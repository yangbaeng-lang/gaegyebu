import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

// 내용(desc) 자동완성 — 최근 거래를 desc별로 그룹화해 반환
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q   = searchParams.get('q') ?? ''
  const sid = getSid(req)

  if (!q.trim()) return NextResponse.json([])

  // 검색어가 포함된 desc의 최근 거래를 가져옴 (desc별 최신 1건씩)
  const txs = await prisma.transaction.findMany({
    where: { sessionId: sid, desc: { contains: q } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: 100,
  })

  // desc별로 가장 최근 거래만 남김
  const seen = new Set<string>()
  const result: { desc: string; amount: number; fromAcct: string; toAcct: string; memo: string }[] = []
  for (const tx of txs) {
    if (seen.has(tx.desc)) continue
    seen.add(tx.desc)
    result.push({ desc: tx.desc, amount: tx.amount, fromAcct: tx.fromAcct, toAcct: tx.toAcct, memo: tx.memo })
    if (result.length >= 8) break
  }

  return NextResponse.json(result)
}
