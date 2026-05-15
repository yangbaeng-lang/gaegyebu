import { useState, useEffect } from 'react'

export type ViewMode = 'year' | 'quarter' | 'month'

const STORAGE_KEY = 'period_state'

export function usePeriod() {
  const today = new Date()

  // 초기값은 항상 기본값 → SSR/클라이언트 불일치 방지
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [year,    setYear]    = useState(today.getFullYear())
  const [quarter, setQuarter] = useState(Math.floor(today.getMonth() / 3) + 1)
  const [month,   setMonth]   = useState(today.getMonth())
  const [hydrated, setHydrated] = useState(false)

  // 마운트 후 섹션 전환인 경우에만 localStorage에서 복원
  useEffect(() => {
    try {
      const isSectionSwitch = sessionStorage.getItem('sectionSwitch') === '1'
      if (isSectionSwitch) {
        sessionStorage.removeItem('sectionSwitch')
        const s = localStorage.getItem(STORAGE_KEY)
        if (s) {
          const p = JSON.parse(s)
          if (p.viewMode) setViewMode(p.viewMode)
          if (p.year)     setYear(p.year)
          if (p.quarter)  setQuarter(p.quarter)
          if (p.month !== undefined) setMonth(p.month)
        }
      }
    } catch {}
    setHydrated(true)
  }, [])

  // 상태 변경 시 저장 (hydration 이후에만)
  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ viewMode, year, quarter, month })) } catch {}
  }, [viewMode, year, quarter, month, hydrated])

  const label =
    viewMode === 'year'    ? `${year}년` :
    viewMode === 'quarter' ? `${year}년 Q${quarter}` :
                             `${year}년 ${month + 1}월`

  const qStart = (quarter - 1) * 3 + 1
  const qEnd   = quarter * 3

  const dateFrom =
    viewMode === 'year'    ? `${year}-01-01` :
    viewMode === 'quarter' ? `${year}-${String(qStart).padStart(2,'0')}-01` :
                             `${year}-${String(month + 1).padStart(2,'0')}-01`

  const dateTo =
    viewMode === 'year'    ? `${year}-12-31` :
    viewMode === 'quarter' ? `${year}-${String(qEnd).padStart(2,'0')}-31` :
                             `${year}-${String(month + 1).padStart(2,'0')}-31`

  const prev = () => {
    if (viewMode === 'year') {
      setYear(y => y - 1)
    } else if (viewMode === 'quarter') {
      if (quarter === 1) { setYear(y => y - 1); setQuarter(4) }
      else setQuarter(q => q - 1)
    } else {
      if (month === 0) { setYear(y => y - 1); setMonth(11) }
      else setMonth(m => m - 1)
    }
  }

  const next = () => {
    if (viewMode === 'year') {
      setYear(y => y + 1)
    } else if (viewMode === 'quarter') {
      if (quarter === 4) { setYear(y => y + 1); setQuarter(1) }
      else setQuarter(q => q + 1)
    } else {
      if (month === 11) { setYear(y => y + 1); setMonth(0) }
      else setMonth(m => m + 1)
    }
  }

  const syncFrom = (src: { viewMode: ViewMode; year: number; quarter: number; month: number }) => {
    setViewMode(src.viewMode)
    setYear(src.year)
    setQuarter(src.quarter)
    setMonth(src.month)
  }

  return { viewMode, setViewMode, year, setYear, quarter, setQuarter, month, setMonth, label, dateFrom, dateTo, prev, next, syncFrom }
}
