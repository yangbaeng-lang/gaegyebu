import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id                        = Number(params.id)
    const { date, title, content, starred } = await req.json()
    const data: Record<string, unknown> = {}
    if (date    !== undefined) data.date    = date
    if (title   !== undefined) data.title   = title
    if (content !== undefined) data.content = content
    if (starred !== undefined) data.starred = starred
    const memo = await prisma.memo.update({ where: { id }, data })
    return NextResponse.json(memo)
  } catch (e) {
    console.error('[PUT /api/memos/:id]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id)
    await prisma.memo.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/memos/:id]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
