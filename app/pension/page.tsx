'use client'
import { useState, useEffect, useRef } from 'react'
import { fmt } from '@/lib/utils'

type PensionItem = {
  name: string
  color: string
  icon: string
  group: string
  납입액: number
  평가액: number
  hasEval: boolean
  평가손익: number | null
  수익률: number | null
  비중: number | null
}

function rateColor(v: number | null) {
  if (v === null) return 'text-gray-300'
  if (v === 0) return 'text-gray-800'
  return v > 0 ? 'text-red-500' : 'text-blue-500'
}
function fmtRate(v: number | null) {
  if (v === null) return '-'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}
function fmtPct(v: number | null) {
  if (v === null) return '-'
  return `${v.toFixed(1)}%`
}
function fmtPnl(v: number | null) {
  if (v === null) return '-'
  return `${v >= 0 ? '+' : ''}${fmt(v)}`
}

const COLS = '0.6fr 160px 180px 160px 100px 80px 70px'

export default function PensionPage() {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  const [pensionSid,  setPensionSid]  = useState<number | null>(null)
  const [items,       setItems]       = useState<PensionItem[]>([])
  const [groupOrder,  setGroupOrder]  = useState<string[]>([])
  const [loading,     setLoading]     = useState(false)
  const [collapsed,   setCollapsed]   = useState<Record<string, boolean>>({})
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editVal,     setEditVal]     = useState('')
  const [toast,       setToast]       = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`

  const reload = (sid: number) =>
    fetch(`/api/pension-eval?sessionId=${sid}&yearMonth=${yearMonth}`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setGroupOrder(d.groupOrder ?? []) })

  useEffect(() => {
    fetch('/api/sessions').then(r => r.json()).then(d => {
      const list: { id: number; name: string }[] = d.sessions ?? []
      const pension = list.find(s => s.name === '연금')
      setPensionSid(pension?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!pensionSid) return
    setLoading(true)
    reload(pensionSid).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pensionSid, yearMonth])

  useEffect(() => {
    if (editingName) inputRef.current?.focus()
  }, [editingName])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const startEdit = (name: string, current: number, hasEval: boolean) => {
    setEditingName(name)
    setEditVal(hasEval ? String(current) : '')
  }

  const saveEval = async (name: string, val: string) => {
    if (!pensionSid) return
    const evalAmount = Number(val.replace(/[^0-9]/g, '')) || 0
    setEditingName(null)
    await fetch('/api/pension-eval', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: pensionSid, assetName: name, yearMonth, evalAmount }),
    })
    showToast('저장됐습니다 ✓')
    reload(pensionSid)
  }

  const copyNapip = async (item: PensionItem) => {
    if (!pensionSid || item.납입액 === 0) return
    await fetch('/api/pension-eval', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: pensionSid, assetName: item.name, yearMonth, evalAmount: item.납입액 }),
    })
    showToast('납입액으로 저장됐습니다 ✓')
    reload(pensionSid)
  }

  const prev = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const next = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }
  const toggleGroup = (g: string) => setCollapsed(p => ({ ...p, [g]: !p[g] }))

  const visibleItems = items.filter(i => i.납입액 !== 0)

  const groupedItems = groupOrder.map(grp => ({
    grp,
    rows: visibleItems.filter(i => i.group === grp),
  })).filter(g => g.rows.length > 0)

  const ungrouped = visibleItems.filter(i => !i.group || !groupOrder.includes(i.group))

  const total납입액 = visibleItems.reduce((s, i) => s + i.납입액, 0)
  const total평가액 = visibleItems.reduce((s, i) => s + i.평가액, 0)
  const total손익   = total평가액 > 0 ? total평가액 - total납입액 : null
  const total수익률 = total납입액 > 0 && total평가액 > 0
    ? ((total평가액 - total납입액) / total납입액) * 100 : null

  const rankMap: Record<string, number> = {}
  const ranked = [...visibleItems]
    .filter(i => i.수익률 !== null)
    .sort((a, b) => (b.수익률 ?? 0) - (a.수익률 ?? 0))
  ranked.forEach((item, idx) => { rankMap[item.name] = idx + 1 })

  const grpTotals = (rows: PensionItem[]) => {
    const 납 = rows.reduce((s, i) => s + i.납입액, 0)
    const 평 = rows.reduce((s, i) => s + i.평가액, 0)
    const 손익 = 평 > 0 ? 평 - 납 : null
    const 율  = 납 > 0 && 평 > 0 ? ((평 - 납) / 납) * 100 : null
    const 비중 = total평가액 > 0 && 평 > 0 ? (평 / total평가액) * 100 : null
    return { 납, 평, 손익, 율, 비중 }
  }

  const renderItemRow = (item: PensionItem, indent = false) => {
    const isEditing = editingName === item.name
    return (
      <div key={item.name}
        className="grid items-center pl-6 pr-2 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
        style={{ gridTemplateColumns: COLS }}>

        <div className={`flex items-center gap-2.5 ${indent ? 'pl-5' : ''}`}>
          <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: (item.color || '#6b8cff') + '20' }}>
            <i className={`ti ${item.icon || 'ti-pig-money'} text-xs`}
              style={{ color: item.color || '#6b8cff' }} />
          </div>
          <span className="text-sm text-gray-700 truncate">{item.name}</span>
        </div>

        <span className="text-sm text-gray-600 tabular-nums text-right">{fmt(item.납입액)}</span>

        <div className="flex items-center justify-end gap-1 group">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => saveEval(item.name, editVal)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveEval(item.name, editVal)
                if (e.key === 'Escape') setEditingName(null)
              }}
              className="w-36 text-sm text-right border border-blue-300 rounded-lg px-2 py-0.5 focus:outline-none focus:border-blue-400 bg-blue-50"
              placeholder="금액 입력"
            />
          ) : (
            <>
              {item.납입액 !== 0 && (
                <button
                  title="납입액과 동일하게 설정"
                  onClick={() => copyNapip(item)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50 flex-shrink-0">
                  <i className="ti ti-copy text-[11px]" />
                </button>
              )}
              <button
                onClick={() => startEdit(item.name, item.평가액, item.hasEval)}
                className={`text-sm tabular-nums px-2 py-0.5 rounded-lg transition-colors
                  ${item.hasEval
                    ? 'text-gray-800 hover:bg-blue-50 hover:text-blue-600'
                    : 'text-gray-300 hover:bg-blue-50 hover:text-blue-400 border border-dashed border-gray-200'}`}>
                {item.hasEval ? fmt(item.평가액) : '입력'}
              </button>
            </>
          )}
        </div>

        <span className={`text-sm tabular-nums text-right ${rateColor(item.평가손익)}`}>
          {fmtPnl(item.평가손익)}
        </span>

        <span className={`text-sm font-semibold tabular-nums text-right ${rateColor(item.수익률)}`}>
          {fmtRate(item.수익률)}
        </span>

        <span className="text-sm tabular-nums text-right text-gray-400">
          {fmtPct(item.비중)}
        </span>

        <span className="flex items-center justify-center pl-12">
          {rankMap[item.name] !== undefined ? (() => {
            const r = rankMap[item.name]
            const cls =
              r === 1 ? 'text-yellow-600 bg-yellow-50 border border-yellow-200' :
              r === 2 ? 'text-slate-500 bg-slate-100 border border-slate-200' :
              r === 3 ? 'text-orange-600 bg-orange-50 border border-orange-200' :
              r === 4 ? 'text-purple-600 bg-purple-50 border border-purple-200' :
              r === 5 ? 'text-teal-600 bg-teal-50 border border-teal-200' :
              'text-gray-400'
            return (
              <span className={`text-[13px] font-bold tabular-nums px-1.5 py-0.5 rounded ${cls}`}>
                {r}
              </span>
            )
          })() : <span className="text-gray-300 text-[13px]">-</span>}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">

      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center flex-shrink-0">
        <h1 className="text-base font-bold text-gray-800 flex items-center gap-2">
          <i className="ti ti-pig-money text-[#6b8cff]" />
          연금 결산
        </h1>
      </div>

      <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center gap-3 flex-shrink-0">
        <button onClick={prev}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
          <i className="ti ti-chevron-left text-sm" />
        </button>
        <span className="text-sm font-semibold text-gray-700 w-28 text-center">
          {year}년 {month}월
        </span>
        <button onClick={next}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
          <i className="ti ti-chevron-right text-sm" />
        </button>
        <span className="text-xs text-gray-400 ml-2">말일 기준 납입액 자동 계산 · 평가액 클릭해서 입력</span>
        <button
          onClick={() => {
            const allCollapsed = groupedItems.every(({ grp }) => collapsed[grp])
            if (allCollapsed) {
              setCollapsed({})
            } else {
              setCollapsed(Object.fromEntries(groupedItems.map(({ grp }) => [grp, true])))
            }
          }}
          className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0">
          <i className={`ti ${groupedItems.every(({ grp }) => collapsed[grp]) ? 'ti-chevrons-down' : 'ti-chevrons-up'} text-xs`} />
          {groupedItems.every(({ grp }) => collapsed[grp]) ? '전체 펼치기' : '전체 접기'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">

          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-300 text-sm">불러오는 중…</div>
          ) : !pensionSid ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-300">
              <i className="ti ti-pig-money text-3xl" />
              <p className="text-sm">"연금" 섹션이 없습니다</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              <div className="min-w-[700px]">

              <div className="grid text-xs font-semibold text-gray-400 uppercase tracking-wider pl-6 pr-2 py-3 bg-gray-50 border-b border-gray-100"
                style={{ gridTemplateColumns: COLS }}>
                <span>항목</span>
                <span className="text-right">납입액 (누적)</span>
                <span className="text-right">평가액</span>
                <span className="text-right">평가손익</span>
                <span className="text-right">수익률</span>
                <span className="text-right">비중</span>
                <span className="pl-12 text-center">순위</span>
              </div>

              {groupedItems.map(({ grp, rows }) => {
                const t = grpTotals(rows)
                const isOpen = !collapsed[grp]
                return (
                  <div key={grp}>
                    <button
                      onClick={() => toggleGroup(grp)}
                      className="w-full grid items-center pl-6 pr-2 py-2.5 bg-gray-50 hover:bg-gray-100 border-b border-gray-100 transition-colors text-left"
                      style={{ gridTemplateColumns: COLS }}>
                      <div className="flex items-center gap-1.5">
                        <i className={`ti ${isOpen ? 'ti-chevron-down' : 'ti-chevron-right'} text-[11px] text-gray-400`} />
                        <span className="text-sm font-semibold text-gray-600">{grp}</span>
                        <span className="text-xs text-gray-400">({rows.length})</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-600 tabular-nums text-right">{fmt(t.납)}</span>
                      <span className="text-sm font-semibold text-gray-600 tabular-nums text-right">{t.평 > 0 ? fmt(t.평) : '-'}</span>
                      <span className={`text-sm font-semibold tabular-nums text-right ${rateColor(t.손익)}`}>{fmtPnl(t.손익)}</span>
                      <span className={`text-sm font-semibold tabular-nums text-right ${rateColor(t.율)}`}>{fmtRate(t.율)}</span>
                      <span className="text-sm font-semibold text-gray-500 tabular-nums text-right">{fmtPct(t.비중)}</span>
                      <span />
                    </button>
                    {isOpen && rows.map(item => renderItemRow(item, true))}
                  </div>
                )
              })}

              {ungrouped.map(item => renderItemRow(item, false))}

              <div className="grid items-center pl-6 pr-2 py-4 bg-[#1a1f2e] font-semibold"
                style={{ gridTemplateColumns: COLS }}>
                <span className="text-sm text-white/70">합계</span>
                <span className="text-sm text-white tabular-nums text-right">{fmt(total납입액)}</span>
                <span className="text-sm text-white tabular-nums text-right">{total평가액 > 0 ? fmt(total평가액) : '-'}</span>
                <span className={`text-sm tabular-nums text-right font-semibold ${total손익 === null ? 'text-white/30' : total손익 === 0 ? 'text-white' : total손익 > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                  {fmtPnl(total손익)}
                </span>
                <span className={`text-sm tabular-nums text-right font-semibold ${total수익률 === null ? 'text-white/30' : total수익률 === 0 ? 'text-white' : total수익률 > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                  {fmtRate(total수익률)}
                </span>
                <span className="text-sm text-white/50 text-right">100%</span>
                <span />
              </div>

              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#1a1f2e] text-white text-xs px-4 py-2 rounded-full z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
