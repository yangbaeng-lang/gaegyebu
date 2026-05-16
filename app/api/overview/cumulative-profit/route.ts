import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const mode       = req.nextUrl.searchParams.get('mode') ?? 'monthly'
  const includeRaw = req.nextUrl.searchParams.get('include')

  const allSessions = await prisma.session.findMany({ orderBy: { id: 'asc' } })
  const includeIds  = includeRaw ? new Set(includeRaw.split(',').map(Number)) : null
  const sessions    = includeIds ? allSessions.filter(s => includeIds.has(s.id)) : allSessions

  // 세션별 트랜잭션을 병렬 조회
  const sessionProfits = await Promise.all(
    sessions.map(async (session) => {
      const txs = await prisma.transaction.findMany({
        where:   { sessionId: session.id },
        orderBy: { date: 'asc' },
        select:  { date: true, type: true, amount: true },
      })
      const profitMap = new Map<string, number>()
      for (const tx of txs) {
        const period = mode === 'monthly' ? tx.date.substring(0, 7) : tx.date.substring(0, 4)
        if (tx.type === 'income'         || tx.type === 'income_expense') profitMap.set(period, (profitMap.get(period) ?? 0) + tx.amount)
        if (tx.type === 'expense'        || tx.type === 'income_expense') profitMap.set(period, (profitMap.get(period) ?? 0) - tx.amount)
      }
      return profitMap
    })
  )

  // 전체 기간 수집 후 정렬
  const allPeriodsSet = new Set<string>()
  sessionProfits.forEach(m => m.forEach((_, p) => allPeriodsSet.add(p)))
  const sortedPeriods = Array.from(allPeriodsSet).sort()

  const getLabel = (p: string) =>
    mode === 'monthly' ? `${p.slice(2, 4)}/${p.slice(5, 7)}` : `${p}년`

  // 세션별 누적 합산
  const cumulatives = sessions.map(() => 0)

  const series = sortedPeriods.map(period => {
    const row: Record<string, string | number> = { period, label: getLabel(period) }
    for (let i = 0; i < sessions.length; i++) {
      cumulatives[i] += sessionProfits[i].get(period) ?? 0
      row[sessions[i].name] = cumulatives[i]
    }
    return row
  })

  return NextResponse.json({
    sessions: sessions.map(s => ({ id: s.id, name: s.name })),
    series,
  })
}
