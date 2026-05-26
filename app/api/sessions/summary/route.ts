import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

type SummaryRow = {
  sessionId: bigint | number
  totalAssets: string | number
  totalLiab: string | number
}

export async function GET(req: NextRequest) {
  const toParam  = req.nextUrl.searchParams.get('to')
  const replayTo = toParam ?? new Date().toISOString().slice(0, 10)

  const [sessions, rows] = await Promise.all([
    prisma.session.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.$queryRaw<SummaryRow[]>`
      WITH deltas AS (
        SELECT "sessionId", "toAcct"   AS acct,  amount AS delta FROM "Transaction" WHERE type = 'income'   AND date <= ${replayTo}
        UNION ALL
        SELECT "sessionId", "fromAcct" AS acct, -amount AS delta FROM "Transaction" WHERE type = 'expense'  AND date <= ${replayTo}
        UNION ALL
        SELECT "sessionId", "fromAcct" AS acct, -amount AS delta FROM "Transaction" WHERE type = 'transfer' AND date <= ${replayTo}
        UNION ALL
        SELECT "sessionId", "toAcct"   AS acct,  amount AS delta FROM "Transaction" WHERE type = 'transfer' AND date <= ${replayTo}
      ),
      account_sums AS (
        SELECT "sessionId", acct, SUM(delta) AS net
        FROM deltas GROUP BY "sessionId", acct
      ),
      enriched AS (
        SELECT
          a."sessionId",
          a.kind,
          CASE WHEN a.kind = 'liability' THEN -s.net ELSE s.net END AS actual
        FROM account_sums s
        JOIN "Asset" a ON s.acct = a.type AND s."sessionId" = a."sessionId"
      )
      SELECT
        "sessionId",
        COALESCE(SUM(CASE WHEN kind = 'asset'     THEN actual      ELSE 0 END), 0) AS "totalAssets",
        COALESCE(SUM(CASE WHEN kind = 'liability' THEN ABS(actual) ELSE 0 END), 0) AS "totalLiab"
      FROM enriched
      GROUP BY "sessionId"
    `,
  ])

  const summaryMap = new Map<number, { totalAssets: number; totalLiab: number }>(
    rows.map(r => [
      Number(r.sessionId),
      { totalAssets: Number(r.totalAssets), totalLiab: Number(r.totalLiab) },
    ])
  )

  const results = sessions.map(s => {
    const sums = summaryMap.get(s.id) ?? { totalAssets: 0, totalLiab: 0 }
    const rate = (s.currency && s.currency !== 'KRW' && s.exchangeRate) ? s.exchangeRate : 1
    const totalAssets = Math.round(sums.totalAssets * rate)
    const totalLiab   = Math.round(sums.totalLiab   * rate)
    return {
      id:            s.id,
      name:          s.name,
      createdAt:     s.createdAt,
      decimalPlaces: s.decimalPlaces,
      currency:      s.currency ?? 'KRW',
      exchangeRate:  s.exchangeRate ?? null,
      totalAssets,
      totalLiab,
      netWorth:      totalAssets - totalLiab,
    }
  })

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=10', 'Vary': 'Cookie' },
  })
}
