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
  } else if (exists.kind !== kind) {
    await prisma.asset.update({ where: { id: exists.id }, data: { kind } })
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
    headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30', 'Vary': 'Cookie' },
  })
}

export async function POST(req: NextRequest) {
  const { type, name, group, sortOrder: reqSortOrder } = await req.json()
  const sid = getSid(req)
  if (!type || !name?.trim()) return NextResponse.json({ error: '입력값 오류' }, { status: 400 })

  // 그룹명/항목명 통합 중복 검사: 같은 type 내에서 그룹명과 항목명은 겹칠 수 없음
  const displayName = name.trim() === '__group__' ? (group ?? '') : name.trim()
  const [itemConflict, groupConflict] = await Promise.all([
    prisma.category.findFirst({ where: { sessionId: sid, type, name: displayName } }),
    prisma.category.findFirst({ where: { sessionId: sid, type, name: '__group__', group: displayName } }),
  ])
  if (itemConflict || groupConflict) {
    return NextResponse.json({ error: `"${displayName}"은(는) 이미 존재하는 이름입니다` }, { status: 409 })
  }

  // 자산/부채 계정 항목은 반대 유형에 같은 이름이 있으면 거부
  if (name.trim() !== '__group__' && (type === 'account_asset' || type === 'account_liability')) {
    const oppositeType = type === 'account_asset' ? 'account_liability' : 'account_asset'
    const conflict = await prisma.category.findFirst({
      where: { sessionId: sid, type: oppositeType, name: displayName },
    })
    if (conflict) {
      return NextResponse.json(
        { error: `"${displayName}"은(는) 이미 ${type === 'account_asset' ? '부채' : '자산'} 계정으로 등록되어 있습니다` },
        { status: 409 },
      )
    }
  }

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

  const before = (name !== undefined || type !== undefined)
    ? await prisma.category.findUnique({ where: { id } })
    : null

  // 이름 변경 시 같은 유형 내 중복 거부
  if (before && name !== undefined && before.name !== name.trim() && before.name !== '__group__') {
    const targetType = type ?? before.type
    const duplicate = await prisma.category.findFirst({
      where: { sessionId: sid, type: targetType, name: name.trim(), id: { not: id } },
    })
    if (duplicate) {
      return NextResponse.json({ error: `"${name.trim()}"은(는) 이미 존재하는 항목입니다` }, { status: 409 })
    }
    if (targetType === 'account_asset' || targetType === 'account_liability') {
      const oppositeType = targetType === 'account_asset' ? 'account_liability' : 'account_asset'
      const conflict = await prisma.category.findFirst({
        where: { sessionId: sid, type: oppositeType, name: name.trim() },
      })
      if (conflict) {
        return NextResponse.json(
          { error: `"${name.trim()}"은(는) 이미 ${targetType === 'account_asset' ? '부채' : '자산'} 계정으로 등록되어 있습니다` },
          { status: 409 },
        )
      }
    }
  }

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

  if (type !== undefined && (type === 'account_asset' || type === 'account_liability')) {
    const newKind = type === 'account_asset' ? 'asset' : 'liability'
    await prisma.asset.updateMany({
      where: { sessionId: sid, type: cat.name },
      data: { kind: newKind },
    })
  }

  if (before && name !== undefined && before.name !== name.trim() && before.name !== '__group__') {
    const newName = name.trim()
    const resolvedType = cat.type
    if (resolvedType === 'account_asset' || resolvedType === 'account_liability') {
      // 새 이름으로 이미 존재하는 Asset 항목을 먼저 삭제 (중복 방지)
      await prisma.asset.deleteMany({ where: { sessionId: sid, type: newName } })
      await prisma.asset.updateMany({
        where: { sessionId: sid, type: before.name },
        data:  { name: newName, type: newName },
      })
      // 이름 변경 후에도 asset 레코드가 없으면 자동 생성
      const kind = resolvedType === 'account_asset' ? 'asset' : 'liability'
      await syncAsset(newName, kind, sid)
    }
    await prisma.transaction.updateMany({ where: { sessionId: sid, fromAcct: before.name }, data: { fromAcct: newName } })
    await prisma.transaction.updateMany({ where: { sessionId: sid, toAcct:   before.name }, data: { toAcct:   newName } })
    await prisma.pensionEval.updateMany({ where: { sessionId: sid, assetName: before.name }, data: { assetName: newName } })
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
      await prisma.pensionEval.deleteMany({ where: { sessionId: sid, assetName: cat.name } })
    }
    const newAcct = replaceName?.trim() || ''
    await prisma.transaction.updateMany({ where: { sessionId: sid, fromAcct: cat.name }, data: { fromAcct: newAcct } })
    await prisma.transaction.updateMany({ where: { sessionId: sid, toAcct:   cat.name }, data: { toAcct:   newAcct } })
  }

  await prisma.category.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
