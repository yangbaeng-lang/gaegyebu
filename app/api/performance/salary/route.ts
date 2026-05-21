import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { querySalary } from '@/lib/performanceCalc'

const EMPTY = { cur: { upcheokJun: 0, upcheokSepCur: 0, upcheokPrevFallback: 0, gibonJan: 0, gibonMax: 0 }, prevBase: { upcheok: 0, gibon: 0 } }

export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get('year') ?? new Date().getFullYear())

  const [sessionBH, sessionAR] = await Promise.all([
    prisma.session.findFirst({ where: { name: { contains: '병훈' } } }),
    prisma.session.findFirst({ where: { name: { contains: '아름' } } }),
  ])

  const [BH, AR] = await Promise.all([
    sessionBH ? querySalary(sessionBH.id, year) : Promise.resolve(EMPTY),
    sessionAR ? querySalary(sessionAR.id, year) : Promise.resolve(EMPTY),
  ])

  return NextResponse.json({ BH, AR })
}
