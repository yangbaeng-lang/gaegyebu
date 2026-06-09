import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

export async function GET(_req: NextRequest) {
  try {
    const memos = await prisma.memo.findMany({
      orderBy: [{ starred: 'desc' }, { date: 'desc' }, { createdAt: 'desc' }],
    })
    return NextResponse.json(memos)
  } catch (e) {
    console.error('[GET /api/memos]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const sid                          = getSid(req)
    const { date, title, content } = await req.json()

    if (!date) {
      return NextResponse.json({ error: '날짜는 필수입니다' }, { status: 400 })
    }

    const memo = await prisma.memo.create({
      data: { sessionId: sid, date, title: title ?? '', content: content ?? '' },
    })
    return NextResponse.json(memo, { status: 201 })
  } catch (e) {
    console.error('[POST /api/memos]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
