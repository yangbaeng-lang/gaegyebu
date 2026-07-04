'use client'
import { useState, useEffect, useRef } from 'react'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell, LabelList,
} from 'recharts'

const GROUP_COLORS = ['#4a6fdb', '#2a9d5c', '#f0a020', '#8b5cf6', '#06b6d4', '#d94f4f']

function fmtY(v: number) {
  const a = Math.abs(v)
  if (a >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`
  if (a >= 10_000)      return `${(v / 10_000).toFixed(0)}만`
  return String(v)
}
function fmtFull(v: number) { return v.toLocaleString('ko-KR') + '원' }
const fmtLabel = (v: number) => (!v || v === 0) ? '' : fmtY(v)
const LBL = { fontSize: 9, fill: '#9ca3af' } as const
const VISIBLE = 10

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

  // data가 바뀌면 스크롤 플래그 리셋
  useEffect(() => { scrolledRef.current = false }, [data])

  // dims 준비 + 아직 스크롤 전이면 오른쪽 끝으로 이동 (resize/hover 시에는 실행 안 됨)
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
        .pc-scroll{overflow-anchor:none}
        .pc-scroll::-webkit-scrollbar{height:8px}
        .pc-scroll::-webkit-scrollbar-track{background:#f1f5f9;border-radius:4px}
        .pc-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px;min-width:28px}
        .pc-scroll::-webkit-scrollbar-thumb:hover{background:#94a3b8}
      `}</style>
      <div
        ref={wrapRef}
        className="pc-scroll overflow-x-auto h-full select-none"
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
function PensionTooltip({ active, payload, label, pct }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[180px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500 flex-1">{p.name}</span>
          <span className="font-medium text-gray-800 tabular-nums">
            {pct === 'rate' ? `${Number(p.value).toFixed(2)}%`
              : pct === 'pct' ? `${Number(p.value).toFixed(1)}%`
              : fmtFull(Number(p.value) * 10000)}
          </span>
        </div>
      ))}
    </div>
  )
}

type GroupMonthly = {
  납입액: number; 평가액: number; 평가손익: number | null
  수익률: number | null; 비중: number | null
}
type MonthlyEntry = { yearMonth: string; groups: Record<string, GroupMonthly>; total평가액: number }

const EXCLUDED_GROUPS = ['퇴직금', '보험사연금']

export default function PensionChartsOverviewPage() {
  const today        = new Date()
  const currentYear  = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const [pensionSid,    setPensionSid]    = useState<number | null>(null)
  const [monthlyData,   setMonthlyData]   = useState<MonthlyEntry[]>([])
  const [groupOrder,    setGroupOrder]    = useState<string[]>([])
  const [loading,       setLoading]       = useState(false)
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(new Set())
  const [mode,          setMode]          = useState<'monthly' | 'yearly'>('monthly')

  useEffect(() => {
    fetch('/api/sessions').then(r => r.json()).then(d => {
      const list: { id: number; name: string }[] = d.sessions ?? []
      setPensionSid(list.find(s => s.name === '연금')?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!pensionSid) return
    setLoading(true)
    const endMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
    fetch(`/api/pension-eval/range?sessionId=${pensionSid}&startMonth=2020-01&endMonth=${endMonth}`)
      .then(r => r.json())
      .then(d => {
        setMonthlyData(d.monthlyData ?? [])
        const order: string[] = (d.groupOrder ?? []).filter((g: string) => !EXCLUDED_GROUPS.includes(g))
        setGroupOrder(order)
        setVisibleGroups(new Set(order))
      })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pensionSid])

  const toggleGroup = (grp: string) =>
    setVisibleGroups(prev => { const n = new Set(prev); n.has(grp) ? n.delete(grp) : n.add(grp); return n })

  // 데이터 있는 월만
  const activeMonths = monthlyData.filter(e => Object.keys(e.groups).length > 0)

  // 연도별: 각 연도의 마지막 데이터 있는 월
  const yearlyData = (() => {
    const byYear: Record<string, MonthlyEntry> = {}
    activeMonths.forEach(e => { byYear[e.yearMonth.slice(0, 4)] = e })
    return Object.entries(byYear).map(([yr, e]) => ({ ...e, yearMonth: yr }))
  })()

  const displayData = mode === 'monthly' ? activeMonths : yearlyData

  // X축 레이블
  const labelOf = (ym: string) =>
    mode === 'yearly' ? ym :
    ym.length === 7 ? `${ym.slice(2, 4)}.${ym.slice(5)}` : ym   // "24.05"

  // 최신 기준 요약 (제외 그룹 빼고)
  const latestEntry  = [...activeMonths].at(-1)
  const latestGroups = latestEntry?.groups ?? {}
  const total납입액  = groupOrder.reduce((s, g) => s + (latestGroups[g]?.납입액 ?? 0), 0)
  const total평가액  = groupOrder.reduce((s, g) => s + (latestGroups[g]?.평가액 ?? 0), 0)
  const total손익    = total평가액 > 0 ? total평가액 - total납입액 : null
  const total수익률  = total납입액 > 0 && total평가액 > 0
    ? ((total평가액 - total납입액) / total납입액) * 100 : null

  // 그룹 비교 (최신 월)
  const groupCompData = groupOrder
    .filter(g => visibleGroups.has(g))
    .map(grp => {
      const g = latestGroups[grp]
      return {
        name: grp,
        납입액: g ? Math.round(g.납입액 / 10000) : 0,
        평가액: g ? Math.round(g.평가액 / 10000) : 0,
        color: GROUP_COLORS[groupOrder.indexOf(grp) % GROUP_COLORS.length],
      }
    })

  // 시계열 데이터
  const tsData = displayData.map(entry => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = { month: labelOf(entry.yearMonth), yearMonth: entry.yearMonth }
    groupOrder.forEach(grp => {
      const g = entry.groups[grp]
      row[`${grp}_납입액`]   = g ? Math.round(g.납입액 / 10000) : undefined
      row[`${grp}_평가액`]   = g ? Math.round(g.평가액 / 10000) : undefined
      row[`${grp}_평가손익`] = g?.평가손익 != null ? Math.round(g.평가손익 / 10000) : undefined
      row[`${grp}_수익률`]   = g?.수익률   != null ? g.수익률   : undefined
      row[`${grp}_비중`]     = g?.비중     != null ? g.비중     : undefined
    })
    return row
  })

  const xProps = {
    tick: { fontSize: 10, fill: '#9ca3af' },
    axisLine: false as const, tickLine: false as const, interval: 0 as const,
  }
  const yAmt = { tick: { fontSize: 10, fill: '#9ca3af' }, axisLine: false as const, tickLine: false as const, width: 50 }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-y-auto md:overflow-hidden bg-gray-50">

      {/* 헤더 */}
      <div className="px-4 md:px-8 pt-4 pb-2 flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-800">연금 전체 현황</h1>
      </div>

      {/* 그룹 토글 */}
      <div className="px-4 md:px-8 pb-2 flex items-center gap-2 flex-wrap flex-shrink-0">
        {groupOrder.map((grp, i) => {
          const on    = visibleGroups.has(grp)
          const color = GROUP_COLORS[i % GROUP_COLORS.length]
          return (
            <button key={grp} onClick={() => toggleGroup(grp)}
              style={on ? { background: color, borderColor: color, color: '#fff' } : {}}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                ${on ? '' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}>
              <i className={`ti ${on ? 'ti-check' : 'ti-circle'} text-[10px]`} />
              {grp}
            </button>
          )
        })}
      </div>

      {/* 차트 영역 */}
      <div className="px-4 pb-4 flex flex-col gap-3 md:flex-1 md:min-h-0 md:px-8">

        {/* Row 1: 요약 + 그룹 비교 */}
        <div className="flex flex-col gap-3 md:flex-row md:min-h-0" style={{ flex: 3 }}>

          {/* 요약 카드 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex flex-col md:w-[352px] md:flex-shrink-0">
            <SummaryRow label="총 납입액" value={total납입액}
              color="text-[#4a6fdb]" bg="bg-[#4a6fdb]/10" icon="ti-wallet" />
            <div className="border-t border-gray-100 my-2" />
            <SummaryRow label="총 평가액" value={total평가액}
              color="text-[#2a9d5c]" bg="bg-[#2a9d5c]/10" icon="ti-chart-line" />
            <div className="border-t border-gray-100 my-2" />
            <SummaryRow label="평가손익" value={total손익 ?? 0}
              color={!total손익 ? 'text-gray-400' : total손익 > 0 ? 'text-[#d94f4f]' : 'text-[#4a6fdb]'}
              bg={!total손익 ? 'bg-gray-100' : total손익 > 0 ? 'bg-[#d94f4f]/10' : 'bg-[#4a6fdb]/10'}
              icon="ti-trending-up" />
            <div className="border-t border-gray-100 my-2" />
            <div className="flex-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="w-5 h-5 flex items-center justify-center rounded-md flex-shrink-0 bg-gray-100">
                  <i className="ti ti-percentage text-[11px] text-gray-500" />
                </span>
                <span className="text-xs text-gray-400">수익률</span>
              </div>
              <span className={`text-[15px] font-bold tabular-nums whitespace-nowrap ${
                !total수익률 ? 'text-gray-400' : total수익률 > 0 ? 'text-red-500' : 'text-blue-500'
              }`}>
                {total수익률 != null ? `${total수익률 >= 0 ? '+' : ''}${total수익률.toFixed(2)}%` : '-'}
              </span>
            </div>
          </div>

          {/* 그룹 비교 */}
          <div className="h-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:h-auto md:flex-1 md:min-w-0">
            <p className="text-sm font-semibold text-gray-600 mb-2 flex-shrink-0">
              그룹별 납입액 / 평가액 (최신 기준)
            </p>
            <div className="flex-1 min-h-0">
              {groupCompData.length === 0
                ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">데이터 없음</div>
                : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={groupCompData}
                      margin={{ top: 10, right: 12, left: 0, bottom: 4 }} barCategoryGap="30%" barGap={3}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={v => `${v}만`} {...yAmt} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, fontWeight: 'bold', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                        formatter={(v: number) => [`${v}만원`]}
                        cursor={{ fill: '#f3f4f6' }}
                      />
                      <ReferenceLine y={0} stroke="#e5e7eb" />
                      <Bar dataKey="납입액" name="납입액" fill="#e0e7ff" radius={[4,4,0,0]} maxBarSize={44}>
                        <LabelList dataKey="납입액" position="top" formatter={fmtLabel} style={LBL} />
                      </Bar>
                      <Bar dataKey="평가액" name="평가액" radius={[4,4,0,0]} maxBarSize={44}>
                        {groupCompData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.65} />)}
                        <LabelList dataKey="평가액" position="top" formatter={fmtLabel} style={LBL} />
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
            </div>
          </div>
        </div>

        {/* Row 2: 납입액 추이 + 수익률 추이 */}
        <div className="flex flex-col gap-3 md:flex-row md:min-h-0" style={{ flex: 4 }}>

          <div className="h-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:h-auto md:flex-1 md:min-w-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <p className="text-sm font-semibold text-gray-600">{mode === 'monthly' ? '월별' : '연도별'} 납입액 추이</p>
              <div className="flex items-center gap-3">
                <GroupLegend groupOrder={groupOrder} visibleGroups={visibleGroups} />
                <ModeToggle mode={mode} onChange={setMode} />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {tsData.length === 0
                ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">데이터 없음</div>
                : (
                  <ScrollChart data={tsData}>
                    {(w, h) => {
                      const visible = groupOrder.filter(g => visibleGroups.has(g))
                      const lastGrp = visible[visible.length - 1]
                      const stacked = true
                      return (
                        <BarChart data={tsData} width={w} height={h}
                          margin={{ top: 10, right: 8, left: 0, bottom: 4 }}
                          barCategoryGap={stacked ? '30%' : '28%'} barGap={stacked ? 0 : 2}>
                          <XAxis dataKey="month" {...xProps} />
                          <YAxis tickFormatter={v => `${v}만`} {...yAmt} />
                          <Tooltip content={<PensionTooltip />} cursor={{ fill: '#f3f4f6' }} />
                          <ReferenceLine y={0} stroke="#e5e7eb" />
                          {visible.map(grp => {
                            const isLast = grp === lastGrp
                            return (
                              <Bar key={grp} dataKey={`${grp}_납입액`} name={grp}
                                stackId={stacked ? 'n' : undefined}
                                fill={GROUP_COLORS[groupOrder.indexOf(grp) % GROUP_COLORS.length]}
                                fillOpacity={stacked ? 1 : 0.75}
                                radius={stacked ? (isLast ? [3,3,0,0] : [0,0,0,0]) : [2,2,0,0]}
                                maxBarSize={stacked ? 44 : 24}>
                                {stacked ? (
                                  isLast && (
                                    <LabelList
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      valueAccessor={(row: any) =>
                                        visible.reduce((s, g) => s + (Number(row[`${g}_납입액`]) || 0), 0)
                                      }
                                      position="top" formatter={fmtLabel} style={LBL}
                                    />
                                  )
                                ) : (
                                  <LabelList dataKey={`${grp}_납입액`} position="top" formatter={fmtLabel} style={LBL} />
                                )}
                              </Bar>
                            )
                          })}
                        </BarChart>
                      )
                    }}
                  </ScrollChart>
                )}
            </div>
          </div>

          <div className="h-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:h-auto md:flex-1 md:min-w-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <p className="text-sm font-semibold text-gray-600">{mode === 'monthly' ? '월별' : '연도별'} 수익률 추이</p>
              <div className="flex items-center gap-3">
                <GroupLegend groupOrder={groupOrder} visibleGroups={visibleGroups} />
                <ModeToggle mode={mode} onChange={setMode} />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {tsData.length === 0
                ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">데이터 없음</div>
                : (
                  <ScrollChart data={tsData}>
                    {(w, h) => (
                      <ComposedChart data={tsData} width={w} height={h}
                        margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                        <XAxis dataKey="month" {...xProps} padding={{ right: 10 }} />
                        <YAxis tickFormatter={v => `${v}%`}
                          tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={42} />
                        <Tooltip content={<PensionTooltip pct="rate" />} cursor={{ fill: '#f3f4f6' }} />
                        <ReferenceLine y={0} stroke="#e5e7eb" />
                        {groupOrder.filter(g => visibleGroups.has(g)).map(grp => (
                          <Line key={grp} type="monotone"
                            dataKey={`${grp}_수익률`} name={grp}
                            stroke={GROUP_COLORS[groupOrder.indexOf(grp) % GROUP_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3, fill: GROUP_COLORS[groupOrder.indexOf(grp) % GROUP_COLORS.length], strokeWidth: 0 }}
                            activeDot={{ r: 5 }} connectNulls={false}
                          />
                        ))}
                      </ComposedChart>
                    )}
                  </ScrollChart>
                )}
            </div>
          </div>
        </div>

        {/* Row 3: 평가액 추이 + 비중 추이 */}
        <div className="flex flex-col gap-3 md:flex-row md:min-h-0" style={{ flex: 4 }}>
          <div className="h-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:h-auto md:flex-1 md:min-w-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <p className="text-sm font-semibold text-gray-600">{mode === 'monthly' ? '월별' : '연도별'} 평가액 추이</p>
              <div className="flex items-center gap-3">
                <GroupLegend groupOrder={groupOrder} visibleGroups={visibleGroups} />
                <ModeToggle mode={mode} onChange={setMode} />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {tsData.length === 0
                ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">데이터 없음</div>
                : (
                  <ScrollChart data={tsData}>
                    {(w, h) => {
                      const visible = groupOrder.filter(g => visibleGroups.has(g))
                      const lastGrp = visible[visible.length - 1]
                      return (
                        <BarChart data={tsData} width={w} height={h}
                          margin={{ top: 10, right: 8, left: 0, bottom: 4 }}
                          barCategoryGap="30%" barGap={0}>
                          <XAxis dataKey="month" {...xProps} />
                          <YAxis tickFormatter={v => `${v}만`} {...yAmt} />
                          <Tooltip content={<PensionTooltip />} cursor={{ fill: '#f3f4f6' }} />
                          <ReferenceLine y={0} stroke="#e5e7eb" />
                          {visible.map(grp => {
                            const isLast = grp === lastGrp
                            return (
                              <Bar key={grp} dataKey={`${grp}_평가액`} name={grp}
                                stackId="e"
                                fill={GROUP_COLORS[groupOrder.indexOf(grp) % GROUP_COLORS.length]}
                                fillOpacity={0.85}
                                radius={isLast ? [3,3,0,0] : [0,0,0,0]}
                                maxBarSize={44}>
                                {isLast && (
                                  <LabelList
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    valueAccessor={(row: any) =>
                                      visible.reduce((s, g) => s + (Number(row[`${g}_평가액`]) || 0), 0)
                                    }
                                    position="top" formatter={fmtLabel} style={LBL}
                                  />
                                )}
                              </Bar>
                            )
                          })}
                        </BarChart>
                      )
                    }}
                  </ScrollChart>
                )}
            </div>
          </div>
          <div className="h-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:h-auto md:flex-1 md:min-w-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <p className="text-sm font-semibold text-gray-600">{mode === 'monthly' ? '월별' : '연도별'} 그룹 비중 추이</p>
              <div className="flex items-center gap-3">
                <GroupLegend groupOrder={groupOrder} visibleGroups={visibleGroups} />
                <ModeToggle mode={mode} onChange={setMode} />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {tsData.length === 0
                ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">데이터 없음</div>
                : (
                  <ScrollChart data={tsData}>
                    {(w, h) => {
                      const visible = groupOrder.filter(g => visibleGroups.has(g))
                      const lastGrp = visible[visible.length - 1]
                      return (
                        <BarChart data={tsData} width={w} height={h}
                          margin={{ top: 10, right: 8, left: 0, bottom: 4 }} barCategoryGap="30%" barGap={0}>
                          <XAxis dataKey="month" {...xProps} />
                          <YAxis tickFormatter={v => `${v}%`}
                            tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={38} />
                          <Tooltip content={<PensionTooltip pct="pct" />} cursor={{ fill: '#f3f4f6' }} />
                          <ReferenceLine y={0} stroke="#e5e7eb" />
                          {visible.map(grp => (
                            <Bar key={grp} dataKey={`${grp}_비중`} name={grp} stackId="w"
                              fill={GROUP_COLORS[groupOrder.indexOf(grp) % GROUP_COLORS.length]}
                              radius={grp === lastGrp ? [3,3,0,0] : [0,0,0,0]}
                              maxBarSize={44}>
                              {grp === lastGrp && (
                                <LabelList
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  valueAccessor={(row: any) =>
                                    visible.reduce((s, g) => s + (Number(row[`${g}_비중`]) || 0), 0)
                                  }
                                  position="top"
                                  formatter={(v: number) => v > 0 ? `${v.toFixed(0)}%` : ''}
                                  style={LBL}
                                />
                              )}
                            </Bar>
                          ))}
                        </BarChart>
                      )
                    }}
                  </ScrollChart>
                )}
            </div>
          </div>
        </div>

      </div>
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

function GroupLegend({ groupOrder, visibleGroups }: { groupOrder: string[]; visibleGroups: Set<string> }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {groupOrder.filter(g => visibleGroups.has(g)).map(grp => (
        <span key={grp} className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-2 h-2 rounded-sm inline-block"
            style={{ background: GROUP_COLORS[groupOrder.indexOf(grp) % GROUP_COLORS.length] }} />
          {grp}
        </span>
      ))}
    </div>
  )
}
