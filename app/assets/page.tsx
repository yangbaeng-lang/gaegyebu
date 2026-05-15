'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { fmt } from '@/lib/utils'
import GroupedSelect from '@/components/GroupedSelect'
import AmountInput from '@/components/AmountInput'
import PeriodNav from '@/components/PeriodNav'
import { usePeriod } from '@/lib/usePeriod'
import { exportAssets } from '@/lib/exportExcel'

type Asset = { id: number; name: string; type: string; kind: string; amount: number; color: string; icon: string }
type Cat   = { id: number; type: string; name: string; group: string; sortOrder: number }
type Tx    = { id: number; type: string; date: string; desc: string; fromAcct: string; toAcct: string; amount: number; memo: string }

const DOW = ['일','월','화','수','목','금','토']
const TYPE_COLOR: Record<string, string> = { expense: '#d94f4f', income: '#2a9d5c', transfer: '#4a6fdb' }
const TYPE_BG:    Record<string, string> = { expense: '#fff0f0', income: '#f0fff6', transfer: '#f0f4ff' }
const TYPE_LABEL: Record<string, string> = { expense: '지출', income: '수입', transfer: '이체' }

// ── 모듈 레벨 컴포넌트 ───────────────────────────────────────
type AssetCardProps = { item: Asset; selected: boolean; onClick: (item: Asset) => void }
function AssetCard({ item, selected, onClick }: AssetCardProps) {
  return (
    <button onClick={() => onClick(item)}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all text-left
        ${selected ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: item.color + '20' }}>
        <i className={`ti ${item.icon} text-xs`} style={{ color: item.color }} />
      </div>
      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{item.name}</span>
      <span className="text-sm font-medium tabular-nums flex-shrink-0"
        style={{ color: item.amount < 0 ? '#d94f4f' : item.kind === 'asset' ? '#1a1f2e' : '#d94f4f' }}>
        {fmt(item.amount)}
      </span>
    </button>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────
export default function AssetsPage() {
  const period   = usePeriod()
  const txPeriod = usePeriod()
  const [assets,      setAssets]      = useState<Asset[]>([])
  const [liabilities, setLiabilities] = useState<Asset[]>([])
  const [summary,     setSummary]     = useState({ totalAssets: 0, totalLiab: 0, netWorth: 0 })
  const [cats,        setCats]        = useState<Cat[]>([])
  const [collapsed,   setCollapsed]   = useState<Record<string, boolean>>({})
  const [selected,    setSelected]    = useState<Asset | null>(null)
  const [panelTxs,    setPanelTxs]    = useState<Tx[]>([])
  const [refreshKey,  setRefreshKey]  = useState(0)
  const [editTx,      setEditTx]      = useState<Tx | null>(null)
  const [editForm,    setEditForm]    = useState<Tx | null>(null)
  const [toast,       setToast]       = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const mouseDownRef = useRef(false)
  const dragStartIdx = useRef(-1)
  const lastDragIdx  = useRef(-1)

  const fetchData = async () => {
    const catRes  = await fetch('/api/categories')
    const catJson = await catRes.json()
    setCats(catJson.raw ?? [])
    const res  = await fetch(`/api/assets?to=${period.dateTo}`)
    const json = await res.json()
    setAssets(json.assets)
    setLiabilities(json.liabilities)
    setSummary(json.summary)
  }

  useEffect(() => { fetchData() }, [period.dateTo])

  useEffect(() => {
    if (!selected) return
    fetch(`/api/transactions?from=${txPeriod.dateFrom}&to=${txPeriod.dateTo}`)
      .then(r => r.json()).then(d => setPanelTxs(d.data ?? []))
  }, [selected, txPeriod.dateFrom, txPeriod.dateTo, refreshKey])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }
  const openEdit  = (tx: Tx)      => { setEditTx(tx); setEditForm({ ...tx }) }

  const handleEditSave = async () => {
    if (!editForm) return
    await fetch(`/api/transactions/${editForm.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setEditTx(null)
    showToast('수정됐습니다 ✓')
    setRefreshKey(k => k + 1)
    fetchData()
  }

  const handleDelete = async (id: number, desc?: string) => {
    if (!confirm(`"${desc ?? '이 거래'}"를 삭제하시겠습니까?`)) return
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    showToast('삭제됐습니다')
    setRefreshKey(k => k + 1)
    fetchData()
  }

  const catsByType = (type: string) => cats
    .filter(c => c.type === type && c.name !== '__group__')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(c => c.name)

  const editFromGroups = [
    { label: '자산 계정',   opts: catsByType('account_asset')     },
    { label: '부채 계정',   opts: catsByType('account_liability') },
    { label: '수입 분류',   opts: catsByType('income')            },
    { label: '순자산 분류', opts: catsByType('networth')          },
  ]
  const editToGroups = [
    { label: '자산 계정',     opts: catsByType('account_asset')     },
    { label: '부채 계정',     opts: catsByType('account_liability') },
    { label: '지출 카테고리', opts: catsByType('expense')           },
    { label: '순자산 분류',   opts: catsByType('networth')          },
  ]
  const allFromOpts = editFromGroups.flatMap(g => g.opts)
  const allToOpts   = editToGroups.flatMap(g => g.opts)

  const handleMouseDown = useCallback((idx: number, txId: number, e: React.MouseEvent) => {
    e.preventDefault()
    mouseDownRef.current = true
    dragStartIdx.current = idx
    lastDragIdx.current  = idx
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(txId)) next.delete(txId); else next.add(txId)
      return next
    })
  }, [])

  const handleMouseEnter = useCallback((idx: number, list: { id: number }[]) => {
    if (!mouseDownRef.current) return
    const lo = Math.min(dragStartIdx.current, idx)
    const hi = Math.max(dragStartIdx.current, idx)
    if (lo === Math.min(dragStartIdx.current, lastDragIdx.current) &&
        hi === Math.max(dragStartIdx.current, lastDragIdx.current)) return
    lastDragIdx.current = idx
    setSelectedIds(() => {
      const next = new Set<number>()
      for (let i = lo; i <= hi; i++) next.add(list[i].id)
      return next
    })
  }, [])

  const handleSelect = (item: Asset) => {
    if (selected?.id !== item.id) { txPeriod.syncFrom(period); setSelectedIds(new Set()) }
    setSelected(prev => prev?.id === item.id ? null : item)
  }

  const getGroups = (type: string) =>
    cats.filter(c => c.type === type && c.name === '__group__')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(g => g.group)

  const getGroupItems = (items: Asset[], type: string, group: string) => {
    const order = cats
      .filter(c => c.type === type && c.group === group && c.name !== '__group__')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(c => c.name)
    return order.map(name => items.find(a => a.name === name || a.type === name)).filter(Boolean) as Asset[]
  }

  const getUngrouped = (items: Asset[], type: string) => {
    const grouped = new Set(
      cats.filter(c => c.type === type && c.group && c.name !== '__group__').map(c => c.name)
    )
    return items.filter(a => !grouped.has(a.name) && !grouped.has(a.type))
  }

  const acctTxs = useMemo(() => {
    if (!selected) return []
    return panelTxs
      .filter(tx => tx.fromAcct === selected.name || tx.toAcct === selected.name)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map(tx => ({ tx, isIn: tx.toAcct === selected.name }))
  }, [panelTxs, selected])

  const panelIncome  = acctTxs.filter(r => r.isIn).reduce((s, r) => s + r.tx.amount, 0)
  const panelExpense = acctTxs.filter(r => !r.isIn).reduce((s, r) => s + r.tx.amount, 0)
  const selAmount    = useMemo(() =>
    acctTxs.filter(r => selectedIds.has(r.tx.id)).reduce((s, r) => s + r.tx.amount, 0)
  , [acctTxs, selectedIds])

  const renderSection = (items: Asset[], type: string, label: string, totalColor: string, total: number, icon: string) => {
    const groups    = getGroups(type)
    const ungrouped = getUngrouped(items, type)
    const visibleUngrouped = ungrouped.filter(a => a.amount !== 0)
    const visibleCount = items.filter(a => a.amount !== 0).length

    const allCollapsed = groups.length > 0 && groups.every(g => collapsed[`${type}|${g}`])
    const toggleAll = () => {
      if (allCollapsed) {
        setCollapsed(p => { const n = { ...p }; groups.forEach(g => { delete n[`${type}|${g}`] }); return n })
      } else {
        setCollapsed(p => { const n = { ...p }; groups.forEach(g => { n[`${type}|${g}`] = true }); return n })
      }
    }

    return (
      <div className="bg-white border border-gray-100 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-medium text-gray-500 flex items-center gap-1">
            <i className={`ti ${icon} text-xs`} style={{ color: totalColor }} />{label} ({visibleCount})
          </h3>
          <span className="text-xs font-medium tabular-nums" style={{ color: totalColor }}>{fmt(total)}</span>
          {groups.length > 0 && (
            <button onClick={toggleAll}
              className="ml-auto text-[10px] text-gray-400 hover:text-blue-500 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors">
              <i className={`ti ${allCollapsed ? 'ti-chevrons-down' : 'ti-chevrons-up'} text-xs`} />
              {allCollapsed ? '전체 펼치기' : '전체 접기'}
            </button>
          )}
        </div>

        <div className="space-y-1">
          {groups.map(grp => {
            const grpItems = getGroupItems(items, type, grp).filter(a => a.amount !== 0)
            if (grpItems.length === 0) return null
            const colKey   = `${type}|${grp}`
            const isOpen   = !collapsed[colKey]
            const grpTotal = grpItems.reduce((s, a) => s + a.amount, 0)
            return (
              <div key={grp} className="border border-gray-100 rounded-lg overflow-hidden">
                <button
                  onClick={() => setCollapsed(p => ({ ...p, [colKey]: !p[colKey] }))}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                  <i className={`ti ${isOpen ? 'ti-chevron-down' : 'ti-chevron-right'} text-[9px] text-gray-400`} />
                  <span className="text-[11px] font-medium text-gray-600 flex-1">{grp}</span>
                  <span className="text-[10px] text-gray-400 tabular-nums">{fmt(grpTotal)}</span>
                </button>
                {isOpen && (
                  <div className="px-1 py-1 space-y-0.5">
                    {grpItems.map(a => (
                      <AssetCard key={a.id} item={a} selected={selected?.id === a.id} onClick={handleSelect} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {visibleUngrouped.length > 0 && (
            <div>
              {groups.length > 0 && (
                <p className="text-[9px] text-gray-400 px-1 pt-0.5 pb-0.5">미분류</p>
              )}
              <div className="space-y-0.5">
                {visibleUngrouped.map(a => (
                  <AssetCard key={a.id} item={a} selected={selected?.id === a.id} onClick={handleSelect} />
                ))}
              </div>
            </div>
          )}

          {items.length === 0 && (
            <p className="text-xs text-gray-300 text-center py-3">설정 → 계정에서 추가하세요</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PeriodNav label={period.label} viewMode={period.viewMode} setViewMode={period.setViewMode}
        year={period.year} setYear={period.setYear}
        quarter={period.quarter} setQuarter={period.setQuarter}
        month={period.month} setMonth={period.setMonth}
        prev={period.prev} next={period.next}>
        <button onClick={() => exportAssets(assets, liabilities, summary, period.label)}
          title="엑셀 다운로드"
          className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
          <i className="ti ti-table-export text-base" />
        </button>
        <Link href="/settings" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <i className="ti ti-settings text-sm" />계정 관리
        </Link>
      </PeriodNav>

      <div className="flex-1 flex overflow-hidden">

        {/* ── 자산/부채 메인 ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-[1080px] mx-auto space-y-3">

            {/* 순자산 배너 */}
            <div className="bg-[#1a1f2e] rounded-2xl p-4">
              <p className="text-xs text-white/40 mb-0.5">순자산</p>
              <p className="text-2xl font-medium mb-3"
                style={{ color: summary.netWorth >= 0 ? '#2a9d5c' : '#d94f4f' }}>
                {fmt(summary.netWorth)}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-white/35 mb-0.5">총 자산</p>
                  <p className="text-base font-medium text-emerald-400">{fmt(summary.totalAssets)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/35 mb-0.5">총 부채</p>
                  <p className="text-base font-medium text-red-400">{fmt(summary.totalLiab)}</p>
                </div>
              </div>
              {summary.totalAssets > 0 && (
                <div className="mt-3">
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${Math.min(100, Math.round((1 - summary.totalLiab / summary.totalAssets) * 100))}%` }} />
                  </div>
                  <p className="text-[10px] text-white/30 mt-1">
                    부채비율 {Math.round(summary.totalLiab / summary.totalAssets * 100)}%
                  </p>
                </div>
              )}
            </div>

            {/* 자산 / 부채 2열 */}
            <div className="grid grid-cols-2 gap-3">
              {renderSection(assets,      'account_asset',     '자산', '#059669', summary.totalAssets, 'ti-trending-up'  )}
              {renderSection(liabilities, 'account_liability', '부채', '#d94f4f', summary.totalLiab,   'ti-trending-down')}
            </div>
          </div>
        </div>

      </div>

      {/* ── 팝업 모달 ─────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
          onClick={() => { setSelected(null); setSelectedIds(new Set()) }}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: 'min(900px, 100%)', height: 'min(85vh, 100%)' }}
            onClick={e => e.stopPropagation()}>

            {/* 헤더 */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: selected.color + '20' }}>
                <i className={`ti ${selected.icon} text-xs`} style={{ color: selected.color }} />
              </div>
              <span className="text-sm font-medium text-gray-800 flex-1 truncate">{selected.name}</span>
              <span className="text-sm font-medium tabular-nums" style={{ color: selected.kind === 'asset' ? '#1a1f2e' : '#d94f4f' }}>
                {fmt(selected.amount)}
              </span>
              <div className="w-px h-4 bg-gray-200 mx-1" />
              <span className="text-xs text-gray-400">입금 <span className="font-medium" style={{ color: '#2a9d5c' }}>+{fmt(panelIncome)}</span></span>
              <span className="text-xs text-gray-400">출금 <span className="font-medium" style={{ color: '#d94f4f' }}>-{fmt(panelExpense)}</span></span>
              {selectedIds.size > 0 && (
                <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex-shrink-0">
                  {selectedIds.size}개 선택 · {fmt(selAmount)}
                </span>
              )}
              <button onClick={() => { setSelected(null); setSelectedIds(new Set()) }} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                <i className="ti ti-x" />
              </button>
            </div>

            {/* 기간 선택기 */}
            <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 flex-shrink-0">
              <div className="flex gap-0.5 bg-gray-100 rounded-md p-0.5">
                {(['year','quarter','month'] as const).map(m => (
                  <button key={m} onClick={() => txPeriod.setViewMode(m)}
                    className={`text-[10px] px-2 py-0.5 rounded transition-all
                      ${txPeriod.viewMode === m ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
                    {m === 'year' ? '년' : m === 'quarter' ? '분기' : '월'}
                  </button>
                ))}
              </div>
              <button onClick={txPeriod.prev} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
                <i className="ti ti-chevron-left text-xs" />
              </button>
              <span className="text-sm font-medium text-gray-700 w-28 text-center">{txPeriod.label}</span>
              <button onClick={txPeriod.next} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
                <i className="ti ti-chevron-right text-xs" />
              </button>
              {selectedIds.size > 0 && (
                <button onClick={() => setSelectedIds(new Set())}
                  className="ml-auto text-xs text-blue-400 hover:text-blue-600 flex items-center gap-0.5">
                  <i className="ti ti-x text-[10px]" />선택 해제
                </button>
              )}
            </div>

            {/* 거래 목록 */}
            <div className="flex-1 overflow-y-auto select-none"
              onMouseUp={() => { mouseDownRef.current = false }}
              onMouseLeave={() => { mouseDownRef.current = false }}>
              <div className="sticky top-0 z-10 grid text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-2 bg-gray-50 border-b border-gray-100"
                style={{ gridTemplateColumns: '20px 80px 1.5fr 1fr 1fr 110px 70px 60px' }}>
                <span /><span>날짜</span><span>내용</span><span>출금</span><span>입금</span>
                <span className="text-right">금액</span><span className="text-center">유형</span><span />
              </div>
              {acctTxs.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-gray-300 text-sm">거래 내역 없음</div>
              ) : acctTxs.map(({ tx, isIn }, idx) => {
                const isSel = selectedIds.has(tx.id)
                return (
                  <div key={tx.id}
                    className={`grid items-center px-5 py-2.5 border-b border-gray-50 text-sm cursor-pointer transition-colors group
                      ${isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    style={{ gridTemplateColumns: '20px 80px 1.5fr 1fr 1fr 110px 70px 60px' }}
                    onMouseDown={ev => handleMouseDown(idx, tx.id, ev)}
                    onMouseEnter={() => handleMouseEnter(idx, acctTxs.map(r => ({ id: r.tx.id })))}>
                    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors
                      ${isSel ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                      {isSel && <i className="ti ti-check text-white" style={{ fontSize: '8px' }} />}
                    </span>
                    <span className="text-gray-400 text-xs">{tx.date.replace(/-/g, '.')}</span>
                    <span className="text-gray-700 font-medium truncate pr-2">{tx.desc}</span>
                    <span className="text-gray-500 text-xs truncate pr-2">{tx.fromAcct}</span>
                    <span className="text-gray-500 text-xs truncate pr-2">{tx.toAcct}</span>
                    <span className="text-right tabular-nums font-medium" style={{ color: isIn ? '#2a9d5c' : '#d94f4f' }}>
                      {isIn ? '+' : '-'}{tx.amount.toLocaleString()}
                    </span>
                    <span className="text-center">
                      <span className="text-[10px] rounded px-1.5 py-0.5 inline-block"
                        style={{ background: TYPE_COLOR[tx.type] + '18', color: TYPE_COLOR[tx.type] }}>
                        {TYPE_LABEL[tx.type]}
                      </span>
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end"
                      onMouseDown={ev => ev.stopPropagation()}>
                      <button className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50"
                        onClick={ev => { ev.stopPropagation(); openEdit(tx) }}>
                        <i className="ti ti-pencil text-xs" />
                      </button>
                      <button className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                        onClick={ev => { ev.stopPropagation(); handleDelete(tx.id, tx.desc) }}>
                        <i className="ti ti-trash text-xs" />
                      </button>
                    </div>
                  </div>
                )
              })}
              {acctTxs.length > 0 && (
                <div className="sticky bottom-0 grid items-center px-5 py-2.5 bg-gray-50 border-t border-gray-200 text-sm font-semibold"
                  style={{ gridTemplateColumns: '20px 80px 1.5fr 1fr 1fr 110px 70px 60px' }}>
                  <span className="col-span-5 text-gray-500">{acctTxs.length}건</span>
                  <span className="text-right tabular-nums" style={{ color: (panelIncome - panelExpense) >= 0 ? '#2a9d5c' : '#d94f4f' }}>
                    {(panelIncome - panelExpense) >= 0 ? '+' : ''}{fmt(panelIncome - panelExpense)}
                  </span>
                  <span /><span />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 수정 모달 ────────────────────────────────────── */}
      {editTx && editForm && (
        <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center"
          onClick={() => setEditTx(null)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl space-y-3"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-gray-800">거래 수정</h3>

            <div className="flex gap-1">
              {(['expense','income','transfer'] as const).map(t => (
                <button key={t}
                  onClick={() => setEditForm(f => f ? { ...f, type: t } : f)}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${editForm.type === t ? 'font-medium' : 'text-gray-400 border-gray-100 bg-gray-50'}`}
                  style={editForm.type === t ? { background: TYPE_BG[t], color: TYPE_COLOR[t], borderColor: TYPE_COLOR[t] + '80' } : {}}>
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">날짜</label>
              <input type="date" value={editForm.date}
                onChange={e => setEditForm(f => f ? { ...f, date: e.target.value } : f)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 h-8 focus:outline-none focus:border-blue-300" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">내용</label>
              <input type="text" value={editForm.desc}
                onChange={e => setEditForm(f => f ? { ...f, desc: e.target.value } : f)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 h-8 focus:outline-none focus:border-blue-300" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">출금 <span className="text-gray-300">— 나가는 곳</span></label>
                <GroupedSelect
                  value={editForm.fromAcct}
                  onChange={v => setEditForm(f => f ? { ...f, fromAcct: v } : f)}
                  groups={editFromGroups}
                  extraOpt={!allFromOpts.includes(editForm.fromAcct) ? editForm.fromAcct : undefined}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">입금 <span className="text-gray-300">— 들어오는 곳</span></label>
                <GroupedSelect
                  value={editForm.toAcct}
                  onChange={v => setEditForm(f => f ? { ...f, toAcct: v } : f)}
                  groups={editToGroups}
                  extraOpt={!allToOpts.includes(editForm.toAcct) ? editForm.toAcct : undefined}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">금액 (원)</label>
              <AmountInput value={editForm.amount}
                onChange={v => setEditForm(f => f ? { ...f, amount: v } : f)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 h-8 focus:outline-none focus:border-blue-300" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">메모</label>
              <input type="text" value={editForm.memo}
                onChange={e => setEditForm(f => f ? { ...f, memo: e.target.value } : f)}
                placeholder="선택 사항"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 h-8 focus:outline-none focus:border-blue-300" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditTx(null)}
                className="flex-1 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={handleEditSave}
                className="flex-1 py-2 text-xs bg-[#1a1f2e] text-white rounded-lg hover:opacity-90">저장</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#1a1f2e] text-white text-xs px-4 py-2 rounded-full z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
