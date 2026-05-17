import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import prisma from '@/lib/db'
import { getSid } from '@/lib/session'

// 후잉 거래내역 Excel 실제 컬럼 구조
// [0] 날짜  [1] 아이템  [2] 금액  [3] 기간내합계
// [4] 왼쪽 타입(비용/자산/부채/수익/순자산)  [5] 왼쪽 이름
// [6] 오른쪽 타입                             [7] 오른쪽 이름  [8] 메모

const PREFIX_TO_TYPE: Record<string, string> = {
  '비용': 'expense',
  '수익': 'income',
  '수입': 'income',
  '자산': 'account_asset',
  '부채': 'account_liability',
  '순자산': 'networth',
}

function parseHuingRow(row: unknown[]): {
  date: string; desc: string; amount: number;
  fromAcct: string; toAcct: string; memo: string;
  fromPrefix: string; toPrefix: string;
} | null {
  if (!row || row.length < 8) return null

  let date = ''
  const rawDate = row[0]
  if (typeof rawDate === 'number') {
    const d = XLSX.SSF.parse_date_code(rawDate)
    if (!d) return null
    date = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  } else if (typeof rawDate === 'string') {
    const m = rawDate.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
    if (!m) return null
    date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  } else return null

  const desc = String(row[1] ?? '').trim()
  if (!desc) return null

  const rawAmt = row[2]
  let amount = 0
  if (typeof rawAmt === 'number') amount = rawAmt
  else if (typeof rawAmt === 'string') {
    const n = parseFloat(rawAmt.replace(/[,\s]/g, ''))
    if (isNaN(n)) return null
    amount = n
  } else return null

  if (amount === 0) return null

  const toPrefix   = String(row[4] ?? '').trim()
  const toAcct     = String(row[5] ?? '').trim()
  const fromPrefix = String(row[6] ?? '').trim()
  const fromAcct   = String(row[7] ?? '').trim()
  const memo       = String(row[8] ?? '').trim().replace(/^-$/, '')

  if (!toAcct && !fromAcct) return null

  return {
    date, desc, amount: Math.round(amount),
    fromAcct, fromPrefix,
    toAcct, toPrefix,
    memo,
  }
}

function inferType(fromPrefix: string, toPrefix: string): string {
  if (toPrefix.trim() === '비용') return 'expense'
  if (fromPrefix.trim() === '수익' || fromPrefix.trim() === '수입') return 'income'
  return 'transfer'
}

export async function POST(req: NextRequest) {
  try {
    const sid = getSid(req)
    const url = new URL(req.url)
    const dryRun = url.searchParams.get('dryRun') === 'true'
    const skipDuplicates = url.searchParams.get('skipDuplicates') !== 'false'
    const skipInFileDuplicates = url.searchParams.get('skipInFileDuplicates') !== 'false'

    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (!files.length) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })

    // ── 기존 데이터를 처음 한 번에 로드 (매 행마다 쿼리 방지) ──
    const existingTxRows = await prisma.transaction.findMany({
      where: { sessionId: sid },
      select: { date: true, desc: true, amount: true, fromAcct: true, toAcct: true },
    })
    const existingTxSet = new Set(
      existingTxRows.map(t => `${t.date}|${t.desc}|${t.amount}|${t.fromAcct}|${t.toAcct}`)
    )
    const importedSet = new Set<string>()

    const existingCatRows = await prisma.category.findMany({
      where: { sessionId: sid },
      select: { type: true, name: true, sortOrder: true },
    })
    const catSet = new Set(existingCatRows.map(c => `${c.type}|${c.name}`))
    const catMaxOrder: Record<string, number> = {}
    for (const c of existingCatRows) {
      catMaxOrder[c.type] = Math.max(catMaxOrder[c.type] ?? 0, c.sortOrder)
    }

    const existingAssetRows = await prisma.asset.findMany({
      where: { sessionId: sid },
      select: { type: true, kind: true, amount: true, id: true },
    })
    const assetMap = new Map(existingAssetRows.map(a => [a.type, a]))

    // ── 파일 파싱 & 분류 ──
    let imported = 0
    let skipped  = 0
    let duplicates = 0
    let inFileDuplicates = 0
    const errors: string[] = []
    const newTxs: {
      sessionId: number; date: string; desc: string; amount: number;
      fromAcct: string; toAcct: string; memo: string; type: string;
    }[] = []
    const assetDeltas = new Map<string, number>()

    // 새로 추가할 카테고리/자산 수집
    const newCats: { sessionId: number; type: string; name: string; sortOrder: number; group: string }[] = []
    const newAssets: { sessionId: number; name: string; type: string; kind: string; amount: number; color: string; icon: string }[] = []

    const ensureCategory = (name: string, prefix: string) => {
      if (!name || !prefix) return
      const catType = PREFIX_TO_TYPE[prefix]
      if (!catType) return
      const key = `${catType}|${name}`
      if (catSet.has(key)) return
      catSet.add(key)
      const sortOrder = (catMaxOrder[catType] ?? -1) + 1
      catMaxOrder[catType] = sortOrder
      newCats.push({ sessionId: sid, type: catType, name, sortOrder, group: '' })
      if (catType === 'account_asset' && !assetMap.has(name)) {
        assetMap.set(name, { id: -1, type: name, kind: 'asset', amount: 0 })
        newAssets.push({ sessionId: sid, name, type: name, kind: 'asset', amount: 0, color: '#4a6fdb', icon: 'ti-building-bank' })
      }
      if (catType === 'account_liability' && !assetMap.has(name)) {
        assetMap.set(name, { id: -1, type: name, kind: 'liability', amount: 0 })
        newAssets.push({ sessionId: sid, name, type: name, kind: 'liability', amount: 0, color: '#d94f4f', icon: 'ti-credit-card' })
      }
    }

    for (const file of files) {
      const buf  = Buffer.from(await file.arrayBuffer())
      const wb   = XLSX.read(buf, { type: 'buffer', cellDates: false })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

      for (let i = 1; i < rows.length; i++) {
        try {
          const parsed = parseHuingRow(rows[i])
          if (!parsed) { skipped++; continue }

          const key = `${parsed.date}|${parsed.desc}|${parsed.amount}|${parsed.fromAcct}|${parsed.toAcct}`
          if (importedSet.has(key)) {
            inFileDuplicates++
            if (skipInFileDuplicates) { skipped++; continue }
          } else {
            importedSet.add(key)
          }
          if (existingTxSet.has(key)) {
            duplicates++
            if (skipDuplicates) { continue }
          }
          ensureCategory(parsed.fromAcct, parsed.fromPrefix)
          ensureCategory(parsed.toAcct,   parsed.toPrefix)

          const type = inferType(parsed.fromPrefix, parsed.toPrefix)
          newTxs.push({ sessionId: sid, date: parsed.date, desc: parsed.desc, amount: parsed.amount, fromAcct: parsed.fromAcct, toAcct: parsed.toAcct, memo: parsed.memo, type })

          // 자산 변화 누적
          if (type === 'income')   assetDeltas.set(parsed.toAcct,   (assetDeltas.get(parsed.toAcct)   ?? 0) + parsed.amount)
          if (type === 'expense')  assetDeltas.set(parsed.fromAcct, (assetDeltas.get(parsed.fromAcct) ?? 0) - parsed.amount)
          if (type === 'transfer') {
            assetDeltas.set(parsed.fromAcct, (assetDeltas.get(parsed.fromAcct) ?? 0) - parsed.amount)
            assetDeltas.set(parsed.toAcct,   (assetDeltas.get(parsed.toAcct)   ?? 0) + parsed.amount)
          }
          imported++
        } catch (e) {
          errors.push(`행${i}: ${e}`)
          skipped++
        }
      }
    }

    if (dryRun) {
      return NextResponse.json({ toImport: newTxs.length, duplicates, inFileDuplicates, errors: errors.slice(0, 10) })
    }

    // ── 일괄 DB 저장 ──
    if (newCats.length > 0) {
      await prisma.category.createMany({ data: newCats })
    }
    if (newAssets.length > 0) {
      await prisma.asset.createMany({ data: newAssets })
    }
    if (newTxs.length > 0) {
      await prisma.transaction.createMany({ data: newTxs })
    }

    // 자산 잔액 일괄 업데이트 (계정당 1회)
    for (const [acctName, delta] of Array.from(assetDeltas.entries())) {
      if (delta === 0) continue
      const asset = assetMap.get(acctName)
      if (!asset || asset.id === -1) continue
      const actualDelta = asset.kind === 'liability' ? -delta : delta
      try {
        await prisma.asset.update({ where: { id: asset.id }, data: { amount: { increment: actualDelta } } })
      } catch {}
    }

    return NextResponse.json({ imported, skipped, duplicates, inFileDuplicates, errors: errors.slice(0, 10) })
  } catch (e) {
    console.error('[import-excel]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
