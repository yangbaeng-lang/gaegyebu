import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sessions = await prisma.session.findMany({ orderBy: { id: 'asc' } })

  const results = await Promise.all(
    sessions.map(async (s) => {
      const [assets, txs] = await Promise.all([
        prisma.asset.findMany({ where: { sessionId: s.id } }),
        prisma.transaction.findMany({ where: { sessionId: s.id }, orderBy: { date: 'asc' } }),
      ])

      const kindMap: Record<string, string> = {}
      assets.forEach(a => { kindMap[a.type] = a.kind })

      // 거래 내역 전체 누적 합산 (자산 페이지와 동일한 방식)
      const amounts: Record<string, number> = {}
      const applyDelta = (acct: string, delta: number) => {
        const kind = kindMap[acct]
        if (!kind) return
        const actual = kind === 'liability' ? -delta : delta
        amounts[acct] = (amounts[acct] ?? 0) + actual
      }

      for (const tx of txs) {
        if (tx.type === 'income')   { applyDelta(tx.toAcct,   tx.amount) }
        if (tx.type === 'expense')  { applyDelta(tx.fromAcct, -tx.amount) }
        if (tx.type === 'transfer') { applyDelta(tx.fromAcct, -tx.amount); applyDelta(tx.toAcct, tx.amount) }
      }

      const totalAssets = assets.filter(a => a.kind === 'asset')    .reduce((sum, a) => sum + (amounts[a.type] ?? 0), 0)
      const totalLiab   = assets.filter(a => a.kind === 'liability') .reduce((sum, a) => sum + Math.abs(amounts[a.type] ?? 0), 0)

      return {
        id:        s.id,
        name:      s.name,
        createdAt: s.createdAt,
        totalAssets,
        totalLiab,
        netWorth:  totalAssets - totalLiab,
      }
    })
  )

  return NextResponse.json(results)
}
