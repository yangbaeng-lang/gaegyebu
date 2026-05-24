import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode') ?? 'monthly'

  const sessions = await prisma.session.findMany({ orderBy: { sortOrder: 'asc' } })

  const sectionsData = await Promise.all(sessions.map(async (session) => {
    const [txs, incomeBudgets, expBudgets] = await Promise.all([
      prisma.transaction.findMany({ where: { sessionId: session.id }, orderBy: { date: 'asc' } }),
      prisma.budget.findMany({ where: { sessionId: session.id, category: { startsWith: 'income:' } } }),
      prisma.budget.findMany({ where: { sessionId: session.id, category: { not: { startsWith: 'income:' } } } }),
    ])

    const getPeriod = (date: string) => mode === 'monthly' ? date.slice(0, 7) : date.slice(0, 4)

    const incomeBudgetMap: Record<string, number> = {}
    for (const b of incomeBudgets) {
      const p = mode === 'monthly' ? b.yearMonth : b.yearMonth.slice(0, 4)
      incomeBudgetMap[p] = (incomeBudgetMap[p] ?? 0) + b.amount
    }

    const expenseBudgetMap: Record<string, number> = {}
    for (const b of expBudgets) {
      const p = mode === 'monthly' ? b.yearMonth : b.yearMonth.slice(0, 4)
      expenseBudgetMap[p] = (expenseBudgetMap[p] ?? 0) + b.amount
    }

    const periodMap: Record<string, { income: number; expense: number }> = {}
    for (const tx of txs) {
      const p = getPeriod(tx.date)
      if (!periodMap[p]) periodMap[p] = { income: 0, expense: 0 }
      if (tx.type === 'income' || tx.type === 'income_expense') periodMap[p].income += tx.amount
      if (tx.type === 'expense' || tx.type === 'income_expense') periodMap[p].expense += tx.amount
    }

    // 예산이 있는 기간도 포함
    const allPeriods = new Set([...Object.keys(periodMap), ...Object.keys(incomeBudgetMap), ...Object.keys(expenseBudgetMap)])
    const periodData: Record<string, {
      income: number; expense: number; profit: number;
      incomeBudget: number; expenseBudget: number; profitBudget: number;
    }> = {}

    for (const p of allPeriods) {
      const income = periodMap[p]?.income ?? 0
      const expense = periodMap[p]?.expense ?? 0
      const incomeBudget = incomeBudgetMap[p] ?? 0
      const expenseBudget = expenseBudgetMap[p] ?? 0
      periodData[p] = {
        income, expense, profit: income - expense,
        incomeBudget, expenseBudget, profitBudget: incomeBudget - expenseBudget,
      }
    }

    return { id: session.id, name: session.name, periodData }
  }))

  const allPeriodsSet = new Set<string>()
  sectionsData.forEach(s => Object.keys(s.periodData).forEach(p => allPeriodsSet.add(p)))
  const sortedPeriods = Array.from(allPeriodsSet).sort()

  const getLabel = (p: string) => mode === 'monthly' ? p.slice(2).replace('-', '/') : `${p}년`
  const periods = sortedPeriods.map(p => ({ period: p, label: getLabel(p) }))

  return NextResponse.json({ periods, sections: sectionsData })
}
