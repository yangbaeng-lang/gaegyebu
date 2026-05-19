'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import PeriodNav from '@/components/PeriodNav'
import { usePeriod } from '@/lib/usePeriod'
import AmountInput from '@/components/AmountInput'
import GroupedSelect from '@/components/GroupedSelect'
import { QuickTx, loadQuickTxs, saveQuickTxs as saveQTxs, restoreQuickTxDate } from '@/lib/quickTxUtils'
import { useSession } from '@/lib/SessionContext'

type Tx   = { id: number; type: string; date: string; desc: string; fromAcct: string; toAcct: string; amount: number; memo: string }
type Cats = { account_asset: string[]; account_liability: string[]; expense: string[]; income: string[]; networth: string[] }
type Cat  = { id: number; type: string; name: string; group: string; sortOrder: number; hidden: boolean }

const TYPE_COLOR: Record<string, string> = { expense: '#d94f4f', income: '#2a9d5c', transfer: '#4a6fdb', income_expense: '#e07820' }
const TYPE_BG:    Record<string, string> = { expense: '#fff0f0', income: '#f0fff6', transfer: '#f0f4ff', income_expense: '#fff8f0' }
const TYPE_LABEL: Record<string, string> = { expense: '지출', income: '수입', transfer: '이체', income_expense: '수입+지출' }
const DOW = ['일','월','화','수','목','금','토']

function inferType(from: string, to: string, cats: Cats): 'income' | 'expense' | 'transfer' | 'income_expense' {
  if (cats.networth.includes(from) || cats.networth.includes(to)) return 'transfer'
  if (cats.income.includes(from) && cats.expense.includes(to))    return 'income_expense'
  if (cats.expense.includes(to))   return 'expense'
  if (cats.income.includes(from))  return 'income'
  return 'transfer'
}

type AcctSubGroup = { name: string; items: string[] }
type AcctSection  = { label: string; subGroups: AcctSubGroup[] }

function buildSubGroups(type: string, rawCats: Cat[], items: string[]): AcctSubGroup[] {
  const anchors = rawCats
    .filter(c => c.type === type && c.name === '__group__')
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const result: AcctSubGroup[] = []
  const usedNames = new Set<string>()
  for (const anchor of anchors) {
    const groupItems = rawCats
      .filter(c => c.type === type && c.group === anchor.group && c.name !== '__group__')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(c => c.name)
      .filter(n => items.includes(n))
    if (groupItems.length > 0) {
      result.push({ name: anchor.group, items: groupItems })
      groupItems.forEach(n => usedNames.add(n))
    }
  }
  const ungrouped = items.filter(n => !usedNames.has(n))
  if (ungrouped.length > 0) result.push({ name: '', items: ungrouped })
  return result
}

type AcctPaneProps = {
  side: 'from' | 'to'; selected: string; sections: AcctSection[]; onSelect: (acc: string) => void
  showHidden: boolean; onToggleShowHidden: () => void
}
const SIGN_MAP: Record<string, Record<string, { sign: string; color: string }>> = {
  from: {
    '자산':  { sign: '-', color: '#d94f4f' },
    '부채':  { sign: '+', color: '#2a9d5c' },
    '수입':  { sign: '+', color: '#2a9d5c' },
  },
  to: {
    '자산':  { sign: '+', color: '#2a9d5c' },
    '부채':  { sign: '-', color: '#d94f4f' },
    '지출':  { sign: '-', color: '#d94f4f' },
  },
}

function AcctPane({ side, selected, sections, onSelect, showHidden, onToggleShowHidden }: AcctPaneProps) {
  const color = side === 'from' ? '#2a9d5c' : '#4a6fdb'
  const bg    = side === 'from' ? '#f0fff6' : '#f0f4ff'
  const dirLabel = side === 'from' ? '나가는 곳' : '들어오는 곳'
  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 flex-shrink-0"
        style={{ background: bg }}>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium opacity-60" style={{ color }}>{dirLabel}</p>
          <p className="text-sm font-semibold truncate" style={{ color }}>{selected || '—'}</p>
        </div>
        {side === 'from' && (
          <button onClick={onToggleShowHidden}
            title={showHidden ? '숨김 항목 숨기기' : '숨김 항목 표시'}
            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors flex-shrink-0
              ${showHidden
                ? 'border-orange-300 text-orange-500 bg-orange-50'
                : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-white/60'}`}>
            <i className={`ti ${showHidden ? 'ti-eye' : 'ti-eye-off'} text-[10px]`} />
            {showHidden ? '숨김 표시 중' : '숨김 항목'}
          </button>
        )}
      </div>
      <div className="px-2 py-2 space-y-3">
        {sections.map((sec) => (
          <div key={sec.label}>
            <div className="flex items-center mb-1.5 bg-gray-300 rounded px-2 py-0.5">
              <span className="text-[12px] font-bold text-gray-600 uppercase tracking-wider">{sec.label}</span>
            </div>
            {sec.subGroups.map(sub => (
              <div key={sub.name || '__none__'} className="mb-2">
                {sub.name && (
                  <p className="text-[11px] text-gray-500 font-medium mb-1 bg-gray-100 rounded px-2 py-0.5">{sub.name}</p>
                )}
                <div className="flex flex-wrap gap-1 ml-0.5">
                  {sub.items.map(acc => {
                    const isSel  = acc === selected
                    const signInfo = SIGN_MAP[side]?.[sec.label]
                    return (
                      <button key={acc} onClick={() => onSelect(acc)}
                        className="text-xs px-2.5 py-0.5 rounded-full transition-all flex items-center gap-0.5"
                        style={isSel
                          ? { background: color, color: '#fff' }
                          : { background: 'transparent', color: '#555' }}>
                        {acc}
                        {signInfo && !isSel && (
                          <span className="font-bold text-[11px]" style={{ color: signInfo.color }}>{signInfo.sign}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function InsertPage() {
  const today = new Date()
  const period = usePeriod()
  const { refreshKey: sessionKey } = useSession()
  const [cats,       setCats]       = useState<Cats>({ account_asset: [], account_liability: [], expense: [], income: [], networth: [] })
  const [rawCats,    setRawCats]    = useState<Cat[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [form,  setForm]  = useState({
    date: today.toISOString().split('T')[0],
    desc: '', amount: 0, memo: '', fromAcct: '', toAcct: '',
  })
  const [txs,       setTxs]       = useState<Tx[]>([])
  const [editTx,    setEditTx]    = useState<Tx | null>(null)
  const [editForm,  setEditForm]  = useState<Tx | null>(null)
  const [toast,     setToast]     = useState('')
  const [quickTxs,     setQuickTxs]     = useState<QuickTx[]>([])
  const [editQuickId,  setEditQuickId]  = useState<string | null>(null)
  const [editQuickForm,setEditQuickForm]= useState<QuickTx | null>(null)
  const [sessionId, setSessionId] = useState(1)
  const [suggestions, setSuggestions] = useState<{ desc: string; amount: number; fromAcct: string; toAcct: string; memo: string }[]>([])
  const [showSuggest, setShowSuggest] = useState(false)
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quickTxsRef    = useRef<QuickTx[]>([])
  const activeQuickRef = useRef<string | null>(null)

  const fetchCats = async () => {
    const res  = await fetch('/api/categories')
    const json = await res.json()
    const toNames = (arr: { name: string }[]) => arr?.map(c => c.name) ?? []
    const g: Cats = {
      account_asset:     toNames(json.grouped.account_asset),
      account_liability: toNames(json.grouped.account_liability),
      expense:           toNames(json.grouped.expense),
      income:            toNames(json.grouped.income),
      networth:          toNames(json.grouped.networth),
    }
    setCats(g)
    setRawCats(json.raw ?? [])
    const allAccounts = [...g.account_asset, ...g.account_liability]
    setForm(f => ({
      ...f,
      fromAcct: f.fromAcct || g.income[0]    || allAccounts[0] || '',
      toAcct:   f.toAcct   || allAccounts[0] || g.expense[0]   || '',
    }))
  }

  const fetchTxs = async () => {
    const res  = await fetch(`/api/transactions?from=${period.dateFrom}&to=${period.dateTo}`)
    const json = await res.json()
    setTxs(json.data)
  }

  useEffect(() => { fetchCats() }, [sessionKey])
  useEffect(() => { fetchTxs() }, [period.dateFrom, period.dateTo, sessionKey])

  // 빠른 입력 — 세션별 localStorage
  useEffect(() => {
    fetch('/api/sessions').then(r => r.json()).then(d => {
      const sid = d.current ?? 1
      setSessionId(sid)
      try {
        const list = loadQuickTxs(sid)
        if (list.length) { setQuickTxs(list); quickTxsRef.current = list }
      } catch {}
    })
  }, [])

  const saveQuickTxs = (list: QuickTx[], sid = sessionId) => {
    setQuickTxs(list)
    quickTxsRef.current = list
    saveQTxs(sid, list)
  }

  const handleDescChange = (val: string) => {
    setForm(f => ({ ...f, desc: val }))
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    if (!val.trim()) { setSuggestions([]); setShowSuggest(false); return }
    suggestTimer.current = setTimeout(async () => {
      const res  = await fetch(`/api/transactions/suggest?q=${encodeURIComponent(val)}`)
      const data = await res.json()
      setSuggestions(data)
      setShowSuggest(data.length > 0)
    }, 200)
  }

  const applySuggestion = (s: typeof suggestions[0]) => {
    setForm(f => ({ ...f, desc: s.desc, amount: s.amount, fromAcct: s.fromAcct, toAcct: s.toAcct, memo: s.memo }))
    setSuggestions([]); setShowSuggest(false)
  }

  const addQuickTx = () => {
    if (!form.desc || form.amount === 0) return showToast('내용과 금액을 먼저 입력하세요')
    const day = form.date ? parseInt(form.date.split('-')[2]) : new Date().getDate()
    const newItem: QuickTx = {
      id: Date.now().toString(),
      desc: form.desc, amount: form.amount,
      fromAcct: form.fromAcct, toAcct: form.toAcct, memo: form.memo,
      day,
    }
    saveQuickTxs([...quickTxs, newItem])
    showToast(`"${form.desc}" (매월 ${day}일) 빠른 입력에 저장 ✓`)
  }

  const deleteQuickTx = (id: string) => {
    if (!confirm('빠른 입력 항목을 삭제하시겠습니까?')) return
    saveQuickTxs(quickTxs.filter(q => q.id !== id))
  }

  const openEditQuickTx = (q: QuickTx) => { setEditQuickId(q.id); setEditQuickForm({ ...q }) }

  const saveEditQuickTx = () => {
    if (!editQuickForm) return
    saveQuickTxs(quickTxs.map(q => q.id === editQuickForm.id ? editQuickForm : q))
    setEditQuickId(null); setEditQuickForm(null)
    showToast(`"${editQuickForm.desc}" 빠른 입력 수정됨 ✓`)
  }

  const runQuickTx = (q: QuickTx) => {
    const now = new Date()
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const useYm = (q.nextYm && q.nextYm >= currentYm) ? q.nextYm : currentYm
    const [ys, ms] = useYm.split('-')
    const yn = parseInt(ys), mn = parseInt(ms)
    const maxDay = new Date(yn, mn, 0).getDate()
    const d = String(Math.min(q.day, maxDay)).padStart(2, '0')
    activeQuickRef.current = q.id
    setForm(f => ({ ...f, date: `${useYm}-${d}`, desc: q.desc, amount: q.amount, fromAcct: q.fromAcct, toAcct: q.toAcct, memo: q.memo }))
  }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const handleSubmit = async () => {
    if (!form.desc || form.amount === 0) return showToast('내용과 금액을 입력해주세요')
    const type = inferType(form.fromAcct, form.toAcct, cats)
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, type }),
    })
    setForm(f => ({ ...f, desc: '', amount: 0, memo: '' }))
    showToast('입력됐습니다 ✓')
    fetchTxs()

    // 빠른 입력으로 채운 경우 → 다음 달로 진행
    if (activeQuickRef.current) {
      const [ys, ms] = form.date.split('-')
      let ny = parseInt(ms) + 1, yy = parseInt(ys)
      if (ny > 12) { ny = 1; yy++ }
      const nextYm = `${yy}-${String(ny).padStart(2, '0')}`
      saveQuickTxs(quickTxsRef.current.map(q => q.id === activeQuickRef.current ? { ...q, nextYm } : q))
      activeQuickRef.current = null
    }
  }

  const handleDelete = async (id: number) => {
    const tx = txs.find(t => t.id === id)
    if (!confirm(`"${tx?.desc ?? ''}" 거래를 삭제하시겠습니까?`)) return
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    fetchTxs()

    if (tx) {
      restoreQuickTxDate(sessionId, tx.desc, tx.date)
      // UI 상태도 동기화
      const updated = loadQuickTxs(sessionId)
      setQuickTxs(updated)
      quickTxsRef.current = updated
    }
  }

  const openEdit = (tx: Tx) => { setEditTx(tx); setEditForm({ ...tx }) }

  const handleEditSave = async () => {
    if (!editForm) return
    await fetch(`/api/transactions/${editForm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setEditTx(null)
    showToast('수정됐습니다 ✓')
    fetchTxs()
  }

  const getVisibleNames = (type: string): string[] =>
    rawCats
      .filter(c => c.type === type && c.name !== '__group__' && (showHidden || !c.hidden))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(c => c.name)

  const mkSection = (label: string, type: string, items: string[]): AcctSection | null => {
    const subs = buildSubGroups(type, rawCats, items)
    if (subs.every(s => s.items.length === 0)) return null
    return { label, subGroups: subs }
  }

  const fromSections: AcctSection[] = useMemo(() => [
    mkSection('자산',   'account_asset',     getVisibleNames('account_asset')),
    mkSection('부채',   'account_liability', getVisibleNames('account_liability')),
    mkSection('순자산', 'networth',          getVisibleNames('networth')),
    mkSection('수입',   'income',            getVisibleNames('income')),
  ].filter(Boolean) as AcctSection[], [rawCats, showHidden])

  const toSections: AcctSection[] = useMemo(() => [
    mkSection('자산',   'account_asset',     getVisibleNames('account_asset')),
    mkSection('부채',   'account_liability', getVisibleNames('account_liability')),
    mkSection('순자산', 'networth',          getVisibleNames('networth')),
    mkSection('지출',   'expense',           getVisibleNames('expense')),
  ].filter(Boolean) as AcctSection[], [rawCats, showHidden])

  const sortedTxs = useMemo(() => [...txs].sort((a, b) => b.id - a.id), [txs])

  const sortedQuickTxs = useMemo(() => {
    const now = new Date()
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return [...quickTxs].sort((a, b) => {
      const ymA = (a.nextYm && a.nextYm >= currentYm) ? a.nextYm : currentYm
      const ymB = (b.nextYm && b.nextYm >= currentYm) ? b.nextYm : currentYm
      if (ymA !== ymB) return ymA.localeCompare(ymB)
      return a.day - b.day
    })
  }, [quickTxs])

  const editFromGroups = [
    { label: '자산 계정',   opts: cats.account_asset     },
    { label: '부채 계정',   opts: cats.account_liability },
    { label: '수입 분류',   opts: cats.income            },
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

  const ColHeader = ({ label }: { label: string }) => (
    <div className="px-3 h-9 flex items-center justify-center border-b border-gray-100 flex-shrink-0">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 탑바 */}
      <PeriodNav label={period.label} viewMode={period.viewMode} setViewMode={period.setViewMode}
        year={period.year} setYear={period.setYear}
        quarter={period.quarter} setQuarter={period.setQuarter}
        month={period.month} setMonth={period.setMonth}
        prev={period.prev} next={period.next}>
        <Link href="/settings" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <i className="ti ti-settings text-sm" />계정 관리
        </Link>
      </PeriodNav>

      {/* 전체 스크롤 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-[1080px] mx-auto space-y-4">

          {/* 빠른 입력 */}
          {quickTxs.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 flex items-center gap-2 flex-wrap">
              {sortedQuickTxs.map(q => (
                <div key={q.id} className="group/q relative flex-shrink-0">
                  <button
                    onClick={() => runQuickTx(q)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 transition-colors text-xs font-semibold text-gray-800">
                    {(() => {
                      const now = new Date()
                      const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                      const useYm = (q.nextYm && q.nextYm >= currentYm) ? q.nextYm : currentYm
                      const [, ms] = useYm.split('-')
                      const maxDay = new Date(parseInt(useYm.split('-')[0]), parseInt(ms), 0).getDate()
                      const d = Math.min(q.day, maxDay)
                      return <span className="text-[10px] font-normal text-gray-400">{parseInt(ms)}/{d}</span>
                    })()}
                    {q.desc}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); openEditQuickTx(q) }}
                    className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-blue-400 text-white text-[9px] items-center justify-center hidden group-hover/q:flex hover:bg-blue-600 transition-colors">
                    <i className="ti ti-pencil" />
                  </button>
                  <button
                    onClick={() => deleteQuickTx(q.id)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-400 text-white text-[9px] items-center justify-center hidden group-hover/q:flex hover:bg-red-500 transition-colors">
                    <i className="ti ti-x" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 5열 입력 영역 — 항목 모두 펼침, 스크롤 없음 */}
          <div className="flex flex-col md:flex-row border border-gray-100 bg-white rounded-xl overflow-hidden">

            {/* ① 날짜 */}
            <div className="md:w-40 md:flex-shrink-0 border-b border-gray-100 md:border-b-0 md:border-r flex flex-col">
              <ColHeader label="날짜" />
              <div className="p-3">
                <input type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 h-8 focus:outline-none focus:border-blue-300" />
              </div>
            </div>

            {/* ② 내용 */}
            <div className="md:w-40 md:flex-shrink-0 border-b border-gray-100 md:border-b-0 md:border-r flex flex-col">
              <ColHeader label="내용" />
              <div className="p-3 flex flex-col gap-2">
                <div className="relative">
                  <input type="text" value={form.desc}
                    onChange={e => handleDescChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { setShowSuggest(false); handleSubmit() } if (e.key === 'Escape') setShowSuggest(false) }}
                    onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                    onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
                    placeholder="내용 입력"
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 h-8 focus:outline-none focus:border-blue-300" />
                  {showSuggest && suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                      {suggestions.map((s, i) => (
                        <button key={i} onMouseDown={() => applySuggestion(s)}
                          className="w-full text-left px-2 py-1.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{s.desc}</p>
                          <p className="text-[10px] text-gray-400 tabular-nums">{s.amount.toLocaleString()}원 · {s.fromAcct} → {s.toAcct}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <textarea value={form.memo}
                  onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                  placeholder="메모"
                  rows={4}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-300 resize-none leading-5" />
              </div>
            </div>

            {/* ③ 금액 */}
            <div className="md:w-40 md:flex-shrink-0 border-b border-gray-100 md:border-b-0 md:border-r flex flex-col">
              <ColHeader label="금액" />
              <div className="p-3 flex flex-col gap-3">
                <AmountInput value={form.amount}
                  onChange={v => setForm(f => ({ ...f, amount: v }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 h-8 focus:outline-none focus:border-blue-300" />
                <button onClick={handleSubmit}
                  className="w-full py-2 bg-[#1a1f2e] text-white text-sm rounded-lg hover:opacity-90 flex items-center justify-center gap-1">
                  <i className="ti ti-check" />입력 완료
                </button>
                <button onClick={addQuickTx}
                  title="빠른 입력에 저장"
                  className="w-full py-1.5 border border-dashed border-gray-300 text-gray-400 text-xs rounded-lg hover:border-blue-300 hover:text-blue-500 transition-colors flex items-center justify-center gap-1">
                  <i className="ti ti-bookmark-plus text-xs" />빠른 입력 저장
                </button>
              </div>
            </div>

            {/* ④⑤ 입금 / 출금 — 모바일: 2열 그리드, 데스크톱: 각 flex-1 */}
            <div className="md:contents grid grid-cols-2">
              {/* ④ 입금 */}
              <div className="md:flex-1 border-r border-gray-100 flex flex-col">
                <ColHeader label="입금" />
                <div className="overflow-y-auto max-h-60 md:max-h-none">
                  <AcctPane side="to" selected={form.toAcct} sections={toSections}
                    onSelect={acc => setForm(f => ({ ...f, toAcct: acc }))}
                    showHidden={showHidden} onToggleShowHidden={() => setShowHidden(v => !v)} />
                </div>
              </div>

              {/* ⑤ 출금 */}
              <div className="md:flex-1 flex flex-col">
                <ColHeader label="출금" />
                <div className="overflow-y-auto max-h-60 md:max-h-none">
                  <AcctPane side="from" selected={form.fromAcct} sections={fromSections}
                    onSelect={acc => setForm(f => ({ ...f, fromAcct: acc }))}
                    showHidden={showHidden} onToggleShowHidden={() => setShowHidden(v => !v)} />
                </div>
              </div>
            </div>
          </div>

          {/* 하단 거래 내역 */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center px-4 h-8 border-b border-gray-100 bg-gray-50">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex-1">거래 내역</span>
              <span className="text-[10px] text-gray-400">{txs.length}건</span>
            </div>
            <div className="grid text-[10px] font-medium text-gray-400 px-4 py-1 border-b border-gray-100 bg-gray-50"
              style={{ gridTemplateColumns: '80px 1fr 100px 120px 120px 80px' }}>
              <span>날짜</span>
              <span>내용</span>
              <span className="text-right">금액</span>
              <span className="pl-2">출금</span>
              <span className="pl-2">입금</span>
              <span className="text-center">유형</span>
            </div>
            {sortedTxs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-xs gap-2">
                <i className="ti ti-receipt-off text-2xl opacity-30" />거래 내역이 없습니다
              </div>
            ) : sortedTxs.map(tx => (
              <div key={tx.id}
                className="grid items-center px-4 py-1.5 border-b border-gray-50 hover:bg-gray-50 group text-xs"
                style={{ gridTemplateColumns: '80px 1fr 100px 120px 120px 80px' }}>
                <span className="text-gray-400 text-[11px]">{tx.date.slice(5).replace('-', '/')} ({DOW[new Date(tx.date).getDay()]})</span>
                <span className="text-gray-800 font-medium truncate pr-2">{tx.desc}
                  {tx.memo && <span className="text-gray-400 font-normal ml-1.5 text-[10px]">{tx.memo}</span>}
                </span>
                <span className="text-right font-medium" style={{ color: TYPE_COLOR[tx.type] }}>
                  {tx.type === 'expense' ? '−' : tx.type === 'income' ? (tx.amount >= 0 ? '+' : '') : tx.type === 'income_expense' ? '±' : ''}{tx.amount.toLocaleString()}원
                </span>
                <span className="text-gray-500 text-[11px] pl-2 truncate">{tx.fromAcct}</span>
                <span className="text-gray-500 text-[11px] pl-2 truncate">{tx.toAcct}</span>
                <div className="flex items-center justify-center gap-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: TYPE_BG[tx.type], color: TYPE_COLOR[tx.type] }}>
                    {TYPE_LABEL[tx.type]}
                  </span>
                  <button onClick={() => openEdit(tx)}
                    className="text-[9px] text-gray-300 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <i className="ti ti-pencil" />
                  </button>
                  <button onClick={() => handleDelete(tx.id)}
                    className="text-[9px] text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>


      {/* 빠른입력 편집 모달 */}
      {editQuickId && editQuickForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => { setEditQuickId(null); setEditQuickForm(null) }}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-gray-800">빠른 입력 수정</h3>
            <div>
              <label className="text-xs text-gray-400 block mb-1">내용</label>
              <input type="text" value={editQuickForm.desc}
                onChange={e => setEditQuickForm(f => f ? { ...f, desc: e.target.value } : f)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 h-8 focus:outline-none focus:border-blue-300" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">금액 (원)</label>
                <AmountInput value={editQuickForm.amount}
                  onChange={v => setEditQuickForm(f => f ? { ...f, amount: v } : f)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 h-8 focus:outline-none focus:border-blue-300" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">반복 일자</label>
                <input type="number" min={1} max={31} value={editQuickForm.day}
                  onChange={e => setEditQuickForm(f => f ? { ...f, day: Math.max(1, Math.min(31, Number(e.target.value))) } : f)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 h-8 focus:outline-none focus:border-blue-300" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">출금 <span className="text-gray-300">— 나가는 곳</span></label>
                <GroupedSelect
                  value={editQuickForm.fromAcct}
                  onChange={v => setEditQuickForm(f => f ? { ...f, fromAcct: v } : f)}
                  groups={editFromGroups}
                  extraOpt={!allFromOpts.includes(editQuickForm.fromAcct) ? editQuickForm.fromAcct : undefined}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">입금 <span className="text-gray-300">— 들어오는 곳</span></label>
                <GroupedSelect
                  value={editQuickForm.toAcct}
                  onChange={v => setEditQuickForm(f => f ? { ...f, toAcct: v } : f)}
                  groups={editToGroups}
                  extraOpt={!allToOpts.includes(editQuickForm.toAcct) ? editQuickForm.toAcct : undefined}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">메모</label>
              <input type="text" value={editQuickForm.memo}
                onChange={e => setEditQuickForm(f => f ? { ...f, memo: e.target.value } : f)}
                placeholder="선택 사항"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 h-8 focus:outline-none focus:border-blue-300" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setEditQuickId(null); setEditQuickForm(null) }}
                className="flex-1 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={saveEditQuickTx}
                className="flex-1 py-2 text-xs bg-[#1a1f2e] text-white rounded-lg hover:opacity-90">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {editTx && editForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setEditTx(null)}>
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
