'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

type SectionSummary = {
  id: number
  name: string
  createdAt: string
  totalAssets: number
  totalLiab: number
  netWorth: number
}

const fmt = (n: number) =>
  (n < 0 ? '-' : '') + Math.abs(n).toLocaleString() + '원'

export default function SectionsPage() {
  const [sections,    setSections]    = useState<SectionSummary[]>([])
  const [loading,     setLoading]     = useState(true)
  const [currentSid,  setCurrentSid]  = useState(1)
  const [showModal,   setShowModal]   = useState(false)
  const [newName,     setNewName]     = useState('')
  const [createMode,  setCreateMode]  = useState<'copy' | 'fresh'>('fresh')
  const [creating,    setCreating]    = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; error?: string } | null>(null)
  const [importing,    setImporting]    = useState(false)

  const fetchData = () =>
    Promise.all([
      fetch('/api/sessions/summary').then(r => r.json()),
      fetch('/api/sessions').then(r => r.json()),
    ]).then(([summary, sessions]) => {
      setSections(summary)
      setCurrentSid(sessions.current ?? 1)
      setLoading(false)
    })

  useEffect(() => { fetchData() }, [])

  const switchSection = async (id: number) => {
    await fetch(`/api/sessions/${id}`, { method: 'POST' })
    window.location.href = '/'
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setImporting(true); setImportResult(null)
    const fd = new FormData()
    Array.from(files).forEach(f => fd.append('files', f))
    try {
      const res  = await fetch('/api/import-excel', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        setImportResult({ imported: data.imported ?? 0, skipped: data.skipped ?? 0 })
      } else {
        setImportResult({ imported: 0, skipped: 0, error: data.error ?? '가져오기에 실패했습니다' })
      }
    } catch (e) {
      setImportResult({ imported: 0, skipped: 0, error: `오류: ${e}` })
    } finally {
      setImporting(false)
      e.target.value = ''
      fetchData()
    }
  }

  const createSection = async () => {
    if (!newName.trim() || creating) return
    setCreating(true)
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), mode: createMode }),
    })
    const newSession = await res.json()
    await fetch(`/api/sessions/${newSession.id}`, { method: 'POST' })
    window.location.href = '/'
  }

  const totalAssets = sections.reduce((s, r) => s + r.totalAssets, 0)
  const totalLiab   = sections.reduce((s, r) => s + r.totalLiab,   0)
  const totalNet    = sections.reduce((s, r) => s + r.netWorth,    0)

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <i className="ti ti-arrow-left text-base" />
          </Link>
          <h1 className="text-[15px] font-semibold text-gray-800">섹션 관리</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-gray-400">{sections.length}개 섹션</span>
          <label className={`flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
            <i className="ti ti-file-import text-xs" />
            {importing ? '가져오는 중...' : '후잉 가져오기'}
            <input type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleImport} disabled={importing} />
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-[1080px] mx-auto space-y-4">

          {/* Import 결과 */}
          {importResult && (
            <div className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${importResult.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <i className={`ti ${importResult.error ? 'ti-alert-circle text-red-500' : 'ti-circle-check text-green-500'}`} />
              <span className={`text-xs font-medium ${importResult.error ? 'text-red-700' : 'text-green-700'}`}>
                {importResult.error
                  ? importResult.error
                  : `가져오기 완료 — ${importResult.imported}건 추가, ${importResult.skipped}건 건너뜀`}
              </span>
              <button onClick={() => setImportResult(null)} className={`ml-auto ${importResult.error ? 'text-red-400 hover:text-red-600' : 'text-green-400 hover:text-green-600'}`}>
                <i className="ti ti-x text-xs" />
              </button>
            </div>
          )}

          {/* 전체 합계 배너 */}
          {sections.length > 1 && (
            <div className="bg-[#1a1f2e] rounded-2xl overflow-hidden">
              <div className="grid grid-cols-4 px-5 py-[22px]">
                <div className="flex items-center">
                  <p className="text-[15px] font-semibold text-white">전체 합계</p>
                </div>
                <div className="flex items-center justify-end">
                  <p className="text-[15px] font-semibold text-white tabular-nums">{fmt(totalAssets)}</p>
                </div>
                <div className="flex items-center justify-end">
                  <p className="text-[15px] font-semibold text-[#ff7070] tabular-nums">{fmt(totalLiab)}</p>
                </div>
                <div className="flex items-center justify-end">
                  <p className={`text-[15px] font-semibold tabular-nums ${totalNet >= 0 ? 'text-[#4fe8a0]' : 'text-[#ff7070]'}`}>{fmt(totalNet)}</p>
                </div>
              </div>
            </div>
          )}

          {/* 섹션 목록 테이블 */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="px-5 py-10 text-center text-[13px] text-gray-300">불러오는 중...</div>
            ) : sections.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-gray-300">섹션이 없습니다</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {sections.map(s => (
                  <div
                    key={s.id}
                    onClick={() => switchSection(s.id)}
                    className={`grid grid-cols-4 px-5 py-4 cursor-pointer transition-colors group
                      ${s.id === currentSid ? 'bg-[#6b8cff]/5' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      {s.id === currentSid && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6b8cff] flex-shrink-0" />
                      )}
                      <div className={s.id !== currentSid ? 'pl-3.5' : ''}>
                        <p className={`text-[15px] font-semibold ${s.id === currentSid ? 'text-[#6b8cff]' : 'text-gray-800 group-hover:text-gray-900'}`}>
                          {s.name}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(s.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <p className="text-[15px] font-medium text-gray-800 tabular-nums">{fmt(s.totalAssets)}</p>
                    </div>
                    <div className="flex items-center justify-end">
                      <p className={`text-[15px] font-medium tabular-nums ${s.totalLiab > 0 ? 'text-[#d94f4f]' : 'text-gray-400'}`}>{fmt(s.totalLiab)}</p>
                    </div>
                    <div className="flex items-center justify-end">
                      <p className={`text-[15px] font-semibold tabular-nums ${s.netWorth >= 0 ? 'text-[#2a9d5c]' : 'text-[#d94f4f]'}`}>{fmt(s.netWorth)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[12px] text-gray-400 text-center">섹션을 클릭하면 해당 섹션으로 전환됩니다</p>
        </div>
      </div>

      {/* 섹션 만들기 버튼 */}
      <div className="flex justify-center py-4 border-t border-gray-100 bg-white flex-shrink-0">
        <button
          onClick={() => { setShowModal(true); setNewName(''); setCreateMode('fresh') }}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#1a1f2e] text-white text-[14px] font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <i className="ti ti-plus text-[14px]" />
          섹션 만들기
        </button>
      </div>

      {/* 섹션 만들기 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
          onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-gray-800 mb-4">섹션 만들기</h3>
            <div className="space-y-3">
              <input
                autoFocus
                placeholder="섹션 이름"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createSection()}
                className="w-full border border-gray-200 text-[14px] text-gray-800 px-3 py-2 rounded-lg outline-none focus:border-blue-300 placeholder-gray-300"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setCreateMode('fresh')}
                  className={`flex-1 text-[13px] font-semibold py-2 rounded-lg transition-colors
                    ${createMode === 'fresh' ? 'bg-[#1a1f2e] text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  초기화
                </button>
                <button
                  onClick={() => setCreateMode('copy')}
                  className={`flex-1 text-[13px] font-semibold py-2 rounded-lg transition-colors
                    ${createMode === 'copy' ? 'bg-[#1a1f2e] text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  데이터 복사
                </button>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 py-2 text-[13px] font-semibold border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                  취소
                </button>
                <button onClick={createSection} disabled={creating}
                  className="flex-1 py-2 text-[13px] font-semibold bg-[#1a1f2e] text-white rounded-lg hover:opacity-90 disabled:opacity-50">
                  {creating ? '생성 중...' : '만들기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
