import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { computeTotalBonus } from '@/lib/performanceCalc'

export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get('year') ?? new Date().getFullYear())

  const [sessionBH, sessionAR] = await Promise.all([
    prisma.session.findFirst({ where: { name: { contains: '병훈' } } }),
    prisma.session.findFirst({ where: { name: { contains: '아름' } } }),
  ])

  const sidBH = sessionBH?.id ?? 0
  const sidAR = sessionAR?.id ?? 0

  // Y-1년, Y-2년 성과급 계산 (각각의 10%가 해당년도 적립금 수령액)
  const [bhPrev1, bhPrev2, arPrev1, arPrev2] = await Promise.all([
    sidBH ? computeTotalBonus(sidBH, year - 1) : Promise.resolve(0),
    sidBH ? computeTotalBonus(sidBH, year - 2) : Promise.resolve(0),
    sidAR ? computeTotalBonus(sidAR, year - 1) : Promise.resolve(0),
    sidAR ? computeTotalBonus(sidAR, year - 2) : Promise.resolve(0),
  ])

  const makeResult = (prev1: number, prev2: number) => ({
    fromPrevYear:     { year: year - 1, totalBonus: prev1, reserve: prev1 * 0.1 },
    fromPrevPrevYear: { year: year - 2, totalBonus: prev2, reserve: prev2 * 0.1 },
    total: (prev1 + prev2) * 0.1,
  })

  return NextResponse.json({
    BH: makeResult(bhPrev1, bhPrev2),
    AR: makeResult(arPrev1, arPrev2),
  })
}
