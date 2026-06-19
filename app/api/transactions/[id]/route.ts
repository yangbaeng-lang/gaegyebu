import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'
import { inferTxType } from '@/lib/txType'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const id   = Number(params.id)
  const body = await req.json()
  const sid  = getSid(req)

  const type = await inferTxType(sid, body.fromAcct, body.toAcct)

  const tx = await prisma.transaction.update({
    where: { id },
    data: {
      type,
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
