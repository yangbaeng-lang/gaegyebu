'use client'
import { useState, useEffect, useRef } from 'react'
import { fmt } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, LabelList,
} from 'recharts'

const ITEM_PALETTE = [
  '#6b8cff', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
  '#a78bfa', '#fb923c', '#4ade80', '#38bdf8', '#f43f5e',
]

function fmtY(v: number) {
  const a = Math.abs(v)
  if (a >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`
  if (a >= 10_000)      return `${(v / 10_000).toFixed(0)}만`
  return String(v)
}
const fmtLabel = (v: number) => (!v || v === 0) ? '' : fmtY(v)
const LBL = { fontSize: 9, fill: '#9ca3af' } as const
const VISIBLE = 10

type MonthlyEntry = { yearMonth: string; total: number; items: Record<string, number> }
type ItemSummary   = { name: string; total: number }

// ── 드래그 스크롤 지원 ScrollChart ──────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScrollChart({ data, children }: { data: any[]; children: (w: number, h: number) => React.ReactNode }) {
  const wrapRef      = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const dragging     = useRef(false)
  const startX       = useRef(0)
  const scrollLeft   = useRef(0)
  const scrolledRef  = useRef(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setDims({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => { scrolledRef.current = false }, [data])

  useEffect(() => {
    if (dims.w === 0 || scrolledRef.current) return
    scrolledRef.current = true
    requestAnimationFrame(() => {
      if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth
    })
  }, [dims.w, data])

  const onDown  = (e: React.MouseEvent) => {
    dragging.current   = true
    startX.current     = e.pageX - (wrapRef.current?.offsetLeft ?? 0)
    scrollLeft.current = wrapRef.current?.scrollLeft ?? 0
  }
  const onMove  = (e: React.MouseEvent) => {
    if (!dragging.current || !wrapRef.current) return
    e.preventDefault()
    wrapRef.current.scrollLeft = scrollLeft.current - (e.pageX - (wrapRef.current.offsetLeft ?? 0) - startX.current)
  }
  const onUp    = () => { dragging.current = false }

  const barW   = dims.w > 0 ? Math.floor(dims.w / VISIBLE) : 60
  const innerW = data.length > VISIBLE ? data.length * barW : dims.w

  return (
    <>
      <style>{`
        .pd-scroll{overflow-anchor:none}
        .pd-scroll::-webkit-scrollbar{height:8px}
        .pd-scroll::-webkit-scrollbar-track{background:#f1f5f9;border-radius:4px}
        .pd-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px;min-width:28px}
        .pd-scroll::-webkit-scrollbar-thumb:hover{background:#94a3b8}
      `}</style>
      <div
        ref={wrapRef}
        className="pd-scroll overflow-x-auto h-full select-none"
        style={{ cursor: dragging.current ? 'grabbing' : 'grab' }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      >
        <div style={{ width: innerW, height: '100%' }}>
          {dims.w > 0 && dims.h > 0 && children(innerW, dims.h)}
        </div>
      </div>
    </>
  )
}

// ── 월별·연도별 토글 ────────────────────────────────────────────────────
function ModeToggle({ mode, onChange }: { mode: 'monthly' | 'yearly'; onChange: (m: 'monthly' | 'yearly') => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-semibold flex-shrink-0">
      {(['monthly', 'yearly'] as const).map(m => (
        <button key={m} onClick={() => onChange(m)}
          className={`px-3 py-1.5 transition-colors ${mode === m ? 'bg-[#6b8cff] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
          {m === 'monthly' ? '월별' : '연도별'}
        </button>
      ))}
    </div>
  )
}

// ── 툴팁 ────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DividendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const exactOf = (p: { dataKey: string; payload: Record<string, number> }) => p.payload[`${p.dataKey}__exact`] ?? 0
  const rows = payload.filter(exactOf)
  const total = rows.reduce((s: number, p: { dataKey: string; payload: Record<string, number> }) => s + exactOf(p), 0)
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[180px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {rows.map((p: { name: string; dataKey: string; color: string; payload: Record<string, number> }) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500 flex-1">{p.name}</span>
          <span className="font-medium text-gray-800 tabular-nums">{fmt(exactOf(p))}</span>
        </div>
      ))}
      {rows.length > 1 && (
        <div className="flex items-center gap-2 py-0.5 mt-1 pt-1 border-t border-gray-100">
          <span className="text-gray-500 flex-1">합계</span>
          <span className="font-semibold text-gray-800 tabular-nums">{fmt(total)}</span>
        </div>
      )}
    </div>
  )
}

export default function PensionDividendPage() {
  const today        = new Date()
  const currentYear  = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const currentYm    = `${currentYear}-${String(currentMonth).padStart(2, '0')}`

  const [pensionSid,    setPensionSid]    = useState<number | null>(null)
  const [monthly,       setMonthly]       = useState<MonthlyEntry[]>([])
  const [itemOrder,     setItemOrder]     = useState<ItemSummary[]>([])
  const [loading,       setLoading]       = useState(false)
  const [visibleItems,  setVisibleItems]  = useState<Set<string>>(new Set())
  const [mode,          setMode]          = useState<'monthly' | 'yearly'>('monthly')

  useEffect(() => {
    fetch('/api/sessions', { cache: 'no-store' }).then(r => r.json()).then(d => {
      const list: { id: number; name: string }[] = d.sessions ?? []
      setPensionSid(list.find(s => s.name === '연금')?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!pensionSid) return

    const loadDividends = () => {
      setLoading(true)
      fetch(`/api/pension-dividend?sessionId=${pensionSid}&startMonth=2020-01&endMonth=${currentYm}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(d => {
          setMonthly(d.monthly ?? [])
          const order: string[] = (d.itemOrder ?? []).map((i: ItemSummary) => i.name)
          setItemOrder(d.itemOrder ?? [])
          setVisibleItems(new Set(order))
        })
        .finally(() => setLoading(false))
    }

    loadDividends()

    // 뒤로/앞으로 가기(bfcache)나 탭 재활성화 시에도 항상 최신 데이터를 다시 조회
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) loadDividends() }
    const onVisible  = () => { if (document.visibilityState === 'visible') loadDividends() }
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisible)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pensionSid])

  const toggleItem = (name: string) =>
    setVisibleItems(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

  const itemColor = (name: string) =>
    ITEM_PALETTE[itemOrder.findIndex(i => i.name === name) % ITEM_PALETTE.length]

  // 연도별: 월별 데이터를 연도 단위로 합산
  const yearlyData = (() => {
    const byYear: Record<string, MonthlyEntry> = {}
    monthly.forEach(e => {
      const yr = e.yearMonth.slice(0, 4)
      if (!byYear[yr]) byYear[yr] = { yearMonth: yr, total: 0, items: {} }
      byYear[yr].total += e.total
      for (const [name, amt] of Object.entries(e.items)) {
        byYear[yr].items[name] = (byYear[yr].items[name] ?? 0) + amt
      }
    })
    return Object.values(byYear)
  })()

  const displayData = mode === 'monthly' ? monthly : yearlyData

  const labelOf = (ym: string) =>
    mode === 'yearly' ? ym :
    ym.length === 7 ? `${ym.slice(2, 4)}.${ym.slice(5)}` : ym

  const tsData = displayData.map(entry => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = { month: labelOf(entry.yearMonth), yearMonth: entry.yearMonth }
    itemOrder.forEach(({ name }) => {
      row[name] = entry.items[name] ? Math.round(entry.items[name] / 10000) : undefined
      row[`${name}__exact`] = entry.items[name] ?? 0
    })
    return row
  })

  const xProps = {
    tick: { fontSize: 10, fill: '#9ca3af' },
    axisLine: false as const, tickLine: false as const, interval: 0 as const,
  }
  const yAmt = { tick: { fontSize: 10, fill: '#9ca3af' }, axisLine: false as const, tickLine: false as const, width: 50 }

  const grandTotal   = itemOrder.reduce((s, i) => s + i.total, 0)
  const thisMonthSum = monthly.find(e => e.yearMonth === currentYm)?.total ?? 0
  const thisYearSum  = monthly.filter(e => e.yearMonth.startsWith(`${currentYear}-`)).reduce((s, e) => s + e.total, 0)

  const visible = itemOrder.filter(i => visibleItems.has(i.name))
  const lastVisible = visible[visible.length - 1]?.name

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-y-auto md:overflow-hidden bg-gray-50">

      {/* 헤더 */}
      <div className="px-4 md:px-8 pt-4 pb-2 flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-800">배당금 현황</h1>
      </div>

      {!pensionSid ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-300">
          <i className="ti ti-pig-money text-3xl" />
          <p className="text-sm">&quot;연금&quot; 섹션이 없습니다</p>
        </div>
      ) : itemOrder.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-300">
          <i className="ti ti-coin text-3xl" />
          <p className="text-sm">배당금 거래 내역이 없습니다</p>
        </div>
      ) : (
        <>
          {/* 종목 토글 */}
          <div className="px-4 md:px-8 pb-2 flex items-center gap-2 flex-wrap flex-shrink-0">
            {itemOrder.map(({ name }) => {
              const on    = visibleItems.has(name)
              const color = itemColor(name)
              return (
                <button key={name} onClick={() => toggleItem(name)}
                  style={on ? { background: color, borderColor: color, color: '#fff' } : {}}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                    ${on ? '' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                  <i className={`ti ${on ? 'ti-check' : 'ti-circle'} text-[10px]`} />
                  {name}
                </button>
              )
            })}
          </div>

          <div className="px-4 pb-4 flex flex-col gap-3 md:flex-1 md:min-h-0 md:px-8">

            {/* Row 1: 요약 + 차트 */}
            <div className="flex flex-col gap-3 md:flex-row md:min-h-0" style={{ flex: 3 }}>

              {/* 요약 카드 */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex flex-col md:w-[352px] md:flex-shrink-0">
                <SummaryRow label="누적 배당금" value={grandTotal} color="text-[#4a6fdb]" bg="bg-[#4a6fdb]/10" icon="ti-wallet" />
                <div className="border-t border-gray-100 my-2" />
                <SummaryRow label="이번 달 배당금" value={thisMonthSum} color="text-[#2a9d5c]" bg="bg-[#2a9d5c]/10" icon="ti-calendar" />
                <div className="border-t border-gray-100 my-2" />
                <SummaryRow label="올해 배당금" value={thisYearSum} color="text-[#f0a020]" bg="bg-[#f0a020]/10" icon="ti-chart-line" />
                <div className="border-t border-gray-100 my-2" />
                <div className="flex-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="w-5 h-5 flex items-center justify-center rounded-md flex-shrink-0 bg-gray-100">
                      <i className="ti ti-list-numbers text-[11px] text-gray-500" />
                    </span>
                    <span className="text-xs text-gray-400">배당 종목 수</span>
                  </div>
                  <span className="text-[15px] font-bold tabular-nums whitespace-nowrap text-gray-700">
                    {itemOrder.length}개
                  </span>
                </div>
              </div>

              {/* 종목별 순위 */}
              <div className="h-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:h-auto md:flex-1 md:min-w-0">
                <p className="text-sm font-semibold text-gray-600 mb-2 flex-shrink-0">종목별 누적 배당금</p>
                <div className="flex-1 min-h-0 overflow-y-auto pr-2 flex flex-col gap-1.5">
                  {itemOrder.map(({ name, total }) => (
                    <div key={name} className="flex items-center gap-2 py-1">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: itemColor(name) }} />
                      <span className="text-xs text-gray-600 flex-1 truncate">{name}</span>
                      <span className="text-xs text-gray-400 tabular-nums">
                        {grandTotal > 0 ? `${((total / grandTotal) * 100).toFixed(1)}%` : ''}
                      </span>
                      <span className="text-sm font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                        {fmt(total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: 배당금 추이 */}
            <div className="flex flex-col md:min-h-0" style={{ flex: 4 }}>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col h-[280px] md:h-auto md:flex-1 md:min-h-0">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-600">{mode === 'monthly' ? '월별' : '연도별'} 배당금 추이</p>
                  <ModeToggle mode={mode} onChange={setMode} />
                </div>
                <div className="flex-1 min-h-0">
                  {tsData.length === 0
                    ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">데이터 없음</div>
                    : (
                      <ScrollChart data={tsData}>
                        {(w, h) => (
                          <BarChart data={tsData} width={w} height={h}
                            margin={{ top: 10, right: 8, left: 0, bottom: 4 }}
                            barCategoryGap="30%" barGap={0}>
                            <XAxis dataKey="month" {...xProps} />
                            <YAxis tickFormatter={v => `${v}만`} {...yAmt} />
                            <Tooltip content={<DividendTooltip />} cursor={{ fill: '#f3f4f6' }}
                              position={{ y: 4 }} allowEscapeViewBox={{ x: true, y: true }} />
                            <ReferenceLine y={0} stroke="#e5e7eb" />
                            {visible.map(({ name }) => {
                              const isLast = name === lastVisible
                              return (
                                <Bar key={name} dataKey={name} name={name}
                                  stackId="d"
                                  fill={itemColor(name)}
                                  radius={isLast ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                                  maxBarSize={44}>
                                  {isLast && (
                                    <LabelList
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      valueAccessor={(row: any) =>
                                        visible.reduce((s, i) => s + (Number(row[i.name]) || 0), 0)
                                      }
                                      position="top" formatter={fmtLabel} style={LBL}
                                    />
                                  )}
                                </Bar>
                              )
                            })}
                          </BarChart>
                        )}
                      </ScrollChart>
                    )}
                </div>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  )
}

function SummaryRow({ label, value, color, bg, icon }: {
  label: string; value: number; color: string; bg: string; icon: string
}) {
  return (
    <div className="flex-1 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`w-5 h-5 flex items-center justify-center rounded-md flex-shrink-0 ${bg}`}>
          <i className={`ti ${icon} text-[11px] ${color}`} />
        </span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <p className={`text-[15px] font-bold tabular-nums whitespace-nowrap ${color}`}>{value.toLocaleString('ko-KR')}원</p>
    </div>
  )
}
