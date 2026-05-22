import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const id   = Number(params.id)
  const body = await req.json()

  const tx = await prisma.transaction.update({
    where: { id },
    data: {
      type:     body.type,
      date:     body.date,
      desc:     body.desc,
      amount:   Number(body.amount),
      fromAcct: body.fromAcct,
      toAcct:   body.toAcct,
      memo:     body.memo ?? '',
    },
  })

  return NextResponse.json(tx)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  await prisma.transaction.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
