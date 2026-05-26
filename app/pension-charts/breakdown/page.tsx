'use client'
import { useState, useEffect } from 'react'
import { fmt } from '@/lib/utils'
import {
  PieChart, Pie, Cell, Tooltip as RechartTooltip,
} from 'recharts'

type PensionItem = {
  name: string
  color: string
  icon: string
  group: string
  납입액: number
  평가액: number
  평가손익: number | null
  수익률: number | null
  hasEval: boolean
  비중: number | null
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

const GROUP_PALETTE = [
  '#6b8cff', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
]

const ITEM_PALETTE = [
  '#6b8cff', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
  '#a78bfa', '#fb923c', '#4ade80', '#38bdf8', '#f43f5e',
]

function rateBadge(v: number | null) {
  if (v === null) return 'bg-gray-100 text-gray-400'
  if (v === 0) return 'bg-gray-100 text-gray-600'
  return v > 0 ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
}

export default function PensionBreakdownPage() {
  const today = new Date()
  const [selectedYear,  setSelectedYear]  = useState(today.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1)
  const [pensionSid,    setPensionSid]    = useState<number | null>(null)
  const [items,         setItems]         = useState<PensionItem[]>([])
  const [groupOrder,    setGroupOrder]    = useState<string[]>([])
  const [loading,       setLoading]       = useState(false)
  const [isMobile,      setIsMobile]      = useState(false)

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
    const ym = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
    fetch(`/api/pension-eval?sessionId=${pensionSid}&yearMonth=${ym}`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setGroupOrder(d.groupOrder ?? []) })
      .finally(() => setLoading(false))
  }, [pensionSid, selectedYear, selectedMonth])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const evalItems = items.filter(i => i.hasEval && i.평가액 > 0)

  const groupData = groupOrder.map((grp, idx) => {
    const grpItems = evalItems.filter(i => i.group === grp).sort((a, b) => b.평가액 - a.평가액)
    if (grpItems.length === 0) return null
    const 평가액 = grpItems.reduce((s, i) => s + i.평가액, 0)
    const 납입액 = grpItems.reduce((s, i) => s + i.납입액, 0)
    return {
      name: grp,
      value: 평가액,
      납입액,
      평가손익: 평가액 - 납입액,
      수익률: 납입액 > 0 ? ((평가액 - 납입액) / 납입액) * 100 : null,
      color: GROUP_PALETTE[idx % GROUP_PALETTE.length],
      items: grpItems,
    }
  }).filter((g): g is NonNullable<typeof g> => g !== null)
    .sort((a, b) => b.value - a.value)

  const total평가액 = groupData.reduce((s, g) => s + g.value, 0)

  const yearOptions: number[] = []
  for (let y = today.getFullYear(); y >= 2020; y--) yearOptions.push(y)

  const pieSize    = isMobile ? 120 : 160
  const innerR     = isMobile ? 32  : 42
  const outerR     = isMobile ? 54  : 72

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2 flex-shrink-0">
        <h1 className="text-base font-bold text-gray-800 flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
          <i className="ti ti-chart-pie text-[#6b8cff]" />
          세부내역 비율
        </h1>

        <div className="flex items-center gap-2 ml-2">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#6b8cff]/30"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#6b8cff]/30"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-300 text-sm">불러오는 중…</div>
        ) : !pensionSid ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-300">
            <i className="ti ti-pig-money text-3xl" />
            <p className="text-sm">"연금" 섹션이 없습니다</p>
          </div>
        ) : groupData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-300">
            <i className="ti ti-chart-pie text-3xl" />
            <p className="text-sm">{selectedYear}년 {selectedMonth}월 평가 데이터가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-5">

            {/* 전체 그룹 비율 도넛 차트 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5">
              <div className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <i className="ti ti-chart-donut text-[#6b8cff]" />
                전체 그룹별 평가액 비율
              </div>
              <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
                <div className="flex-shrink-0">
                  <PieChart width={220} height={220}>
                    <Pie
                      data={groupData}
                      cx="50%"
                      cy="50%"
                      innerRadius={66}
                      outerRadius={100}
                      dataKey="value"
                      nameKey="name"
                      paddingAngle={2}
                    >
                      {groupData.map((g, i) => (
                        <Cell key={i} fill={g.color} />
                      ))}
                    </Pie>
                    <RechartTooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: unknown, name: string) => [fmt(Number(value)), name]}
                    />
                  </PieChart>
                </div>

                {/* 범례 */}
                <div className="w-full space-y-2.5 min-w-0">
                  {groupData.map(g => {
                    const pct = total평가액 > 0 ? (g.value / total평가액) * 100 : 0
                    return (
                      <div key={g.name} className="flex items-center gap-2 min-w-0">
                        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: g.color }} />
                        <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{g.name}</span>
                        <span className="text-sm font-bold text-gray-700 w-14 text-right flex-shrink-0">{pct.toFixed(1)}%</span>
                        <span className="text-xs text-gray-400 w-24 text-right flex-shrink-0">{fmt(g.value)}</span>
                        {g.수익률 !== null && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md w-16 text-center flex-shrink-0 ${rateBadge(g.수익률)}`}>
                            {g.수익률 >= 0 ? '+' : ''}{g.수익률.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    )
                  })}
                  <div className="border-t border-gray-100 pt-2.5 flex items-center justify-between">
                    <span className="text-xs text-gray-400">전체 합계</span>
                    <span className="text-sm font-bold text-gray-800">{fmt(total평가액)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 그룹별 세부내역 파이 차트 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {groupData.map(g => {
                const grpTotal = g.value
                return (
                  <div key={g.name} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5">
                    {/* 그룹 헤더 */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: g.color }} />
                        {g.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {g.수익률 !== null && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${rateBadge(g.수익률)}`}>
                            {g.수익률 >= 0 ? '+' : ''}{g.수익률.toFixed(2)}%
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{fmt(g.value)}</span>
                      </div>
                    </div>

                    <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-4'}`}>
                      {/* 세부 파이 차트 */}
                      <PieChart width={pieSize} height={pieSize} style={{ flexShrink: 0 }}>
                        <Pie
                          data={g.items}
                          cx="50%"
                          cy="50%"
                          innerRadius={innerR}
                          outerRadius={outerR}
                          dataKey="평가액"
                          nameKey="name"
                          paddingAngle={g.items.length > 1 ? 2 : 0}
                        >
                          {g.items.map((_item, i) => (
                            <Cell key={i} fill={ITEM_PALETTE[i % ITEM_PALETTE.length]} />
                          ))}
                        </Pie>
                        <RechartTooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: unknown, name: string) => [fmt(Number(value)), name]}
                        />
                      </PieChart>

                      {/* 세부 아이템 목록 */}
                      <div className="flex-1 min-w-0 space-y-2">
                        {g.items.map((item, i) => {
                          const pct = grpTotal > 0 ? (item.평가액 / grpTotal) * 100 : 0
                          return (
                            <div key={item.name} className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: ITEM_PALETTE[i % ITEM_PALETTE.length] }}
                              />
                              <span className="text-xs text-gray-600 flex-1 min-w-0 truncate" title={item.name}>{item.name}</span>
                              <span className="text-xs text-gray-500 w-20 text-right flex-shrink-0">{fmt(item.평가액)}</span>
                              <span className="text-xs font-semibold text-gray-600 w-9 text-right flex-shrink-0">{pct.toFixed(1)}%</span>
                              {!isMobile && item.수익률 !== null && (
                                <span className={`text-[10px] font-semibold w-14 text-right flex-shrink-0 ${item.수익률 > 0 ? 'text-red-400' : item.수익률 < 0 ? 'text-blue-400' : 'text-gray-400'}`}>
                                  {item.수익률 >= 0 ? '+' : ''}{item.수익률.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
