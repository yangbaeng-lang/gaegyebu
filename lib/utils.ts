/** 숫자를 "1,234,000원" 형태로 포맷 */
export const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

/** 숫자를 "120만원" 형태로 축약 */
export const fmtK = (n: number) => {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + '억원'
  if (n >= 10_000) return Math.round(n / 10_000) + '만원'
  return n.toLocaleString('ko-KR') + '원'
}

/** "2026-05" 형태의 연월 문자열 반환 */
export const toYearMonth = (year: number, month: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}`

/** 예산 대비 퍼센트 → 상태 */
export const getBudgetStatus = (pct: number): 'safe' | 'warn' | 'over' => {
  if (pct >= 100) return 'over'
  if (pct >= 80) return 'warn'
  return 'safe'
}

export const STATUS_COLOR = {
  safe: '#4a6fdb',
  warn: '#e8a020',
  over: '#d94f4f',
}

export const CAT_META: Record<string, { icon: string; color: string; bg: string }> = {
  식비:  { icon: 'ti-soup',              color: '#4a6fdb', bg: '#eef2ff' },
  교통:  { icon: 'ti-bus',               color: '#9b5cf0', bg: '#f5f0ff' },
  주거:  { icon: 'ti-home',              color: '#2a9d5c', bg: '#f0fff6' },
  의료:  { icon: 'ti-heart',             color: '#d94f4f', bg: '#fff0f0' },
  여가:  { icon: 'ti-device-gamepad',    color: '#f0a020', bg: '#fffbf0' },
  교육:  { icon: 'ti-school',            color: '#5cc8a0', bg: '#f0fdf8' },
  기타:  { icon: 'ti-dots-circle-horizontal', color: '#aaa', bg: '#f5f5f5' },
}
