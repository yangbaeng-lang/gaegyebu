import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sessionId  = Number(req.nextUrl.searchParams.get('sessionId') ?? '1')
  const startMonth = req.nextUrl.searchParams.get('startMonth') ?? ''
  const endMonth   = req.nextUrl.searchParams.get('endMonth')   ?? ''

  if (!startMonth || !endMonth) {
    return NextResponse.json({ monthly: [], itemOrder: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const txs = await prisma.transaction.findMany({
    where: {
      sessionId,
      fromAcct: '배당금',
      type: { in: ['income', 'income_expense'] },
      date: { gte: `${startMonth}-01`, lte: `${endMonth}-31` },
    },
    orderBy: { date: 'asc' },
  })

  const monthlyMap: Record<string, Record<string, number>> = {}
  const itemTotals: Record<string, number> = {}

  for (const tx of txs) {
    const ym   = tx.date.slice(0, 7)
    const item = tx.memo.trim() || '미분류'
    if (!monthlyMap[ym]) monthlyMap[ym] = {}
    monthlyMap[ym][item] = (monthlyMap[ym][item] ?? 0) + tx.amount
    itemTotals[item] = (itemTotals[item] ?? 0) + tx.amount
  }

  const monthly = Object.entries(monthlyMap)
    .map(([yearMonth, items]) => ({
      yearMonth,
      total: Object.values(items).reduce((s, v) => s + v, 0),
      items,
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))

  const itemOrder = Object.entries(itemTotals)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({ monthly, itemOrder }, { headers: { 'Cache-Control': 'no-store' } })
}
