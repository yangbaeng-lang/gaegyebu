'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from '@/lib/SessionContext'

type Props = {
  value: number
  onChange: (val: number) => void
  className?: string
  placeholder?: string
  decimalPlaces?: number
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'>

export default function AmountInput({ value, onChange, className, placeholder, decimalPlaces: propDecimalPlaces, ...rest }: Props) {
  const { decimalPlaces: ctxDecimalPlaces } = useSession()
  const decimalPlaces = propDecimalPlaces ?? ctxDecimalPlaces

  const formatValue = useCallback((n: number) => {
    if (n === 0) return ''
    const sign = n < 0 ? '-' : ''
    const abs = Math.abs(n)
    if (decimalPlaces === 0) return sign + abs.toLocaleString('ko-KR')
    const [intStr, decStr] = abs.toFixed(decimalPlaces).split('.')
    return sign + parseInt(intStr, 10).toLocaleString('ko-KR') + '.' + decStr
  }, [decimalPlaces])

  const [raw, setRaw] = useState(() => formatValue(value))
  const lastValue = useRef(value)

  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value
      setRaw(formatValue(value))
    }
  }, [value, formatValue])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    if (input === '-') { setRaw('-'); return }
    const isNegative = input.startsWith('-')
    const body = isNegative ? input.slice(1) : input
    const sign = isNegative ? '-' : ''

    if (decimalPlaces === 0) {
      const digits = body.replace(/[^0-9]/g, '')
      if (digits === '') { setRaw(''); lastValue.current = 0; onChange(0); return }
      const num = parseInt(sign + digits, 10)
      lastValue.current = num
      setRaw(sign + parseInt(digits, 10).toLocaleString('ko-KR'))
      onChange(num)
    } else {
      const cleaned = body.replace(/[^0-9.]/g, '')
      const dotIdx = cleaned.indexOf('.')
      const intStr = dotIdx === -1 ? cleaned : cleaned.slice(0, dotIdx)
      const decStr = dotIdx === -1 ? '' : cleaned.slice(dotIdx + 1, dotIdx + 1 + decimalPlaces)
      const hasDot = body.includes('.')
      const intFormatted = intStr ? parseInt(intStr, 10).toLocaleString('ko-KR') : ''
      setRaw(hasDot ? `${sign}${intFormatted}.${decStr}` : `${sign}${intFormatted}`)
      const num = parseFloat(`${sign}${intStr || '0'}${hasDot && decStr ? '.' + decStr : ''}`) || 0
      lastValue.current = num
      onChange(num)
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={handleChange}
      placeholder={placeholder ?? '0'}
      className={className}
      {...rest}
    />
  )
}
