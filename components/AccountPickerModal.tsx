'use client'
import { useState, useEffect, useRef } from 'react'

type Group = { label: string; opts: string[] }

type Props = {
  title: string
  value: string
  groups: Group[]
  extraOpt?: string
  onSelect: (val: string) => void
  onClose: () => void
}

export default function AccountPickerModal({ title, value, groups, extraOpt, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const allOpts = groups.flatMap(g => g.opts)
  const showExtra = extraOpt && !allOpts.includes(extraOpt)
  const q = query.trim().toLowerCase()

  const filteredGroups = groups.map(g => ({
    ...g,
    opts: q ? g.opts.filter(o => o.toLowerCase().includes(q)) : g.opts,
  })).filter(g => g.opts.length > 0)

  const showExtraFiltered = showExtra && (!q || extraOpt!.toLowerCase().includes(q))

  return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-end sm:items-center justify-center"
      onClick={onClose}>
      <div className="bg-white w-full sm:w-80 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[70vh]"
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          <h4 className="text-sm font-medium text-gray-800">{title}</h4>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
            <i className="ti ti-x text-base" />
          </button>
        </div>

        {/* 검색 */}
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 h-9 focus-within:border-blue-300 transition-colors bg-gray-50">
            <i className="ti ti-search text-gray-400 text-sm flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="계좌 검색..."
              className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                <i className="ti ti-x text-xs" />
              </button>
            )}
          </div>
        </div>

        {/* 목록 */}
        <div className="overflow-y-auto flex-1 pb-3">
          {showExtraFiltered && (
            <button type="button"
              onClick={() => { onSelect(extraOpt!); onClose() }}
              className={`w-full text-left px-5 py-2.5 text-sm transition-colors flex items-center justify-between
                ${value === extraOpt ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
              <span>{extraOpt}</span>
              {value === extraOpt && <i className="ti ti-check text-blue-500 text-sm" />}
            </button>
          )}

          {filteredGroups.length === 0 && !showExtraFiltered ? (
            <p className="text-center text-xs text-gray-400 py-8">검색 결과가 없습니다</p>
          ) : (
            filteredGroups.map(g => (
              <div key={g.label}>
                <p className="px-5 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-y border-gray-100 sticky top-0">
                  {g.label}
                </p>
                {g.opts.map(opt => (
                  <button key={opt} type="button"
                    onClick={() => { onSelect(opt); onClose() }}
                    className={`w-full text-left px-5 py-2.5 text-sm transition-colors flex items-center justify-between
                      ${value === opt ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                    <span>{opt}</span>
                    {value === opt && <i className="ti ti-check text-blue-500 text-sm" />}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
