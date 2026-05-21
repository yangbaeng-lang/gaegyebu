import prisma from '@/lib/db'

export const BASE_AMOUNT_2025 = 159_278_022_699

export type RawSalary = {
  upcheokJun: number
  upcheokSepCur: number
  upcheokDecCur: number
  upcheokPrevFallback: number
  gibonJan: number
  gibonMax: number
}

export async function fetchRaw(sessionId: number, year: number): Promise<RawSalary> {
  const prevYear = year - 1

  const [junRows, sepCurRows, decCurRows, sepPrevRows, decPrevRows, janRows, yearRows] = await Promise.all([
    prisma.transaction.findMany({ where: { sessionId, type: 'income', fromAcct: '업적급', date: { gte: `${year}-06-01`, lte: `${year}-06-30` } } }),
    prisma.transaction.findMany({ where: { sessionId, type: 'income', fromAcct: '업적급', date: { gte: `${year}-09-01`, lte: `${year}-09-30` } } }),
    prisma.transaction.findMany({ where: { sessionId, type: 'income', fromAcct: '업적급', date: { gte: `${year}-12-01`, lte: `${year}-12-31` } } }),
    prisma.transaction.findMany({ where: { sessionId, type: 'income', fromAcct: '업적급', date: { gte: `${prevYear}-09-01`, lte: `${prevYear}-09-30` } } }),
    prisma.transaction.findMany({ where: { sessionId, type: 'income', fromAcct: '업적급', date: { gte: `${prevYear}-12-01`, lte: `${prevYear}-12-31` } } }),
    prisma.transaction.findMany({ where: { sessionId, type: 'income', fromAcct: '기본급', date: { gte: `${year}-01-01`, lte: `${year}-01-31` } } }),
    prisma.transaction.findMany({ where: { sessionId, type: 'income', fromAcct: '기본급', date: { gte: `${year}-01-01`, lte: `${year}-12-31` } } }),
  ])

  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0)
  const max = (rows: { amount: number }[]) => rows.reduce((m, r) => Math.max(m, r.amount), 0)

  return {
    upcheokJun:          sum(junRows),
    upcheokSepCur:       sum(sepCurRows),
    upcheokDecCur:       sum(decCurRows),
    upcheokPrevFallback: sum(sepPrevRows) + sum(decPrevRows),
    gibonJan:            sum(janRows),
    gibonMax:            max(yearRows),
  }
}

// 해당 연도의 최종 업적급·기본급을 재귀적으로 계산
// (DB에 데이터 없는 연도도 전년도 계산값 기반으로 추정)
async function computeFinalBase(
  sessionId: number,
  year: number,
  depth = 0,
): Promise<{ upcheok: number; gibon: number }> {
  if (depth > 8 || year < 2025) return { upcheok: 0, gibon: 0 }

  const [curRaw, prevBase] = await Promise.all([
    fetchRaw(sessionId, year),
    computeFinalBase(sessionId, year - 1, depth + 1),
  ])

  const { upcheokUsed, gibonUsed } = calcUpcheokAndGibon(curRaw, prevBase)
  return { upcheok: upcheokUsed, gibon: gibonUsed }
}

export async function querySalary(sessionId: number, year: number) {
  const [curRaw, prevBase] = await Promise.all([
    fetchRaw(sessionId, year),
    computeFinalBase(sessionId, year - 1),
  ])
  return { cur: curRaw, prevBase }
}

export function calcUpcheokAndGibon(cur: RawSalary, prevBase: { upcheok: number; gibon: number }) {
  const upcheokExpected = cur.upcheokJun > 0
    ? cur.upcheokJun
    : cur.upcheokPrevFallback > 0
      ? cur.upcheokPrevFallback
      : prevBase.upcheok + 100_000
  const upcheokConfirmed = cur.upcheokSepCur > 0
    ? cur.upcheokSepCur * 2
    : cur.upcheokDecCur > 0
      ? cur.upcheokDecCur
      : null
  const upcheokUsed = upcheokConfirmed ?? upcheokExpected

  const gibonExpected = cur.gibonJan > 0 ? cur.gibonJan : prevBase.gibon * 1.06
  const gibonConfirmed = cur.gibonMax > cur.gibonJan && cur.gibonJan > 0 ? cur.gibonMax : null
  const gibonUsed = gibonConfirmed ?? gibonExpected

  return { upcheokUsed, gibonUsed }
}

export function calcPayoutRate(opProfit: number, baseAmountOverride: number | null | undefined, year: number) {
  const baseAmount = (baseAmountOverride ?? 0) > 0
    ? baseAmountOverride!
    : BASE_AMOUNT_2025 * Math.pow(1.1, year - 2025)
  const fund = opProfit * 0.1 * 1_000_000_000_000
  return baseAmount > 0 ? fund / baseAmount : 0
}

export async function computeTotalBonus(sessionId: number, year: number): Promise<number> {
  const [salaryData, setting] = await Promise.all([
    querySalary(sessionId, year),
    // 해당 연도 설정이 없으면 가장 최근 저장된 설정을 폴백으로 사용
    prisma.performanceSetting.findFirst({
      where: { year: { lte: year } },
      orderBy: { year: 'desc' },
    }),
  ])

  const opProfit = setting?.operatingProfit ?? 0
  if (opProfit === 0) return 0

  // 지급율은 target year 기준금액으로 계산 (설정 연도가 달라도 year 기준 적용)
  const payoutRate = calcPayoutRate(opProfit, setting?.baseAmountOverride, year)
  const { upcheokUsed, gibonUsed } = calcUpcheokAndGibon(salaryData.cur, salaryData.prevBase)
  const basis100 = upcheokUsed + gibonUsed * 0.1
  return basis100 * payoutRate
}
