import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

// POST /api/sessions/[id] — 세션 전환 (쿠키 설정)
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const res = NextResponse.json({ ok: true })
  res.cookies.set('sid', String(id), { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  return res
}

// PATCH /api/sessions/[id] — 세션 이름/설정 변경
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id   = Number(params.id)
  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.name          !== undefined) data.name          = body.name
  if (body.decimalPlaces !== undefined) data.decimalPlaces = Number(body.decimalPlaces)
  const session = await prisma.session.update({ where: { id }, data })
  return NextResponse.json(session)
}

// DELETE /api/sessions/[id] — 세션 삭제 (기본 세션 1은 삭제 불가)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id  = Number(params.id)
  const sid = getSid(req)
  if (id === 1) return NextResponse.json({ error: '기본 세션은 삭제할 수 없습니다' }, { status: 400 })

  await Promise.all([
    prisma.transaction.deleteMany({ where: { sessionId: id } }),
    prisma.budget.deleteMany({      where: { sessionId: id } }),
    prisma.asset.deleteMany({       where: { sessionId: id } }),
    prisma.goal.deleteMany({        where: { sessionId: id } }),
    prisma.category.deleteMany({   where: { sessionId: id } }),
  ])
  await prisma.session.delete({ where: { id } })

  const res = NextResponse.json({ ok: true })
  // 삭제한 세션이 현재 세션이면 1로 되돌림
  if (sid === id) {
    res.cookies.set('sid', '1', { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  }
  return res
}
