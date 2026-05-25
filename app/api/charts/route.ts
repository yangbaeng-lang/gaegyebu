import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode') ?? 'monthly'
  const sid  = getSid(req)

  const [txs, cats, groupAnchors, budgets, expBudgets, incomeCats] = await Promise.all([
    prisma.transaction.findMany({ where: { sessionId: sid }, orderBy: { date: 'asc' } }),
    prisma.category.findMany({ where: { sessionId: sid, type: 'expense', name: { not: '__group__' } } }),
    prisma.category.findMany({ where: { sessionId: sid, type: 'expense', name: '__group__' }, orderBy: { sortOrder: 'asc' } }),
    prisma.budget.findMany({ where: { sessionId: sid, category: { startsWith: 'income:' } } }),
    prisma.budget.findMany({ where: { sessionId: sid, category: { not: { startsWith: 'income:' } } } }),
    prisma.category.findMany({ where: { sessionId: sid, type: 'income' }, select: { name: true } }),
  ])

  const incomeCatSet  = new Set(incomeCats.map(c => c.name))
  const expenseCatSet = new Set(cats.map(c => c.name))
  const validBudgets    = budgets.filter(b => incomeCatSet.has(b.category.slice('income:'.length)))
  const validExpBudgets = expBudgets.filter(b => expenseCatSet.has(b.category))

  const expenseGroups = groupAnchors.map(g => g.group).filter(Boolean) as string[]
  const catGroupMap: Record<string, string> = {}
  cats.forEach(c => { catGroupMap[c.name] = c.group || '미분류' })

  const getPeriod = (date: string) => mode === 'monthly' ? date.slice(0, 7) : date.slice(0, 4)
  const getLabel  = (p: string)    => mode === 'monthly' ? p.slice(2).replace('-', '/') : `${p}년`

  const incomeBudgetMap: Record<string, number> = {}
  for (const b of validBudgets) {
    const period = mode === 'monthly' ? b.yearMonth : b.yearMonth.slice(0, 4)
    incomeBudgetMap[period] = (incomeBudgetMap[period] ?? 0) + b.amount
  }

  const expenseBudgetMap: Record<string, number> = {}
  for (const b of validExpBudgets) {
    const period = mode === 'monthly' ? b.yearMonth : b.yearMonth.slice(0, 4)
    expenseBudgetMap[period] = (expenseBudgetMap[period] ?? 0) + b.amount
  }

  const periodMap: Record<string, { income: number; expense: number }> = {}
  const groupPeriodMap: Record<string, Record<string, number>> = {}

  for (const tx of txs) {
    const period = getPeriod(tx.date)
    if (!periodMap[period]) periodMap[period] = { income: 0, expense: 0 }

    if (tx.type === 'income' || tx.type === 'income_expense') periodMap[period].income += tx.amount
    if (tx.type === 'expense' || tx.type === 'income_expense') {
      periodMap[period].expense += tx.amount
      const grp = catGroupMap[tx.toAcct] || '미분류'
      if (!groupPeriodMap[grp]) groupPeriodMap[grp] = {}
      groupPeriodMap[grp][period] = (groupPeriodMap[grp][period] ?? 0) + tx.amount
    }
  }

  const periods = Object.keys(periodMap).sort()

  let cumNet = 0
  const series = periods.map(p => {
    const { income, expense } = periodMap[p]
    const profit = income - expense
    cumNet += profit
    return {
      period: p,
      label: getLabel(p),
      income,
      expense,
      profit,
      incomeBudget:  incomeBudgetMap[p]  ?? 0,
      expenseBudget: expenseBudgetMap[p] ?? 0,
      profitBudget:  (incomeBudgetMap[p] ?? 0) - (expenseBudgetMap[p] ?? 0),
      savingRate: income > 0 ? Math.round((profit / income) * 100) : 0,
      netWorth: cumNet,
    }
  })

  return NextResponse.json({ series, expenseGroups, groupSeries: groupPeriodMap })
}
