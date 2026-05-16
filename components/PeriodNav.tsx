'use client'
import { useState, useRef, useEffect } from 'react'
import { ViewMode } from '@/lib/usePeriod'

const MONTHS   = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
const QUARTERS = ['Q1','Q2','Q3','Q4']

type Props = {
  label:       string
  viewMode:    ViewMode
  setViewMode: (m: ViewMode) => void
  year:        number
  setYear:     (y: number) => void
  quarter:     number
  setQuarter:  (q: number) => void
  month:       number
  setMonth:    (m: number) => void
  prev:        () => void
  next:        () => void
  children?:   React.ReactNode
}

export default function PeriodNav({ viewMode, setViewMode, label, year, setYear, quarter, setQuarter, month, setMonth, prev, next, children }: Props) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const [pickerYear, setPickerYear] = useState(year)
  const handleOpen = () => { setPickerYear(year); setOpen(o => !o) }

  const selectMonth   = (m: number) => { setYear(pickerYear); setMonth(m);    setOpen(false) }
  const selectQuarter = (q: number) => { setYear(pickerYear); setQuarter(q); setOpen(false) }
  const selectYear    = (y: number) => { setYear(y);                          setOpen(false) }

  return (
    <div className="relative bg-white border-b border-gray-100 px-3 md:px-5 h-[60px] flex items-center flex-shrink-0">

      {/* 모드 탭 — 좌측 */}
      <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
        {(['year', 'quarter', 'month'] as const).map(m => (
          <button key={m} onClick={() => setViewMode(m)}
            className={`text-[12px] md:text-[14px] px-2 md:px-2.5 py-0.5 rounded-md transition-all
              ${viewMode === m ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
            {m === 'year' ? <><span className="md:hidden">연도</span><span className="hidden md:inline">연도별</span></> : m === 'quarter' ? <><span className="md:hidden">분기</span><span className="hidden md:inline">분기별</span></> : <><span className="md:hidden">월</span><span className="hidden md:inline">월별</span></>}
          </button>
        ))}
      </div>

      {/* 이전/레이블/다음 — CSS 절대 중앙 (JS 측정 없음) */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 md:gap-2">
        <button onClick={prev} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
          <i className="ti ti-chevron-left text-sm md:text-base" />
        </button>

        <div ref={pickerRef} className="relative">
          <button onClick={handleOpen}
            className="text-[13px] md:text-[14px] font-medium text-gray-700 min-w-[90px] md:min-w-[110px] text-center px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
            {label}
          </button>

          {open && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50 w-52">
              <div className="flex items-center justify-between mb-2.5">
                <button onClick={() => setPickerYear(y => y - 1)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500">
                  <i className="ti ti-chevron-left text-xs" />
                </button>
                <span className="text-sm font-semibold text-gray-800">{pickerYear}년</span>
                <button onClick={() => setPickerYear(y => y + 1)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500">
                  <i className="ti ti-chevron-right text-xs" />
                </button>
              </div>

              {viewMode === 'year' && (
                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: 9 }, (_, i) => pickerYear - 4 + i).map(y => (
                    <button key={y} onClick={() => selectYear(y)}
                      className={`text-xs py-1.5 rounded-lg transition-colors
                        ${year === y ? 'bg-[#1a1f2e] text-white font-medium' : 'hover:bg-gray-100 text-gray-700'}`}>
                      {y}년
                    </button>
                  ))}
                </div>
              )}
              {viewMode === 'quarter' && (
                <div className="grid grid-cols-2 gap-1.5">
                  {QUARTERS.map((q, i) => (
                    <button key={i} onClick={() => selectQuarter(i + 1)}
                      className={`text-sm py-2 rounded-lg transition-colors
                        ${year === pickerYear && quarter === i + 1 ? 'bg-[#1a1f2e] text-white font-medium' : 'hover:bg-gray-100 text-gray-700'}`}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {viewMode === 'month' && (
                <div className="grid grid-cols-4 gap-1">
                  {MONTHS.map((m, i) => (
                    <button key={i} onClick={() => selectMonth(i)}
                      className={`text-xs py-1.5 rounded-lg transition-colors
                        ${year === pickerYear && month === i ? 'bg-[#1a1f2e] text-white font-medium' : 'hover:bg-gray-100 text-gray-700'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button onClick={next} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
          <i className="ti ti-chevron-right text-sm md:text-base" />
        </button>
      </div>

      {/* children — 우측 */}
      {children && (
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {children}
        </div>
      )}

    </div>
  )
}
