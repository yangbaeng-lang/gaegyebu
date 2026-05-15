'use client'
import { useState, useRef, useEffect } from 'react'

type Group = { label: string; opts: string[] }

type Props = {
  value: string
  onChange: (val: string) => void
  groups: Group[]
  extraOpt?: string
}

export default function GroupedSelect({ value, onChange, groups, extraOpt }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const allOpts = groups.flatMap(g => g.opts)
  const showExtra = extraOpt && !allOpts.includes(extraOpt)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-xs border border-gray-200 rounded-lg px-2 h-8 hover:border-blue-300 bg-white focus:outline-none transition-colors">
        <span className={value ? 'text-gray-800 truncate' : 'text-gray-400'}>{value || '선택'}</span>
        <i className={`ti ti-chevron-${open ? 'up' : 'down'} text-gray-400 text-[10px] flex-shrink-0 ml-1`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[60] max-h-56 overflow-y-auto">
          {showExtra && (
            <button type="button"
              onClick={() => { onChange(extraOpt!); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors
                ${value === extraOpt ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
              {extraOpt}
            </button>
          )}
          {groups.map(g => g.opts.length > 0 && (
            <div key={g.label}>
              <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-y border-gray-100 sticky top-0">
                {g.label}
              </p>
              {g.opts.map(opt => (
                <button key={opt} type="button"
                  onClick={() => { onChange(opt); setOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors
                    ${value === opt ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                  {opt}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
