import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

function generateMonths(start: string, end: string): string[] {
  const months: string[] = []
  let [y, m] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

export async function GET(req: NextRequest) {
  const sessionId = Number(req.nextUrl.searchParams.get('sessionId') ?? '1')
  const startMonth = req.nextUrl.searchParams.get('startMonth') ?? ''
  const endMonth   = req.nextUrl.searchParams.get('endMonth')   ?? ''

  if (!startMonth || !endMonth) {
    return NextResponse.json({ monthlyData: [], groupOrder: [] })
  }

  const assets = await prisma.asset.findMany({
    where: { sessionId, kind: 'asset', NOT: { name: '__group__' } },
  })
  const kindMap: Record<string, string> = {}
  assets.forEach(a => { kindMap[a.name] = a.kind })

  const cats = await prisma.category.findMany({
    where: { sessionId, type: 'account_asset' },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })

  const groupOrder = cats
    .filter(c => c.name === '__group__')
    .map(c => c.group)
    .filter((g, i, arr) => arr.indexOf(g) === i)

  const hiddenSet = new Set(
    cats.filter(c => c.name !== '__group__' && c.hidden).map(c => c.name)
  )

  const itemGroupMap: Record<string, string> = {}
  cats.filter(c => c.name !== '__group__').forEach(c => {
    itemGroupMap[c.name] = c.group
  })

  const visibleAssets = assets.filter(a => !hiddenSet.has(a.name))

  // 전체 트랜잭션 (endMonth 말일까지)
  const txs = await prisma.transaction.findMany({
    where: { sessionId, date: { lte: `${endMonth}-31` } },
    orderBy: { date: 'asc' },
  })

  // 기간 내 모든 평가액
  const evals = await prisma.pensionEval.findMany({
    where: { sessionId, yearMonth: { gte: startMonth, lte: endMonth } },
  })
  const evalMap: Record<string, Record<string, number>> = {}
  evals.forEach(e => {
    if (!evalMap[e.yearMonth]) evalMap[e.yearMonth] = {}
    evalMap[e.yearMonth][e.assetName] = e.evalAmount
  })

  const months = generateMonths(startMonth, endMonth)

  // 월별 누적 납입액 계산 (트랜잭션 한 번 순회)
  const runningAmounts: Record<string, number> = {}
  const monthlyAmounts: Record<string, Record<string, number>> = {}
  let txIdx = 0

  for (const ym of months) {
    const cutoff = `${ym}-31`
    while (txIdx < txs.length && txs[txIdx].date <= cutoff) {
      const tx = txs[txIdx]
      if (tx.type === 'income') {
        if (kindMap[tx.toAcct] === 'asset')
          runningAmounts[tx.toAcct] = (runningAmounts[tx.toAcct] ?? 0) + tx.amount
      } else if (tx.type === 'expense') {
        if (kindMap[tx.fromAcct] === 'asset')
          runningAmounts[tx.fromAcct] = (runningAmounts[tx.fromAcct] ?? 0) - tx.amount
      } else if (tx.type === 'transfer') {
        if (kindMap[tx.fromAcct] === 'asset')
          runningAmounts[tx.fromAcct] = (runningAmounts[tx.fromAcct] ?? 0) - tx.amount
        if (kindMap[tx.toAcct] === 'asset')
          runningAmounts[tx.toAcct] = (runningAmounts[tx.toAcct] ?? 0) + tx.amount
      }
      txIdx++
    }
    monthlyAmounts[ym] = { ...runningAmounts }
  }

  // 월별 × 그룹별 집계
  const monthlyData = months.map(ym => {
    const amts = monthlyAmounts[ym] ?? {}
    const evalsForMonth = evalMap[ym] ?? {}

    const assetData = visibleAssets.map(a => {
      const 납입액 = amts[a.name] ?? 0
      const hasEval = evalsForMonth[a.name] !== undefined
      const 평가액 = evalsForMonth[a.name] ?? 0
      const 평가손익 = hasEval ? 평가액 - 납입액 : null
      const 수익률 = hasEval && 납입액 !== 0 ? ((평가액 - 납입액) / Math.abs(납입액)) * 100 : null
      const group = itemGroupMap[a.name] ?? ''
      return { name: a.name, color: a.color, group, 납입액, 평가액, 평가손익, 수익률, hasEval }
    }).filter(i => i.납입액 !== 0)

    const total평가액 = assetData.reduce((s, i) => s + i.평가액, 0)

    const groups: Record<string, {
      납입액: number; 평가액: number; 평가손익: number | null
      수익률: number | null; 비중: number | null
    }> = {}

    for (const grp of groupOrder) {
      const rows = assetData.filter(i => i.group === grp)
      if (rows.length === 0) continue
      const 납 = rows.reduce((s, i) => s + i.납입액, 0)
      const 평 = rows.reduce((s, i) => s + i.평가액, 0)
      const 손익 = 평 > 0 ? 평 - 납 : null
      const 율  = 납 > 0 && 평 > 0 ? ((평 - 납) / 납) * 100 : null
      const 비중 = total평가액 > 0 && 평 > 0 ? (평 / total평가액) * 100 : null
      groups[grp] = { 납입액: 납, 평가액: 평, 평가손익: 손익, 수익률: 율, 비중 }
    }

    return { yearMonth: ym, groups, total평가액, assets: assetData }
  })

  // 자산별 최신 데이터 수집 → 수익률 내림차순 정렬
  const assetLatest: Record<string, { color: string; 납입액: number; 평가손익: number | null; 수익률: number | null }> = {}
  for (const entry of monthlyData) {
    for (const a of entry.assets) {
      assetLatest[a.name] = { color: a.color, 납입액: a.납입액, 평가손익: a.평가손익, 수익률: a.수익률 }
    }
  }
  const assetOrder = Object.entries(assetLatest)
    .sort(([, a], [, b]) => {
      if (a.수익률 === null && b.수익률 === null) return 0
      if (a.수익률 === null) return 1
      if (b.수익률 === null) return -1
      return b.수익률 - a.수익률
    })
    .map(([name, meta]) => ({ name, ...meta }))

  return NextResponse.json({ monthlyData, groupOrder, assetOrder })
}
