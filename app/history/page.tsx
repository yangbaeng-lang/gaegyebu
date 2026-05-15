'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { fmt } from '@/lib/utils'
import PeriodNav from '@/components/PeriodNav'
import { usePeriod } from '@/lib/usePeriod'
import { exportTransactions } from '@/lib/exportExcel'

type Tx   = { id: number; type: string; date: string; desc: string; fromAcct: string; toAcct: string; amount: number; memo: string }
type Cats = { account_asset: string[]; account_liability: string[]; expense: string[]; income: string[]; networth: string[] }
type ModalState = { type: 'desc'; desc: string } | { type: 'account'; name: string }

const TYPE_COLOR: Record<string, string> = { expense: '#d94f4f', income: '#2a9d5c', transfer: '#4a6fdb', income_expense: '#e07820' }
const TYPE_BG:    Record<string, string> = { expense: '#fff0f0', income: '#f0fff6', transfer: '#f0f4ff', income_expense: '#fff8f0' }
const TYPE_ICO:   Record<string, string> = { expense: 'ti-arrow-up-right', income: 'ti-arrow-down-left', transfer: 'ti-arrows-exchange', income_expense: 'ti-arrows-exchange-2' }
const TYPE_LABEL: Record<string, string> = { all: '전체', expense: '지출', income: '수입', transfer: '이체', income_expense: '수입+지출' }
const DOW = ['일','월','화','수','목','금','토']

function DateBtn({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const display = value ? value.replace(/-/g, '') : placeholder
  return (
    <div className="relative" style={{ height: '28px', minWidth: '116px' }}>
      <div className={`absolute inset-0 flex items-center px-3 rounded-lg text-xs font-mono tracking-wider select-none
        ${value ? 'bg-[#1a1f2e] text-white' : 'bg-gray-100 text-gray-400'}`}>
        {display}
      </div>
      <input type="date" value={value}
        onChange={e => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', zIndex: 1 }} />
    </div>
  )
}

export default function HistoryPage() {
  const period      = usePeriod()
  const modalPeriod = usePeriod()

  const [typeFilter, setTypeFilter] = useState('all')
  const [q, setQ]               = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [txs, setTxs]           = useState<Tx[]>([])
  const [summary, setSummary]   = useState({ income: 0, expense: 0, net: 0, count: 0 })
  const [cats, setCats]         = useState<Cats>({ account_asset: [], account_liability: [], expense: [], income: [], networth: [] })
  const [editTx, setEditTx]     = useState<Tx | null>(null)
  const [editForm, setEditForm] = useState<Tx | null>(null)
  const [toast, setToast]       = useState('')

  const [modal,       setModal]       = useState<ModalState | null>(null)
  const [modalTxs,    setModalTxs]    = useState<Tx[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const mouseDownRef = useRef(false)
  const dragStartIdx = useRef(-1)
  const lastDragIdx  = useRef(-1)

  const fetchTxs = async () => {
    const from = dateFrom || period.dateFrom
    const to   = dateTo   || period.dateTo
    const params = new URLSearchParams({ from, to })
    if (typeFilter !== 'all') params.set('type', typeFilter)
    if (q.trim()) params.set('q', q.trim())
    const res  = await fetch(`/api/transactions?${params}`)
    const json = await res.json()
    setTxs(json.data)
    setSummary(json.summary)
  }

  const fetchCats = async () => {
    const res  = await fetch('/api/categories')
    const json = await res.json()
    const toNames = (arr: { name: string }[]) => arr?.map(c => c.name) ?? []
    setCats({
      account_asset:     toNames(json.grouped.account_asset),
      account_liability: toNames(json.grouped.account_liability),
      expense:           toNames(json.grouped.expense),
      income:            toNames(json.grouped.income),
      networth:          toNames(json.grouped.networth),
    })
  }

  useEffect(() => { fetchTxs() }, [period.dateFrom, period.dateTo, typeFilter, dateFrom, dateTo])
  useEffect(() => { fetchCats() }, [])
  useEffect(() => {
    if (!modal) return
    fetch(`/api/transactions?from=${modalPeriod.dateFrom}&to=${modalPeriod.dateTo}`)
      .then(r => r.json()).then(d => setModalTxs(d.data ?? []))
  }, [modal, modalPeriod.dateFrom, modalPeriod.dateTo])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }
  const openEdit  = (tx: Tx)      => { setEditTx(tx); setEditForm({ ...tx }) }

  const openModal = (m: ModalState) => {
    const key    = m.type === 'desc' ? m.desc : m.name
    const curKey = !modal ? null : modal.type === 'desc' ? modal.desc : modal.name
    if (curKey !== key) { modalPeriod.syncFrom(period); setSelectedIds(new Set()) }
    setModal(m)
  }

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

  const handleSave = async () => {
    if (!editForm) return
    await fetch(`/api/transactions/${editForm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setEditTx(null)
    showToast('수정됐습니다 ✓')
    fetchTxs()
    if (modal) setModalTxs(prev => prev.map(t => t.id === editForm.id ? { ...editForm } : t))
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 거래를 삭제하시겠습니까?')) return
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    showToast('삭제됐습니다')
    fetchTxs()
    setModalTxs(prev => prev.filter(t => t.id !== id))
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const fromGroups = [
    { label: '자산 계정',  opts: cats.account_asset     },
    { label: '부채 계정',  opts: cats.account_liability },
    { label: '수입 분류',  opts: cats.income            },
    { label: '순자산 분류', opts: cats.networth          },
  ]
  const toGroups = [
    { label: '자산 계정',     opts: cats.account_asset     },
    { label: '부채 계정',     opts: cats.account_liability },
    { label: '지출 카테고리', opts: cats.expense           },
    { label: '순자산 분류',   opts: cats.networth          },
  ]
  const allFromOpts = fromGroups.flatMap(g => g.opts)
  const allToOpts   = toGroups.flatMap(g => g.opts)

  const grouped: Record<string, Tx[]> = {}
  txs.forEach(t => { if (!grouped[t.date]) grouped[t.date] = []; grouped[t.date].push(t) })
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  // 모달 – 내용별
  const modalDescRows = useMemo(() => {
    if (!modal || modal.type !== 'desc') return []
    return [...modalTxs]
      .filter(tx => tx.desc === modal.desc)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  }, [modal, modalTxs])

  // 모달 – 계정 원장 (오름차순 계산 후 역순 표시)
  const modalAcctRows = useMemo(() => {
    if (!modal || modal.type !== 'account') return []
    const rows: { tx: Tx; isIn: boolean; balance: number }[] = []
    let bal = 0
    const sorted = [...modalTxs]
      .filter(tx => tx.fromAcct === modal.name || tx.toAcct === modal.name)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    for (const tx of sorted) {
      const isIn = tx.toAcct === modal.name
      bal += isIn ? tx.amount : -tx.amount
      rows.push({ tx, isIn, balance: bal })
    }
    return rows.reverse()
  }, [modal, modalTxs])

  const selAmount = useMemo(() => {
    if (!modal) return 0
    if (modal.type === 'desc')
      return modalDescRows.filter(tx => selectedIds.has(tx.id)).reduce((s, tx) => s + tx.amount, 0)
    return modalAcctRows.filter(r => selectedIds.has(r.tx.id)).reduce((s, r) => s + r.tx.amount, 0)
  }, [modal, modalDescRows, modalAcctRows, selectedIds])

  return (
    <div className="flex flex-col h-full">
      <PeriodNav label={period.label} viewMode={period.viewMode} setViewMode={period.setViewMode}
        year={period.year} setYear={period.setYear}
        quarter={period.quarter} setQuarter={period.setQuarter}
        month={period.month} setMonth={period.setMonth}
        prev={period.prev} next={period.next} />

      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-[1080px] w-full mx-auto">
        {/* KPI */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '총 수입',   val: fmt(summary.income),   color: '#2a9d5c' },
            { label: '총 지출',   val: fmt(summary.expense),  color: '#d94f4f' },
            { label: '순수익',    val: fmt(summary.net),      color: summary.net >= 0 ? '#2a9d5c' : '#d94f4f' },
            { label: '거래 건수', val: `${summary.count}건`,  color: '#4a6fdb' },
          ].map(k => (
            <div key={k.label} className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">{k.label}</p>
              <p className="text-sm font-medium" style={{ color: k.color }}>{k.val}</p>
            </div>
          ))}
        </div>

        {/* 필터 */}
        <div className="bg-white border border-gray-100 rounded-xl p-3 flex gap-2 items-center flex-wrap">
          <button onClick={() => exportTransactions(txs, period.label)}
            className="h-7 px-2.5 flex items-center gap-1 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors flex-shrink-0">
            <i className="ti ti-download text-sm" />내보내기
          </button>
          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />
          <div className="flex gap-1 flex-shrink-0">
            {(['all','expense','income','transfer'] as const).map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`text-xs px-3 py-1 rounded-full border transition-all ${typeFilter === t ? 'bg-[#1a1f2e] text-white border-[#1a1f2e]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <input value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchTxs()}
              placeholder="내용 검색"
              className="w-28 text-xs border border-gray-200 rounded-lg px-3 h-7 focus:outline-none focus:border-blue-300" />
            <button onClick={fetchTxs}
              className="px-3 h-7 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50">
              <i className="ti ti-search" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-gray-400">시작일</span>
            <DateBtn value={dateFrom} onChange={setDateFrom} placeholder="YYYYMMDD" />
            <span className="text-xs text-gray-300">~</span>
            <span className="text-xs text-gray-400">종료일</span>
            <DateBtn value={dateTo} onChange={setDateTo} placeholder="YYYYMMDD" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }}
                className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-0.5 px-2 h-7 border border-gray-200 rounded-lg hover:bg-red-50 transition-colors">
                <i className="ti ti-x text-[10px]" />초기화
              </button>
            )}
          </div>
        </div>

        {/* 거래 목록 */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {txs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-xs gap-2">
              <i className="ti ti-receipt-off text-3xl opacity-30" />거래 내역이 없습니다
            </div>
          ) : dates.map(d => {
            const dd = new Date(d)
            const dayTotal = grouped[d].reduce((s, tx) =>
              tx.type === 'income' ? s + tx.amount : tx.type === 'expense' ? s - tx.amount : tx.type === 'income_expense' ? s : s, 0)
            return (
              <div key={d}>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                  <span className="text-[11px] text-gray-500 font-medium">
                    {d.slice(5).replace('-', '월 ')}일 ({DOW[dd.getDay()]})
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: dayTotal >= 0 ? '#2a9d5c' : '#d94f4f' }}>
                    {dayTotal >= 0 ? '+' : ''}{dayTotal.toLocaleString()}원
                  </span>
                </div>
                {grouped[d].map(tx => (
                  <div key={tx.id}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 group">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: TYPE_BG[tx.type] }}>
                      <i className={`ti ${TYPE_ICO[tx.type]} text-sm`} style={{ color: TYPE_COLOR[tx.type] }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <button className="text-xs font-medium text-gray-800 text-left hover:text-blue-600 transition-colors truncate w-full"
                        onClick={() => openModal({ type: 'desc', desc: tx.desc })}>
                        {tx.desc}
                      </button>
                      <p className="text-[10px] text-gray-400 truncate">
                        <button className="hover:text-blue-500 transition-colors" onClick={() => openModal({ type: 'account', name: tx.fromAcct })}>{tx.fromAcct}</button>
                        {' → '}
                        <button className="hover:text-blue-500 transition-colors" onClick={() => openModal({ type: 'account', name: tx.toAcct })}>{tx.toAcct}</button>
                        {tx.memo ? ` · ${tx.memo}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-medium flex-shrink-0" style={{ color: TYPE_COLOR[tx.type] }}>
                      {tx.type === 'expense' ? '-' : tx.type === 'income' ? (tx.amount >= 0 ? '+' : '') : tx.type === 'income_expense' ? '±' : ''}{tx.amount.toLocaleString()}원
                    </p>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => openEdit(tx)}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50">
                        <i className="ti ti-pencil text-xs" />
                      </button>
                      <button onClick={() => handleDelete(tx.id)}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
                        <i className="ti ti-trash text-xs" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 팝업 모달 ─────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
          onClick={() => { setModal(null); setSelectedIds(new Set()) }}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: 'min(900px, 100%)', height: 'min(85vh, 100%)' }}
            onClick={e => e.stopPropagation()}>

            {/* 헤더 */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <i className={`ti ${modal.type === 'desc' ? 'ti-file-description' : 'ti-building-bank'} text-gray-400 flex-shrink-0`} />
              <span className="text-sm font-medium text-gray-800 flex-1 truncate">
                {modal.type === 'desc' ? modal.desc : modal.name}
              </span>
              {selectedIds.size > 0 && (
                <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex-shrink-0">
                  {selectedIds.size}개 선택 · {fmt(selAmount)}
                </span>
              )}
              <button onClick={() => { setModal(null); setSelectedIds(new Set()) }} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                <i className="ti ti-x" />
              </button>
            </div>

            {/* 기간 선택기 */}
            <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 flex-shrink-0">
              <div className="flex gap-0.5 bg-gray-100 rounded-md p-0.5">
                {(['year','quarter','month'] as const).map(m => (
                  <button key={m} onClick={() => modalPeriod.setViewMode(m)}
                    className={`text-[10px] px-2 py-0.5 rounded transition-all
                      ${modalPeriod.viewMode === m ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
                    {m === 'year' ? '년' : m === 'quarter' ? '분기' : '월'}
                  </button>
                ))}
              </div>
              <button onClick={modalPeriod.prev} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
                <i className="ti ti-chevron-left text-xs" />
              </button>
              <span className="text-sm font-medium text-gray-700 w-28 text-center">{modalPeriod.label}</span>
              <button onClick={modalPeriod.next} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
                <i className="ti ti-chevron-right text-xs" />
              </button>
              {selectedIds.size > 0 && (
                <button onClick={() => setSelectedIds(new Set())}
                  className="ml-auto text-xs text-blue-400 hover:text-blue-600 flex items-center gap-0.5">
                  <i className="ti ti-x text-[10px]" />선택 해제
                </button>
              )}
            </div>

            {modal.type === 'desc' ? (
              /* 내용별 뷰 */
              <div className="flex-1 overflow-y-auto select-none"
                onMouseUp={() => { mouseDownRef.current = false }}
                onMouseLeave={() => { mouseDownRef.current = false }}>
                <div className="sticky top-0 z-10 grid text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-2 bg-gray-50 border-b border-gray-100"
                  style={{ gridTemplateColumns: '20px 80px 1.5fr 1fr 1fr 110px 60px' }}>
                  <span /><span>날짜</span><span>내용</span><span>출금</span><span>입금</span>
                  <span className="text-right">금액</span><span />
                </div>
                {modalDescRows.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-gray-300 text-sm">거래 내역 없음</div>
                ) : modalDescRows.map((tx, idx) => {
                  const isSel = selectedIds.has(tx.id)
                  return (
                    <div key={tx.id}
                      className={`grid items-center px-5 py-2.5 border-b border-gray-50 text-sm cursor-pointer transition-colors group
                        ${isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      style={{ gridTemplateColumns: '20px 80px 1.5fr 1fr 1fr 110px 60px' }}
                      onMouseDown={ev => handleMouseDown(idx, tx.id, ev)}
                      onMouseEnter={() => handleMouseEnter(idx, modalDescRows)}>
                      <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors
                        ${isSel ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                        {isSel && <i className="ti ti-check text-white" style={{ fontSize: '8px' }} />}
                      </span>
                      <span className="text-gray-400 text-xs">{tx.date.replace(/-/g, '.')}</span>
                      <span className="text-gray-700 font-medium truncate pr-2">{tx.desc}</span>
                      <span className="text-gray-500 text-xs truncate pr-2">{tx.fromAcct}</span>
                      <span className="text-gray-500 text-xs truncate pr-2">{tx.toAcct}</span>
                      <span className="text-right tabular-nums font-medium" style={{ color: TYPE_COLOR[tx.type] }}>
                        {tx.amount.toLocaleString()}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end"
                        onMouseDown={ev => ev.stopPropagation()}>
                        <button className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50"
                          onClick={ev => { ev.stopPropagation(); openEdit(tx) }}>
                          <i className="ti ti-pencil text-xs" />
                        </button>
                        <button className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                          onClick={ev => { ev.stopPropagation(); handleDelete(tx.id) }}>
                          <i className="ti ti-trash text-xs" />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {modalDescRows.length > 0 && (
                  <div className="sticky bottom-0 grid items-center px-5 py-2.5 bg-gray-50 border-t border-gray-200 text-sm font-semibold"
                    style={{ gridTemplateColumns: '20px 80px 1.5fr 1fr 1fr 110px 60px' }}>
                    <span className="col-span-5 text-gray-500">{modalDescRows.length}건 합계</span>
                    <span className="text-right tabular-nums" style={{ color: '#4a6fdb' }}>
                      {modalDescRows.reduce((s, t) => s + t.amount, 0).toLocaleString()}
                    </span>
                    <span />
                  </div>
                )}
              </div>
            ) : (
              /* 계정 원장 뷰 */
              <div className="flex-1 overflow-y-auto select-none"
                onMouseUp={() => { mouseDownRef.current = false }}
                onMouseLeave={() => { mouseDownRef.current = false }}>
                <div className="sticky top-0 z-10 grid text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-2 bg-gray-50 border-b border-gray-100"
                  style={{ gridTemplateColumns: '20px 80px 1.5fr 110px 110px 120px 60px' }}>
                  <span /><span>날짜</span><span>내용</span>
                  <span className="text-right">출금</span>
                  <span className="text-right">입금</span>
                  <span className="text-right">잔액</span>
                  <span />
                </div>
                {modalAcctRows.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-gray-300 text-sm">거래 내역 없음</div>
                ) : modalAcctRows.map(({ tx, isIn, balance }, idx) => {
                  const isSel = selectedIds.has(tx.id)
                  return (
                    <div key={tx.id}
                      className={`grid items-center px-5 py-2.5 border-b border-gray-50 text-sm cursor-pointer transition-colors group
                        ${isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      style={{ gridTemplateColumns: '20px 80px 1.5fr 110px 110px 120px 60px' }}
                      onMouseDown={ev => handleMouseDown(idx, tx.id, ev)}
                      onMouseEnter={() => handleMouseEnter(idx, modalAcctRows.map(r => ({ id: r.tx.id })))}>
                      <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors
                        ${isSel ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                        {isSel && <i className="ti ti-check text-white" style={{ fontSize: '8px' }} />}
                      </span>
                      <span className="text-gray-400 text-xs">{tx.date.replace(/-/g, '.')}</span>
                      <span className="text-gray-700 truncate pr-2">{tx.desc}</span>
                      <span className="text-right tabular-nums" style={{ color: isIn ? '' : '#d94f4f' }}>
                        {!isIn ? tx.amount.toLocaleString() : ''}
                      </span>
                      <span className="text-right tabular-nums" style={{ color: isIn ? '#2a9d5c' : '' }}>
                        {isIn ? tx.amount.toLocaleString() : ''}
                      </span>
                      <span className="text-right tabular-nums font-medium"
                        style={{ color: balance >= 0 ? '#1a1f2e' : '#d94f4f' }}>
                        {balance.toLocaleString()}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end"
                        onMouseDown={ev => ev.stopPropagation()}>
                        <button className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50"
                          onClick={ev => { ev.stopPropagation(); openEdit(tx) }}>
                          <i className="ti ti-pencil text-xs" />
                        </button>
                        <button className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                          onClick={ev => { ev.stopPropagation(); handleDelete(tx.id) }}>
                          <i className="ti ti-trash text-xs" />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {modalAcctRows.length > 0 && (() => {
                  const sumOut = modalAcctRows.filter(r => !r.isIn).reduce((s, r) => s + r.tx.amount, 0)
                  const sumIn  = modalAcctRows.filter(r =>  r.isIn).reduce((s, r) => s + r.tx.amount, 0)
                  const final  = modalAcctRows[0].balance
                  return (
                    <div className="sticky bottom-0 grid items-center px-5 py-2.5 bg-gray-50 border-t border-gray-200 text-sm font-semibold"
                      style={{ gridTemplateColumns: '20px 80px 1.5fr 110px 110px 120px 60px' }}>
                      <span className="col-span-3 text-gray-500">합계</span>
                      <span className="text-right tabular-nums" style={{ color: '#d94f4f' }}>{sumOut.toLocaleString()}</span>
                      <span className="text-right tabular-nums" style={{ color: '#2a9d5c' }}>{sumIn.toLocaleString()}</span>
                      <span className="text-right tabular-nums" style={{ color: final >= 0 ? '#2a9d5c' : '#d94f4f' }}>{final.toLocaleString()}</span>
                      <span />
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {editTx && editForm && (
        <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center" onClick={() => setEditTx(null)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl space-y-3" onClick={e => e.stopPropagation()}>
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
                <label className="text-xs text-gray-400 block mb-1">출금</label>
                <select value={editForm.fromAcct}
                  onChange={e => setEditForm(f => f ? { ...f, fromAcct: e.target.value } : f)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 h-8 focus:outline-none focus:border-blue-300">
                  {fromGroups.map(g => g.opts.length > 0 && (
                    <optgroup key={g.label} label={g.label}>
                      {g.opts.map((a: string) => <option key={a}>{a}</option>)}
                    </optgroup>
                  ))}
                  {!allFromOpts.includes(editForm.fromAcct) && <option>{editForm.fromAcct}</option>}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">입금</label>
                <select value={editForm.toAcct}
                  onChange={e => setEditForm(f => f ? { ...f, toAcct: e.target.value } : f)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 h-8 focus:outline-none focus:border-blue-300">
                  {toGroups.map(g => g.opts.length > 0 && (
                    <optgroup key={g.label} label={g.label}>
                      {g.opts.map((a: string) => <option key={a}>{a}</option>)}
                    </optgroup>
                  ))}
                  {!allToOpts.includes(editForm.toAcct) && <option>{editForm.toAcct}</option>}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">금액 (원)</label>
              <input type="number" value={editForm.amount}
                onChange={e => setEditForm(f => f ? { ...f, amount: Number(e.target.value) } : f)}
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
              <button onClick={handleSave}
                className="flex-1 py-2 text-xs bg-[#1a1f2e] text-white rounded-lg hover:opacity-90">저장</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#1a1f2e] text-white text-xs px-4 py-2 rounded-full z-50">{toast}</div>
      )}
    </div>
  )
}
