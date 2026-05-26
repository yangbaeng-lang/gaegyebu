'use client'
import { useState, useEffect, useCallback } from 'react'

const BASE_AMOUNT_2025 = 159_278_022_699

type ReserveEntry = { year: number; totalBonus: number; reserve: number }
type ReserveData = {
  BH: { fromPrevYear: ReserveEntry; fromPrevPrevYear: ReserveEntry; total: number }
  AR: { fromPrevYear: ReserveEntry; fromPrevPrevYear: ReserveEntry; total: number }
}

type RawSalary = {
  upcheokJun: number
  upcheokSepCur: number
  upcheokDecCur: number
  upcheokPrevFallback: number
  gibonJan: number
  gibonMax: number
}

type SalaryData = {
  cur: RawSalary
  prevBase: { upcheok: number; gibon: number }
}

type PersonOverride = { upcheok: string; gibon: string }

type PersonCalc = {
  upcheokExpected: number
  upcheokConfirmed: number | null
  gibonExpected: number
  gibonConfirmed: number | null
  basis100: number
  totalBonus: number
  reserve: number
  pension: number
  totalPayout: number  // 세전 총 지급액 (성과급 - 적립금 - 퇴직연금)
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('ko-KR')
}

function calcPerson(salary: SalaryData, payoutRate: number, override?: PersonOverride): PersonCalc {
  const { cur, prevBase } = salary

  const upcheokExpectedBase = cur.upcheokJun > 0
    ? cur.upcheokJun
    : cur.upcheokPrevFallback > 0
      ? cur.upcheokPrevFallback
      : prevBase.upcheok + 100_000
  const upcheokConfirmed = cur.upcheokSepCur > 0
    ? cur.upcheokSepCur * 2
    : cur.upcheokDecCur > 0
      ? cur.upcheokDecCur
      : null
  const overrideUpcheok = override?.upcheok ? Number(override.upcheok) : null
  const upcheokExpected = upcheokConfirmed == null && overrideUpcheok ? overrideUpcheok : upcheokExpectedBase
  const upcheokUsed = upcheokConfirmed ?? upcheokExpected

  const gibonExpectedBase = cur.gibonJan > 0 ? cur.gibonJan : prevBase.gibon * 1.06
  const gibonConfirmed = cur.gibonMax > cur.gibonJan && cur.gibonJan > 0 ? cur.gibonMax : null
  const overrideGibon = override?.gibon ? Number(override.gibon) : null
  const gibonExpected = gibonConfirmed == null && overrideGibon ? overrideGibon : gibonExpectedBase
  const gibonUsed = gibonConfirmed ?? gibonExpected

  const basis100    = upcheokUsed + gibonUsed * 0.1
  const totalBonus  = basis100 * payoutRate
  const reserve     = totalBonus * 0.2
  const pension     = (totalBonus - reserve) * 0.3
  const totalPayout = totalBonus - reserve - pension

  return { upcheokExpected, upcheokConfirmed, gibonExpected, gibonConfirmed, basis100, totalBonus, reserve, pension, totalPayout }
}

const EMPTY_SALARY: SalaryData = {
  cur: { upcheokJun: 0, upcheokSepCur: 0, upcheokDecCur: 0, upcheokPrevFallback: 0, gibonJan: 0, gibonMax: 0 },
  prevBase: { upcheok: 0, gibon: 0 },
}

function PersonCard({ name, salary, payoutRate, override, onOverrideChange }: {
  name: string
  salary: SalaryData | null
  payoutRate: number
  override: PersonOverride
  onOverrideChange: (field: 'upcheok' | 'gibon', value: string) => void
}) {
  const c = calcPerson(salary ?? EMPTY_SALARY, payoutRate, override)

  const CompareRow = ({ label, expected, confirmed, field }: {
    label: string; expected: number; confirmed: number | null; field: 'upcheok' | 'gibon'
  }) => {
    const rate = confirmed && expected > 0 ? (confirmed - expected) / expected : null
    return (
      <div className="flex items-start justify-between py-2 border-b border-white/5">
        <span className="text-white/60 text-sm">{label}</span>
        <div className="text-right">
          {confirmed != null ? (
            <>
              <div className="text-white font-medium text-sm">{fmt(confirmed)}원 <span className="text-[#6b8cff] text-xs">확정</span></div>
              <div className="text-white/40 text-xs line-through">{fmt(expected)}원</div>
              {rate != null && (
                <div className={`text-xs ${rate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {rate >= 0 ? '▲' : '▼'} {Math.abs(rate * 100).toFixed(1)}%
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-1 justify-end">
              <input
                type="number"
                value={override[field]}
                onChange={e => onOverrideChange(field, e.target.value)}
                placeholder={String(Math.round(expected))}
                className="w-32 bg-white/[0.06] text-white px-2 py-1 rounded-lg border border-white/10 outline-none focus:border-[#6b8cff] text-sm text-right"
              />
              <span className="text-white/40 text-xs">원</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const Row = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
    <div className="flex items-center justify-between py-2 border-b border-white/5">
      <span className="text-white/60 text-sm">{label}</span>
      <span className={`text-sm font-medium ${highlight ? 'text-[#6b8cff]' : 'text-white'}`}>{value}원</span>
    </div>
  )

  return (
    <div className="bg-[#252b3b] rounded-2xl p-4 flex flex-col gap-3">
      <h2 className="text-white font-bold text-base flex items-center gap-2">
        <i className="ti ti-user text-[#6b8cff]" />
        {name}
      </h2>

      <div>
        <p className="text-white/40 text-xs font-semibold uppercase mb-1">급여 기준</p>
        <CompareRow label="업적급" expected={c.upcheokExpected} confirmed={c.upcheokConfirmed} field="upcheok" />
        <CompareRow label="기본급" expected={c.gibonExpected} confirmed={c.gibonConfirmed} field="gibon" />
        <Row label="100% 기준" value={fmt(c.basis100)} highlight />
      </div>

      <div>
        <p className="text-white/40 text-xs font-semibold uppercase mb-1">성과급 계산</p>
        <Row label="성과급 합계" value={fmt(c.totalBonus)} />
        <Row label="적립금 (20%)" value={fmt(c.reserve)} />
        <Row label="퇴직연금 (성과급-적립금)×30%" value={fmt(c.pension)} />
      </div>

      <div className="flex items-center justify-between bg-[#6b8cff]/10 rounded-xl px-3 py-3 mt-1">
        <span className="text-white font-semibold text-sm">총 지급액</span>
        <span className="text-xl font-bold text-[#6b8cff]">{fmt(c.totalPayout)}원</span>
      </div>
    </div>
  )
}

export default function PerformancePage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear]     = useState(currentYear)
  const [salary, setSalary] = useState<{ BH: SalaryData; AR: SalaryData } | null>(null)
  const [reserve, setReserve] = useState<ReserveData | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [opProfit,    setOpProfit]    = useState('')
  const [baseOverride, setBaseOverride] = useState('')
  const [taxBH, setTaxBH] = useState('0')
  const [taxAR, setTaxAR] = useState('0')
  const [overrideBH, setOverrideBH] = useState<PersonOverride>({ upcheok: '', gibon: '' })
  const [overrideAR, setOverrideAR] = useState<PersonOverride>({ upcheok: '', gibon: '' })

  const fetchData = useCallback(async () => {
    const [sRes, salRes, resRes] = await Promise.all([
      fetch(`/api/performance/settings?year=${year}`),
      fetch(`/api/performance/salary?year=${year}`),
      fetch(`/api/performance/reserve?year=${year}`),
    ])
    const s   = await sRes.json()
    const sal = await salRes.json()
    const res = await resRes.json()
    setSalary(sal)
    setReserve(res)
    setOpProfit(s.setting.operatingProfit > 0 ? String(s.setting.operatingProfit) : '')
    setBaseOverride(s.setting.baseAmountOverride ? String(s.setting.baseAmountOverride / 1e8) : '')
    setTaxBH(String(s.setting.combinedTaxRateBH))
    setTaxAR(String(s.setting.combinedTaxRateAR))
    const stored = localStorage.getItem(`perfOverride_${year}`)
    if (stored) {
      const { BH, AR } = JSON.parse(stored)
      setOverrideBH(BH ?? { upcheok: '', gibon: '' })
      setOverrideAR(AR ?? { upcheok: '', gibon: '' })
    } else {
      setOverrideBH({ upcheok: '', gibon: '' })
      setOverrideAR({ upcheok: '', gibon: '' })
    }
  }, [year])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/performance/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          operatingProfit:  Number(opProfit) || 0,
          baseAmountOverride: baseOverride ? Number(baseOverride) * 1e8 : null,
          combinedTaxRateBH: Number(taxBH),
          combinedTaxRateAR: Number(taxAR),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setSaveMsg({ ok: false, text: `저장 실패: ${json.error ?? res.status}` })
      } else {
        localStorage.setItem(`perfOverride_${year}`, JSON.stringify({ BH: overrideBH, AR: overrideAR }))
        setSaveMsg({ ok: true, text: '저장됨' })
        setTimeout(() => setSaveMsg(null), 2000)
      }
      await fetchData()
    } catch (e) {
      setSaveMsg({ ok: false, text: `네트워크 오류: ${e}` })
    } finally {
      setSaving(false)
    }
  }

  const opProfitNum    = Number(opProfit) || 0
  const baseOverrideNum = baseOverride ? Number(baseOverride) * 1e8 : null
  const baseAmount = baseOverrideNum != null && baseOverrideNum > 0
    ? baseOverrideNum
    : BASE_AMOUNT_2025 * Math.pow(1.1, year - 2025)
  const fund       = opProfitNum * 0.1 * 1_000_000_000_000
  const payoutRate = baseAmount > 0 ? fund / baseAmount : 0

  const persons = [
    { key: 'BH' as const, name: '병훈', taxStr: taxBH, setTax: setTaxBH },
    { key: 'AR' as const, name: '아름', taxStr: taxAR, setTax: setTaxAR },
  ]

  return (
    <div className="flex flex-col h-full bg-[#1a1f2e]">
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="space-y-5">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h1 className="text-white font-bold text-xl flex items-center gap-2">
            <i className="ti ti-award text-[#6b8cff]" />
            성과급 계산
          </h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setYear(y => y - 1)}
              className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white">
              <i className="ti ti-chevron-left text-sm" />
            </button>
            <span className="text-white font-semibold w-14 text-center">{year}년</span>
            <button onClick={() => setYear(y => y + 1)}
              className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white">
              <i className="ti ti-chevron-right text-sm" />
            </button>
          </div>
        </div>

        {/* 성과급 재원 */}
        <div className="bg-[#252b3b] rounded-2xl p-4">
          <h2 className="text-white font-bold text-base mb-3 flex items-center gap-2">
            <i className="ti ti-building-bank text-[#6b8cff]" />
            회사 성과급 재원
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-white/50 text-xs block mb-1">영업이익 (조원)</label>
              <input type="number" step="0.01" value={opProfit}
                onChange={e => setOpProfit(e.target.value)} placeholder="예: 47.21"
                className="w-full bg-white/[0.06] text-white px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-[#6b8cff] text-sm" />
            </div>
            <div>
              <label className="text-white/50 text-xs block mb-1">기준금액 (억원, 선택)</label>
              <input type="number" step="0.01" value={baseOverride}
                onChange={e => setBaseOverride(e.target.value)} placeholder="비워두면 자동"
                className="w-full bg-white/[0.06] text-white px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-[#6b8cff] text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 rounded-xl bg-[#6b8cff] text-white font-semibold text-sm hover:bg-[#5a7aef] disabled:opacity-50 transition-colors">
              {saving ? '저장 중...' : '저장'}
            </button>
            {saveMsg && (
              <span className={`text-sm font-medium ${saveMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {saveMsg.text}
              </span>
            )}
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-white/50">재원 <span className="text-white font-medium">{fmt(fund)}원</span></span>
              <span className="text-white/50">기준금액 <span className="text-white font-medium">{fmt(baseAmount)}원</span></span>
              <span className="text-white/50">지급율 <span className="text-[#6b8cff] font-bold">{(payoutRate * 100).toFixed(1)}%</span></span>
            </div>
          </div>
        </div>

        {/* 수령액 요약 */}
        {(() => {
          const summaryBH = (() => {
            const c = calcPerson(salary?.BH ?? EMPTY_SALARY, payoutRate, overrideBH)
            const preTax = c.totalPayout + (reserve?.BH?.total ?? 0)
            const finalAmount = preTax - preTax * (Number(taxBH) / 100)
            return { finalAmount, pension: c.pension, reserve: c.reserve }
          })()
          const summaryAR = (() => {
            const c = calcPerson(salary?.AR ?? EMPTY_SALARY, payoutRate, overrideAR)
            const preTax = c.totalPayout + (reserve?.AR?.total ?? 0)
            const finalAmount = preTax - preTax * (Number(taxAR) / 100)
            return { finalAmount, pension: c.pension, reserve: c.reserve }
          })()
          const totalFinal   = summaryBH.finalAmount + summaryAR.finalAmount
          const totalPension = summaryBH.pension     + summaryAR.pension
          const totalReserve = summaryBH.reserve     + summaryAR.reserve
          return (
            <div className="bg-[#252b3b] rounded-2xl p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-4">
                {[
                  { name: '병훈', s: summaryBH, isTotal: false },
                  { name: '아름', s: summaryAR, isTotal: false },
                  { name: '합계', s: { finalAmount: totalFinal, pension: totalPension, reserve: totalReserve }, isTotal: true },
                ].map(({ name, s, isTotal }) => (
                  <div key={name} className={`flex flex-col gap-2 ${isTotal ? 'col-span-2 md:col-span-1 border-t md:border-t-0 md:border-l border-white/10 pt-3 md:pt-0 md:pl-4' : ''}`}>
                    <p className={`text-xs font-semibold ${isTotal ? 'text-[#6b8cff]' : 'text-white/40'}`}>{name}</p>
                    <div>
                      <p className="text-white/50 text-xs mb-0.5">최종 수령액 (세후)</p>
                      <p className={`font-bold text-base md:text-lg whitespace-nowrap ${isTotal ? 'text-[#6b8cff]' : 'text-white'}`}>{fmt(s.finalAmount)}원</p>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs mb-0.5">퇴직연금 적립</p>
                      <p className="text-white/70 font-semibold text-sm whitespace-nowrap">{fmt(s.pension)}원</p>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs mb-0.5">적립금 (20%)</p>
                      <p className="text-white/70 font-semibold text-sm whitespace-nowrap">{fmt(s.reserve)}원</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* 합산 수령액 */}
        <p className="text-white/40 text-xs font-semibold px-1">
          합산 수령액
          <span className="text-white/20 font-normal ml-2">총 지급액 + 적립금 수령 — 세율 입력 후 최종 수령액 확인</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {persons.map(({ key, name, taxStr, setTax }) => {
            const override = key === 'BH' ? overrideBH : overrideAR
            const c = calcPerson(salary?.[key] ?? EMPTY_SALARY, payoutRate, override)
            const reserveTotal = reserve?.[key]?.total ?? 0
            const preTax       = c.totalPayout + reserveTotal
            const tax          = preTax * (Number(taxStr) / 100)
            const finalAmount  = preTax - tax
            return (
              <div key={key} className="bg-[#252b3b] rounded-2xl p-4 flex flex-col gap-3">
                <h2 className="text-white font-bold text-base flex items-center gap-2">
                  <i className="ti ti-wallet text-[#6b8cff]" />{name}
                </h2>
                <div>
                  <p className="text-white/40 text-xs font-semibold uppercase mb-1">합산 내역</p>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-white/60 text-sm">총 지급액</span>
                    <span className="text-white text-sm font-medium">{fmt(c.totalPayout)}원</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-white/60 text-sm">적립금 수령</span>
                    <span className="text-white text-sm font-medium">{fmt(reserveTotal)}원</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-white/60 text-sm font-semibold">세전 합계</span>
                    <span className="text-white text-sm font-semibold">{fmt(preTax)}원</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-white/50 text-sm whitespace-nowrap">세율 (%)</label>
                  <input type="number" step="0.1" value={taxStr}
                    onChange={e => setTax(e.target.value)}
                    className="w-24 bg-white/[0.06] text-white px-2 py-1.5 rounded-lg border border-white/10 outline-none focus:border-[#6b8cff] text-sm" />
                  <span className="text-white/40 text-sm ml-auto">세금 {fmt(tax)}원</span>
                </div>
                <div className="flex items-center justify-between bg-[#6b8cff]/10 rounded-xl px-3 py-3">
                  <span className="text-white font-semibold text-sm">최종 수령액</span>
                  <span className="text-xl font-bold text-[#6b8cff]">{fmt(finalAmount)}원</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* 성과급 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <PersonCard name="병훈" salary={salary?.BH ?? null} payoutRate={payoutRate}
            override={overrideBH} onOverrideChange={(f, v) => setOverrideBH(p => ({ ...p, [f]: v }))} />
          <PersonCard name="아름" salary={salary?.AR ?? null} payoutRate={payoutRate}
            override={overrideAR} onOverrideChange={(f, v) => setOverrideAR(p => ({ ...p, [f]: v }))} />
        </div>

        {/* 적립금 수령 */}
        {reserve && year >= 2026 && (
          <>
            <p className="text-white/40 text-xs font-semibold px-1">
              {year}년 적립금 수령
              <span className="text-white/20 font-normal ml-2">전년도·전전년도 성과급 적립금 각 10%</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(['BH', 'AR'] as const).map(key => {
                const name = key === 'BH' ? '병훈' : '아름'
                const r = reserve[key]
                return (
                  <div key={key} className="bg-[#252b3b] rounded-2xl p-4 flex flex-col gap-3">
                    <h2 className="text-white font-bold text-base flex items-center gap-2">
                      <i className="ti ti-piggy-bank text-emerald-400" />{name}
                    </h2>
                    <div>
                      <p className="text-white/40 text-xs font-semibold uppercase mb-1">적립금 출처</p>
                      {[r.fromPrevPrevYear, r.fromPrevYear].map((entry, i) => (
                        <div key={entry.year} className="border-b border-white/5 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-white/40 text-xs">{entry.year}년 총 성과급</span>
                            <span className="text-white/50 text-xs">{fmt(entry.totalBonus)}원</span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-white/60 text-sm">{i === 0 ? '2차' : '1차'} 수령 (10%)</span>
                            <span className="text-white text-sm font-medium">{fmt(entry.reserve)}원</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between bg-emerald-400/10 rounded-xl px-3 py-3 mt-1">
                      <span className="text-white font-semibold text-sm">수령 합계</span>
                      <span className="text-xl font-bold text-emerald-400">{fmt(r.total)}원</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="text-white/25 text-xs space-y-0.5">
          <p>• 업적급: ①6월 → ②전년도9+12월 합계 → ③전년도기준+10만원 / 9월·12월 확정 시 재계산</p>
          <p>• 기본급: ①1월 → ②전년도기준×1.06 / 연내 인상 시 최고값으로 비교</p>
          <p>• 기준금액 자동 계산: 2025년 {fmt(BASE_AMOUNT_2025)}원, 연 10% 증가</p>
        </div>
      </div>
      </div>
    </div>
  )
}
