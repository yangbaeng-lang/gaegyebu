import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

async function ensureDefaultSession() {
  const exists = await prisma.session.findUnique({ where: { id: 1 } })
  if (!exists) {
    await prisma.session.create({ data: { id: 1, name: '기본 섹션' } })
  }
}

export async function GET(req: NextRequest) {
  await ensureDefaultSession()
  const sessions = await prisma.session.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })

  const hasCookie = req.cookies.has('sid')
  const cookieSid = getSid(req)
  const validSession = sessions.find(s => s.id === cookieSid)

  // 쿠키가 없거나 존재하지 않는 세션을 가리키면 첫 번째 세션으로 초기화
  const current = validSession ? cookieSid : (sessions[0]?.id ?? 1)

  const res = NextResponse.json({ sessions, current }, {
    headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60', 'Vary': 'Cookie' },
  })

  if (!hasCookie || !validSession) {
    res.cookies.set('sid', String(current), { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  }

  return res
}

export async function PATCH(req: NextRequest) {
  const { order } = await req.json() as { order: number[] }
  await Promise.all(
    order.map((id, index) => prisma.session.update({ where: { id }, data: { sortOrder: index } }))
  )
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  await ensureDefaultSession()
  const { name, mode, sourceId, currency, exchangeRate } = await req.json()
  const sid = sourceId ?? getSid(req)

  const maxSession = await prisma.session.findFirst({ orderBy: { sortOrder: 'desc' } })
  const sortOrder = (maxSession?.sortOrder ?? -1) + 1
  const newSession = await prisma.session.create({
    data: {
      name: name ?? '새 세션',
      sortOrder,
      currency: currency ?? 'KRW',
      exchangeRate: currency === 'USD' ? (Number(exchangeRate) || null) : null,
    }
  })
  const nid = newSession.id

  if (mode === 'copy') {
    const [txs, budgets, assets, goals, cats] = await Promise.all([
      prisma.transaction.findMany({ where: { sessionId: sid } }),
      prisma.budget.findMany({ where: { sessionId: sid } }),
      prisma.asset.findMany({ where: { sessionId: sid } }),
      prisma.goal.findMany({ where: { sessionId: sid } }),
      prisma.category.findMany({ where: { sessionId: sid } }),
    ])

    await Promise.all([
      txs.length    > 0 && prisma.transaction.createMany({ data: txs.map(({ id: _id, sessionId: _s, ...r }) => ({ ...r, sessionId: nid })) }),
      budgets.length > 0 && prisma.budget.createMany({      data: budgets.map(({ id: _id, sessionId: _s, ...r }) => ({ ...r, sessionId: nid })) }),
      assets.length  > 0 && prisma.asset.createMany({       data: assets.map(({ id: _id, sessionId: _s, ...r }) => ({ ...r, sessionId: nid })) }),
      goals.length   > 0 && prisma.goal.createMany({        data: goals.map(({ id: _id, sessionId: _s, ...r }) => ({ ...r, sessionId: nid })) }),
      cats.length    > 0 && prisma.category.createMany({    data: cats.map(({ id: _id, sessionId: _s, ...r }) => ({ ...r, sessionId: nid })) }),
    ])
  }
  // 초기화 모드: 아무것도 복사하지 않음 → 설정 페이지 첫 접근 시 기본값 자동 생성

  return NextResponse.json(newSession, { status: 201 })
}
