import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getSid } from '@/lib/session'

const DEFAULTS = {
  account_asset:     ['국민은행', '카카오뱅크', '현금', '카카오페이'],
  account_liability: ['신용카드'],
  expense:           ['식비', '교통', '주거', '의료', '여가', '교육', '기타'],
  income:            ['국민은행', '카카오뱅크', '현금'],
  networth:          ['부동산', '예금/적금', '투자', '연금', '기타'],
}

const ASSET_ICON  = 'ti-building-bank'
const LIAB_ICON   = 'ti-credit-card'
const ASSET_COLOR = '#4a6fdb'
const LIAB_COLOR  = '#d94f4f'

async function syncAsset(name: string, kind: 'asset' | 'liability', sid: number) {
  const exists = await prisma.asset.findFirst({ where: { type: name, sessionId: sid } })
  if (!exists) {
    await prisma.asset.create({
      data: {
        sessionId: sid,
        name,
        type:  name,
        kind,
        amount: 0,
        color: kind === 'asset' ? ASSET_COLOR : LIAB_COLOR,
        icon:  kind === 'asset' ? ASSET_ICON  : LIAB_ICON,
      },
    })
  }
}

async function ensureDefaults(sid: number) {
  // 구버전 account 타입 마이그레이션
  const old = await prisma.category.findMany({ where: { sessionId: sid, type: 'account' } })
  if (old.length > 0) {
    const LIAB = ['신용카드']
    for (const c of old) {
      await prisma.category.update({
        where: { id: c.id },
        data:  { type: LIAB.includes(c.name) ? 'account_liability' : 'account_asset' },
      })
    }
  }

  const count = await prisma.category.count({
    where: { sessionId: sid, type: { in: ['account_asset', 'account_liability', 'expense', 'income', 'networth'] } },
  })
  if (count > 0) {
    for (const type of Object.keys(DEFAULTS)) {
      const items = await prisma.category.findMany({ where: { sessionId: sid, type }, orderBy: { id: 'asc' } })
      const allZero = items.length > 1 && items.every(c => c.sortOrder === 0)
      if (allZero) {
        for (let i = 0; i < items.length; i++) {
          await prisma.category.update({ where: { id: items[i].id }, data: { sortOrder: i } })
        }
      }
    }
    return
  }

  const rows = Object.entries(DEFAULTS).flatMap(([type, names]) =>
    names.map((name, i) => ({ sessionId: sid, type, name, sortOrder: i }))
  )
  await prisma.category.createMany({ data: rows })
}

export async function GET(req: NextRequest) {
  const sid = getSid(req)
  if (sid === 1) await ensureDefaults(sid)
  const cats = await prisma.category.findMany({
    where: { sessionId: sid },
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  })

  const grouped = {
    account_asset:     [] as typeof cats,
    account_liability: [] as typeof cats,
    expense:           [] as typeof cats,
    income:            [] as typeof cats,
    networth:          [] as typeof cats,
  }
  cats.forEach(c => {
    const t = c.type as keyof typeof grouped
    if (grouped[t] && c.name !== '__group__') grouped[t].push(c)
  })
  const account = [
    ...grouped.account_asset.map(c => c.name),
    ...grouped.account_liability.map(c => c.name),
  ]
  return NextResponse.json({ grouped, raw: cats, account }, {
    headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
  })
}

export async function POST(req: NextRequest) {
  const { type, name, group, sortOrder: reqSortOrder } = await req.json()
  const sid = getSid(req)
  if (!type || !name?.trim()) return NextResponse.json({ error: '입력값 오류' }, { status: 400 })
  try {
    let sortOrder: number
    if (reqSortOrder !== undefined) {
      sortOrder = reqSortOrder
    } else {
      const last = await prisma.category.findFirst({ where: { sessionId: sid, type, group: group ?? '' }, orderBy: { sortOrder: 'desc' } })
      sortOrder = last ? last.sortOrder + 1 : 0
    }
    const cat = await prisma.category.create({ data: { sessionId: sid, type, name: name.trim(), sortOrder, group: group ?? '' } })

    if (type === 'account_asset')     await syncAsset(name.trim(), 'asset',     sid)
    if (type === 'account_liability') await syncAsset(name.trim(), 'liability', sid)

    return NextResponse.json(cat)
  } catch (e: unknown) {
    console.error('[categories POST error]', e)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: '이미 존재하는 항목입니다' }, { status: 409 })
    }
    return NextResponse.json({ error: 'DB 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const { id, name, sortOrder, type, group, hidden } = await req.json()
  const sid = getSid(req)

  const before = name !== undefined
    ? await prisma.category.findUnique({ where: { id } })
    : null

  const data: Record<string, unknown> = {}
  if (name !== undefined)      data.name      = name.trim()
  if (sortOrder !== undefined) data.sortOrder = sortOrder
  if (type !== undefined)      data.type      = type
  if (group !== undefined)     data.group     = group
  if (hidden !== undefined)    data.hidden    = hidden
  const cat = await prisma.category.update({ where: { id }, data })

  if (hidden !== undefined && cat.name === '__group__') {
    await prisma.category.updateMany({
      where: { sessionId: sid, type: cat.type, group: cat.group, name: { not: '__group__' } },
      data: { hidden },
    })
  }

  if (before && name !== undefined && before.name !== name.trim() && before.name !== '__group__') {
    const newName = name.trim()
    if (before.type === 'account_asset' || before.type === 'account_liability') {
      await prisma.asset.updateMany({
        where: { sessionId: sid, type: before.name },
        data:  { name: newName, type: newName },
      })
    }
    await prisma.transaction.updateMany({ where: { sessionId: sid, fromAcct: before.name }, data: { fromAcct: newName } })
    await prisma.transaction.updateMany({ where: { sessionId: sid, toAcct:   before.name }, data: { toAcct:   newName } })
  }

  return NextResponse.json(cat)
}

export async function DELETE(req: NextRequest) {
  const { id, replaceName } = await req.json()
  const sid = getSid(req)
  const cat = await prisma.category.findUnique({ where: { id } })

  if (cat && cat.name !== '__group__') {
    if (cat.type === 'account_asset' || cat.type === 'account_liability') {
      await prisma.asset.deleteMany({ where: { sessionId: sid, type: cat.name } })
    }
    const newAcct = replaceName?.trim() || ''
    await prisma.transaction.updateMany({ where: { sessionId: sid, fromAcct: cat.name }, data: { fromAcct: newAcct } })
    await prisma.transaction.updateMany({ where: { sessionId: sid, toAcct:   cat.name }, data: { toAcct:   newAcct } })
  }

  await prisma.category.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
