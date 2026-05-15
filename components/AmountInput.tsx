'use client'
import { useState, useEffect, useRef } from 'react'

type Props = {
  value: number
  onChange: (val: number) => void
  className?: string
  placeholder?: string
}

export default function AmountInput({ value, onChange, className, placeholder }: Props) {
  const [raw, setRaw] = useState(() => value === 0 ? '' : value.toLocaleString('ko-KR'))
  const lastValue = useRef(value)

  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value
      setRaw(value === 0 ? '' : value.toLocaleString('ko-KR'))
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    if (input === '-') {
      setRaw('-')
      return
    }
    const isNegative = input.startsWith('-')
    const digits = input.replace(/[^0-9]/g, '')
    if (digits === '') {
      setRaw('')
      lastValue.current = 0
      onChange(0)
      return
    }
    const num = parseInt((isNegative ? '-' : '') + digits, 10)
    lastValue.current = num
    setRaw((isNegative ? '-' : '') + parseInt(digits, 10).toLocaleString('ko-KR'))
    onChange(num)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={handleChange}
      placeholder={placeholder ?? '0'}
      className={className}
    />
  )
}
