import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

export async function GET(req: NextRequest) {
  const sid   = getSid(req)
  const goals = await prisma.goal.findMany({ where: { sessionId: sid } })
  return NextResponse.json(goals)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sid  = getSid(req)
  const goal = await prisma.goal.create({
    data: {
      sessionId: sid,
      name:    body.name,
      icon:    body.icon    ?? '🎯',
      color:   body.color   ?? '#6b8cff',
      target:  Number(body.target),
      current: Number(body.current ?? 0),
    },
  })
  return NextResponse.json(goal, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const id   = Number(req.nextUrl.searchParams.get('id'))
  const body = await req.json()
  const goal = await prisma.goal.update({
    where: { id },
    data:  { name: body.name, target: Number(body.target), current: Number(body.current) },
  })
  return NextResponse.json(goal)
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get('id'))
  await prisma.goal.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
