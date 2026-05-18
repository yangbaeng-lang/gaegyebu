import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

export async function GET(req: NextRequest) {
  const yearMonth = req.nextUrl.searchParams.get('yearMonth')
  const toParam   = req.nextUrl.searchParams.get('to')
  const sid       = getSid(req)

  const [cats, items] = await Promise.all([
    prisma.category.findMany({
      where: { sessionId: sid, type: { in: ['account_asset', 'account_liability'] } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
    prisma.asset.findMany({ where: { sessionId: sid } }),
  ])
  const orderMap: Record<string, number> = {}
  cats.forEach((c, i) => { orderMap[c.name] = i })
  const kindMap: Record<string, string> = {}
  items.forEach(a => { kindMap[a.type] = a.kind })

  let amounts: Record<string, number>

  const cutoff = toParam ?? (yearMonth ? `${yearMonth}-31` : null)
  const today  = new Date().toISOString().slice(0, 10)

  // cutoff가 오늘 이후면 assets 테이블 현재값이 이미 최신 → 트랜잭션 재생 불필요
  if (cutoff && cutoff < today) {
    const txs = await prisma.transaction.findMany({
      where: { sessionId: sid, date: { lte: cutoff } },
      orderBy: { date: 'asc' },
    })

    amounts = {}
    const applyDelta = (acct: string, delta: number) => {
      const kind = kindMap[acct]
      if (!kind) return
      const actual = kind === 'liability' ? -delta : delta
      amounts[acct] = (amounts[acct] ?? 0) + actual
    }

    for (const tx of txs) {
      if (tx.type === 'income')   { applyDelta(tx.toAcct, tx.amount) }
      if (tx.type === 'expense')  { applyDelta(tx.fromAcct, -tx.amount) }
      if (tx.type === 'transfer') { applyDelta(tx.fromAcct, -tx.amount); applyDelta(tx.toAcct, tx.amount) }
    }
  } else {
    amounts = {}
    items.forEach(a => { amounts[a.type] = a.amount })
  }

  const sorted = items.sort((a, b) => (orderMap[a.type] ?? 99) - (orderMap[b.type] ?? 99))
  const withAmounts = sorted.map(a => ({ ...a, amount: amounts[a.type] ?? 0 }))

  const assets      = withAmounts.filter(i => i.kind === 'asset')
  const liabilities = withAmounts.filter(i => i.kind === 'liability')
  const totalAssets = assets.reduce((s, a) => s + a.amount, 0)
  const totalLiab   = liabilities.reduce((s, a) => s + a.amount, 0)

  return NextResponse.json({
    assets, liabilities,
    summary: { totalAssets, totalLiab, netWorth: totalAssets - totalLiab },
  }, {
    headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=15' },
  })
}

export async function PUT(req: NextRequest) {
  const id   = Number(req.nextUrl.searchParams.get('id'))
  const body = await req.json()
  const data: Record<string, unknown> = { amount: Number(body.amount) }
  if (body.color) data.color = body.color
  if (body.icon)  data.icon  = body.icon
  const item = await prisma.asset.update({ where: { id }, data })
  return NextResponse.json(item)
}
