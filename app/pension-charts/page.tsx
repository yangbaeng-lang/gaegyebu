'use client'
import { useState, useEffect, useRef } from 'react'
import { fmt } from '@/lib/utils'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis,
  Tooltip as RechartTooltip, Cell, ReferenceLine, LabelList,
} from 'recharts'

type GroupMonthly = {
  납입액: number; 평가액: number; 평가손익: number | null
  수익률: number | null; 비중: number | null
}
type MonthlyEntry = {
  yearMonth: string
  groups: Record<string, GroupMonthly>
  total평가액: number
}

const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '11px',
  fontWeight: 'bold' as const,
  color: '#374151',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScrollChart({ data, children }: { data: any[]; children: (w: number, h: number) => React.ReactNode }) {
  const wrapRef     = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const dragging    = useRef(false)
  const startX      = useRef(0)
  const scrollLeft  = useRef(0)
  const scrolledRef = useRef(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setDims({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // 터치 이벤트 (모바일 드래그 스크롤)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let startTouchX = 0
    let startScrollLeft = 0
    const onTouchStart = (e: TouchEvent) => {
      startTouchX    = e.touches[0].pageX
      startScrollLeft = el.scrollLeft
    }
    const onTouchMove = (e: TouchEvent) => {
      const dx = startTouchX - e.touches[0].pageX
      if (Math.abs(dx) > 5) e.preventDefault()
      el.scrollLeft = startScrollLeft + dx
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
    }
  }, [])

  useEffect(() => { scrolledRef.current = false }, [data])

  useEffect(() => {
    if (dims.w === 0 || scrolledRef.current) return
    scrolledRef.current = true
    requestAnimationFrame(() => {
      if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth
    })
  }, [dims.w, data])

  const onDown = (e: React.MouseEvent) => {
    dragging.current   = true
    startX.current     = e.pageX - (wrapRef.current?.offsetLeft ?? 0)
    scrollLeft.current = wrapRef.current?.scrollLeft ?? 0
  }
  const onMove = (e: React.MouseEvent) => {
    if (!dragging.current || !wrapRef.current) return
    e.preventDefault()
    wrapRef.current.scrollLeft = scrollLeft.current - (e.pageX - (wrapRef.current.offsetLeft ?? 0) - startX.current)
  }
  const onUp = () => { dragging.current = false }

  // 화면 너비에 따라 표시 개수 조정
  const visible = dims.w < 480 ? 6 : 10
  const barW    = dims.w > 0 ? Math.floor(dims.w / visible) : 60
  const innerW  = data.length > visible ? data.length * barW : dims.w

  return (
    <>
      <style>{`
        .pc-scroll{overflow-anchor:none}
        .pc-scroll::-webkit-scrollbar{height:4px}
        .pc-scroll::-webkit-scrollbar-track{background:#f1f5f9;border-radius:4px}
        .pc-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px;min-width:24px}
        .pc-scroll::-webkit-scrollbar-thumb:hover{background:#94a3b8}
      `}</style>
      <div
        ref={wrapRef}
        className="pc-scroll overflow-x-auto overflow-y-hidden h-full select-none"
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

export default function PensionChartsPage() {
  const today        = new Date()
  const currentYear  = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const [mode,        setMode]        = useState<'monthly' | 'yearly'>('monthly')
  const [pensionSid,  setPensionSid]  = useState<number | null>(null)
  const [monthlyData, setMonthlyData] = useState<MonthlyEntry[]>([])
  const [groupOrder,  setGroupOrder]  = useState<string[]>([])
  const [loading,     setLoading]     = useState(false)

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
    const endMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
    fetch(`/api/pension-eval/range?sessionId=${pensionSid}&startMonth=2020-01&endMonth=${endMonth}`)
      .then(r => r.json())
      .then(d => { setMonthlyData(d.monthlyData ?? []); setGroupOrder(d.groupOrder ?? []) })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pensionSid])

  const activeMonths = monthlyData.filter(e => Object.keys(e.groups).length > 0)

  const yearlyData = (() => {
    const byYear: Record<string, MonthlyEntry> = {}
    activeMonths.forEach(e => { byYear[e.yearMonth.slice(0, 4)] = e })
    return Object.entries(byYear).map(([yr, e]) => ({ ...e, yearMonth: yr }))
  })()

  const displayData = mode === 'monthly' ? activeMonths : yearlyData

  const labelOf = (ym: string) =>
    mode === 'yearly' ? ym : `${ym.slice(2, 4)}.${ym.slice(5)}`

  const groupCharts = groupOrder.map(grp => {
    const chartData = displayData.map(entry => {
      const g = entry.groups[grp]
      if (!g) return null
      return {
        month:    labelOf(entry.yearMonth),
        yearMonth: entry.yearMonth,
        납입액:   g.납입액  > 0 ? Math.round(g.납입액  / 10000) : 0,
        평가액:   g.평가액  > 0 ? Math.round(g.평가액  / 10000) : undefined,
        수익률:   g.수익률  !== null ? g.수익률 : undefined,
        비중:     g.비중    !== null ? g.비중   : undefined,
      }
    }).filter((d): d is NonNullable<typeof d> => d !== null)

    if (chartData.length === 0) return null

    const latest = activeMonths.at(-1)?.groups[grp] ?? null
    return { grp, chartData, latest }
  }).filter((g): g is NonNullable<typeof g> => g !== null)

  const rateBg = (v: number | null) => {
    if (v === null) return 'bg-gray-100 text-gray-400'
    if (v === 0) return 'bg-gray-100 text-gray-600'
    return v > 0 ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <h1 className="text-base font-bold text-gray-800 flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
          <i className="ti ti-chart-bar text-[#6b8cff]" />
          <span className="hidden sm:inline">연금 차트</span>
          <span className="sm:hidden">연금</span>
        </h1>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-300 text-sm">불러오는 중…</div>
        ) : !pensionSid ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-300">
            <i className="ti ti-pig-money text-3xl" />
            <p className="text-sm">"연금" 섹션이 없습니다</p>
          </div>
        ) : groupCharts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-300">
            <i className="ti ti-chart-bar text-3xl" />
            <p className="text-sm">데이터가 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5">
            {groupCharts.map(({ grp, chartData, latest }) => (
              <div key={grp} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* 그룹 헤더 */}
                <div className="px-4 sm:px-5 pt-3 sm:pt-4 pb-2 sm:pb-3 border-b border-gray-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-gray-800 truncate">{grp}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {latest?.비중 != null && (
                        <span className="text-[11px] text-gray-400 hidden sm:inline">
                          포트폴리오 <span className="font-semibold text-gray-600">{latest.비중.toFixed(1)}%</span>
                        </span>
                      )}
                      {latest?.비중 != null && (
                        <span className="text-[11px] text-gray-400 sm:hidden">
                          <span className="font-semibold text-gray-600">{latest.비중.toFixed(1)}%</span>
                        </span>
                      )}
                      {latest?.수익률 != null && (
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${rateBg(latest.수익률)}`}>
                          {latest.수익률 >= 0 ? '+' : ''}{latest.수익률.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs">
                    {latest && (
                      <>
                        <span className="text-gray-400">납입 <span className="font-semibold text-gray-700">{fmt(latest.납입액)}</span></span>
                        {latest.평가손익 !== null && (
                          <span className={latest.평가손익 >= 0 ? 'text-red-400' : 'text-blue-400'}>
                            손익 <span className="font-semibold">{latest.평가손익 >= 0 ? '+' : ''}{fmt(latest.평가손익)}</span>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* 시계열 차트 + 비중 추이 (드래그/터치 스크롤) */}
                {(() => {
                  const hasWeight = chartData.some(d => d.비중 != null)
                  const mainH  = 200
                  const weightH = 90
                  const totalH  = hasWeight ? mainH + weightH : mainH + 10
                  return (
                    <div className="px-2 sm:px-3 pt-3 pb-0" style={{ height: totalH }}>
                      <ScrollChart data={chartData}>
                        {(w, h) => (
                          <div style={{ width: w, height: h }}>
                            <ComposedChart data={chartData} width={w} height={mainH} margin={{ top: 10, right: 36, bottom: 5, left: 0 }}>
                              <XAxis
                                dataKey="month"
                                tick={{ fontSize: 9, fill: '#9ca3af' }}
                                axisLine={false} tickLine={false}
                              />
                              <YAxis
                                yAxisId="left"
                                tick={{ fontSize: 9, fill: '#9ca3af' }}
                                tickFormatter={v => v === 0 ? '0' : `${v}만`}
                                axisLine={false} tickLine={false}
                                width={40}
                              />
                              <YAxis
                                yAxisId="right"
                                orientation="right"
                                tick={{ fontSize: 9, fill: '#a78bfa' }}
                                tickFormatter={v => `${v}%`}
                                axisLine={false} tickLine={false}
                                width={34}
                              />
                              <RechartTooltip
                                contentStyle={TOOLTIP_STYLE}
                                formatter={(value: unknown, name: string) => {
                                  const v = Number(value)
                                  if (name === '수익률') return [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, name]
                                  return [`${v}만원`, name]
                                }}
                              />
                              <ReferenceLine yAxisId="left" y={0} stroke="#e5e7eb" />
                              <Bar yAxisId="left" dataKey="납입액" name="납입액" fill="#e0e7ff" radius={[3, 3, 0, 0]} maxBarSize={26} />
                              <Bar yAxisId="left" dataKey="평가액" name="평가액" fill="#86efac" radius={[3, 3, 0, 0]} maxBarSize={26} />
                              <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="수익률"
                                name="수익률"
                                stroke="#8b5cf6"
                                strokeWidth={2}
                                dot={{ r: 2.5, fill: '#8b5cf6', strokeWidth: 0 }}
                                activeDot={{ r: 4 }}
                                connectNulls={false}
                              />
                            </ComposedChart>

                            {hasWeight && (
                              <>
                                <div className="text-[10px] font-semibold text-gray-400 px-2 pt-1 border-t border-gray-100">비중 추이</div>
                                <BarChart data={chartData} width={w} height={weightH - 14} margin={{ top: 14, right: 36, bottom: 10, left: 0 }}>
                                  <XAxis
                                    dataKey="month"
                                    tick={{ fontSize: 9, fill: '#9ca3af' }}
                                    axisLine={false} tickLine={false}
                                  />
                                  <YAxis
                                    tick={{ fontSize: 9, fill: '#9ca3af' }}
                                    tickFormatter={v => `${v}%`}
                                    axisLine={false} tickLine={false}
                                    width={40}
                                  />
                                  <RechartTooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, '비중']}
                                  />
                                  <Bar dataKey="비중" fill="#6b8cff" fillOpacity={0.55} radius={[2, 2, 0, 0]} maxBarSize={26}>
                                    <LabelList
                                      dataKey="비중"
                                      position="top"
                                      formatter={(v: number) => `${v.toFixed(1)}%`}
                                      style={{ fontSize: 9, fill: '#6b8cff', fontWeight: 600 }}
                                    />
                                  </Bar>
                                </BarChart>
                              </>
                            )}
                          </div>
                        )}
                      </ScrollChart>
                    </div>
                  )
                })()}

                {/* 범례 */}
                <div className="flex items-center gap-3 sm:gap-4 justify-center py-2 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-2.5 rounded-sm bg-[#e0e7ff] inline-block" />납입액
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-2.5 rounded-sm bg-[#86efac] inline-block" />평가액
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-0.5 bg-[#8b5cf6] inline-block rounded" />수익률
                  </span>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
