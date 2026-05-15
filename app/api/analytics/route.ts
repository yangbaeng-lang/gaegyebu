import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from     = searchParams.get('from') ?? ''
  const to       = searchParams.get('to')   ?? ''
  const viewMode = searchParams.get('viewMode') ?? 'month'
  const sid      = getSid(req)

  if (!from || !to) return NextResponse.json({ summary: {}, categories: [], trend: [], dowPattern: [] })

  const txs = await prisma.transaction.findMany({
    where: { sessionId: sid, date: { gte: from, lte: to } },
    orderBy: { date: 'asc' },
  })

  const income  = txs.filter(t => t.type === 'income'  || t.type === 'income_expense').reduce((s, t) => s + t.amount, 0)
  const expense = txs.filter(t => t.type === 'expense' || t.type === 'income_expense').reduce((s, t) => s + t.amount, 0)

  const catMap: Record<string, number> = {}
  for (const tx of txs.filter(t => t.type === 'expense' || t.type === 'income_expense')) {
    catMap[tx.toAcct] = (catMap[tx.toAcct] ?? 0) + tx.amount
  }
  const categories = Object.entries(catMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)

  const incCatMap: Record<string, number> = {}
  for (const tx of txs.filter(t => t.type === 'income' || t.type === 'income_expense')) {
    incCatMap[tx.fromAcct] = (incCatMap[tx.fromAcct] ?? 0) + tx.amount
  }
  const incomeCategories = Object.entries(incCatMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)

  const dowMap = [0, 0, 0, 0, 0, 0, 0]
  for (const tx of txs.filter(t => t.type === 'expense')) {
    const dow = new Date(tx.date).getDay()
    const idx = dow === 0 ? 6 : dow - 1
    dowMap[idx] += tx.amount
  }

  const fromYear  = Number(from.slice(0, 4))
  const fromMonth = Number(from.slice(5, 7))
  const fromQ     = Math.ceil(fromMonth / 3)

  let trend: { label: string; income: number; expense: number }[] = []

  if (viewMode === 'month') {
    trend = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        let m = fromMonth - 1 - (5 - i)
        let y = fromYear
        while (m < 0) { m += 12; y-- }
        const ym = `${y}-${String(m + 1).padStart(2, '0')}`
        return prisma.transaction.findMany({
          where: { sessionId: sid, date: { gte: `${ym}-01`, lte: `${ym}-31` } },
        }).then(rows => {
          const income  = rows.filter(r => r.type === 'income'  || r.type === 'income_expense').reduce((s, r) => s + r.amount, 0)
          const expense = rows.filter(r => r.type === 'expense' || r.type === 'income_expense').reduce((s, r) => s + r.amount, 0)
          return { label: `${m + 1}월`, income, expense, net: income - expense }
        })
      })
    )
  } else if (viewMode === 'quarter') {
    trend = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        let q = fromQ - (5 - i)
        let y = fromYear
        while (q < 1) { q += 4; y-- }
        while (q > 4) { q -= 4; y++ }
        const qFrom = `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`
        const qTo   = `${y}-${String(q * 3).padStart(2, '0')}-31`
        return prisma.transaction.findMany({
          where: { sessionId: sid, date: { gte: qFrom, lte: qTo } },
        }).then(rows => {
          const income  = rows.filter(r => r.type === 'income'  || r.type === 'income_expense').reduce((s, r) => s + r.amount, 0)
          const expense = rows.filter(r => r.type === 'expense' || r.type === 'income_expense').reduce((s, r) => s + r.amount, 0)
          return { label: `${y} Q${q}`, income, expense, net: income - expense }
        })
      })
    )
  } else {
    trend = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const y = fromYear - (5 - i)
        return prisma.transaction.findMany({
          where: { sessionId: sid, date: { gte: `${y}-01-01`, lte: `${y}-12-31` } },
        }).then(rows => {
          const income  = rows.filter(r => r.type === 'income'  || r.type === 'income_expense').reduce((s, r) => s + r.amount, 0)
          const expense = rows.filter(r => r.type === 'expense' || r.type === 'income_expense').reduce((s, r) => s + r.amount, 0)
          return { label: `${y}년`, income, expense, net: income - expense }
        })
      })
    )
  }

  return NextResponse.json({
    summary: { income, expense, net: income - expense, savingRate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0 },
    categories,
    incomeCategories,
    trend,
    dowPattern: dowMap,
  })
}
