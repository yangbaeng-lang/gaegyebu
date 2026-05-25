import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const mode       = req.nextUrl.searchParams.get('mode') ?? 'monthly'
  const includeRaw = req.nextUrl.searchParams.get('include') // 쉼표 구분 세션 ID

  const allSessions = await prisma.session.findMany({ orderBy: { id: 'asc' } })
  const includeIds  = includeRaw ? new Set(includeRaw.split(',').map(Number)) : null
  const sessions    = includeIds ? allSessions.filter(s => includeIds.has(s.id)) : allSessions

  // 세션별 병렬 조회
  const sessionResults = await Promise.all(sessions.map(async (session) => {
    const [assetDefs, txs] = await Promise.all([
      prisma.asset.findMany({ where: { sessionId: session.id } }),
      prisma.transaction.findMany({
        where: { sessionId: session.id },
        orderBy: { date: 'asc' },
      }),
    ])

    const kindMap: Record<string, string> = {}
    assetDefs.forEach(a => { kindMap[a.type] = a.kind })

    const amounts: Record<string, number> = {}
    const applyDelta = (acct: string, delta: number) => {
      const kind = kindMap[acct]
      if (!kind) return
      amounts[acct] = (amounts[acct] ?? 0) + (kind === 'liability' ? -delta : delta)
    }

    // 미리 분리해서 루프 내 filter 반복 제거
    const assetAccts = assetDefs.filter(a => a.kind === 'asset')
    const liabAccts  = assetDefs.filter(a => a.kind === 'liability')

    const running = new Map<string, { assets: number; liab: number }>()
    const incMap  = new Map<string, number>()
    const expMap  = new Map<string, number>()

    for (const tx of txs) {
      const period = mode === 'monthly' ? tx.date.substring(0, 7) : tx.date.substring(0, 4)

      if (tx.type === 'income')         applyDelta(tx.toAcct,   tx.amount)
      if (tx.type === 'expense')        applyDelta(tx.fromAcct, -tx.amount)
      if (tx.type === 'transfer')     { applyDelta(tx.fromAcct, -tx.amount); applyDelta(tx.toAcct, tx.amount) }
      if (tx.type === 'income_expense') { applyDelta(tx.fromAcct, -tx.amount); applyDelta(tx.toAcct, tx.amount) }

      const totalAssets = assetAccts.reduce((s, a) => s + Math.max(0, amounts[a.type] ?? 0), 0)
      const totalLiab   = liabAccts.reduce((s, a) => s + Math.abs(amounts[a.type] ?? 0), 0)
      running.set(period, { assets: totalAssets, liab: totalLiab })

      if (tx.type === 'income' || tx.type === 'income_expense') {
        incMap.set(period, (incMap.get(period) ?? 0) + tx.amount)
      }
      if (tx.type === 'expense' || tx.type === 'income_expense') {
        expMap.set(period, (expMap.get(period) ?? 0) + tx.amount)
      }
    }

    return { running, incMap, expMap }
  }))

  // 세션별 결과 병합
  const sessionData: Map<string, { assets: number; liab: number }>[] = []
  const incomeMap:  Map<string, number> = new Map()
  const expenseMap: Map<string, number> = new Map()

  for (const { running, incMap, expMap } of sessionResults) {
    sessionData.push(running)
    incMap.forEach((v, k) => incomeMap.set(k, (incomeMap.get(k) ?? 0) + v))
    expMap.forEach((v, k) => expenseMap.set(k, (expenseMap.get(k) ?? 0) + v))
  }

  // 전체 기간 수집
  const allPeriodsSet = new Set<string>()
  sessionData.forEach(r => r.forEach((_, p) => allPeriodsSet.add(p)))
  const sortedPeriods = Array.from(allPeriodsSet).sort()

  // 세션별 "마지막 알려진 값"으로 공백 기간 채우기
  const lastKnown = sessionData.map(() => ({ assets: 0, liab: 0 }))

  const getLabel = (p: string) =>
    mode === 'monthly'
      ? `${p.slice(2, 4)}/${p.slice(5, 7)}`
      : `${p}년`

  const series = sortedPeriods.map(period => {
    for (let i = 0; i < sessionData.length; i++) {
      const val = sessionData[i].get(period)
      if (val) lastKnown[i] = val
    }
    const totals = lastKnown.reduce(
      (acc, v) => ({ assets: acc.assets + v.assets, liab: acc.liab + v.liab }),
      { assets: 0, liab: 0 },
    )
    const income  = incomeMap.get(period)  ?? 0
    const expense = expenseMap.get(period) ?? 0
    return {
      period,
      label:       getLabel(period),
      totalAssets: totals.assets,
      totalLiab:   totals.liab,
      netWorth:    totals.assets - totals.liab,
      income,
      expense,
      profit:      income - expense,
    }
  })

  return NextResponse.json({ series })
}
