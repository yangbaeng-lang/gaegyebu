import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const yearMonth = searchParams.get('yearMonth')
  const type      = searchParams.get('type')
  const category  = searchParams.get('category')
  const q         = searchParams.get('q')
  const from      = searchParams.get('from')
  const to        = searchParams.get('to')
  const sid       = getSid(req)

  const where: Record<string, unknown> = { sessionId: sid }

  if (from && to) {
    where.date = { gte: from, lte: to }
  } else if (yearMonth) {
    where.date = { gte: `${yearMonth}-01`, lte: `${yearMonth}-31` }
  }

  if (type && type !== 'all') where.type = type
  if (category) where.toAcct = category
  if (q) {
    where.desc = { contains: q }
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  })

  const income  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  return NextResponse.json({
    data: transactions,
    summary: { income, expense, net: income - expense, count: transactions.length },
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, date, desc, amount, fromAcct, toAcct, memo } = body
  const sid = getSid(req)

  if (!type || !date || !desc || !amount || !fromAcct || !toAcct) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다' }, { status: 400 })
  }

  const tx = await prisma.transaction.create({
    data: { sessionId: sid, type, date, desc, amount: Number(amount), fromAcct, toAcct, memo: memo ?? '' },
  })

  return NextResponse.json(tx, { status: 201 })
}
