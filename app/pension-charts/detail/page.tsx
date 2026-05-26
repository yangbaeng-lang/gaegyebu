'use client'
import { useState, useEffect } from 'react'
import { fmt } from '@/lib/utils'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Cell,
  Tooltip as RechartTooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

type AssetMonthly = {
  name: string; color: string; group: string
  납입액: number; 평가액: number; 평가손익: number | null
  수익률: number | null; hasEval: boolean
}
type MonthlyEntry = {
  yearMonth: string
  assets: AssetMonthly[]
  total평가액: number
}
type AssetSummary = {
  name: string; color: string
  납입액: number; 평가손익: number | null; 수익률: number | null
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

export default function PensionDetailPage() {
  const today        = new Date()
  const currentYear  = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [pensionSid,   setPensionSid]   = useState<number | null>(null)
  const [monthlyData,  setMonthlyData]  = useState<MonthlyEntry[]>([])
  const [assetOrder,   setAssetOrder]   = useState<AssetSummary[]>([])
  const [loading,      setLoading]      = useState(false)

  useEffect(() => {
    fetch('/api/sessions').then(r => r.json()).then(d => {
      const list: { id: number; name: string }[] = d.sessions ?? []
      setPensionSid(list.find(s => s.name === '연금')?.id ?? null)
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
      .then(d => { setMonthlyData(d.monthlyData ?? []); setAssetOrder(d.assetOrder ?? []) })
      .finally(() => setLoading(false))
  }, [pensionSid, selectedYear])

  // 자산별 월별 차트 데이터 조합
  const assetCharts = assetOrder.map(summary => {
    const chartData = monthlyData
      .map(entry => {
        const a = entry.assets.find(a => a.name === summary.name)
        if (!a) return null
        return {
          month:    entry.yearMonth.slice(5) + '월',
          yearMonth: entry.yearMonth,
          납입액:   Math.round(a.납입액   / 10000),
          평가손익: a.평가손익 !== null ? Math.round(a.평가손익 / 10000) : undefined,
          수익률:   a.수익률   !== null ? a.수익률 : undefined,
        }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)

    if (chartData.length === 0) return null
    return { ...summary, chartData }
  }).filter((c): c is NonNullable<typeof c> => c !== null)

  const rateBg = (v: number | null) => {
    if (v === null) return 'bg-gray-100 text-gray-400'
    if (v === 0)   return 'bg-gray-100 text-gray-600'
    return v > 0 ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
  }

  const yearOptions: number[] = []
  for (let y = currentYear; y >= 2020; y--) yearOptions.push(y)

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2 flex-shrink-0">
        <h1 className="text-base font-bold text-gray-800 flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
          <i className="ti ti-chart-histogram text-[#6b8cff]" />
          세부내역 차트
        </h1>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0">
          {yearOptions.map(y => (
            <button key={y} onClick={() => setSelectedYear(y)}
              className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
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
        ) : assetCharts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-300">
            <i className="ti ti-chart-histogram text-3xl" />
            <p className="text-sm">{selectedYear}년 데이터가 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {assetCharts.map(({ name, color, 납입액, 평가손익, 수익률, chartData }) => (
              <div key={name} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* 카드 헤더 */}
                <div className="px-5 pt-4 pb-3 border-b border-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-sm font-bold text-gray-800">{name}</span>
                    </span>
                    {수익률 != null && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${rateBg(수익률)}`}>
                        {수익률 >= 0 ? '+' : ''}{수익률.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 mt-1.5 text-xs">
                    <span className="text-gray-400">납입 <span className="font-semibold text-gray-700">{fmt(납입액)}</span></span>
                    {평가손익 !== null && (
                      <span className={평가손익 >= 0 ? 'text-red-400' : 'text-blue-400'}>
                        손익 <span className="font-semibold">{평가손익 >= 0 ? '+' : ''}{fmt(평가손익)}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 시계열 차트 */}
                <div className="px-3 pt-3 pb-0">
                  <ResponsiveContainer width="100%" height={210}>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 42, bottom: 5, left: 0 }}>
                      <XAxis dataKey="month"
                        tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left"
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                        tickFormatter={v => v === 0 ? '0' : `${v}만`}
                        axisLine={false} tickLine={false} width={46} />
                      <YAxis yAxisId="right" orientation="right"
                        tick={{ fontSize: 9, fill: '#a78bfa' }}
                        tickFormatter={v => `${v}%`}
                        axisLine={false} tickLine={false} width={38} />
                      <RechartTooltip contentStyle={TOOLTIP_STYLE}
                        formatter={(value: unknown, name: string) => {
                          const v = Number(value)
                          if (name === '수익률') return [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, name]
                          return [`${v}만원`, name]
                        }} />
                      <ReferenceLine yAxisId="left" y={0} stroke="#e5e7eb" />

                      {/* 누적 막대: 납입액(하단) + 평가손익(상단) */}
                      <Bar yAxisId="left" dataKey="납입액"   name="납입액"   stackId="a" fill="#c7d2fe" maxBarSize={28} />
                      <Bar yAxisId="left" dataKey="평가손익" name="평가손익" stackId="a" maxBarSize={28}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={(entry.평가손익 ?? 0) >= 0 ? '#86efac' : '#fca5a5'} />
                        ))}
                      </Bar>

                      <Line yAxisId="right" type="monotone" dataKey="수익률" name="수익률"
                        stroke="#8b5cf6" strokeWidth={2}
                        dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
                        activeDot={{ r: 5 }} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>

                  {/* 범례 */}
                  <div className="flex items-center gap-4 justify-center pb-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-sm bg-[#c7d2fe] inline-block" />납입액
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-sm bg-[#86efac] inline-block" />평가손익(+)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-sm bg-[#fca5a5] inline-block" />평가손익(−)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-0.5 bg-[#8b5cf6] inline-block rounded" />수익률
                    </span>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
