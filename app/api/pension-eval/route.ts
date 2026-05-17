import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const sessionId = Number(req.nextUrl.searchParams.get('sessionId') ?? '1')
  const yearMonth = req.nextUrl.searchParams.get('yearMonth') ?? ''

  const assets = await prisma.asset.findMany({
    where: { sessionId, kind: 'asset', NOT: { name: '__group__' } },
  })

  const kindMap: Record<string, string> = {}
  assets.forEach(a => { kindMap[a.name] = a.kind })

  // 카테고리에서 그룹 정보 조회
  const cats = await prisma.category.findMany({
    where: { sessionId, type: 'account_asset' },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })

  // 그룹 순서 (anchor 기준)
  const groupOrder = cats
    .filter(c => c.name === '__group__')
    .map(c => c.group)
    .filter((g, i, arr) => arr.indexOf(g) === i)

  // 숨김 처리된 항목 수집
  const hiddenSet = new Set(
    cats.filter(c => c.name !== '__group__' && c.hidden).map(c => c.name)
  )

  // 항목별 그룹 매핑
  const itemGroupMap: Record<string, string> = {}
  cats.filter(c => c.name !== '__group__').forEach(c => {
    itemGroupMap[c.name] = c.group
  })

  // 해당 월 말일 기준 납입액 계산
  const cutoff = yearMonth ? `${yearMonth}-31` : '9999-12-31'
  const txs = await prisma.transaction.findMany({
    where: { sessionId, date: { lte: cutoff } },
    orderBy: { date: 'asc' },
  })

  const amounts: Record<string, number> = {}
  for (const tx of txs) {
    if (tx.type === 'income') {
      if (kindMap[tx.toAcct] === 'asset') amounts[tx.toAcct] = (amounts[tx.toAcct] ?? 0) + tx.amount
    } else if (tx.type === 'expense') {
      if (kindMap[tx.fromAcct] === 'asset') amounts[tx.fromAcct] = (amounts[tx.fromAcct] ?? 0) - tx.amount
    } else if (tx.type === 'transfer') {
      if (kindMap[tx.fromAcct] === 'asset') amounts[tx.fromAcct] = (amounts[tx.fromAcct] ?? 0) - tx.amount
      if (kindMap[tx.toAcct] === 'asset') amounts[tx.toAcct] = (amounts[tx.toAcct] ?? 0) + tx.amount
    }
  }

  // 평가액 조회
  const evals = yearMonth
    ? await prisma.pensionEval.findMany({ where: { sessionId, yearMonth } })
    : []
  const evalMap: Record<string, number> = {}
  evals.forEach(e => { evalMap[e.assetName] = e.evalAmount })

  const visibleAssets = assets.filter(a => !hiddenSet.has(a.name))

  const items = visibleAssets.map(a => {
    const 납입액 = amounts[a.name] ?? 0
    const hasEval = evalMap[a.name] !== undefined
    const 평가액 = evalMap[a.name] ?? 0
    const 평가손익 = hasEval ? 평가액 - 납입액 : null
    const 수익률 = hasEval && 납입액 !== 0 ? ((평가액 - 납입액) / Math.abs(납입액)) * 100 : null
    const group = itemGroupMap[a.name] ?? ''
    return { name: a.name, color: a.color, icon: a.icon, group, 납입액, 평가액, 평가손익, 수익률, hasEval }
  })

  const total평가액 = items.reduce((s, i) => s + i.평가액, 0)
  const result = items.map(i => ({
    ...i,
    비중: total평가액 !== 0 && i.hasEval ? (i.평가액 / total평가액) * 100 : null,
  }))

  return NextResponse.json({ items: result, groupOrder })
}

export async function PUT(req: NextRequest) {
  const { sessionId, assetName, yearMonth, evalAmount } = await req.json()
  const record = await prisma.pensionEval.upsert({
    where: { sessionId_assetName_yearMonth: { sessionId, assetName, yearMonth } },
    update: { evalAmount: Number(evalAmount) },
    create: { sessionId, assetName, yearMonth, evalAmount: Number(evalAmount) },
  })
  return NextResponse.json(record)
}
