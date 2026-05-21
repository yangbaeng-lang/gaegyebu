import { NextRequest, NextResponse } from 'next/server'
import prisma, { withReconnect } from '@/lib/db'

const DEFAULT_BASE_AMOUNT_2025 = 159_278_022_699

function calcBaseAmount(year: number, override?: number | null): number {
  if (override != null && override > 0) return override
  return DEFAULT_BASE_AMOUNT_2025 * Math.pow(1.1, year - 2025)
}

export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get('year') ?? new Date().getFullYear())

  const setting = await withReconnect(() =>
    prisma.performanceSetting.findUnique({ where: { year } })
  )

  const operatingProfit = setting?.operatingProfit ?? 0
  const baseAmountOverride = setting?.baseAmountOverride ?? null
  const baseAmount = calcBaseAmount(year, baseAmountOverride)
  const fund = operatingProfit * 0.1 * 1_000_000_000_000
  const payoutRate = baseAmount > 0 ? fund / baseAmount : 0

  return NextResponse.json({
    year,
    setting: {
      operatingProfit,
      baseAmountOverride,
      taxRateBH: setting?.taxRateBH ?? 0,
      taxRateAR: setting?.taxRateAR ?? 0,
      combinedTaxRateBH: setting?.combinedTaxRateBH ?? 0,
      combinedTaxRateAR: setting?.combinedTaxRateAR ?? 0,
    },
    derived: { fund, baseAmount, payoutRate },
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { year, operatingProfit, baseAmountOverride, taxRateBH, taxRateAR,
            combinedTaxRateBH, combinedTaxRateAR } = body

    const data = {
      operatingProfit: Number(operatingProfit ?? 0),
      baseAmountOverride: baseAmountOverride != null ? Number(baseAmountOverride) : null,
      taxRateBH: Number(taxRateBH ?? 0),
      taxRateAR: Number(taxRateAR ?? 0),
      combinedTaxRateBH: Number(combinedTaxRateBH ?? 0),
      combinedTaxRateAR: Number(combinedTaxRateAR ?? 0),
    }

    const setting = await withReconnect(() =>
      prisma.performanceSetting.upsert({
        where: { year: Number(year) },
        update: data,
        create: { year: Number(year), ...data },
      })
    )

    return NextResponse.json({ ok: true, setting })
  } catch (e) {
    console.error('[performance/settings POST]', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
