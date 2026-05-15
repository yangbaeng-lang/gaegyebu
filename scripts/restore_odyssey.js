/**
 * 오딧세이 거래 내역 복원 스크립트
 * - 삭제된 오딧세이 계정으로 인해 fromAcct/toAcct가 ''로 초기화된 거래를 복원
 * - 매칭 안 되는 건은 신규 입력
 */
const { PrismaClient } = require('@prisma/client')
const XLSX = require('xlsx')

const FILES = [
  "F:\\One Drive\\OneDrive - SK Hynix Inc\\후잉 거래 내역\\(현금성 자산) 거래내역-20190101~20191231_xlsx-20190101~20191231-31843.xlsx",
  "F:\\One Drive\\OneDrive - SK Hynix Inc\\후잉 거래 내역\\(현금성 자산) 거래내역-20200101~20201231_xlsx-20200101~20201231-32408.xlsx",
  "F:\\One Drive\\OneDrive - SK Hynix Inc\\후잉 거래 내역\\(현금성 자산) 거래내역-20210101~20211231_xlsx-20210101~20211231-32639.xlsx",
  "F:\\One Drive\\OneDrive - SK Hynix Inc\\후잉 거래 내역\\(현금성 자산) 거래내역-20220101~20221231_xlsx-20220101~20221231-33128.xlsx",
  "F:\\One Drive\\OneDrive - SK Hynix Inc\\후잉 거래 내역\\(현금성 자산) 거래내역-20230101~20231231_xlsx-20230101~20231231-33258.xlsx",
  "F:\\One Drive\\OneDrive - SK Hynix Inc\\후잉 거래 내역\\(현금성 자산) 거래내역-20240101~20241231_xlsx-20240101~20241231-35422.xlsx",
  "F:\\One Drive\\OneDrive - SK Hynix Inc\\후잉 거래 내역\\(현금성 자산) 거래내역-20250101~20251231_xlsx-20250101~20251231-35588.xlsx",
  "F:\\One Drive\\OneDrive - SK Hynix Inc\\후잉 거래 내역\\(현금성 자산) 거래내역-20260101~20261231_xlsx-20260101~20261231-81897.xlsx",
]

const p = new PrismaClient()

function inferType(from, to, catMap) {
  if (catMap.networth.includes(from) || catMap.networth.includes(to)) return 'transfer'
  if (catMap.income.includes(from) && catMap.expense.includes(to)) return 'income_expense'
  if (catMap.expense.includes(to))  return 'expense'
  if (catMap.income.includes(from)) return 'income'
  return 'transfer'
}

async function main() {
  const cats = await p.category.findMany()
  const byType = (type) => cats.filter(c => c.type === type && c.name !== '__group__').map(c => c.name)
  const catMap = {
    account_asset:     byType('account_asset'),
    account_liability: byType('account_liability'),
    expense:           byType('expense'),
    income:            byType('income'),
    networth:          byType('networth'),
  }

  let totalUpdated = 0
  let totalInserted = 0
  let totalSkipped = 0

  for (const filePath of FILES) {
    const year = filePath.match(/(\d{4})0101/)?.[1] ?? '?'
    const wb = XLSX.readFile(filePath)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (rows.length < 2) continue

    const header = rows[0]
    if (String(header[0]).includes('시작일') || String(header[2]).includes('계정')) continue
    const is9col = header.length >= 8 && String(header[3]).includes('합계')
    if (!is9col) continue

    // 오딧세이가 포함된 행만 필터
    const odysseyRows = []
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      const toAcct   = String(r[5] || '').trim()
      const fromAcct = String(r[7] || '').trim()
      if (toAcct === '오딧세이' || fromAcct === '오딧세이') {
        odysseyRows.push(r)
      }
    }

    if (odysseyRows.length === 0) continue
    console.log(`\n[${year}년] 오딧세이 관련 ${odysseyRows.length}건 처리 중...`)

    for (const r of odysseyRows) {
      const date   = String(r[0] || '').trim()
      const desc   = String(r[1] || '').trim()
      const amount = Number(r[2])
      let toAcct   = String(r[5] || '').trim()
      let fromAcct = String(r[7] || '').trim()
      const memo   = String(r[8] || '').trim()
      if (!date || !desc || isNaN(amount)) continue

      // 음수 처리
      let finalFrom = fromAcct, finalTo = toAcct, finalAmt = amount
      if (amount < 0) {
        if (catMap.income.includes(fromAcct)) {
          finalAmt = amount
        } else {
          finalFrom = toAcct; finalTo = fromAcct; finalAmt = Math.abs(amount)
        }
      }

      const type = inferType(finalFrom, finalTo, catMap)

      // 오딧세이가 finalFrom인 경우: DB에서 fromAcct='' AND toAcct=finalTo 인 레코드 찾기
      // 오딧세이가 finalTo인 경우: DB에서 toAcct='' AND fromAcct=finalFrom 인 레코드 찾기
      let matched = null

      if (finalFrom === '오딧세이') {
        matched = await p.transaction.findFirst({
          where: { date, desc, amount: finalAmt, fromAcct: '', toAcct: finalTo }
        })
      } else if (finalTo === '오딧세이') {
        matched = await p.transaction.findFirst({
          where: { date, desc, amount: finalAmt, fromAcct: finalFrom, toAcct: '' }
        })
      }

      if (matched) {
        await p.transaction.update({
          where: { id: matched.id },
          data: { fromAcct: finalFrom, toAcct: finalTo, type }
        })
        console.log(`  ✓ 복원: [${date}] ${desc} ${finalAmt.toLocaleString()}원 (${finalFrom} → ${finalTo})`)
        totalUpdated++
      } else {
        // 이미 정상적으로 존재하는지 확인
        const exists = await p.transaction.findFirst({
          where: { date, desc, amount: finalAmt, fromAcct: finalFrom, toAcct: finalTo }
        })
        if (exists) {
          totalSkipped++
        } else {
          await p.transaction.create({ data: { date, desc, amount: finalAmt, fromAcct: finalFrom, toAcct: finalTo, memo, type } })
          console.log(`  + 신규: [${date}] ${desc} ${finalAmt.toLocaleString()}원 (${finalFrom} → ${finalTo})`)
          totalInserted++
        }
      }
    }
  }

  console.log(`\n완료: 복원 ${totalUpdated}건, 신규 ${totalInserted}건, 중복제외 ${totalSkipped}건`)
  await p.$disconnect()
}

main().catch(e => { console.error('오류:', e.message); p.$disconnect() })
