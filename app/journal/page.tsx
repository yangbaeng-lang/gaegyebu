'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { fmt } from '@/lib/utils'
import { restoreQuickTxDate } from '@/lib/quickTxUtils'
import GroupedSelect from '@/components/GroupedSelect'
import AmountInput from '@/components/AmountInput'
import PeriodNav from '@/components/PeriodNav'
import Link from 'next/link'
import { usePeriod } from '@/lib/usePeriod'
import { exportTransactions } from '@/lib/exportExcel'
import { useSession } from '@/lib/SessionContext'

// ── 타입 ──────────────────────────────────────────────────────
type Tx = { id: number; type: string; date: string; desc: string; fromAcct: string; toAcct: string; amount: number; memo: string }
type Cats = { account_asset: string[]; account_liability: string[]; expense: string[]; income: string[]; networth: string[] }
type AcctType = 'asset' | 'liability' | 'revenue' | 'expense'
type JournalLine = { acctName: string; acctType: AcctType; amount: number }
type JournalEntry = { date: string; txId: number; tx: Tx; txType: string; desc: string; memo: string; dr: JournalLine; cr: JournalLine }

// ── 상수 ──────────────────────────────────────────────────────
const ACCT_META: Record<AcctType, { label: string; color: string; bg: string }> = {
  asset:     { label: '자산', color: '#4a6fdb', bg: '#eef2ff' },
  liability: { label: '부채', color: '#d94f4f', bg: '#fff0f0' },
  revenue:   { label: '수익', color: '#2a9d5c', bg: '#f0fff6' },
  expense:   { label: '비용', color: '#f0a020', bg: '#fffbf0' },
}
const TYPE_COLOR: Record<string, string> = { expense: '#d94f4f', income: '#2a9d5c', transfer: '#4a6fdb', income_expense: '#e07820' }
const TYPE_BG:    Record<string, string> = { expense: '#fff0f0', income: '#f0fff6', transfer: '#f0f4ff', income_expense: '#fff8f0' }
const TYPE_LABEL: Record<string, string> = { expense: '지출', income: '수입', transfer: '이체', income_expense: '수입+지출' }
const DOW = ['일','월','화','수','목','금','토']

function DateBtn({ value, onChange }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const display = value ? value.replace(/-/g, '') : ''
  return (
    <div className="relative" style={{ height: '28px', minWidth: '112px' }}>
      <div className={`absolute inset-0 flex items-center justify-between px-2 rounded-lg text-xs font-mono border select-none
        ${value ? 'border-gray-200 bg-white text-gray-800' : 'border-gray-200 bg-white text-gray-300'}`}>
        <span>{display || 'YYYYMMDD'}</span>
        <i className="ti ti-calendar text-gray-400 text-xs flex-shrink-0" />
      </div>
      <input type="date" value={value}
        onChange={e => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', zIndex: 1 }} />
    </div>
  )
}

// ── 헬퍼 함수 ─────────────────────────────────────────────────
function fmtShort(n: number): string {
  const abs = Math.abs(n), sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return sign + Math.floor(abs / 1_000).toLocaleString() + ',..'
  return n.toLocaleString()
}

function buildTypeMap(cats: Cats): Map<string, AcctType> {
  const m = new Map<string, AcctType>()
  cats.account_asset.forEach(n     => m.set(n, 'asset'))
  cats.account_liability.forEach(n => m.set(n, 'liability'))
  cats.income.forEach(n            => m.set(n, 'revenue'))
  cats.expense.forEach(n           => m.set(n, 'expense'))
  return m
}

function resolveType(name: string, txType: string, role: 'from' | 'to', map: Map<string, AcctType>): AcctType {
  if (map.has(name)) return map.get(name)!
  if (txType === 'income'   && role === 'from') return 'revenue'
  if (txType === 'income'   && role === 'to')   return 'asset'
  if (txType === 'expense'  && role === 'from') return 'asset'
  if (txType === 'expense'  && role === 'to')   return 'expense'
  return 'asset'
}

function toEntry(tx: Tx, map: Map<string, AcctType>): JournalEntry {
  return {
    date: tx.date, txId: tx.id, tx,
    txType: tx.type, desc: tx.desc, memo: tx.memo,
    dr: { acctName: tx.toAcct,   acctType: resolveType(tx.toAcct,   tx.type, 'to',   map), amount: tx.amount },
    cr: { acctName: tx.fromAcct, acctType: resolveType(tx.fromAcct, tx.type, 'from', map), amount: tx.amount },
  }
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export default function JournalPage() {
  type PanelState = { type: 'account'; name: string; acctType: AcctType } | { type: 'desc'; desc: string }

  const period       = usePeriod()
  const panelPeriod  = usePeriod()
  const { refreshKey: sessionKey, currentSid: sessionId } = useSession()
  const [txs,        setTxs]        = useState<Tx[]>([])
  const [panelTxs,   setPanelTxs]   = useState<Tx[]>([])
  const [cats,       setCats]       = useState<Cats>({ account_asset: [], account_liability: [], expense: [], income: [], networth: [] })
  const [editTx,     setEditTx]     = useState<Tx | null>(null)
  const [editForm,   setEditForm]   = useState<Tx | null>(null)
  const [panel,      setPanel]      = useState<PanelState | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income' | 'transfer'>('all')
  const [q,          setQ]          = useState('')
  const [qInput,     setQInput]     = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [sortBy,     setSortBy]     = useState('date_desc')
  const [toast,      setToast]      = useState('')
  const [selectedIds,     setSelectedIds]     = useState<Set<number>>(new Set())
  const [mainSelectedIds, setMainSelectedIds] = useState<Set<number>>(new Set())
  const panelMouseDownRef = useRef(false)
  const panelDragStartIdx = useRef(-1)
  const panelLastDragIdx  = useRef(-1)
  const mainMouseDownRef  = useRef(false)
  const mainDragStartIdx  = useRef(-1)
  const mainLastDragIdx   = useRef(-1)

  const fetchTxs = async () => {
    const from = dateFrom || period.dateFrom
    const to   = dateTo   || period.dateTo
    const res = await fetch(`/api/transactions?from=${from}&to=${to}`)
    const d   = await res.json()
    setTxs(d.data ?? [])
  }

  const fetchPanelTxs = useCallback(async (from: string, to: string) => {
    const res = await fetch(`/api/transactions?from=${from}&to=${to}`)
    const d   = await res.json()
    setPanelTxs(d.data ?? [])
  }, [])

  useEffect(() => { fetchTxs() }, [period.dateFrom, period.dateTo, dateFrom, dateTo, sessionKey])
  useEffect(() => { setMainSelectedIds(new Set()) }, [period.dateFrom, period.dateTo, dateFrom, dateTo, typeFilter, q])
  useEffect(() => {
    if (!panel) return
    fetchPanelTxs(panelPeriod.dateFrom, panelPeriod.dateTo)
  }, [panel, panelPeriod.dateFrom, panelPeriod.dateTo, sessionKey])

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(json => {
      const names = (arr: { name: string }[]) => arr?.map(c => c.name) ?? []
      setCats({
        account_asset:     names(json.grouped.account_asset),
        account_liability: names(json.grouped.account_liability),
        expense:           names(json.grouped.expense),
        income:            names(json.grouped.income),
        networth:          names(json.grouped.networth),
      })
    })
  }, [sessionKey])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }
  const openEdit  = (tx: Tx)      => { setEditTx(tx); setEditForm({ ...tx }) }

  const openPanel = (p: PanelState) => {
    const key    = p.type === 'account' ? p.name : p.desc
    const curKey = !panel ? null : panel.type === 'account' ? panel.name : panel.desc
    if (curKey !== key) { panelPeriod.syncFrom(period); setSelectedIds(new Set()) }
    setPanel(p)
  }

  const handlePanelMouseDown = useCallback((idx: number, txId: number, e: React.MouseEvent) => {
    e.preventDefault()
    panelMouseDownRef.current = true
    panelDragStartIdx.current = idx
    panelLastDragIdx.current  = idx
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(txId)) next.delete(txId); else next.add(txId)
      return next
    })
  }, [])

  const handlePanelMouseEnter = useCallback((idx: number, list: { id: number }[]) => {
    if (!panelMouseDownRef.current) return
    const lo = Math.min(panelDragStartIdx.current, idx)
    const hi = Math.max(panelDragStartIdx.current, idx)
    if (lo === Math.min(panelDragStartIdx.current, panelLastDragIdx.current) &&
        hi === Math.max(panelDragStartIdx.current, panelLastDragIdx.current)) return
    panelLastDragIdx.current = idx
    setSelectedIds(() => {
      const next = new Set<number>()
      for (let i = lo; i <= hi; i++) next.add(list[i].id)
      return next
    })
  }, [])

  const handleMainMouseDown = useCallback((idx: number, txId: number, e: React.MouseEvent) => {
    e.preventDefault()
    mainMouseDownRef.current = true
    mainDragStartIdx.current = idx
    mainLastDragIdx.current  = idx
    setMainSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(txId)) next.delete(txId); else next.add(txId)
      return next
    })
  }, [])

  const handleMainMouseEnter = useCallback((idx: number, list: { id: number }[]) => {
    if (!mainMouseDownRef.current) return
    const lo = Math.min(mainDragStartIdx.current, idx)
    const hi = Math.max(mainDragStartIdx.current, idx)
    if (lo === Math.min(mainDragStartIdx.current, mainLastDragIdx.current) &&
        hi === Math.max(mainDragStartIdx.current, mainLastDragIdx.current)) return
    mainLastDragIdx.current = idx
    setMainSelectedIds(() => {
      const next = new Set<number>()
      for (let i = lo; i <= hi; i++) next.add(list[i].id)
      return next
    })
  }, [])

  const handleEditSave = async () => {
    if (!editForm) return
    await fetch(`/api/transactions/${editForm.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setEditTx(null)
    showToast('수정됐습니다 ✓')
    fetchTxs()
    if (panel) fetchPanelTxs(panelPeriod.dateFrom, panelPeriod.dateTo)
  }

  const handleDelete = async (id: number) => {
    const tx = txs.find(t => t.id === id) ?? panelTxs.find(t => t.id === id)
    if (!confirm(`"${tx?.desc ?? '이 거래'}"를 삭제하시겠습니까?`)) return
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    showToast('삭제됐습니다')
    fetchTxs()
    if (panel) fetchPanelTxs(panelPeriod.dateFrom, panelPeriod.dateTo)
    if (tx) restoreQuickTxDate(sessionId, tx.desc, tx.date)
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const count = ids.length
    if (!confirm(`선택한 ${count}건을 삭제하시겠습니까?`)) return
    const allTxs = panel?.type === 'account' ? panelLedgerRows.map(r => r.tx) : panelDescRows
    await Promise.all(ids.map(id => fetch(`/api/transactions/${id}`, { method: 'DELETE' })))
    for (const tx of allTxs.filter(t => ids.includes(t.id))) {
      restoreQuickTxDate(sessionId, tx.desc, tx.date)
    }
    setSelectedIds(new Set())
    showToast(`${count}건 삭제됐습니다`)
    fetchTxs()
    fetchPanelTxs(panelPeriod.dateFrom, panelPeriod.dateTo)
  }

  // 변환 및 필터
  const typeMap = useMemo(() => buildTypeMap(cats), [cats])
  const entries = useMemo(() => txs.map(tx => toEntry(tx, typeMap)), [txs, typeMap])


  const filtered = useMemo(() => {
    const list = entries
      .filter(e => typeFilter === 'all' || e.txType === typeFilter)
      .filter(e => !q.trim() || e.desc.includes(q.trim()) || e.memo.includes(q.trim()))
    switch (sortBy) {
      case 'date_asc':   return [...list].sort((a, b) =>  a.date.localeCompare(b.date) ||  a.txId - b.txId)
      case 'date_desc':  return [...list].sort((a, b) =>  b.date.localeCompare(a.date) ||  b.txId - a.txId)
      case 'amt_asc':    return [...list].sort((a, b) =>  a.dr.amount - b.dr.amount)
      case 'amt_desc':   return [...list].sort((a, b) =>  b.dr.amount - a.dr.amount)
      case 'desc_asc':   return [...list].sort((a, b) =>  a.desc.localeCompare(b.desc, 'ko'))
      case 'desc_desc':  return [...list].sort((a, b) =>  b.desc.localeCompare(a.desc, 'ko'))
      default:           return [...list].sort((a, b) =>  b.date.localeCompare(a.date) ||  b.txId - a.txId)
    }
  }, [entries, typeFilter, q, sortBy])

  // KPI (기간 전체 기준)
  const kpiIncome  = useMemo(() => txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [txs])
  const kpiExpense = useMemo(() => txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [txs])

  const totalDr = useMemo(() => entries.reduce((s, e) => s + e.dr.amount, 0), [entries])
  const totalCr = useMemo(() => entries.reduce((s, e) => s + e.cr.amount, 0), [entries])
  const balanced = totalDr === totalCr
  const kpiNet = kpiIncome - kpiExpense

  // 패널 – 계정 원장 (날짜 오름차순 + 누적잔액)
  const panelLedgerRows = useMemo(() => {
    if (!panel || panel.type !== 'account') return []
    const rows: { tx: Tx; side: 'dr' | 'cr'; balance: number }[] = []
    let bal = 0
    const sorted = [...panelTxs].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    for (const tx of sorted) {
      const isDr = tx.toAcct   === panel.name
      const isCr = tx.fromAcct === panel.name
      if (!isDr && !isCr) continue
      const side = isDr ? 'dr' : 'cr'
      bal += isDr ? tx.amount : -tx.amount
      rows.push({ tx, side, balance: bal })
    }
    return rows
  }, [panelTxs, panel])

  // 패널 – 내용별 거래 목록
  const panelDescRows = useMemo(() => {
    if (!panel || panel.type !== 'desc') return []
    return [...panelTxs]
      .filter(tx => tx.desc === panel.desc)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  }, [panelTxs, panel])

  const selAmount = useMemo(() => {
    const all = panel?.type === 'account' ? panelLedgerRows.map(r => r.tx) : panelDescRows
    return all.filter(tx => selectedIds.has(tx.id)).reduce((s, tx) => s + tx.amount, 0)
  }, [panel, panelLedgerRows, panelDescRows, selectedIds])

  const currentPanelIds = useMemo(() =>
    panel?.type === 'account' ? panelLedgerRows.map(r => r.tx.id) : panelDescRows.map(t => t.id),
    [panel, panelLedgerRows, panelDescRows])
  const allSelected = currentPanelIds.length > 0 && currentPanelIds.every(id => selectedIds.has(id))

  const handleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(currentPanelIds))
  }

  // 메인 목록 전체선택/삭제
  const allMainSelected = filtered.length > 0 && filtered.every(e => mainSelectedIds.has(e.txId))

  const handleMainSelectAll = () => {
    if (allMainSelected) setMainSelectedIds(new Set())
    else setMainSelectedIds(new Set(filtered.map(e => e.txId)))
  }

  const mainSelAmount = useMemo(() =>
    filtered.filter(e => mainSelectedIds.has(e.txId)).reduce((s, e) => s + e.dr.amount, 0)
  , [filtered, mainSelectedIds])

  const handleDeleteMainSelected = async () => {
    if (mainSelectedIds.size === 0) return
    const ids = Array.from(mainSelectedIds)
    if (!confirm(`선택한 ${ids.length}건을 삭제하시겠습니까?`)) return
    await Promise.all(ids.map(id => fetch(`/api/transactions/${id}`, { method: 'DELETE' })))
    for (const tx of txs.filter(t => ids.includes(t.id))) {
      restoreQuickTxDate(sessionId, tx.desc, tx.date)
    }
    setMainSelectedIds(new Set())
    showToast(`${ids.length}건 삭제됐습니다`)
    fetchTxs()
  }

  // 수정 모달용 드롭다운 그룹
  const editFromGroups = [
    { label: '자산 계정',  opts: cats.account_asset     },
    { label: '부채 계정',  opts: cats.account_liability },
    { label: '수입 분류',  opts: cats.income            },
    { label: '순자산 분류', opts: cats.networth          },
  ]
  const editToGroups = [
    { label: '자산 계정',     opts: cats.account_asset     },
    { label: '부채 계정',     opts: cats.account_liability },
    { label: '수입 분류',     opts: cats.income            },
    { label: '지출 카테고리', opts: cats.expense           },
    { label: '순자산 분류',   opts: cats.networth          },
  ]
  const allFromOpts = editFromGroups.flatMap(g => g.opts)
  const allToOpts   = editToGroups.flatMap(g => g.opts)

  return (
    <div className="flex flex-col h-full">
      <PeriodNav label={period.label} viewMode={period.viewMode} setViewMode={period.setViewMode}
        year={period.year} setYear={period.setYear}
        quarter={period.quarter} setQuarter={period.setQuarter}
        month={period.month} setMonth={period.setMonth}
        prev={period.prev} next={period.next}>
        <button onClick={() => exportTransactions(txs, period.label)}
          title="엑셀 다운로드"
          className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
          <i className="ti ti-table-export text-base" />
        </button>
        <Link href="/settings" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <i className="ti ti-settings text-sm" />계정 관리
        </Link>
      </PeriodNav>

      <div className="flex-1 flex overflow-hidden">

        {/* ── 거래내역 메인 ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-[1080px] mx-auto space-y-3">

            {/* KPI */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '총 수입',  val: fmt(kpiIncome),  color: '#2a9d5c' },
                { label: '총 지출',  val: fmt(kpiExpense), color: '#d94f4f' },
                { label: '순수익',   val: fmt(kpiNet),     color: kpiNet >= 0 ? '#2a9d5c' : '#d94f4f' },
                { label: '거래 건수', val: `${entries.length}건`, color: '#888' },
              ].map(k => (
                <div key={k.label} className="bg-white border border-gray-100 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">{k.label}</p>
                  <p className="text-base font-medium" style={{ color: k.color }}>{k.val}</p>
                </div>
              ))}
            </div>

            {/* 필터 + 검색 */}
            <div className="bg-white border border-gray-100 rounded-xl p-3 flex gap-2 items-center flex-wrap">
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 h-7 focus:outline-none focus:border-blue-300 text-gray-600 flex-shrink-0">
                <option value="date_desc">날짜 최신순</option>
                <option value="date_asc">날짜 과거순</option>
                <option value="amt_desc">금액 높은순</option>
                <option value="amt_asc">금액 낮은순</option>
                <option value="desc_asc">항목 가나다순</option>
                <option value="desc_desc">항목 가나다 역순</option>
              </select>
              <div className="flex gap-1 flex-shrink-0">
                {(['all','expense','income','transfer'] as const).map(t => (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    className={`text-xs px-3 py-1 rounded-full border transition-all ${typeFilter === t ? 'bg-[#1a1f2e] text-white border-[#1a1f2e]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {t === 'all' ? '전체' : t === 'expense' ? '지출' : t === 'income' ? '수입' : '이체'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs text-gray-400">시작일</span>
                <DateBtn value={dateFrom} onChange={setDateFrom} />
                <span className="text-xs text-gray-300">~</span>
                <span className="text-xs text-gray-400">종료일</span>
                <DateBtn value={dateTo} onChange={setDateTo} />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(''); setDateTo('') }}
                    className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-0.5 px-2 h-7 border border-gray-200 rounded-lg hover:bg-red-50 transition-colors">
                    <i className="ti ti-x text-[10px]" />초기화
                  </button>
                )}
              </div>
              <div className="flex flex-1 gap-1 flex-shrink-0">
                <input value={qInput} onChange={e => setQInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && setQ(qInput)}
                  placeholder="내용 검색"
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-3 h-7 focus:outline-none focus:border-blue-300" />
                <button onClick={() => setQ(qInput)}
                  className="px-3 h-7 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50">
                  <i className="ti ti-search" />
                </button>
              </div>
              {/* 선택 삭제 영역 */}
              {filtered.length > 0 && (
                <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                  {mainSelectedIds.size > 0 && (
                    <>
                      <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                        {mainSelectedIds.size}건 · {fmt(mainSelAmount)}
                      </span>
                      <button onClick={handleDeleteMainSelected}
                        className="text-xs text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full hover:bg-red-100 transition-colors flex items-center gap-0.5">
                        <i className="ti ti-trash text-[10px]" />선택 삭제
                      </button>
                    </>
                  )}
                  <button onClick={handleMainSelectAll}
                    className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5 transition-colors">
                    <i className={`ti ${allMainSelected ? 'ti-square-minus' : 'ti-square-check'} text-[10px]`} />
                    {allMainSelected ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
              )}
            </div>

            {/* 거래내역 테이블 */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden select-none"
              onMouseUp={() => { mainMouseDownRef.current = false }}
              onMouseLeave={() => { mainMouseDownRef.current = false }}>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300 text-xs gap-2">
                  <i className="ti ti-receipt-off text-3xl" />거래 내역이 없습니다
                </div>
              ) : (
                <>
                  {filtered.map((e, idx) => {
                    const drMeta = ACCT_META[e.dr.acctType]
                    const crMeta = ACCT_META[e.cr.acctType]
                    const d = new Date(e.date)
                    const isSel = mainSelectedIds.has(e.txId)
                    return (
                      <div key={e.txId}
                        className={`grid items-center px-4 py-3 border-b border-gray-50 group text-sm transition-colors cursor-pointer
                          ${isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        style={{ gridTemplateColumns: '20px 110px 1.5fr 1fr 1fr 100px 100px 100px 56px' }}
                        onMouseDown={ev => handleMainMouseDown(idx, e.txId, ev)}
                        onMouseEnter={() => handleMainMouseEnter(idx, filtered.map(f => ({ id: f.txId })))}>
                        {/* 체크박스 */}
                        <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors
                          ${isSel ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                          {isSel && <i className="ti ti-check text-white" style={{ fontSize: '8px' }} />}
                        </span>
                        {/* 날짜 */}
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-gray-700 font-medium">{e.date}</span>
                          <span className="text-[10px] text-gray-400">({DOW[d.getDay()]})</span>
                        </div>
                        {/* 내용 */}
                        <button className="text-left text-gray-700 font-medium truncate pr-2 hover:text-blue-600 transition-colors"
                          onClick={ev => { ev.stopPropagation(); openPanel({ type: 'desc', desc: e.desc }) }}>
                          {e.desc}
                        </button>
                        {/* 차변 계정 */}
                        <button className="flex items-center gap-1.5 min-w-0 text-left hover:opacity-70"
                          onClick={ev => { ev.stopPropagation(); openPanel({ type: 'account', name: e.dr.acctName, acctType: e.dr.acctType }) }}>
                          <span className="text-[9px] px-1 py-0.5 rounded font-medium flex-shrink-0"
                            style={{ background: drMeta.bg, color: drMeta.color }}>{drMeta.label}</span>
                          <span className="text-xs text-gray-800 truncate">{e.dr.acctName}</span>
                        </button>
                        {/* 대변 계정 */}
                        <button className="flex items-center gap-1.5 min-w-0 text-left hover:opacity-70"
                          onClick={ev => { ev.stopPropagation(); openPanel({ type: 'account', name: e.cr.acctName, acctType: e.cr.acctType }) }}>
                          <span className="text-[9px] px-1 py-0.5 rounded font-medium flex-shrink-0"
                            style={{ background: crMeta.bg, color: crMeta.color }}>{crMeta.label}</span>
                          <span className="text-xs text-gray-600 truncate">{e.cr.acctName}</span>
                        </button>
                        {/* 금액 */}
                        <span className="text-[13px] text-right font-medium tabular-nums" style={{ color: '#4a6fdb' }}>
                          {e.dr.amount.toLocaleString()}
                        </span>
                        <span className="text-[13px] text-right font-medium tabular-nums" style={{ color: '#f0a020' }}>
                          {e.cr.amount.toLocaleString()}
                        </span>
                        {/* 적요 */}
                        <span className="text-[10px] text-gray-400 text-center" title={e.memo}>
                          {e.memo.length > 7 ? e.memo.slice(0, 7) + '…' : e.memo}
                        </span>
                        {/* 수정/삭제 */}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end"
                          onMouseDown={ev => ev.stopPropagation()}>
                          <button onClick={ev => { ev.stopPropagation(); openEdit(e.tx) }}
                            className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50">
                            <i className="ti ti-pencil text-xs" />
                          </button>
                          <button onClick={ev => { ev.stopPropagation(); handleDelete(e.txId) }}
                            className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
                            <i className="ti ti-trash text-xs" />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* 합계 */}
                  {(() => {
                    const fDr = filtered.reduce((s, e) => s + e.dr.amount, 0)
                    const fCr = filtered.reduce((s, e) => s + e.cr.amount, 0)
                    return (
                      <div className="grid items-center px-4 py-2.5 bg-gray-50 border-t border-gray-200 text-xs font-semibold"
                        style={{ gridTemplateColumns: '20px 110px 1.5fr 1fr 1fr 100px 100px 100px 56px' }}>
                        <span className="text-gray-500 col-span-5">{filtered.length}건 합계</span>
                        <span className="text-right tabular-nums" style={{ color: '#4a6fdb' }}>{fmt(fDr)}</span>
                        <span className="text-right tabular-nums" style={{ color: '#f0a020' }}>{fmt(fCr)}</span>
                        <span className="col-span-2" />
                      </div>
                    )
                  })()}
                </>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ── 팝업 모달 ─────────────────────────────────────── */}
      {panel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
          onClick={() => { setPanel(null); setSelectedIds(new Set()) }}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: 'min(900px, 100%)', height: 'min(85vh, 100%)' }}
            onClick={e => e.stopPropagation()}>

            {/* 모달 헤더 */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              {panel.type === 'account' ? (
                <span className="text-[11px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                  style={{ background: ACCT_META[panel.acctType].bg, color: ACCT_META[panel.acctType].color }}>
                  {ACCT_META[panel.acctType].label}
                </span>
              ) : (
                <i className="ti ti-file-description text-gray-400 flex-shrink-0" />
              )}
              <span className="text-sm font-medium text-gray-800 flex-1 truncate">
                {panel.type === 'account' ? panel.name : panel.desc}
              </span>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex-shrink-0">
                    {selectedIds.size}건 선택 · {fmt(selAmount)}
                  </span>
                  <button onClick={handleDeleteSelected}
                    className="text-xs text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex-shrink-0 hover:bg-red-100 transition-colors flex items-center gap-0.5">
                    <i className="ti ti-trash text-[10px]" />선택 삭제
                  </button>
                </>
              )}
              <button onClick={() => { setPanel(null); setSelectedIds(new Set()) }} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                <i className="ti ti-x" />
              </button>
            </div>

            {/* 기간 선택기 */}
            <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 flex-shrink-0">
              <div className="flex gap-0.5 bg-gray-100 rounded-md p-0.5">
                {(['year','quarter','month'] as const).map(m => (
                  <button key={m} onClick={() => panelPeriod.setViewMode(m)}
                    className={`text-[10px] px-2 py-0.5 rounded transition-all
                      ${panelPeriod.viewMode === m ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
                    {m === 'year' ? '년' : m === 'quarter' ? '분기' : '월'}
                  </button>
                ))}
              </div>
              <button onClick={panelPeriod.prev} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
                <i className="ti ti-chevron-left text-xs" />
              </button>
              <span className="text-sm font-medium text-gray-700 w-28 text-center">{panelPeriod.label}</span>
              <button onClick={panelPeriod.next} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
                <i className="ti ti-chevron-right text-xs" />
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={handleSelectAll}
                  className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5 transition-colors">
                  <i className={`ti ${allSelected ? 'ti-square-minus' : 'ti-square-check'} text-[10px]`} />
                  {allSelected ? '모두 해제' : '모두 선택'}
                </button>
                {selectedIds.size > 0 && !allSelected && (
                  <button onClick={() => setSelectedIds(new Set())}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors">
                    <i className="ti ti-x text-[10px]" />선택 해제
                  </button>
                )}
              </div>
            </div>

            {panel.type === 'account' ? (
              /* ── 계정 원장 (확대) ── */
              <div className="flex-1 overflow-y-auto select-none"
                onMouseUp={() => { panelMouseDownRef.current = false }}
                onMouseLeave={() => { panelMouseDownRef.current = false }}>
                <div className="sticky top-0 z-10 grid text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-2 bg-gray-50 border-b border-gray-100"
                  style={{ gridTemplateColumns: '20px 80px 1fr 110px 110px 120px 60px' }}>
                  <span />
                  <span>날짜</span>
                  <span>내용</span>
                  <span className="text-right">출금</span>
                  <span className="text-right">입금</span>
                  <span className="text-right">잔액</span>
                  <span />
                </div>
                {panelLedgerRows.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-gray-300 text-sm">거래 내역 없음</div>
                ) : panelLedgerRows.map(({ tx, side, balance }, idx) => {
                  const isSel = selectedIds.has(tx.id)
                  return (
                    <div key={tx.id}
                      className={`grid items-center px-5 py-2.5 border-b border-gray-50 text-sm cursor-pointer transition-colors group
                        ${isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      style={{ gridTemplateColumns: '20px 80px 1fr 110px 110px 120px 60px' }}
                      onMouseDown={ev => handlePanelMouseDown(idx, tx.id, ev)}
                      onMouseEnter={() => handlePanelMouseEnter(idx, panelLedgerRows.map(r => ({ id: r.tx.id })))}>
                      <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors
                        ${isSel ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                        {isSel && <i className="ti ti-check text-white" style={{ fontSize: '8px' }} />}
                      </span>
                      <span className="text-gray-400 text-xs">{tx.date.replace(/-/g, '.')}</span>
                      <span className="text-gray-700 truncate pr-2">{tx.desc}</span>
                      <span className="text-right tabular-nums" style={{ color: side === 'dr' ? '#4a6fdb' : '' }}>
                        {side === 'dr' ? tx.amount.toLocaleString() : ''}
                      </span>
                      <span className="text-right tabular-nums" style={{ color: side === 'cr' ? '#f0a020' : '' }}>
                        {side === 'cr' ? tx.amount.toLocaleString() : ''}
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
                {panelLedgerRows.length > 0 && (() => {
                  const sumDr = panelLedgerRows.filter(r => r.side === 'dr').reduce((s, r) => s + r.tx.amount, 0)
                  const sumCr = panelLedgerRows.filter(r => r.side === 'cr').reduce((s, r) => s + r.tx.amount, 0)
                  const final = panelLedgerRows[panelLedgerRows.length - 1].balance
                  return (
                    <div className="sticky bottom-0 grid items-center px-5 py-2.5 bg-gray-50 border-t border-gray-200 text-sm font-semibold"
                      style={{ gridTemplateColumns: '20px 80px 1fr 110px 110px 120px 60px' }}>
                      <span className="col-span-3 text-gray-500">합계</span>
                      <span className="text-right tabular-nums" style={{ color: '#4a6fdb' }}>{sumDr.toLocaleString()}</span>
                      <span className="text-right tabular-nums" style={{ color: '#f0a020' }}>{sumCr.toLocaleString()}</span>
                      <span className="text-right tabular-nums" style={{ color: final >= 0 ? '#2a9d5c' : '#d94f4f' }}>{final.toLocaleString()}</span>
                      <span />
                    </div>
                  )
                })()}
              </div>
            ) : (
              /* ── 내용별 거래 (확대) ── */
              <div className="flex-1 overflow-y-auto select-none"
                onMouseUp={() => { panelMouseDownRef.current = false }}
                onMouseLeave={() => { panelMouseDownRef.current = false }}>
                <div className="sticky top-0 z-10 grid text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-2 bg-gray-50 border-b border-gray-100"
                  style={{ gridTemplateColumns: '20px 80px 1.5fr 1fr 1fr 110px 60px' }}>
                  <span />
                  <span>날짜</span>
                  <span>내용</span>
                  <span>출금</span>
                  <span>입금</span>
                  <span className="text-right">금액</span>
                  <span />
                </div>
                {panelDescRows.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-gray-300 text-sm">거래 내역 없음</div>
                ) : panelDescRows.map((tx, idx) => {
                  const isSel = selectedIds.has(tx.id)
                  return (
                    <div key={tx.id}
                      className={`grid items-center px-5 py-2.5 border-b border-gray-50 text-sm cursor-pointer transition-colors group
                        ${isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      style={{ gridTemplateColumns: '20px 80px 1.5fr 1fr 1fr 110px 60px' }}
                      onMouseDown={ev => handlePanelMouseDown(idx, tx.id, ev)}
                      onMouseEnter={() => handlePanelMouseEnter(idx, panelDescRows)}>
                      <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors
                        ${isSel ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                        {isSel && <i className="ti ti-check text-white" style={{ fontSize: '8px' }} />}
                      </span>
                      <span className="text-gray-400 text-xs">{tx.date.replace(/-/g, '.')}</span>
                      <span className="text-gray-700 font-medium truncate pr-2">{tx.desc}</span>
                      <span className="text-gray-600 truncate pr-2 text-xs">{tx.fromAcct}</span>
                      <span className="text-gray-600 truncate pr-2 text-xs">{tx.toAcct}</span>
                      <span className="text-right tabular-nums font-medium" style={{ color: '#4a6fdb' }}>
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
                {panelDescRows.length > 0 && (
                  <div className="sticky bottom-0 grid items-center px-5 py-2.5 bg-gray-50 border-t border-gray-200 text-sm font-semibold"
                    style={{ gridTemplateColumns: '20px 80px 1.5fr 1fr 1fr 110px 60px' }}>
                    <span className="col-span-5 text-gray-500">{panelDescRows.length}건 합계</span>
                    <span className="text-right tabular-nums" style={{ color: '#4a6fdb' }}>
                      {panelDescRows.reduce((s, t) => s + t.amount, 0).toLocaleString()}
                    </span>
                    <span />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 수정 모달 ─────────────────────────────────────── */}
      {editTx && editForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
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
