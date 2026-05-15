'use client'
import { useState, useEffect } from 'react'
import AmountInput from '@/components/AmountInput'
import PeriodNav from '@/components/PeriodNav'
import Link from 'next/link'
import { usePeriod } from '@/lib/usePeriod'
import { fmt, fmtK, CAT_META, STATUS_COLOR } from '@/lib/utils'
import { exportBudget } from '@/lib/exportExcel'

type BudgetItem = {
  id: number; category: string; group?: string; amount: number; yearMonth: string
  spent: number; remain: number; pct: number; status: 'safe'|'warn'|'over'
}
type EditTarget = BudgetItem & { budgetType: 'income'|'expense' }

const INC_STATUS_COLOR: Record<string, string> = { over: '#2a9d5c', warn: '#4a6fdb', safe: '#9ca3af' }
const INC_DEFAULT_META = { icon: 'ti-coins', color: '#2a9d5c', bg: '#f0fff6' }
const EXP_DEFAULT_META = { icon: 'ti-dots',  color: '#aaa',    bg: '#f5f5f5' }

function BudgetRow({ b, isIncome, onEdit }: { b: BudgetItem; isIncome: boolean; onEdit: () => void }) {
  const sc   = isIncome ? INC_STATUS_COLOR[b.status] : STATUS_COLOR[b.status]
  const meta = CAT_META[b.category] ?? (isIncome ? INC_DEFAULT_META : EXP_DEFAULT_META)
  const statusLabel = isIncome
    ? ({ over: '달성', warn: '진행중', safe: '미달' } as const)[b.status]
    : ({ over: '초과', warn: '주의',   safe: '안전' } as const)[b.status]

  return (
    <div onClick={onEdit}
      className="rounded-lg px-2 py-2 hover:bg-gray-50 cursor-pointer transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
            <i className={`ti ${meta.icon} text-[10px]`} style={{ color: meta.color }} />
          </div>
          <span className="text-sm font-medium text-gray-800">{b.category}</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-medium text-gray-800 tabular-nums">{fmt(b.spent)}</span>
          <span className="text-xs text-gray-400 ml-1">
            / {b.amount > 0 ? fmtK(b.amount) : '미설정'}
          </span>
        </div>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-1">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, b.pct)}%`, background: sc }} />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-gray-400">{statusLabel}</span>
        <span className="text-[10px] font-medium tabular-nums" style={{ color: sc }}>{b.pct}%</span>
      </div>
    </div>
  )
}

export default function BudgetPage() {
  const period = usePeriod()

  const [incomeBudgets,  setIncomeBudgets]  = useState<BudgetItem[]>([])
  const [expenseBudgets, setExpenseBudgets] = useState<BudgetItem[]>([])
  const [incomeSummary,  setIncomeSummary]  = useState({ totalBudget: 0, totalSpent: 0, totalRemain: 0 })
  const [expenseSummary, setExpenseSummary] = useState({ totalBudget: 0, totalSpent: 0, totalRemain: 0 })

  const [editTarget,    setEditTarget]    = useState<EditTarget | null>(null)
  const [newAmount,     setNewAmount]     = useState(0)
  const [toast,         setToast]         = useState('')
  const [collapsedGrps, setCollapsedGrps] = useState<Record<string, boolean>>({})

  // 저장은 항상 기간의 첫 번째 달 기준
  const saveYm = period.dateFrom.slice(0, 7)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const fetchData = async () => {
    try {
      const [iRes, eRes] = await Promise.all([
        fetch(`/api/budgets?from=${period.dateFrom}&to=${period.dateTo}&type=income`),
        fetch(`/api/budgets?from=${period.dateFrom}&to=${period.dateTo}&type=expense`),
      ])
      const [iJson, eJson] = await Promise.all([iRes.json(), eRes.json()])
      setIncomeBudgets(iJson.data   ?? [])
      setIncomeSummary(iJson.summary ?? { totalBudget: 0, totalSpent: 0, totalRemain: 0 })
      setExpenseBudgets(eJson.data   ?? [])
      setExpenseSummary(eJson.summary ?? { totalBudget: 0, totalSpent: 0, totalRemain: 0 })
    } catch (e) {
      console.error('budget fetch error:', e)
    }
  }

  useEffect(() => { fetchData() }, [period.dateFrom, period.dateTo])

  const openEdit = (b: BudgetItem, budgetType: 'income'|'expense') => {
    setEditTarget({ ...b, budgetType })
    setNewAmount(b.amount)
  }

  const saveBudget = async () => {
    if (!editTarget || newAmount === 0) return
    await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: editTarget.category, amount: newAmount, yearMonth: saveYm, budgetType: editTarget.budgetType }),
    })
    setEditTarget(null)
    showToast('저장되었습니다 ✓')
    fetchData()
  }

  const incPct = incomeSummary.totalBudget > 0 ? Math.round(incomeSummary.totalSpent / incomeSummary.totalBudget * 100) : 0
  const expPct = expenseSummary.totalBudget > 0 ? Math.round(expenseSummary.totalSpent / expenseSummary.totalBudget * 100) : 0
  const expBarColor = expPct >= 90 ? '#ff7070' : expPct >= 70 ? '#e8a020' : '#4fe8a0'
  const incBarColor = incPct >= 100 ? '#2a9d5c' : incPct >= 70 ? '#4a6fdb' : '#9ca3af'

  return (
    <div className="flex flex-col h-full">
      <PeriodNav label={period.label} viewMode={period.viewMode} setViewMode={period.setViewMode}
        year={period.year} setYear={period.setYear}
        quarter={period.quarter} setQuarter={period.setQuarter}
        month={period.month} setMonth={period.setMonth}
        prev={period.prev} next={period.next}>
        <button onClick={() => exportBudget(incomeBudgets, expenseBudgets, period.label)}
          title="엑셀 다운로드"
          className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
          <i className="ti ti-table-export text-base" />
        </button>
        <Link href="/settings" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <i className="ti ti-settings text-sm" />계정 관리
        </Link>
      </PeriodNav>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-[1080px] mx-auto space-y-3">

          {/* 요약 배너 */}
          <div className="bg-[#1a1f2e] rounded-2xl p-5">
            <div className="grid grid-cols-2 gap-6">
              {/* 수입 목표 */}
              <div>
                <p className="text-[10px] text-white/40 mb-0.5">수입 목표</p>
                <p className="text-xl font-medium text-white mb-2">{fmt(incomeSummary.totalBudget)}</p>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-1">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, incPct)}%`, background: incBarColor }} />
                </div>
                <div className="flex justify-between text-[10px] text-white/35">
                  <span>수령 {fmt(incomeSummary.totalSpent)}</span>
                  <span>{incPct}% 달성</span>
                </div>
              </div>
              {/* 지출 예산 */}
              <div>
                <p className="text-[10px] text-white/40 mb-0.5">지출 예산</p>
                <p className="text-xl font-medium text-white mb-2">{fmt(expenseSummary.totalBudget)}</p>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-1">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, expPct)}%`, background: expBarColor }} />
                </div>
                <div className="flex justify-between text-[10px] text-white/35">
                  <span>사용 {fmt(expenseSummary.totalSpent)} · 잔여 {fmtK(Math.max(0, expenseSummary.totalRemain))}</span>
                  <span>{period.label}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 수입 / 지출 2열 */}
          <div className="grid grid-cols-2 gap-3">

            {/* 수입 목표 */}
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <i className="ti ti-trending-up text-xs" style={{ color: '#2a9d5c' }} />
                <h3 className="text-xs font-medium text-gray-500 flex-1">수입 목표</h3>
                <span className="text-xs font-medium tabular-nums" style={{ color: '#2a9d5c' }}>{fmt(incomeSummary.totalSpent)}</span>
              </div>
              {incomeBudgets.length === 0
                ? <p className="text-xs text-gray-300 text-center py-4">설정 → 카테고리에서 수입 항목을 추가하세요</p>
                : (() => {
                    const grouped: Record<string, BudgetItem[]> = {}
                    incomeBudgets.forEach(b => {
                      const grp = b.group || '미분류'
                      if (!grouped[grp]) grouped[grp] = []
                      grouped[grp].push(b)
                    })
                    return (
                      <div className="space-y-1">
                        {Object.entries(grouped).map(([grp, items]) => {
                          const isOpen    = !collapsedGrps[grp]
                          const grpBudget = items.reduce((s, b) => s + b.amount, 0)
                          const grpSpent  = items.reduce((s, b) => s + b.spent,  0)
                          return (
                            <div key={grp} className="border border-gray-100 rounded-lg overflow-hidden">
                              <button
                                onClick={() => setCollapsedGrps(p => ({ ...p, [grp]: !p[grp] }))}
                                className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                                <i className={`ti ${isOpen ? 'ti-chevron-down' : 'ti-chevron-right'} text-[10px] text-gray-400`} />
                                <span className="text-sm font-medium text-gray-700 flex-1">{grp}</span>
                                <span className="text-xs text-gray-400 tabular-nums">{fmt(grpSpent)}</span>
                                <span className="text-xs font-semibold text-gray-800 tabular-nums ml-1">/ {grpBudget > 0 ? fmtK(grpBudget) : '미설정'}</span>
                              </button>
                              {isOpen && (
                                <div className="px-2 py-1 divide-y divide-gray-50">
                                  {items.map(b => (
                                    <BudgetRow key={b.category} b={b} isIncome={true} onEdit={() => openEdit(b, 'income')} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
              }
            </div>

            {/* 지출 예산 */}
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <i className="ti ti-trending-down text-xs" style={{ color: '#d94f4f' }} />
                <h3 className="text-xs font-medium text-gray-500 flex-1">지출 예산</h3>
                <span className="text-xs font-medium tabular-nums" style={{ color: '#d94f4f' }}>{fmt(expenseSummary.totalSpent)}</span>
              </div>
              <div className="space-y-0.5 divide-y divide-gray-50">
                {expenseBudgets.length === 0
                  ? <p className="text-xs text-gray-300 text-center py-4">설정 → 카테고리에서 지출 항목을 추가하세요</p>
                  : expenseBudgets.map(b => (
                    <BudgetRow key={b.category} b={b} isIncome={false} onEdit={() => openEdit(b, 'expense')} />
                  ))
                }
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* 예산 수정 모달 */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setEditTarget(null)}>
          <div className="bg-white rounded-2xl p-5 w-64 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-gray-800 mb-4">
              {editTarget.category} {editTarget.budgetType === 'income' ? '수입 목표' : '예산'} 설정
            </h3>
            <div className="mb-3">
              <label className="text-xs text-gray-400 block mb-1">
                월 {editTarget.budgetType === 'income' ? '목표 금액' : '예산 금액'} (원)
              </label>
              <AmountInput value={newAmount} onChange={setNewAmount}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 h-9 focus:outline-none focus:border-blue-300" />
              <p className="text-xs text-gray-400 mt-1">
                실제 {editTarget.budgetType === 'income' ? '수입' : '지출'}: {fmt(editTarget.spent)} ({editTarget.pct}%)
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditTarget(null)}
                className="flex-1 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={saveBudget}
                className="flex-1 py-2 text-xs bg-[#1a1f2e] text-white rounded-lg hover:opacity-90">저장</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#1a1f2e] text-white text-xs px-4 py-2 rounded-full z-50">{toast}</div>
      )}
    </div>
  )
}
