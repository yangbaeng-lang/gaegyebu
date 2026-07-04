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

  const [txs, incomeCats] = await Promise.all([
    prisma.transaction.findMany({
      where: { sessionId: sid, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    }),
    prisma.category.findMany({
      where: { sessionId: sid, type: 'income', name: { not: '__group__' } },
      select: { name: true },
    }),
  ])

  const incomeCatNames = new Set(incomeCats.map(c => c.name))

  // type='expense'여도 fromAcct가 수익 계정이면 수익으로 취급
  const isIncomeSource = (tx: typeof txs[number]) =>
    tx.type === 'income' || tx.type === 'income_expense' ||
    (tx.type === 'expense' && incomeCatNames.has(tx.fromAcct))

  const income  = txs.filter(isIncomeSource).reduce((s, t) => s + t.amount, 0)
  const expense = txs.filter(t => t.type === 'expense' || t.type === 'income_expense').reduce((s, t) => s + t.amount, 0)

  const catMap: Record<string, number> = {}
  for (const tx of txs.filter(t => t.type === 'expense' || t.type === 'income_expense')) {
    catMap[tx.toAcct] = (catMap[tx.toAcct] ?? 0) + tx.amount
  }
  const categories = Object.entries(catMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)

  const incCatMap: Record<string, number> = {}
  for (const tx of txs.filter(isIncomeSource)) {
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

  type AggRow = { type: string; amount: number; fromAcct: string }
  const aggregate = (rows: AggRow[]) => {
    const income  = rows.filter(r => r.type === 'income' || r.type === 'income_expense' || (r.type === 'expense' && incomeCatNames.has(r.fromAcct))).reduce((s, r) => s + r.amount, 0)
    const expense = rows.filter(r => r.type === 'expense' || r.type === 'income_expense').reduce((s, r) => s + r.amount, 0)
    return { income, expense, net: income - expense }
  }

  type Period = { key: string; label: string }
  let periods: Period[] = []
  let rangeFrom = ''
  let rangeTo   = ''
  let keyOf: (date: string) => string = () => ''

  if (viewMode === 'month') {
    periods = Array.from({ length: 6 }, (_, i) => {
      let m = fromMonth - 1 - (5 - i)
      let y = fromYear
      while (m < 0) { m += 12; y-- }
      return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${m + 1}월` }
    })
    rangeFrom = `${periods[0].key}-01`
    rangeTo   = `${periods[5].key}-31`
    keyOf = (date) => date.slice(0, 7)
  } else if (viewMode === 'quarter') {
    periods = Array.from({ length: 6 }, (_, i) => {
      let q = fromQ - (5 - i)
      let y = fromYear
      while (q < 1) { q += 4; y-- }
      while (q > 4) { q -= 4; y++ }
      return { key: `${y}-Q${q}`, label: `${y} Q${q}` }
    })
    const y0 = Number(periods[0].key.slice(0, 4)), q0 = Number(periods[0].key.slice(6))
    const y5 = Number(periods[5].key.slice(0, 4)), q5 = Number(periods[5].key.slice(6))
    rangeFrom = `${y0}-${String((q0 - 1) * 3 + 1).padStart(2, '0')}-01`
    rangeTo   = `${y5}-${String(q5 * 3).padStart(2, '0')}-31`
    keyOf = (date) => `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`
  } else {
    periods = Array.from({ length: 6 }, (_, i) => {
      const y = fromYear - (5 - i)
      return { key: `${y}`, label: `${y}년` }
    })
    rangeFrom = `${periods[0].key}-01-01`
    rangeTo   = `${periods[5].key}-12-31`
    keyOf = (date) => date.slice(0, 4)
  }

  const trendTxs = await prisma.transaction.findMany({
    where: { sessionId: sid, date: { gte: rangeFrom, lte: rangeTo } },
    select: { date: true, type: true, amount: true, fromAcct: true },
  })

  const buckets = new Map<string, AggRow[]>()
  for (const tx of trendTxs) {
    const key = keyOf(tx.date)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(tx)
    else buckets.set(key, [tx])
  }

  const trend = periods.map(({ key, label }) => ({ label, ...aggregate(buckets.get(key) ?? []) }))

  return NextResponse.json({
    summary: { income, expense, net: income - expense, savingRate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0 },
    categories,
    incomeCategories,
    trend,
    dowPattern: dowMap,
  })
}
