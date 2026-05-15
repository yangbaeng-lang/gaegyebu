/**
 * 사용법: node scripts/import.js "파일경로.xlsx"
 * 예시:   node scripts/import.js "C:\Users\...\거래내역-2016.xlsx"
 *
 * 지원 형식
 *  - 거래내역 9열: [날짜, 아이템, 금액, 기간내합계, 왼쪽대분, 왼쪽소분(toAcct), 오른쪽대분, 오른쪽소분(fromAcct), 메모]
 *  - 거래내역 6열: [날짜, 아이템, 금액, toAcct, fromAcct, 메모]
 *  - 비용수익 파일: 거래 데이터가 아니므로 건너뜀
 */
const { PrismaClient } = require('@prisma/client')
const XLSX = require('xlsx')
const path = require('path')

const filePath = process.argv[2]
if (!filePath) {
  console.error('파일 경로를 인자로 입력하세요.\n예: node scripts/import.js "C:\\Users\\...\\파일명.xlsx"')
  process.exit(1)
}

const p = new PrismaClient()

async function main() {
  // DB 카테고리 로드
  const cats = await p.category.findMany()
  const byType = (type) => cats.filter(c => c.type === type && c.name !== '__group__').map(c => c.name)
  const catMap = {
    account_asset:     byType('account_asset'),
    account_liability: byType('account_liability'),
    expense:           byType('expense'),
    income:            byType('income'),
    networth:          byType('networth'),
  }

  function inferType(from, to) {
    if (catMap.networth.includes(from) || catMap.networth.includes(to)) return 'transfer'
    if (catMap.income.includes(from) && catMap.expense.includes(to))    return 'income_expense'
    if (catMap.expense.includes(to))   return 'expense'
    if (catMap.income.includes(from))  return 'income'
    return 'transfer'
  }

  // 파일 읽기
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  if (rows.length < 2) {
    console.log('데이터가 없습니다.')
    await p.$disconnect()
    return
  }

  const header = rows[0]

  // 비용수익 파일 감지
  if (String(header[0]).includes('시작일') || String(header[2]).includes('계정')) {
    console.log('비용수익 파일은 거래 데이터가 아니므로 입력하지 않습니다.')
    await p.$disconnect()
    return
  }

  // 형식 감지
  const is9col = header.length >= 8 && String(header[3]).includes('합계')
  console.log(`파일 형식: ${is9col ? '9열 (왼쪽/오른쪽)' : '6열 (toAcct/fromAcct)'}`)
  console.log(`총 데이터 행: ${rows.length - 1}건`)

  const records = []
  const skipped = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const date   = String(r[0] || '').trim()
    const desc   = String(r[1] || '').trim()
    const amount = Number(r[2])
    let fromAcct, toAcct, memo

    if (is9col) {
      toAcct   = String(r[5] || '').trim()
      fromAcct = String(r[7] || '').trim()
      memo     = String(r[8] || '').trim()
    } else {
      toAcct   = String(r[3] || '').trim()
      fromAcct = String(r[4] || '').trim()
      memo     = String(r[5] || '').trim()
    }

    // 유효성 검사
    if (!date || !desc || !fromAcct || !toAcct) {
      skipped.push({ row: i + 1, reason: '필수값 누락', data: r })
      continue
    }
    if (isNaN(amount)) {
      skipped.push({ row: i + 1, reason: '금액 오류', data: r })
      continue
    }

    // 음수 금액 처리
    let finalFrom = fromAcct, finalTo = toAcct, finalAmt = amount
    if (amount < 0) {
      // 원래 fromAcct가 수입 분류인 경우: 수입 반납/공제 → 음수 금액 그대로, type=income
      if (catMap.income.includes(fromAcct)) {
        finalAmt = amount  // 음수 유지
      } else {
        // 일반 음수: from↔to 교체 후 절댓값
        finalFrom = toAcct
        finalTo   = fromAcct
        finalAmt  = Math.abs(amount)
      }
    }

    const type = inferType(finalFrom, finalTo)
    records.push({ date, desc, amount: finalAmt, fromAcct: finalFrom, toAcct: finalTo, memo, type })
  }

  if (skipped.length > 0) {
    console.log(`\n⚠ 건너뛴 행 (${skipped.length}건):`)
    skipped.forEach(s => console.log(`  행 ${s.row}: ${s.reason} → ${JSON.stringify(s.data)}`))
  }

  if (records.length === 0) {
    console.log('입력할 데이터가 없습니다.')
    await p.$disconnect()
    return
  }

  // 중복 체크: 엑셀의 동일 항목 수 vs DB의 동일 항목 수 비교
  const existing = await p.transaction.findMany({
    where: { date: { in: [...new Set(records.map(r => r.date))] } }
  })

  // DB에서 각 키의 현재 개수
  const dbKeyCount = {}
  existing.forEach(t => {
    const k = `${t.date}|${t.desc}|${t.amount}|${t.fromAcct}|${t.toAcct}`
    dbKeyCount[k] = (dbKeyCount[k] ?? 0) + 1
  })

  // 엑셀에서 각 키의 개수를 세면서 DB 수를 초과하는 만큼만 허용
  const excelKeyUsed = {}
  const newRecords = []
  let dupCount = 0

  for (const r of records) {
    const k = `${r.date}|${r.desc}|${r.amount}|${r.fromAcct}|${r.toAcct}`
    excelKeyUsed[k] = (excelKeyUsed[k] ?? 0) + 1
    const dbHas = dbKeyCount[k] ?? 0
    if (excelKeyUsed[k] > dbHas) {
      newRecords.push(r)
    } else {
      dupCount++
    }
  }

  if (dupCount > 0) console.log(`\n중복 제외: ${dupCount}건`)

  if (newRecords.length === 0) {
    console.log('모두 이미 입력된 데이터입니다.')
    await p.$disconnect()
    return
  }

  // 유형별 요약
  const summary = { income: 0, expense: 0, transfer: 0, income_expense: 0 }
  newRecords.forEach(r => summary[r.type]++)
  const ieNote = summary.income_expense > 0 ? `, 수입+지출 ${summary.income_expense}` : ''
  console.log(`\n입력 예정: ${newRecords.length}건 (수입 ${summary.income}, 지출 ${summary.expense}, 이체 ${summary.transfer}${ieNote})`)

  const result = await p.transaction.createMany({ data: newRecords })
  console.log(`✓ 완료: ${result.count}건 입력됨`)
  await p.$disconnect()
}

main().catch(e => { console.error('오류:', e.message); p.$disconnect() })
