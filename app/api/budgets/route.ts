import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

function getYearMonths(from: string, to: string): string[] {
  const [fy, fm] = from.slice(0, 7).split('-').map(Number)
  const [ty, tm] = to.slice(0, 7).split('-').map(Number)
  const result: string[] = []
  let y = fy, m = fm
  while (y < ty || (y === ty && m <= tm)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return result
}

type Row = {
  id: number; category: string; group: string; amount: number
  yearMonth: string; spent: number; remain: number; pct: number
  status: 'safe' | 'warn' | 'over'
}

export async function GET(req: NextRequest) {
  const from       = req.nextUrl.searchParams.get('from') ?? ''
  const to         = req.nextUrl.searchParams.get('to')   ?? ''
  const budgetType = req.nextUrl.searchParams.get('type') ?? 'expense'
  const isIncome   = budgetType === 'income'
  const sid        = getSid(req)

  if (!from || !to) {
    return NextResponse.json({ data: [], summary: { totalBudget: 0, totalSpent: 0, totalRemain: 0 } })
  }

  const yearMonths = getYearMonths(from, to)
  const ymFrom     = yearMonths[0]
  const ymTo       = yearMonths[yearMonths.length - 1]
  const catType    = isIncome ? 'income' : 'expense'

  const [cats, budgets, txs] = await Promise.all([
    prisma.category.findMany({
      where: { sessionId: sid, type: catType, hidden: false },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.budget.findMany({
      where: { sessionId: sid, yearMonth: { gte: ymFrom, lte: ymTo } },
    }),
    prisma.transaction.findMany({
      where: { sessionId: sid, date: { gte: from, lte: to } },
    }),
  ])

  const budgetSum: Record<string, number> = {}
  const budgetId:  Record<string, number> = {}
  for (const b of budgets) {
    const isIncBudget = b.category.startsWith('income:')
    if (isIncome !== isIncBudget) continue
    const key = isIncome ? b.category.slice('income:'.length) : b.category
    budgetSum[key] = (budgetSum[key] ?? 0) + b.amount
    budgetId[key]  = b.id
  }

  const amtMap: Record<string, number> = {}
  for (const tx of txs) {
    if (isIncome) {
      if (tx.type !== 'income' && tx.type !== 'income_expense') continue
      amtMap[tx.fromAcct] = (amtMap[tx.fromAcct] ?? 0) + tx.amount
    } else {
      if (tx.type !== 'expense' && tx.type !== 'income_expense') continue
      amtMap[tx.toAcct] = (amtMap[tx.toAcct] ?? 0) + tx.amount
    }
  }

  const rows: Row[] = []

  if (isIncome) {
    for (const c of cats) {
      if (c.name === '__group__') continue
      const amount = budgetSum[c.name] ?? 0
      const spent  = amtMap[c.name]   ?? 0
      const pct    = amount > 0 ? Math.round((spent / amount) * 100) : 0
      const status: Row['status'] = pct >= 100 ? 'over' : pct >= 70 ? 'warn' : 'safe'
      rows.push({ id: budgetId[c.name] ?? 0, category: c.name, group: c.group, amount, yearMonth: ymFrom, spent, remain: amount - spent, pct, status })
    }
  } else {
    const groups   = cats.filter(c => c.name === '__group__').sort((a, b) => a.sortOrder - b.sortOrder)
    const itemsOf: Record<string, string[]> = {}
    groups.forEach(g => { itemsOf[g.group] = [] })
    cats.filter(c => c.name !== '__group__' && c.group).forEach(c => {
      if (itemsOf[c.group]) itemsOf[c.group].push(c.name)
    })
    for (const g of groups) {
      const grp    = g.group
      const amount = budgetSum[grp] ?? 0
      const spent  = (itemsOf[grp] ?? []).reduce((s, n) => s + (amtMap[n] ?? 0), 0)
      const pct    = amount > 0 ? Math.round((spent / amount) * 100) : 0
      const status: Row['status'] = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'safe'
      rows.push({ id: budgetId[grp] ?? 0, category: grp, group: '', amount, yearMonth: ymFrom, spent, remain: amount - spent, pct, status })
    }
  }

  const totalBudget = rows.reduce((s, r) => s + r.amount, 0)
  const totalSpent  = rows.reduce((s, r) => s + r.spent,  0)

  return NextResponse.json({
    data: rows,
    summary: { totalBudget, totalSpent, totalRemain: totalBudget - totalSpent },
  })
}

export async function POST(req: NextRequest) {
  const { category, amount, yearMonth, budgetType = 'expense' } = await req.json()
  const sid = getSid(req)
  const key = budgetType === 'income' ? `income:${category}` : category
  const budget = await prisma.budget.upsert({
    where:  { sessionId_category_yearMonth: { sessionId: sid, category: key, yearMonth } },
    update: { amount: Number(amount) },
    create: { sessionId: sid, category: key, amount: Number(amount), yearMonth },
  })
  return NextResponse.json(budget)
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get('id'))
  await prisma.budget.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
