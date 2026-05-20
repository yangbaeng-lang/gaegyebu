'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import GroupedSelect from '@/components/GroupedSelect'
import AmountInput from '@/components/AmountInput'
import { fmt, CAT_META } from '@/lib/utils'
import PeriodNav from '@/components/PeriodNav'
import Link from 'next/link'
import { usePeriod } from '@/lib/usePeriod'
import { exportAnalytics } from '@/lib/exportExcel'
import { useSession } from '@/lib/SessionContext'

type Summary   = { income: number; expense: number; net: number; savingRate: number }
type CatItem   = { name: string; amount: number }
type TrendItem = { label: string; income: number; expense: number; net: number }
type Tx        = { id: number; type: string; date: string; desc: string; fromAcct: string; toAcct: string; amount: number; memo: string }
type Cat       = { id: number; type: string; name: string; group: string; sortOrder: number }
type SelCat    = { name: string; txType: 'expense' | 'income' }

const DOW_LABELS  = ['월','화','수','목','금','토','일']
const DOW         = ['일','월','화','수','목','금','토']
const TYPE_COLOR: Record<string, string> = { expense: '#d94f4f', income: '#2a9d5c', transfer: '#4a6fdb' }
const TYPE_BG:    Record<string, string> = { expense: '#fff0f0', income: '#f0fff6', transfer: '#f0f4ff' }
const TYPE_LABEL: Record<string, string> = { expense: '지출', income: '수입', transfer: '이체' }

export default function AnalyticsPage() {
  const period    = usePeriod()
  const catPeriod = usePeriod()
  const { refreshKey: sessionKey } = useSession()
  const [summary,          setSummary]          = useState<Summary>({ income: 0, expense: 0, net: 0, savingRate: 0 })
  const [categories,       setCategories]       = useState<CatItem[]>([])
  const [incomeCategories, setIncomeCategories] = useState<CatItem[]>([])
  const [trend,            setTrend]            = useState<TrendItem[]>([])
  const [dowPattern,       setDowPattern]       = useState<number[]>([0,0,0,0,0,0,0])
  const [selectedDow,      setSelectedDow]      = useState<number | null>(null)
  const [allTxs,           setAllTxs]           = useState<Tx[]>([])
  const [cats,             setCats]             = useState<Cat[]>([])
  const [selectedCat,      setSelectedCat]      = useState<SelCat | null>(null)
  const [catTxs,           setCatTxs]           = useState<Tx[]>([])
  const [collapsedGrps,    setCollapsedGrps]    = useState<Record<string, boolean>>({})
  const [editTx,           setEditTx]           = useState<Tx | null>(null)
  const [editForm,         setEditForm]         = useState<Tx | null>(null)
  const [toast,            setToast]            = useState('')
  const [txKey,            setTxKey]            = useState(0)
  const [selectedIds,      setSelectedIds]      = useState<Set<number>>(new Set())
  const mouseDownRef = useRef(false)
  const dragStartIdx = useRef(-1)
  const lastDragIdx  = useRef(-1)

  useEffect(() => {
    fetch(`/api/analytics?from=${period.dateFrom}&to=${period.dateTo}&viewMode=${period.viewMode}`, { cache: 'no-cache' })
      .then(r => r.json())
      .then(d => {
        setSummary(d.summary)
        setCategories(d.categories)
        setIncomeCategories(d.incomeCategories ?? [])
        setTrend(d.trend)
        setDowPattern(d.dowPattern)
      })
  }, [period.dateFrom, period.dateTo, period.viewMode, txKey, sessionKey])

  useEffect(() => {
    fetch('/api/categories', { cache: 'no-cache' }).then(r => r.json()).then(json => setCats(json.raw ?? []))
  }, [sessionKey])

  useEffect(() => {
    if (selectedDow === null) return
    fetch(`/api/transactions?from=${period.dateFrom}&to=${period.dateTo}`)
      .then(r => r.json()).then(d => setAllTxs(d.data ?? []))
  }, [selectedDow, period.dateFrom, period.dateTo, txKey, sessionKey])

  useEffect(() => {
    if (!selectedCat) return
    fetch(`/api/transactions?from=${catPeriod.dateFrom}&to=${catPeriod.dateTo}`)
      .then(r => r.json()).then(d => setCatTxs(d.data ?? []))
  }, [selectedCat, catPeriod.dateFrom, catPeriod.dateTo, txKey, sessionKey])

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
    setTxKey(k => k + 1)
  }

  const handleDelete = async (id: number, desc?: string) => {
    if (!confirm(`"${desc ?? '이 거래'}"를 삭제하시겠습니까?`)) return
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    showToast('삭제됐습니다')
    setTxKey(k => k + 1)
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

  const handleDowClick = (i: number) => {
    setSelectedCat(null)
    setSelectedIds(new Set())
    setSelectedDow(prev => prev === i ? null : i)
  }

  const handleCatSelect = (name: string, txType: 'expense' | 'income') => {
    setSelectedDow(null)
    setSelectedIds(new Set())
    const same = selectedCat?.name === name && selectedCat?.txType === txType
    if (!same) catPeriod.syncFrom(period)
    setSelectedCat(same ? null : { name, txType })
  }

  const dowFilteredTxs = useMemo(() => {
    if (selectedDow === null) return []
    const jsDay = selectedDow === 6 ? 0 : selectedDow + 1
    return allTxs
      .filter(tx => tx.type === 'expense' && new Date(tx.date).getDay() === jsDay)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  }, [allTxs, selectedDow])

  const catFilteredTxs = useMemo(() => {
    if (!selectedCat) return []
    return catTxs.filter(tx =>
      selectedCat.txType === 'expense'
        ? (tx.type === 'expense' || tx.type === 'income_expense') && tx.toAcct   === selectedCat.name
        : (tx.type === 'income'  || tx.type === 'income_expense') && tx.fromAcct === selectedCat.name
    ).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  }, [catTxs, selectedCat])

  // 대분류 그룹 구조 빌더
  const buildGroups = (catType: string, sourceList: CatItem[]) => {
    const typeCats = cats.filter(c => c.type === catType && c.name !== '__group__')
    const groups   = cats
      .filter(c => c.type === catType && c.name === '__group__')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(g => g.group)

    const result = groups.map(grp => {
      const items = typeCats
        .filter(c => c.group === grp)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(c => ({ name: c.name, amount: sourceList.find(s => s.name === c.name)?.amount ?? 0 }))
        .filter(item => item.amount !== 0)
      return { grp, items, groupTotal: items.reduce((s, i) => s + i.amount, 0) }
    }).filter(g => g.groupTotal !== 0)

    const groupedNames = new Set(typeCats.filter(c => c.group).map(c => c.name))
    const ungrouped    = sourceList.filter(c => !groupedNames.has(c.name) && c.amount !== 0)
    if (ungrouped.length > 0)
      result.push({ grp: '미분류', items: ungrouped, groupTotal: ungrouped.reduce((s, i) => s + i.amount, 0) })

    return result
  }

  const expenseGroups = useMemo(() => buildGroups('expense', categories),       [cats, categories])
  const incomeGroups  = useMemo(() => buildGroups('income',  incomeCategories), [cats, incomeCategories])

  const dowTotal    = dowFilteredTxs.reduce((s, t) => s + t.amount, 0)
  const catTotal    = catFilteredTxs.reduce((s, t) => s + t.amount, 0)
  const maxDow      = Math.max(...dowPattern, 1)
  const totalCatExp = categories.reduce((s, c) => s + c.amount, 0)
  const totalCatInc = incomeCategories.reduce((s, c) => s + c.amount, 0)
  const modalOpen   = selectedDow !== null || selectedCat !== null
  const activeList  = selectedDow !== null ? dowFilteredTxs : catFilteredTxs
  const selAmount   = useMemo(() =>
    activeList.filter(tx => selectedIds.has(tx.id)).reduce((s, tx) => s + tx.amount, 0)
  , [activeList, selectedIds])

  // 카테고리 섹션 렌더 (지출/수입 공용)
  const renderCatSection = (
    groups: typeof expenseGroups,
    txType: 'expense' | 'income',
    totalCat: number,
    collKey: (grp: string) => string,
  ) => {
    const accentColor = txType === 'expense' ? '#d94f4f' : '#2a9d5c'
    const defaultMeta = txType === 'expense'
      ? { icon: 'ti-dots', color: '#aaa', bg: '#f5f5f5' }
      : { icon: 'ti-coins', color: '#2a9d5c', bg: '#f0fff6' }

    if (groups.length === 0)
      return <p className="text-xs text-gray-300 text-center py-8">내역이 없습니다</p>

    return (
      <div className="space-y-1">
        {groups.map(({ grp, items, groupTotal }) => {
          const key    = collKey(grp)
          const isOpen = !!collapsedGrps[key]
          const grpPct = totalCat > 0 ? Math.round(groupTotal / totalCat * 100) : 0
          return (
            <div key={grp} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setCollapsedGrps(p => ({ ...p, [key]: !p[key] }))}
                className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                <i className={`ti ${isOpen ? 'ti-chevron-down' : 'ti-chevron-right'} text-[10px] text-gray-400`} />
                <span className="text-sm font-medium text-gray-700 flex-1">{grp}</span>
                <span className="text-xs text-gray-400 tabular-nums">{grpPct}%</span>
                <span className="text-sm font-semibold text-gray-800 tabular-nums ml-1">{fmt(groupTotal)}</span>
              </button>
              {isOpen && (
                <div className="px-2 py-1.5 space-y-1.5">
                  {items.map(c => {
                    const meta  = CAT_META[c.name] ?? defaultMeta
                    const pct   = totalCat > 0 ? Math.round(c.amount / totalCat * 100) : 0
                    const isSel = selectedCat?.name === c.name && selectedCat?.txType === txType
                    return (
                      <div key={c.name}
                        className={`cursor-pointer rounded-lg px-2 py-1.5 transition-colors ${isSel ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'}`}
                        onClick={() => handleCatSelect(c.name, txType)}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
                              <i className={`ti ${meta.icon} text-[10px]`} style={{ color: meta.color }} />
                            </div>
                            <span className={`text-sm truncate ${isSel ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>{c.name}</span>
                          </div>
                          <div className="text-right flex-shrink-0 ml-1">
                            <span className="text-sm font-medium text-gray-800 tabular-nums">{fmt(c.amount)}</span>
                            <span className="text-xs text-gray-400 ml-1">{pct}%</span>
                          </div>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(0, pct)}%`, background: isSel ? '#4a6fdb' : accentColor }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
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
        <button onClick={() => exportAnalytics(expenseGroups, incomeGroups, period.label)}
          title="엑셀 다운로드"
          className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
          <i className="ti ti-table-export text-base" />
        </button>
        <Link href="/settings" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <i className="ti ti-settings text-sm" />계정 관리
        </Link>
      </PeriodNav>

      <div className="flex-1 flex overflow-hidden">

        {/* ── 보고서 메인 ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-[1080px] mx-auto space-y-4">

            {/* KPI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: '총 수입', val: fmt(summary.income),      color: '#2a9d5c' },
                { label: '총 지출', val: fmt(summary.expense),     color: '#d94f4f' },
                { label: '순수익',  val: fmt(summary.net),         color: summary.net >= 0 ? '#2a9d5c' : '#d94f4f' },
                { label: '수익률',  val: `${summary.savingRate}%`, color: '#4a6fdb' },
              ].map(k => (
                <div key={k.label} className="bg-white border border-gray-100 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">{k.label}</p>
                  <p className="text-base font-medium" style={{ color: k.color }}>{k.val}</p>
                </div>
              ))}
            </div>

            {/* 수입/지출 추이 */}
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <h3 className="text-xs font-medium text-gray-500 mb-3">
                {period.viewMode === 'month' ? '최근 6개월' : period.viewMode === 'quarter' ? '최근 6분기' : '최근 6년'} 수입/지출 추이
              </h3>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={trend} barGap={2} barCategoryGap="30%">
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      fmt(v),
                      name === 'income' ? '수입' : name === 'expense' ? '지출' : '순수익',
                    ]}
                    contentStyle={{ fontSize: 11, fontWeight: 'bold', borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Bar dataKey="income"  fill="#4fe8a0" radius={[3,3,0,0]} />
                  <Bar dataKey="expense" fill="#ff9090" radius={[3,3,0,0]} />
                  <Bar dataKey="net" radius={[3,3,0,0]}
                    fill="#4a6fdb"
                    label={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-1">
                <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-[#4fe8a0] inline-block" />수입</span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-[#ff9090] inline-block" />지출</span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-[#4a6fdb] inline-block" />순수익</span>
              </div>
            </div>

            {/* 카테고리별 지출 / 수입 2열 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* 카테고리별 지출 */}
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-gray-500">카테고리별 지출</h3>
                  {totalCatExp > 0 && (
                    <span className="text-xs font-semibold tabular-nums" style={{ color: '#d94f4f' }}>{fmt(totalCatExp)}</span>
                  )}
                </div>
                {renderCatSection(expenseGroups, 'expense', totalCatExp, grp => `exp|${grp}`)}
              </div>

              {/* 카테고리별 수입 */}
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-gray-500">카테고리별 수입</h3>
                  {totalCatInc > 0 && (
                    <span className="text-xs font-semibold tabular-nums" style={{ color: '#2a9d5c' }}>{fmt(totalCatInc)}</span>
                  )}
                </div>
                {renderCatSection(incomeGroups, 'income', totalCatInc, grp => `inc|${grp}`)}
              </div>
            </div>

            {/* 요일별 지출 패턴 */}
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <h3 className="text-xs font-medium text-gray-500 mb-3">요일별 지출 패턴</h3>
              <div className="flex items-end justify-between gap-1 h-24 px-1">
                {dowPattern.map((v, i) => {
                  const h     = maxDow > 0 ? Math.round((v / maxDow) * 100) : 0
                  const isMax = v === maxDow && v > 0
                  const isSel = selectedDow === i
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 cursor-pointer group"
                      onClick={() => handleDowClick(i)}>
                      <div className="w-full rounded-t flex flex-col justify-end" style={{ height: '80px' }}>
                        <div className="w-full rounded-t transition-all"
                          style={{
                            height: `${h}%`,
                            background: isSel ? '#1a1f2e' : isMax ? '#4a6fdb' : '#e8edf8',
                            minHeight: v > 0 ? '4px' : '0',
                          }} />
                      </div>
                      <span className={`text-[10px] transition-colors ${isSel ? 'text-[#1a1f2e] font-semibold' : 'text-gray-400 group-hover:text-gray-600'}`}>
                        {DOW_LABELS[i]}
                      </span>
                    </div>
                  )
                })}
              </div>
              {maxDow > 0 && (
                <p className="text-[10px] text-gray-400 mt-2 text-center">
                  최다 지출 요일: <span className="text-[#4a6fdb] font-medium">{DOW_LABELS[dowPattern.indexOf(maxDow)]}</span> ({fmt(maxDow)})
                </p>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* ── 팝업 모달 ─────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
          onClick={() => { setSelectedCat(null); setSelectedDow(null); setSelectedIds(new Set()) }}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: 'min(900px, 100%)', height: 'min(85vh, 100%)' }}
            onClick={e => e.stopPropagation()}>

            {/* 헤더 */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              {selectedDow !== null ? (
                <div className="w-6 h-6 rounded-lg bg-[#1a1f2e] flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] text-white font-medium">{DOW_LABELS[selectedDow]}</span>
                </div>
              ) : selectedCat && (() => {
                const meta = CAT_META[selectedCat.name] ??
                  (selectedCat.txType === 'income' ? { icon: 'ti-coins', color: '#2a9d5c', bg: '#f0fff6' } : { icon: 'ti-dots', color: '#f0a020', bg: '#fffbf0' })
                return (
                  <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
                    <i className={`ti ${meta.icon} text-xs`} style={{ color: meta.color }} />
                  </div>
                )
              })()}
              <span className="text-sm font-medium text-gray-800 flex-1 truncate">
                {selectedDow !== null
                  ? `${DOW_LABELS[selectedDow]}요일 지출`
                  : `${selectedCat?.name} · ${selectedCat?.txType === 'income' ? '수입' : '지출'}`}
              </span>
              {selectedIds.size > 0 && (
                <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex-shrink-0">
                  {selectedIds.size}개 선택 · {fmt(selAmount)}
                </span>
              )}
              <button onClick={() => { setSelectedCat(null); setSelectedDow(null); setSelectedIds(new Set()) }}
                className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                <i className="ti ti-x" />
              </button>
            </div>

            {/* 기간 선택기 (카테고리 모드만) */}
            {selectedCat && (
              <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 flex-shrink-0">
                <div className="flex gap-0.5 bg-gray-100 rounded-md p-0.5">
                  {(['year','quarter','month'] as const).map(m => (
                    <button key={m} onClick={() => catPeriod.setViewMode(m)}
                      className={`text-[10px] px-2 py-0.5 rounded transition-all
                        ${catPeriod.viewMode === m ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
                      {m === 'year' ? '년' : m === 'quarter' ? '분기' : '월'}
                    </button>
                  ))}
                </div>
                <button onClick={catPeriod.prev} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
                  <i className="ti ti-chevron-left text-xs" />
                </button>
                <span className="text-sm font-medium text-gray-700 w-28 text-center">{catPeriod.label}</span>
                <button onClick={catPeriod.next} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
                  <i className="ti ti-chevron-right text-xs" />
                </button>
                {selectedIds.size > 0 && (
                  <button onClick={() => setSelectedIds(new Set())}
                    className="ml-auto text-xs text-blue-400 hover:text-blue-600 flex items-center gap-0.5">
                    <i className="ti ti-x text-[10px]" />선택 해제
                  </button>
                )}
              </div>
            )}

            {/* 거래 목록 */}
            <div className="flex-1 overflow-y-auto select-none"
              onMouseUp={() => { mouseDownRef.current = false }}
              onMouseLeave={() => { mouseDownRef.current = false }}>
              <div className="sticky top-0 z-10 grid text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-2 bg-gray-50 border-b border-gray-100"
                style={{ gridTemplateColumns: '20px 84px 1.5fr 1fr 110px 60px' }}>
                <span /><span>날짜</span><span>내용</span><span>계정</span>
                <span className="text-right">금액</span><span />
              </div>
              {activeList.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-gray-300 text-sm">거래 내역 없음</div>
              ) : activeList.map((tx, idx) => {
                const isSel    = selectedIds.has(tx.id)
                const isInc    = selectedCat?.txType === 'income'
                const acctLbl  = selectedDow !== null ? tx.toAcct : (isInc ? tx.toAcct : tx.fromAcct)
                const amtColor = isInc ? '#2a9d5c' : '#d94f4f'
                return (
                  <div key={tx.id}
                    className={`grid items-center px-5 py-2.5 border-b border-gray-50 text-sm cursor-pointer transition-colors group
                      ${isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    style={{ gridTemplateColumns: '20px 84px 1.5fr 1fr 110px 60px' }}
                    onMouseDown={ev => handleMouseDown(idx, tx.id, ev)}
                    onMouseEnter={() => handleMouseEnter(idx, activeList)}>
                    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors
                      ${isSel ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                      {isSel && <i className="ti ti-check text-white" style={{ fontSize: '8px' }} />}
                    </span>
                    <span className="text-gray-400 text-xs">{tx.date.replace(/-/g, '.')}</span>
                    <span className="text-gray-700 font-medium truncate pr-2">{tx.desc}</span>
                    <span className="text-gray-500 text-xs truncate pr-2">{acctLbl}</span>
                    <span className="text-right tabular-nums font-medium" style={{ color: amtColor }}>
                      {isInc ? '+' : '-'}{tx.amount.toLocaleString()}
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
              {activeList.length > 0 && (
                <div className="sticky bottom-0 grid items-center px-5 py-2.5 bg-gray-50 border-t border-gray-200 text-sm font-semibold"
                  style={{ gridTemplateColumns: '20px 84px 1.5fr 1fr 110px 60px' }}>
                  <span className="col-span-4 text-gray-500">{activeList.length}건 합계</span>
                  <span className="text-right tabular-nums"
                    style={{ color: selectedCat?.txType === 'income' ? '#2a9d5c' : '#d94f4f' }}>
                    {selectedCat?.txType === 'income' ? '+' : '-'}{fmt(selectedDow !== null ? dowTotal : catTotal)}
                  </span>
                  <span />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 수정 모달 ────────────────────────────────────── */}
      {editTx && editForm && (
        <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center" onClick={() => setEditTx(null)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-gray-800">거래 수정</h3>
            <div className="flex gap-1">
              {(['expense','income','transfer'] as const).map(t => (
                <button key={t} onClick={() => setEditForm(f => f ? { ...f, type: t } : f)}
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
                <GroupedSelect value={editForm.fromAcct}
                  onChange={v => setEditForm(f => f ? { ...f, fromAcct: v } : f)}
                  groups={editFromGroups}
                  extraOpt={!allFromOpts.includes(editForm.fromAcct) ? editForm.fromAcct : undefined} />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">입금 <span className="text-gray-300">— 들어오는 곳</span></label>
                <GroupedSelect value={editForm.toAcct}
                  onChange={v => setEditForm(f => f ? { ...f, toAcct: v } : f)}
                  groups={editToGroups}
                  extraOpt={!allToOpts.includes(editForm.toAcct) ? editForm.toAcct : undefined} />
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
