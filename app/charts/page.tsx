'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ComposedChart, BarChart, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts'
import { fmt } from '@/lib/utils'

type SeriesItem = {
  period: string; label: string
  income: number; expense: number; profit: number
  incomeBudget: number; expenseBudget: number; profitBudget: number; savingRate: number; netWorth: number
}
type ChartsData = {
  series: SeriesItem[]
  expenseGroups: string[]
  groupSeries: Record<string, Record<string, number>>
}

const COLORS = ['#4a6fdb','#2a9d5c','#d94f4f','#f0a020','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1']
const TIP = { fontSize: 11, fontWeight: 'bold' as const, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }

function formatY(v: number) {
  const a = Math.abs(v)
  if (a >= 100000000) return `${(v / 100000000).toFixed(1)}억`
  if (a >= 10000)     return `${(v / 10000).toFixed(0)}만`
  return String(v)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarLabel({ x, y, width, height, value }: any) {
  if (!value || !(height >= 15)) return <g />
  return <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={9} fill="#6b7280">{formatY(value)}</text>
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProfitLabel({ x, y, width, height, value }: any) {
  if (!value || !(Math.abs(height) >= 15)) return <g />
  const ly = value >= 0 ? y - 4 : y + Math.abs(height) + 11
  return <text x={x + width / 2} y={ly} textAnchor="middle" fontSize={9} fill={value >= 0 ? '#6b7280' : '#f87171'}>{formatY(value)}</text>
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GroupLabel({ x, y, width, height, value }: any) {
  if (!value || !(height >= 15)) return <g />
  return <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={9} fill="#6b7280">{fmt(value)}</text>
}
const X_PROPS = {
  dataKey: 'label' as const,
  tick: { fontSize: 10, fill: '#9ca3af' },
  axisLine: false, tickLine: false, interval: 0,
}

// 스크롤 가능한 차트 래퍼 — max 12개 표시, 스크롤 시 Y축 자동 조정
function ScrollChart({ data, height = 220, getValues, children }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[]; height?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getValues: (item: any) => number[]
  children: (w: number, h: number, domain: [number, number], key: string) => React.ReactNode
}) {
  const ref  = useRef<HTMLDivElement>(null)
  const [cw, setCw]           = useState(0)
  const [scrollLeft, setScroll] = useState(0)
  const didAutoScroll = useRef(false)

  const measure = useCallback(() => {
    if (ref.current) setCw(ref.current.clientWidth)
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const barW   = Math.max(Math.ceil((cw || 900) / 12), 52)
  const chartW = Math.max(cw || 900, data.length * barW)

  // 데이터 로드 후 가장 최근 날짜(오른쪽 끝)로 자동 스크롤
  useEffect(() => {
    if (didAutoScroll.current || !ref.current || cw === 0 || data.length === 0) return
    didAutoScroll.current = true
    requestAnimationFrame(() => {
      if (ref.current) ref.current.scrollLeft = chartW
    })
  }, [chartW, cw, data.length])
  const perItem = chartW / (data.length || 1)

  // 현재 보이는 데이터 범위 계산
  const visStart = Math.max(0, Math.floor(scrollLeft / perItem))
  const visEnd   = Math.min(data.length - 1, Math.ceil((scrollLeft + cw) / perItem))
  const visible  = data.slice(visStart, visEnd + 1)

  // 보이는 데이터 기준 Y 도메인
  const vals   = visible.flatMap(getValues).filter(v => isFinite(v))
  const minVal = vals.length ? Math.min(0, ...vals) : 0
  const maxVal = vals.length ? Math.max(0, ...vals) : 1
  const pad    = (maxVal - minVal) * 0.15 || maxVal * 0.15 || 1
  const domain: [number, number] = [
    minVal < 0 ? minVal - pad : 0,
    maxVal + pad,
  ]
  const domainKey = `${domain[0].toFixed(0)}-${domain[1].toFixed(0)}`

  return (
    <div ref={ref} className="overflow-x-auto"
      onScroll={e => setScroll(e.currentTarget.scrollLeft)}>
      <div style={{ width: chartW, height }}>
        {children(chartW, height, domain, domainKey)}
      </div>
    </div>
  )
}

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="mb-3">{title}</div>
      {children}
    </div>
  )
}

function CardTitle({ text }: { text: string }) {
  return <h3 className="text-sm font-medium text-gray-700">{text}</h3>
}

export default function ChartsPage() {
  const [mode, setMode]       = useState<'monthly' | 'yearly'>('monthly')
  const [data, setData]       = useState<ChartsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selGrp, setSelGrp]   = useState('')
  const [piePeriod, setPiePeriod] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/charts?mode=${mode}`)
      .then(r => r.json())
      .then((d: ChartsData) => {
        setData(d)
        if (d.expenseGroups.length > 0) setSelGrp(d.expenseGroups[0])
        if (d.series.length > 0) setPiePeriod(d.series[d.series.length - 1].period)
        setLoading(false)
      })
  }, [mode])

  if (loading || !data) return (
    <div className="flex flex-col h-full">
      <Header mode={mode} setMode={setMode} />
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">로딩 중…</div>
    </div>
  )

  const { series, expenseGroups, groupSeries } = data

  const grpData = series.map(s => ({ ...s, amount: groupSeries[selGrp]?.[s.period] ?? 0 }))

  const cap = (v: number) => Math.max(-300, Math.min(300, v))
  const enrichedSeries = series.map((s, i) => {
    const prev     = i > 0 ? series[i - 1] : null
    const yoyOff   = mode === 'monthly' ? 12 : 1
    const prevYear = i >= yoyOff ? series[i - yoyOff] : null
    const momRate  = prev     && prev.netWorth     !== 0 ? cap(Math.round((s.netWorth - prev.netWorth)     / Math.abs(prev.netWorth)     * 100)) : null
    const yoyRate  = prevYear && prevYear.netWorth !== 0 ? cap(Math.round((s.netWorth - prevYear.netWorth) / Math.abs(prevYear.netWorth) * 100)) : null
    return { ...s, momRate, yoyRate }
  })

  const rates = enrichedSeries.flatMap(s => [s.momRate, s.yoyRate]).filter(v => v !== null) as number[]
  const rMin  = rates.length ? Math.min(0, ...rates) : -100
  const rMax  = rates.length ? Math.max(0, ...rates) : 100
  const rPad  = (rMax - rMin) * 0.2 || 50
  const rateDomain: [number, number] = [rMin - rPad, rMax + rPad]

  const pieData  = expenseGroups
    .map(g => ({ name: g, value: groupSeries[g]?.[piePeriod] ?? 0 }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header mode={mode} setMode={setMode} />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">

          {/* 수입 / 순이익 — 같은 행 */}
          <div className="grid grid-cols-2 gap-4">
            <Card title={
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-gray-700 flex-1">수입</h3>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="inline-block w-3 h-2.5 rounded-sm bg-[#4fe8a0]" />실적
                  <span className="inline-block w-3 h-2.5 rounded-sm bg-[#2a9d5c] opacity-50 ml-1" />목표
                </span>
              </div>
            }>
              <ScrollChart key={mode} data={series} getValues={s => [s.income as number, s.incomeBudget as number]}>
                {(w, h, domain, key) => (
                  <ComposedChart key={key} width={w} height={h} data={series} barCategoryGap="30%" barGap={2} margin={{ top: 20 }}>
                    <XAxis {...X_PROPS} />
                    <YAxis domain={domain} hide />
                    <Tooltip
                      formatter={(v: number, name: string) => [fmt(v), name === 'income' ? '수입' : '수입 목표']}
                      contentStyle={TIP} />
                    <Bar dataKey="income" fill="#4fe8a0" radius={[3,3,0,0]} label={BarLabel} />
                    <Bar dataKey="incomeBudget" fill="#2a9d5c" radius={[3,3,0,0]} opacity={0.5} />
                  </ComposedChart>
                )}
              </ScrollChart>
            </Card>
            <Card title={
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-gray-700 flex-1">순이익</h3>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="inline-block w-3 h-2.5 rounded-sm bg-[#4a6fdb]" />실적
                  <span className="inline-block w-3 h-2.5 rounded-sm bg-[#a5b4fc] opacity-70 ml-1" />목표
                </span>
              </div>
            }>
              <ScrollChart key={mode} data={series} getValues={s => [s.profit as number, s.profitBudget as number]}>
                {(w, h, domain, key) => (
                  <ComposedChart key={key} width={w} height={h} data={series} barCategoryGap="30%" barGap={2} margin={{ top: 20 }}>
                    <XAxis {...X_PROPS} />
                    <YAxis domain={domain} hide />
                    <ReferenceLine y={0} stroke="#e5e7eb" />
                    <Tooltip
                      formatter={(v: number, name: string) => [fmt(v), name === 'profit' ? '순이익' : '순이익 목표']}
                      contentStyle={TIP} />
                    <Bar dataKey="profit" radius={[3,3,0,0]}
                      fill="#4a6fdb"
                      label={ProfitLabel}
                      shape={(props: any) => {
                        const { x, y, width, height, value } = props
                        const fill = value >= 0 ? '#4a6fdb' : '#f87171'
                        const ry = value >= 0 ? y : y + height
                        const rh = Math.abs(height)
                        return <rect x={x} y={ry} width={width} height={rh} fill={fill} rx={3} />
                      }} />
                    <Bar dataKey="profitBudget" fill="#a5b4fc" radius={[3,3,0,0]} opacity={0.7} />
                  </ComposedChart>
                )}
              </ScrollChart>
            </Card>
          </div>

          {/* 지출 / 대분류별 지출 — 같은 행 */}
          <div className="grid grid-cols-2 gap-4">
            <Card title={
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-gray-700 flex-1">지출</h3>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="inline-block w-3 h-2.5 rounded-sm bg-[#ff9090]" />실적
                  <span className="inline-block w-3 h-2.5 rounded-sm bg-[#d94f4f] opacity-50 ml-1" />예산
                </span>
              </div>
            }>
              <ScrollChart key={mode} data={series} getValues={s => [s.expense as number, s.expenseBudget as number]}>
                {(w, h, domain, key) => (
                  <ComposedChart key={key} width={w} height={h} data={series} barCategoryGap="30%" barGap={2} margin={{ top: 20 }}>
                    <XAxis {...X_PROPS} />
                    <YAxis domain={domain} hide />
                    <Tooltip
                      formatter={(v: number, name: string) => [fmt(v), name === 'expense' ? '지출' : '예산 목표']}
                      contentStyle={TIP} />
                    <Bar dataKey="expense" fill="#ff9090" radius={[3,3,0,0]} label={BarLabel} />
                    <Bar dataKey="expenseBudget" fill="#d94f4f" radius={[3,3,0,0]} opacity={0.5} />
                  </ComposedChart>
                )}
              </ScrollChart>
            </Card>
            <Card title={
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-700 flex-1">항목별 지출</h3>
                <select value={selGrp} onChange={e => setSelGrp(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 h-7 focus:outline-none focus:border-blue-300 text-gray-600">
                  {expenseGroups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            }>
              <ScrollChart key={mode} data={grpData} getValues={d => [d.amount as number]}>
                {(w, h, domain, key) => (
                  <BarChart key={key} width={w} height={h} data={grpData} barCategoryGap="35%" margin={{ top: 20 }}>
                    <XAxis {...X_PROPS} />
                    <YAxis domain={domain} hide />
                    <Tooltip formatter={(v: number) => [fmt(v), selGrp]} contentStyle={TIP} />
                    <Bar dataKey="amount" fill="#f0a020" radius={[3,3,0,0]} label={GroupLabel} />
                  </BarChart>
                )}
              </ScrollChart>
            </Card>
          </div>

          {/* 5. 누적 순이익 */}
          <Card title={
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-gray-700 flex-1">누적 순이익</h3>
              {mode === 'monthly' && (
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="inline-block w-5 border-t-2 border-dashed border-[#f0a020]" />전월 대비 증가율
                </span>
              )}
              {mode === 'yearly' && (
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="inline-block w-5 border-t-2 border-dashed border-[#8b5cf6]" />전년 대비 증가율
                </span>
              )}
            </div>
          }>
            <ScrollChart key={mode} data={enrichedSeries} getValues={s => [s.netWorth as number]}>
              {(w, h, domain, key) => (
                <ComposedChart key={key} width={w} height={h} data={enrichedSeries} barCategoryGap="35%" margin={{ top: 20, right: 20 }}>
                  <XAxis {...X_PROPS} />
                  <YAxis yAxisId="left"  domain={domain}     hide />
                  <YAxis yAxisId="right" domain={rateDomain} hide orientation="right" />
                  <ReferenceLine yAxisId="left" y={0} stroke="#e5e7eb" />
                  <Tooltip
                    formatter={(v, name) =>
                      name === 'netWorth' ? [fmt(v as number), '누적 순이익'] :
                      name === 'momRate'  ? [`${v}%`, '전월 대비'] :
                                           [`${v}%`, '전년 대비']}
                    contentStyle={TIP} />
                  <Bar yAxisId="left" dataKey="netWorth" radius={[3,3,0,0]}
                    label={ProfitLabel}
                    shape={(props: any) => {
                      const { x, y, width, height, value } = props
                      const fill = value >= 0 ? '#6b8cff' : '#f87171'
                      const ry = value >= 0 ? y : y + height
                      const rh = Math.abs(height)
                      return <rect x={x} y={ry} width={width} height={rh} fill={fill} rx={3} />
                    }} />
                  {mode === 'monthly' && (
                    <Line yAxisId="right" dataKey="momRate" stroke="#f0a020" strokeWidth={1.5}
                      strokeDasharray="4 3" dot={false} connectNulls={false} legendType="none" />
                  )}
                  {mode === 'yearly' && (
                    <Line yAxisId="right" dataKey="yoyRate" stroke="#8b5cf6" strokeWidth={1.5}
                      strokeDasharray="4 3" dot={false} connectNulls={false} legendType="none" />
                  )}
                </ComposedChart>
              )}
            </ScrollChart>
          </Card>

          {/* 6. 카테고리별 지출 비중 */}
          <Card title={
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-gray-700 flex-1">카테고리별 지출 비중</h3>
              <select value={piePeriod} onChange={e => setPiePeriod(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 h-7 focus:outline-none focus:border-blue-300 text-gray-600">
                {[...series].reverse().map(s => (
                  <option key={s.period} value={s.period}>{s.label}</option>
                ))}
              </select>
            </div>
          }>
            <div className="flex items-center gap-6">
              <PieChart width={180} height={180}>
                <Pie data={pieData} cx={90} cy={90} innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={TIP} />
              </PieChart>
              <div className="flex flex-col gap-1.5 flex-1">
                {pieData.slice(0, 10).map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-gray-600 flex-1 truncate">{d.name}</span>
                    <span className="text-[10px] text-gray-400">{pieTotal > 0 ? Math.round(d.value / pieTotal * 100) : 0}%</span>
                    <span className="text-xs font-medium text-gray-700 tabular-nums">{fmt(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  )
}

function Header({ mode, setMode }: { mode: string; setMode: (m: 'monthly' | 'yearly') => void }) {
  return (
    <div className="bg-white border-b border-gray-100 px-5 h-12 flex items-center gap-4 flex-shrink-0">
      <span className="text-sm font-medium text-gray-800 flex-1">차트</span>
      <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
        {(['monthly', 'yearly'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`text-xs px-3 py-1 rounded-md transition-all ${mode === m ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
            {m === 'monthly' ? '월별' : '연별'}
          </button>
        ))}
      </div>
    </div>
  )
}
