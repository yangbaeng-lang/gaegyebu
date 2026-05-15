import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

async function updateAsset(acctName: string, delta: number, sid: number) {
  const asset = await prisma.asset.findFirst({ where: { type: acctName, sessionId: sid } })
  if (!asset) return
  const actualDelta = asset.kind === 'liability' ? -delta : delta
  await prisma.asset.update({
    where: { id: asset.id },
    data:  { amount: { increment: actualDelta } },
  })
}

async function applyAssetDelta(type: string, fromAcct: string, toAcct: string, amount: number, sid: number) {
  if (type === 'income')   { await updateAsset(toAcct,   amount,  sid) }
  if (type === 'expense')  { await updateAsset(fromAcct, -amount, sid) }
  if (type === 'transfer') { await updateAsset(fromAcct, -amount, sid); await updateAsset(toAcct, amount, sid) }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const id   = Number(params.id)
  const body = await req.json()
  const sid  = getSid(req)

  const old = await prisma.transaction.findUnique({ where: { id } })
  if (old) await applyAssetDelta(old.type, old.fromAcct, old.toAcct, -old.amount, sid)

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

  await applyAssetDelta(tx.type, tx.fromAcct, tx.toAcct, tx.amount, sid)
  return NextResponse.json(tx)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id  = Number(params.id)
  const sid = getSid(req)
  const tx  = await prisma.transaction.findUnique({ where: { id } })
  if (tx) await applyAssetDelta(tx.type, tx.fromAcct, tx.toAcct, -tx.amount, sid)
  await prisma.transaction.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
