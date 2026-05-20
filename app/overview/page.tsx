'use client'
import { useState, useEffect, useRef } from 'react'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer, Cell, LabelList,
} from 'recharts'

type SessionItem     = { id: number; name: string }
type SectionSummary  = { id: number; name: string; totalAssets: number; totalLiab: number; netWorth: number }
type SeriesItem      = { period: string; label: string; totalAssets: number; totalLiab: number; netWorth: number; income: number; expense: number; profit: number }

const SECTION_COLORS = ['#4a6fdb','#2a9d5c','#f0a020','#8b5cf6','#06b6d4','#d94f4f','#ec4899','#84cc16']

const C = {
  asset:'#4a6fdb', liab:'#d94f4f', netPos:'#2a9d5c', netNeg:'#f87171',
  income:'#06b6d4', expense:'#f97316', profitPos:'#8b5cf6', profitNeg:'#f87171', rate:'#f0a020',
}

function fmtY(v: number) {
  const a = Math.abs(v)
  if (a >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`
  if (a >= 10_000)      return `${(v / 10_000).toFixed(0)}만`
  return String(v)
}
function fmtFull(v: number) { return v.toLocaleString('ko-KR') + '원' }
const fmtLabel = (v: number) => (!v || v === 0) ? '' : fmtY(v)
const LBL = { fontSize: 9, fill: '#9ca3af' } as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const order = ['자산','부채','순자산','수입','지출','순수익','증감율']
  const sorted = [...payload].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[190px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {sorted.map((p: { name: string; value: number; color: string }) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500 w-14">{p.name}</span>
          <span className="font-medium text-gray-800 tabular-nums">
            {p.name === '증감율'
              ? (p.value == null ? '-' : `${p.value > 0 ? '+' : ''}${p.value.toFixed(1)}%`)
              : fmtFull(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

const VISIBLE = 8

// 컨테이너의 너비·높이를 자동 감지하여 차트에 전달
function ScrollChart({ data, children }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[]
  children: (w: number, h: number) => React.ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setDims({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    requestAnimationFrame(() => {
      if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth
    })
  }, [data])

  const barW   = dims.w > 0 ? Math.floor(dims.w / VISIBLE) : 60
  const innerW = data.length > VISIBLE ? data.length * barW : dims.w

  return (
    <>
      <style>{`
        .ov-scroll::-webkit-scrollbar { height: 10px; }
        .ov-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 5px; }
        .ov-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 5px; min-width: 32px; border: 2px solid #f1f5f9; }
        .ov-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
      `}</style>
      <div ref={wrapRef} className="ov-scroll overflow-x-auto h-full">
        <div style={{ width: innerW, height: '100%' }}>
          {dims.w > 0 && dims.h > 0 && children(innerW, dims.h)}
        </div>
      </div>
    </>
  )
}

// 공통 모드 토글
function ModeToggle({ mode, onChange }: { mode: 'monthly'|'yearly'; onChange: (m: 'monthly'|'yearly') => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-semibold flex-shrink-0">
      {(['monthly','yearly'] as const).map(m => (
        <button key={m} onClick={() => onChange(m)}
          className={`px-3 py-1.5 transition-colors ${mode === m ? 'bg-[#6b8cff] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
          {m === 'monthly' ? '월별' : '연도별'}
        </button>
      ))}
    </div>
  )
}

export default function OverviewPage() {
  const [allSessions,   setAllSessions]   = useState<SessionItem[]>([])
  const [selected,      setSelected]      = useState<Set<number>>(new Set())
  const [summary,       setSummary]       = useState<SectionSummary[]>([])
  const [series,        setSeries]        = useState<SeriesItem[]>([])
  const [mode,          setMode]          = useState<'monthly'|'yearly'>('monthly')
  const [loading,       setLoading]       = useState(true)
  const [profitVisible, setProfitVisible] = useState<Set<string>>(new Set(['profit']))
  const [assetVisible,  setAssetVisible]  = useState<Set<string>>(new Set(['netWorth']))
  const [cumulData,     setCumulData]     = useState<{ sessions: SessionItem[]; series: Record<string, string|number>[] }>({ sessions: [], series: [] })
  const [cumulLoading,  setCumulLoading]  = useState(false)
  const [cumulVisible,  setCumulVisible]  = useState<Set<number>>(new Set())
  const cumulAbortRef = useRef<AbortController | null>(null)

  const fetchSeries = (m: string, ids: Set<number>) => {
    if (ids.size === 0) { setSeries([]); return Promise.resolve() }
    return fetch(`/api/overview/charts?mode=${m}&include=${Array.from(ids).join(',')}`)
      .then(r => r.json()).then((d: { series: SeriesItem[] }) => setSeries(d.series))
  }

  const fetchCumul = (m: string, ids: Set<number>) => {
    cumulAbortRef.current?.abort()
    if (ids.size === 0) { setCumulData({ sessions: [], series: [] }); return Promise.resolve() }
    const ctrl = new AbortController()
    cumulAbortRef.current = ctrl
    setCumulLoading(true)
    return fetch(`/api/overview/cumulative-profit?mode=${m}&include=${Array.from(ids).join(',')}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => { setCumulData(d); setCumulVisible(new Set(d.sessions.map((s: SessionItem) => s.id))); setCumulLoading(false) })
      .catch(e => { if (e.name !== 'AbortError') setCumulLoading(false) })
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/sessions').then(r => r.json()),
      fetch('/api/sessions/summary').then(r => r.json()),
    ]).then(([sd, sumD]: [{ sessions: SessionItem[] }, SectionSummary[]]) => {
      const sessions = sd.sessions ?? []
      setAllSessions(sessions)
      setSummary(sumD)
      const EXCLUDED = ['병훈급여','아름급여']
      const ids = new Set(sessions.filter(s => !EXCLUDED.includes(s.name)).map(s => s.id))
      setSelected(ids)
      return Promise.all([fetchSeries(mode, ids), fetchCumul(mode, ids)])
    }).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleSession = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      fetchSeries(mode, next)
      fetchCumul(mode, next)
      return next
    })
  }

  const handleMode = (m: 'monthly'|'yearly') => {
    setMode(m); fetchSeries(m, selected); fetchCumul(m, selected)
  }

  const filteredSummary = summary.filter(d => selected.has(d.id))
  const totalAssets = filteredSummary.reduce((s, d) => s + d.totalAssets, 0)
  const totalLiab   = filteredSummary.reduce((s, d) => s + d.totalLiab,   0)
  const totalNet    = filteredSummary.reduce((s, d) => s + d.netWorth,     0)

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>
  )

  const xProps = { tick: { fontSize: 10, fill: '#9ca3af' }, axisLine: false as const, tickLine: false as const, interval: 0 as const }
  const yProps = { tick: { fontSize: 10, fill: '#9ca3af' }, axisLine: false as const, tickLine: false as const, width: 48 }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto md:overflow-hidden bg-gray-50">

      {/* 헤더 */}
      <div className="px-4 md:px-8 pt-4 pb-2 flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-800">전체 섹션 현황</h1>
      </div>

      {/* 섹션 토글 */}
      <div className="px-4 md:px-8 pb-2 flex items-center gap-2 flex-wrap flex-shrink-0">
        {allSessions.map(s => {
          const on = selected.has(s.id)
          return (
            <button key={s.id} onClick={() => toggleSession(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                ${on ? 'bg-[#6b8cff] border-[#6b8cff] text-white' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}>
              <i className={`ti ${on ? 'ti-check' : 'ti-circle'} text-[10px]`} />
              {s.name}
            </button>
          )
        })}
      </div>

      {/* 차트 영역 — 뷰포트 나머지 채우기 */}
      <div className="px-4 pb-4 flex flex-col gap-3 md:flex-1 md:min-h-0 md:px-8">

        {/* Row 1: 요약 + 섹션 비교 */}
        <div className="flex flex-col gap-3 md:flex-row md:min-h-0" style={{ flex: 3 }}>

          {/* 합계 요약 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col md:w-72 md:flex-shrink-0">
            <SummaryRow label="전체 자산"   value={totalAssets} color="text-[#4a6fdb]" bg="bg-[#4a6fdb]/8" icon="ti-wallet"      />
            <div className="border-t border-gray-100 my-2" />
            <SummaryRow label="전체 부채"   value={totalLiab}   color="text-[#d94f4f]" bg="bg-[#d94f4f]/8" icon="ti-credit-card" />
            <div className="border-t border-gray-100 my-2" />
            <SummaryRow label="전체 순자산" value={totalNet}
              color={totalNet >= 0 ? 'text-[#2a9d5c]' : 'text-[#d94f4f]'}
              bg={totalNet >= 0 ? 'bg-[#2a9d5c]/8' : 'bg-[#d94f4f]/8'}
              icon="ti-trending-up" />
          </div>

          {/* 섹션별 비교 차트 */}
          <div className="h-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:h-auto md:flex-1 md:min-w-0">
            <p className="text-sm font-semibold text-gray-600 mb-2 flex-shrink-0">섹션별 자산 / 부채 / 순자산</p>
            <div className="flex-1 min-h-0">
              {filteredSummary.length === 0
                ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">선택된 섹션 없음</div>
                : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={filteredSummary.map(d => ({ name: d.name, 자산: d.totalAssets, 부채: d.totalLiab, 순자산: d.netWorth }))}
                      margin={{ top: 10, right: 12, left: 0, bottom: 4 }} barCategoryGap="28%" barGap={3}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtY} {...yProps} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
                      <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <ReferenceLine y={0} stroke="#e5e7eb" />
                      <Bar dataKey="자산"   fill={C.asset}  radius={[4,4,0,0]} maxBarSize={44}><LabelList dataKey="자산"   position="top" formatter={fmtLabel} style={LBL} /></Bar>
                      <Bar dataKey="부채"   fill={C.liab}   radius={[4,4,0,0]} maxBarSize={44}><LabelList dataKey="부채"   position="top" formatter={fmtLabel} style={LBL} /></Bar>
                      <Bar dataKey="순자산" fill={C.netPos} radius={[4,4,0,0]} maxBarSize={44}>
                        {filteredSummary.map((d, i) => <Cell key={i} fill={d.netWorth >= 0 ? C.netPos : C.netNeg} />)}
                        <LabelList dataKey="순자산" position="top" formatter={fmtLabel} style={LBL} />
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
            </div>
          </div>
        </div>

        {/* Row 2: 추이 2개 */}
        <div className="flex flex-col gap-3 md:flex-row md:min-h-0" style={{ flex: 4 }}>

          {/* 수입/지출/순수익 추이 */}
          <div className="h-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:h-auto md:flex-1 md:min-w-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <p className="text-sm font-semibold text-gray-600">{mode === 'monthly' ? '월별' : '연도별'} 수입 / 지출 / 순수익</p>
              <ModeToggle mode={mode} onChange={handleMode} />
            </div>
            <div className="flex gap-1.5 mb-2 flex-shrink-0">
              {([{ key:'income', label:'수입', color:'bg-[#06b6d4]' }, { key:'expense', label:'지출', color:'bg-[#f97316]' }, { key:'profit', label:'순수익', color:'bg-[#8b5cf6]' }] as const).map(({ key, label, color }) => {
                const on = profitVisible.has(key)
                return (
                  <button key={key}
                    onClick={() => setProfitVisible(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${on ? `${color} border-transparent text-white` : 'bg-white border-gray-200 text-gray-400'}`}>
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="flex-1 min-h-0">
              {series.length === 0
                ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">데이터 없음</div>
                : (() => {
                  const cd = series.map((item, i) => {
                    const prev = series[i-1]?.profit
                    return { ...item, 증감율: (prev != null && prev !== 0) ? parseFloat(((item.profit - prev) / Math.abs(prev) * 100).toFixed(1)) : null }
                  })
                  return (
                    <ScrollChart data={cd}>
                      {(w, h) => (
                        <ComposedChart data={cd} width={w} height={h} margin={{ top: 10, right: 8, left: 0, bottom: 4 }} barCategoryGap="32%" barGap={2}>
                          <XAxis dataKey="label" {...xProps} />
                          <YAxis yAxisId="amt" tickFormatter={fmtY} {...yProps} />
                          <YAxis yAxisId="pct" orientation="right" hide width={0} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
                          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                          <ReferenceLine yAxisId="amt" y={0} stroke="#e5e7eb" />
                          {profitVisible.has('income')  && <Bar yAxisId="amt" dataKey="income"  name="수입"   fill={C.income}    radius={[3,3,0,0]} maxBarSize={30}><LabelList dataKey="income"  position="top" formatter={fmtLabel} style={LBL} /></Bar>}
                          {profitVisible.has('expense') && <Bar yAxisId="amt" dataKey="expense" name="지출"   fill={C.expense}   radius={[3,3,0,0]} maxBarSize={30}><LabelList dataKey="expense" position="top" formatter={fmtLabel} style={LBL} /></Bar>}
                          {profitVisible.has('profit')  && (
                            <Bar yAxisId="amt" dataKey="profit" name="순수익" fill={C.profitPos} radius={[3,3,0,0]} maxBarSize={30}>
                              {cd.map((d, i) => <Cell key={i} fill={d.profit >= 0 ? C.profitPos : C.profitNeg} />)}
                              <LabelList dataKey="profit" position="top" formatter={fmtLabel} style={LBL} />
                            </Bar>
                          )}
                          <Line yAxisId="pct" dataKey="증감율" name="증감율" type="monotone" stroke={C.rate} strokeWidth={2} dot={{ r: 2, fill: C.rate, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} />
                        </ComposedChart>
                      )}
                    </ScrollChart>
                  )
                })()}
            </div>
          </div>

          {/* 자산/부채/순자산 추이 */}
          <div className="h-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:h-auto md:flex-1 md:min-w-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <p className="text-sm font-semibold text-gray-600">{mode === 'monthly' ? '월별' : '연도별'} 자산 / 부채 / 순자산</p>
              <ModeToggle mode={mode} onChange={handleMode} />
            </div>
            <div className="flex gap-1.5 mb-2 flex-shrink-0">
              {([{ key:'totalAssets', label:'자산', color:'bg-[#4a6fdb]' }, { key:'totalLiab', label:'부채', color:'bg-[#d94f4f]' }, { key:'netWorth', label:'순자산', color:'bg-[#2a9d5c]' }] as const).map(({ key, label, color }) => {
                const on = assetVisible.has(key)
                return (
                  <button key={key}
                    onClick={() => setAssetVisible(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${on ? `${color} border-transparent text-white` : 'bg-white border-gray-200 text-gray-400'}`}>
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="flex-1 min-h-0">
              {series.length === 0
                ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">데이터 없음</div>
                : (() => {
                  const cd = series.map((item, i) => {
                    const prev = series[i-1]?.netWorth
                    return { ...item, 증감율: (prev != null && prev !== 0) ? parseFloat(((item.netWorth - prev) / Math.abs(prev) * 100).toFixed(1)) : null }
                  })
                  return (
                    <ScrollChart data={cd}>
                      {(w, h) => (
                        <ComposedChart data={cd} width={w} height={h} margin={{ top: 10, right: 8, left: 0, bottom: 4 }} barCategoryGap="32%" barGap={2}>
                          <XAxis dataKey="label" {...xProps} />
                          <YAxis yAxisId="amt" tickFormatter={fmtY} {...yProps} />
                          <YAxis yAxisId="pct" orientation="right" width={0} tick={false} axisLine={false} tickLine={false} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
                          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                          <ReferenceLine yAxisId="amt" y={0} stroke="#e5e7eb" />
                          {assetVisible.has('totalAssets') && <Bar yAxisId="amt" dataKey="totalAssets" name="자산"   fill={C.asset}  radius={[3,3,0,0]} maxBarSize={30}><LabelList dataKey="totalAssets" position="top" formatter={fmtLabel} style={LBL} /></Bar>}
                          {assetVisible.has('totalLiab')   && <Bar yAxisId="amt" dataKey="totalLiab"   name="부채"   fill={C.liab}   radius={[3,3,0,0]} maxBarSize={30}><LabelList dataKey="totalLiab"   position="top" formatter={fmtLabel} style={LBL} /></Bar>}
                          {assetVisible.has('netWorth')    && (
                            <Bar yAxisId="amt" dataKey="netWorth" name="순자산" fill={C.netPos} radius={[3,3,0,0]} maxBarSize={30}>
                              {cd.map((d, i) => <Cell key={i} fill={d.netWorth >= 0 ? C.netPos : C.netNeg} />)}
                              <LabelList dataKey="netWorth" position="top" formatter={fmtLabel} style={LBL} />
                            </Bar>
                          )}
                          <Line yAxisId="pct" dataKey="증감율" name="증감율" type="monotone" stroke={C.rate} strokeWidth={2} dot={{ r: 2, fill: C.rate, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} />
                        </ComposedChart>
                      )}
                    </ScrollChart>
                  )
                })()}
            </div>
          </div>
        </div>

        {/* Row 3: 누적 순이익 */}
        <div className="md:min-h-0" style={{ flex: 3 }}>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:h-full md:min-h-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <p className="text-sm font-semibold text-gray-600">{mode === 'monthly' ? '월별' : '연도별'} 섹션별 누적 순이익</p>
              <ModeToggle mode={mode} onChange={handleMode} />
            </div>
            {/* 섹션 토글 */}
            {cumulData.sessions.length > 0 && (
              <div className="flex gap-1.5 mb-2 flex-wrap flex-shrink-0">
                {cumulData.sessions.map((s, i) => {
                  const on = cumulVisible.has(s.id)
                  const bg = SECTION_COLORS[i % SECTION_COLORS.length]
                  return (
                    <button key={s.id}
                      onClick={() => setCumulVisible(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}
                      style={on ? { background: bg, borderColor: bg, color: '#fff' } : {}}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${on ? '' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                      {s.name}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="h-[200px] md:flex-1 md:min-h-0">
            {cumulLoading
              ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">불러오는 중…</div>
              : cumulData.series.length === 0
                ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">데이터 없음</div>
                : (() => {
                  const visibleSessions = cumulData.sessions.filter(s => cumulVisible.has(s.id))
                  const lastVisible = visibleSessions[visibleSessions.length - 1]
                  return (
                  <ScrollChart data={cumulData.series}>
                    {(w, h) => (
                      <BarChart data={cumulData.series} width={w} height={h} margin={{ top: 10, right: 8, left: 0, bottom: 4 }} barCategoryGap="30%" barGap={0}>
                        <XAxis dataKey="label" {...xProps} />
                        <YAxis tickFormatter={fmtY} {...yProps} />
                        <Tooltip formatter={(value: number, name: string) => [fmtFull(value), name]} contentStyle={{ fontSize: 12, fontWeight: 'bold', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} cursor={{ fill: '#f3f4f6' }} />
                        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                        <ReferenceLine y={0} stroke="#e5e7eb" />
                        {cumulData.sessions.map((s, i) => {
                          if (!cumulVisible.has(s.id)) return null
                          const isTop = s.id === lastVisible?.id
                          return (
                            <Bar key={s.id} dataKey={s.name} stackId="c"
                              fill={SECTION_COLORS[i % SECTION_COLORS.length]}
                              radius={isTop ? [3,3,0,0] : [0,0,0,0]}
                              maxBarSize={44}>
                              {isTop && (
                                <LabelList
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  valueAccessor={(row: any) => visibleSessions.reduce((sum, sess) => sum + (Number(row[sess.name]) || 0), 0)}
                                  position="top" formatter={fmtLabel} style={LBL}
                                />
                              )}
                            </Bar>
                          )
                        })}
                      </BarChart>
                    )}
                  </ScrollChart>
                  )
                })()}
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
    <div className="flex-1 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`w-6 h-6 flex items-center justify-center rounded-md flex-shrink-0 ${bg}`}>
          <i className={`ti ${icon} text-xs ${color}`} />
        </span>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className={`text-base font-bold ${color} tabular-nums`}>{fmtFull(value)}</p>
    </div>
  )
}
