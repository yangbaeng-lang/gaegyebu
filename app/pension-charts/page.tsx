'use client'
import { useState, useEffect } from 'react'
import { fmt } from '@/lib/utils'
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip as RechartTooltip, ResponsiveContainer, Cell, ReferenceLine,
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

export default function PensionChartsPage() {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [pensionSid,   setPensionSid]   = useState<number | null>(null)
  const [monthlyData,  setMonthlyData]  = useState<MonthlyEntry[]>([])
  const [groupOrder,   setGroupOrder]   = useState<string[]>([])
  const [loading,      setLoading]      = useState(false)

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
    const startMonth = `${selectedYear}-01`
    const endMonth   = selectedYear === currentYear
      ? `${currentYear}-${String(currentMonth).padStart(2, '0')}`
      : `${selectedYear}-12`
    fetch(`/api/pension-eval/range?sessionId=${pensionSid}&startMonth=${startMonth}&endMonth=${endMonth}`)
      .then(r => r.json())
      .then(d => { setMonthlyData(d.monthlyData ?? []); setGroupOrder(d.groupOrder ?? []) })
      .finally(() => setLoading(false))
  }, [pensionSid, selectedYear])

  // 그룹별 시계열 차트 데이터 조합
  const groupCharts = groupOrder.map(grp => {
    const chartData = monthlyData.map(entry => {
      const g = entry.groups[grp]
      if (!g) return null
      const label = entry.yearMonth.slice(5) + '월'   // "01월"
      return {
        month: label,
        yearMonth: entry.yearMonth,
        납입액:  g.납입액  > 0 ? Math.round(g.납입액  / 10000) : 0,
        평가액:   g.평가액  > 0 ? Math.round(g.평가액  / 10000) : undefined,
        수익률:  g.수익률  !== null ? g.수익률 : undefined,
        비중:    g.비중    !== null ? g.비중   : undefined,
      }
    }).filter((d): d is NonNullable<typeof d> => d !== null)

    if (chartData.length === 0) return null

    // 최신 월 기준 요약
    const latest = [...monthlyData].reverse().find(e => e.groups[grp])?.groups[grp] ?? null

    return { grp, chartData, latest }
  }).filter((g): g is NonNullable<typeof g> => g !== null)

  const rateBg = (v: number | null) => {
    if (v === null) return 'bg-gray-100 text-gray-400'
    if (v === 0) return 'bg-gray-100 text-gray-600'
    return v > 0 ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
  }

  // 연도 선택 범위: 2020 ~ 현재
  const yearOptions: number[] = []
  for (let y = currentYear; y >= 2020; y--) yearOptions.push(y)

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <h1 className="text-base font-bold text-gray-800 flex items-center gap-2">
          <i className="ti ti-chart-bar text-[#6b8cff]" />
          연금 차트
        </h1>

        {/* 연도 선택 */}
        <div className="flex items-center gap-1 ml-4">
          {yearOptions.map(y => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                selectedYear === y
                  ? 'bg-[#6b8cff] text-white'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
              }`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto p-6">
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
            <p className="text-sm">{selectedYear}년 데이터가 없습니다</p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
            {groupCharts.map(({ grp, chartData, latest }) => (
              <div key={grp} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* 그룹 헤더 */}
                <div className="px-5 pt-4 pb-3 border-b border-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-800">{grp}</span>
                    <div className="flex items-center gap-2">
                      {latest?.비중 != null && (
                        <span className="text-xs text-gray-400">
                          포트폴리오 <span className="font-semibold text-gray-600">{latest.비중.toFixed(1)}%</span>
                        </span>
                      )}
                      {latest?.수익률 != null && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${rateBg(latest.수익률)}`}>
                          {latest.수익률 >= 0 ? '+' : ''}{latest.수익률.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 mt-1.5 text-xs">
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

                {/* 시계열 차트 */}
                <div className="px-3 pt-3 pb-0">
                  <ResponsiveContainer width="100%" height={210}>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 42, bottom: 5, left: 0 }}>
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                        tickFormatter={v => v === 0 ? '0' : `${v}만`}
                        axisLine={false} tickLine={false}
                        width={46}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 9, fill: '#a78bfa' }}
                        tickFormatter={v => `${v}%`}
                        axisLine={false} tickLine={false}
                        width={38}
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
                      <Bar yAxisId="left" dataKey="납입액" name="납입액" fill="#e0e7ff" radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Bar yAxisId="left" dataKey="평가액" name="평가액" fill="#86efac" radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="수익률"
                        name="수익률"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        connectNulls={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>

                  {/* 범례 */}
                  <div className="flex items-center gap-4 justify-center pb-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-sm bg-[#e0e7ff] inline-block" />납입액
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-sm bg-[#86efac] inline-block" />평가액
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-0.5 bg-[#8b5cf6] inline-block rounded" />수익률
                    </span>
                  </div>
                </div>

                {/* 비중 시계열 바 */}
                {chartData.some(d => d.비중 != null) && (
                  <div className="px-5 pb-4 border-t border-gray-50 pt-3">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">월별 비중</div>
                    <div className="flex items-end gap-1" style={{ height: '56px' }}>
                      {chartData.map(d => (
                        <div key={d.yearMonth} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                          {d.비중 != null ? (
                            <>
                              <span className="text-[10px] text-gray-500 leading-none font-medium">{d.비중.toFixed(1)}%</span>
                              <div
                                className="w-full rounded-sm bg-[#6b8cff]/60"
                                style={{ height: `${Math.max(2, (d.비중 / 100) * 24)}px` }}
                                title={`${d.month}: ${d.비중.toFixed(1)}%`}
                              />
                            </>
                          ) : (
                            <div className="w-full h-0.5 bg-gray-100 rounded-sm" />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] text-gray-300">{chartData[0]?.month}</span>
                      <span className="text-[9px] text-gray-300">{chartData[chartData.length - 1]?.month}</span>
                    </div>
                  </div>
                )}

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
