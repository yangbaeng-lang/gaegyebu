import * as XLSX from 'xlsx'

function autoWidth(ws: XLSX.WorkSheet, data: Record<string, unknown>[]): void {
  if (!data.length) return
  const cols = Object.keys(data[0]).map(key => {
    const max = Math.max(key.length, ...data.map(r => String(r[key] ?? '').length))
    return { wch: Math.min(max + 2, 40) }
  })
  ws['!cols'] = cols
}

function makeSheet(headers: string[], rows: (string | number)[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const colWidths = headers.map((h, i) => {
    const max = Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length))
    return { wch: Math.min(max + 2, 40) }
  })
  ws['!cols'] = colWidths
  return ws
}

function download(wb: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── 거래 내역 ──────────────────────────────────────────────────
export type TxRow = {
  id: number; type: string; date: string; desc: string
  fromAcct: string; toAcct: string; amount: number; memo: string
}
const TYPE_LABEL: Record<string, string> = {
  expense: '지출', income: '수입', transfer: '이체', income_expense: '수입+지출'
}
export function exportTransactions(txs: TxRow[], label: string): void {
  const headers = ['날짜', '유형', '내용', '금액', '출처', '대상', '메모']
  const rows = txs.map(t => [
    t.date,
    TYPE_LABEL[t.type] ?? t.type,
    t.desc,
    t.amount,
    t.fromAcct,
    t.toAcct,
    t.memo,
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, makeSheet(headers, rows), '거래내역')
  download(wb, `거래내역_${label}`)
}

// ── 비용/수익 ──────────────────────────────────────────────────
export type CatItem = { name: string; amount: number }
export function exportAnalytics(
  expenseGroups: { grp: string; items: CatItem[]; groupTotal: number }[],
  incomeGroups:  { grp: string; items: CatItem[]; groupTotal: number }[],
  label: string,
): void {
  const wb = XLSX.utils.book_new()

  const expHeaders = ['대분류', '항목', '금액']
  const expRows: (string | number)[][] = []
  for (const g of expenseGroups) {
    for (const item of g.items) expRows.push([g.grp, item.name, item.amount])
    expRows.push([g.grp, '소계', g.groupTotal])
    expRows.push(['', '', ''])
  }
  XLSX.utils.book_append_sheet(wb, makeSheet(expHeaders, expRows), '지출')

  const incHeaders = ['대분류', '항목', '금액']
  const incRows: (string | number)[][] = []
  for (const g of incomeGroups) {
    for (const item of g.items) incRows.push([g.grp, item.name, item.amount])
    incRows.push([g.grp, '소계', g.groupTotal])
    incRows.push(['', '', ''])
  }
  XLSX.utils.book_append_sheet(wb, makeSheet(incHeaders, incRows), '수입')

  download(wb, `비용수익_${label}`)
}

// ── 자산/부채 ──────────────────────────────────────────────────
export type AssetRow = { name: string; type: string; kind: string; amount: number }
export function exportAssets(
  assets: AssetRow[],
  liabilities: AssetRow[],
  summary: { totalAssets: number; totalLiab: number; netWorth: number },
  label: string,
): void {
  const wb = XLSX.utils.book_new()

  const headers = ['항목명', '유형', '금액']
  const assetRows: (string | number)[][] = [
    ...assets.map(a => [a.name, a.type, a.amount]),
    ['', '합계', summary.totalAssets],
  ]
  XLSX.utils.book_append_sheet(wb, makeSheet(headers, assetRows), '자산')

  const liabRows: (string | number)[][] = [
    ...liabilities.map(l => [l.name, l.type, l.amount]),
    ['', '합계', summary.totalLiab],
  ]
  XLSX.utils.book_append_sheet(wb, makeSheet(headers, liabRows), '부채')

  const summarySheet = makeSheet(['항목', '금액'], [
    ['총 자산', summary.totalAssets],
    ['총 부채', summary.totalLiab],
    ['순자산',  summary.netWorth],
  ])
  XLSX.utils.book_append_sheet(wb, summarySheet, '요약')

  download(wb, `자산부채_${label}`)
}

// ── 예산 관리 ──────────────────────────────────────────────────
export type BudgetRow = {
  category: string; group?: string; amount: number
  spent: number; remain: number; pct: number; status: string
}
export function exportBudget(
  income: BudgetRow[],
  expense: BudgetRow[],
  label: string,
): void {
  const wb = XLSX.utils.book_new()

  const STATUS_INC: Record<string, string> = { over: '달성', warn: '진행중', safe: '미달' }
  const STATUS_EXP: Record<string, string> = { over: '초과', warn: '주의',   safe: '안전' }

  const incHeaders = ['대분류', '항목', '목표금액', '실적', '달성률', '상태']
  const incRows = income.map(b => [
    b.group ?? '', b.category, b.amount, b.spent,
    `${b.pct}%`, STATUS_INC[b.status] ?? b.status,
  ])
  XLSX.utils.book_append_sheet(wb, makeSheet(incHeaders, incRows), '수입목표')

  const expHeaders = ['항목', '예산금액', '지출', '잔여', '사용률', '상태']
  const expRows = expense.map(b => [
    b.category, b.amount, b.spent, b.remain,
    `${b.pct}%`, STATUS_EXP[b.status] ?? b.status,
  ])
  XLSX.utils.book_append_sheet(wb, makeSheet(expHeaders, expRows), '지출예산')

  download(wb, `예산관리_${label}`)
}
