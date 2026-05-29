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

  // 카테고리에는 있는데 asset 레코드가 없는 항목 자동 복구
  const assetTypes = new Set(items.map(a => a.type))
  const missing = cats.filter(c => c.name !== '__group__' && !assetTypes.has(c.name))
  if (missing.length > 0) {
    await prisma.asset.createMany({
      data: missing.map(c => ({
        sessionId: sid,
        name:  c.name,
        type:  c.name,
        kind:  c.type === 'account_asset' ? 'asset' : 'liability',
        amount: 0,
        color: c.type === 'account_asset' ? '#4a6fdb' : '#d94f4f',
        icon:  c.type === 'account_asset' ? 'ti-building-bank' : 'ti-credit-card',
      })),
      skipDuplicates: true,
    })
    items.push(...await prisma.asset.findMany({ where: { sessionId: sid, type: { in: missing.map(c => c.name) } } }))
  }

  const orderMap: Record<string, number> = {}
  cats.forEach((c, i) => { orderMap[c.name] = i })
  const kindMap: Record<string, string> = {}
  items.forEach(a => { kindMap[a.type] = a.kind })

  const cutoff  = toParam ?? (yearMonth ? `${yearMonth}-31` : null)
  const replayTo = cutoff ?? new Date().toISOString().slice(0, 10)

  const txs = await prisma.transaction.findMany({
    where: { sessionId: sid, date: { lte: replayTo } },
    orderBy: { date: 'asc' },
  })

  const amounts: Record<string, number> = {}
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
    headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=15', 'Vary': 'Cookie' },
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
