'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from '@/lib/SessionContext'
import PeriodNav from '@/components/PeriodNav'
import { usePeriod } from '@/lib/usePeriod'

type SectionSummary = {
  id: number
  name: string
  createdAt: string
  decimalPlaces: number
  currency: string
  exchangeRate: number | null
  totalAssets: number
  totalLiab: number
  netWorth: number
}

const fmt = (n: number) =>
  (n < 0 ? '-' : '') + Math.abs(n).toLocaleString() + '원'

const fmtUSD = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtAmount = (n: number, s: Pick<SectionSummary, 'currency' | 'exchangeRate'>) => {
  if (s.currency === 'USD') {
    const usd = fmtUSD(n)
    if (s.exchangeRate) {
      const krw = Math.round(Math.abs(n) * s.exchangeRate).toLocaleString()
      return { usd, krw: (n < 0 ? '-' : '') + krw + '원' }
    }
    return { usd, krw: null }
  }
  return { usd: null, krw: fmt(n) }
}

export default function SectionsPage() {
  const { refreshDecimalPlaces } = useSession()
  const period = usePeriod()
  const [sections,    setSections]    = useState<SectionSummary[]>([])
  const [loading,     setLoading]     = useState(true)
  const [currentSid,  setCurrentSid]  = useState(1)
  const [dragIndex,     setDragIndex]     = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [showModal,       setShowModal]       = useState(false)
  const [newName,         setNewName]         = useState('')
  const [createMode,      setCreateMode]      = useState<'copy' | 'fresh'>('fresh')
  const [newCurrency,     setNewCurrency]     = useState<'KRW' | 'USD'>('KRW')
  const [newExchangeRate, setNewExchangeRate] = useState('')
  const [creating,        setCreating]        = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; duplicates?: number; error?: string } | null>(null)
  const [importing,    setImporting]    = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
  const [duplicateModal, setDuplicateModal] = useState<{ count: number } | null>(null)
  const [inFileDuplicateModal, setInFileDuplicateModal] = useState<{ count: number } | null>(null)
  const [pendingDuplicatesCount, setPendingDuplicatesCount] = useState(0)
  const [pendingSkipInFileDuplicates, setPendingSkipInFileDuplicates] = useState(true)
  const [sectionSelectModal, setSectionSelectModal] = useState(false)
  const [pendingRawFiles, setPendingRawFiles] = useState<File[] | null>(null)
  const [importTargetSid, setImportTargetSid] = useState<number | null>(null)
  const [selectedImportSid, setSelectedImportSid] = useState<number | null>(null)
  const [settingsModal, setSettingsModal] = useState<{ id: number; name: string; decimalPlaces: number; currency: string; exchangeRate: number | null } | null>(null)
  const [evalTotals, setEvalTotals] = useState<Record<number, number>>({})

  const fetchEvalTotals = (sectionList: SectionSummary[], ym: string) => {
    const targets = sectionList.filter(s => s.name === '주식' || s.name === '연금')
    Promise.all(
      targets.map(s =>
        fetch(`/api/pension-eval?sessionId=${s.id}&yearMonth=${ym}`)
          .then(r => r.json())
          .then((d: { items?: { 평가액: number; hasEval: boolean }[] }) => ({
            id: s.id,
            total: (d.items ?? []).filter(i => i.hasEval).reduce((sum, i) => sum + i.평가액, 0),
          }))
      )
    ).then(results => {
      const map: Record<number, number> = {}
      results.forEach(r => { map[r.id] = r.total })
      setEvalTotals(map)
    })
  }

  const fetchData = (dateTo: string) =>
    Promise.all([
      fetch(`/api/sessions/summary?to=${dateTo}`).then(r => r.json()),
      fetch('/api/sessions').then(r => r.json()),
    ]).then(([summary, sessions]) => {
      setSections(summary)
      setCurrentSid(sessions.current ?? 1)
      setLoading(false)
      fetchEvalTotals(summary, dateTo.substring(0, 7))
    })

  useEffect(() => { fetchData(period.dateTo) }, [period.dateTo])

  const handleDragStart = (index: number) => setDragIndex(index)

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = async (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null); setDragOverIndex(null); return
    }
    const next = [...sections]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(index, 0, moved)
    setSections(next)
    setDragIndex(null); setDragOverIndex(null)
    await fetch('/api/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map(s => s.id) }),
    })
  }

  const switchSection = async (id: number) => {
    await fetch(`/api/sessions/${id}`, { method: 'POST' })
    window.location.href = '/'
  }

  const runImport = async (files: File[], skipDuplicates: boolean, skipInFileDuplicates: boolean = true, targetSid: number) => {
    setImporting(true); setImportResult(null)
    const fd = new FormData()
    files.forEach(f => fd.append('files', f))
    try {
      const res  = await fetch(`/api/import-excel?skipDuplicates=${skipDuplicates}&skipInFileDuplicates=${skipInFileDuplicates}&sid=${targetSid}`, { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        setImportResult({ imported: data.imported ?? 0, skipped: data.skipped ?? 0, duplicates: data.duplicates })
      } else {
        setImportResult({ imported: 0, skipped: 0, error: data.error ?? '가져오기에 실패했습니다' })
      }
    } catch (e) {
      setImportResult({ imported: 0, skipped: 0, error: `오류: ${e}` })
    } finally {
      setImporting(false)
      fetchData(period.dateTo)
    }
  }

  const startDryRun = async (files: File[], targetSid: number) => {
    setImporting(true); setImportResult(null)
    const fd = new FormData()
    files.forEach(f => fd.append('files', f))
    try {
      const res  = await fetch(`/api/import-excel?dryRun=true&sid=${targetSid}`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setImportResult({ imported: 0, skipped: 0, error: data.error ?? '가져오기에 실패했습니다' })
        setImporting(false)
        return
      }
      if ((data.inFileDuplicates ?? 0) > 0) {
        setPendingFiles(files)
        setPendingDuplicatesCount(data.duplicates ?? 0)
        setInFileDuplicateModal({ count: data.inFileDuplicates })
        setImporting(false)
      } else if ((data.duplicates ?? 0) > 0) {
        setPendingFiles(files)
        setDuplicateModal({ count: data.duplicates })
        setImporting(false)
      } else {
        await runImport(files, true, true, targetSid)
      }
    } catch (e) {
      setImportResult({ imported: 0, skipped: 0, error: `오류: ${e}` })
      setImporting(false)
    }
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const fileList = Array.from(files)
    e.target.value = ''
    setPendingRawFiles(fileList)
    setSelectedImportSid(currentSid)
    setSectionSelectModal(true)
  }

  const handleSectionSelected = async (targetSid: number) => {
    setSectionSelectModal(false)
    setImportTargetSid(targetSid)
    const files = pendingRawFiles
    setPendingRawFiles(null)
    if (files) await startDryRun(files, targetSid)
  }

  const handleInFileDuplicateChoice = async (skipInFileDuplicates: boolean) => {
    setInFileDuplicateModal(null)
    setPendingSkipInFileDuplicates(skipInFileDuplicates)
    if (pendingDuplicatesCount > 0) {
      setDuplicateModal({ count: pendingDuplicatesCount })
    } else {
      const files = pendingFiles
      setPendingFiles(null)
      if (files && importTargetSid !== null) await runImport(files, true, skipInFileDuplicates, importTargetSid)
    }
  }

  const handleDuplicateChoice = async (skipDuplicates: boolean) => {
    const files = pendingFiles
    setDuplicateModal(null)
    setPendingFiles(null)
    if (!files || importTargetSid === null) return
    await runImport(files, skipDuplicates, pendingSkipInFileDuplicates, importTargetSid)
  }

  const createSection = async () => {
    if (!newName.trim() || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          mode: createMode,
          currency: newCurrency,
          exchangeRate: newCurrency === 'USD' ? (Number(newExchangeRate) || null) : null,
        }),
      })
      const newSession = await res.json()
      if (!res.ok) {
        alert(`섹션 생성 실패: ${newSession.error ?? res.status}`)
        return
      }
      await fetch(`/api/sessions/${newSession.id}`, { method: 'POST' })
      window.location.href = '/'
    } catch (e) {
      alert(`오류: ${e}`)
    } finally {
      setCreating(false)
    }
  }

  const saveSettings = async () => {
    if (!settingsModal) return
    const saved = { ...settingsModal }
    await fetch(`/api/sessions/${saved.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decimalPlaces: saved.decimalPlaces,
        currency: saved.currency,
        exchangeRate: saved.exchangeRate,
      }),
    })
    setSettingsModal(null)
    setSections(prev => prev.map(s => s.id === saved.id
      ? { ...s, decimalPlaces: saved.decimalPlaces, currency: saved.currency, exchangeRate: saved.exchangeRate }
      : s
    ))
    if (saved.id === currentSid) refreshDecimalPlaces()
  }

  const toKRW = (s: SectionSummary) => s.currency === 'USD' ? (s.exchangeRate ?? 0) : 1
  const totalAssets = sections.reduce((acc, s) => acc + s.totalAssets * toKRW(s), 0)
  const totalLiab   = sections.reduce((acc, s) => acc + s.totalLiab   * toKRW(s), 0)
  const totalNet    = sections.reduce((acc, s) => acc + s.netWorth     * toKRW(s), 0)

  const hasAnyEval = sections.some(s => (evalTotals[s.id] ?? 0) > 0)
  const totalNetWithEval = sections.reduce((acc, s) => {
    const eval_ = evalTotals[s.id]
    if (eval_ !== undefined && eval_ > 0) return acc + eval_
    return acc + s.netWorth * toKRW(s)
  }, 0)

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

      {/* 기간 선택 */}
      <PeriodNav
        label={period.label} viewMode={period.viewMode} setViewMode={period.setViewMode}
        year={period.year} setYear={period.setYear}
        quarter={period.quarter} setQuarter={period.setQuarter}
        month={period.month} setMonth={period.setMonth}
        prev={period.prev} next={period.next}
      />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="space-y-4">

          {/* Import 결과 */}
          {importResult && (
            <div className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${importResult.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <i className={`ti ${importResult.error ? 'ti-alert-circle text-red-500' : 'ti-circle-check text-green-500'}`} />
              <span className={`text-xs font-medium ${importResult.error ? 'text-red-700' : 'text-green-700'}`}>
                {importResult.error
                  ? importResult.error
                  : `가져오기 완료 — ${importResult.imported}건 추가${importResult.duplicates != null ? `, 중복 ${importResult.duplicates}건` : ''}, ${importResult.skipped}건 건너뜀`}
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
                  <div className="text-right">
                    <p className={`text-[15px] font-semibold tabular-nums ${totalNet >= 0 ? 'text-[#4fe8a0]' : 'text-[#ff7070]'}`}>{fmt(totalNet)}</p>
                    {hasAnyEval && (
                      <p className={`text-[11px] tabular-nums mt-0.5 ${totalNetWithEval >= 0 ? 'text-[#a5f3d0]' : 'text-[#ffb3b3]'}`}>
                        평가 포함 {fmt(totalNetWithEval)}
                      </p>
                    )}
                  </div>
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
                {sections.map((s, i) => (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                    onClick={() => switchSection(s.id)}
                    className={`grid grid-cols-4 px-5 py-4 cursor-pointer transition-all group border-t-2
                      ${dragOverIndex === i && dragIndex !== i ? 'border-[#6b8cff]' : 'border-transparent'}
                      ${dragIndex === i ? 'opacity-40' : ''}
                      ${s.id === currentSid ? 'bg-[#6b8cff]/5' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <i
                        className="ti ti-grip-vertical text-gray-300 hover:text-gray-400 cursor-grab flex-shrink-0"
                        onClick={e => e.stopPropagation()}
                      />
                      {s.id === currentSid && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6b8cff] flex-shrink-0" />
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className={`text-[15px] font-semibold ${s.id === currentSid ? 'text-[#6b8cff]' : 'text-gray-800 group-hover:text-gray-900'}`}>
                            {s.name}
                          </p>
                          {s.currency === 'USD' && (
                            <span className="text-[10px] font-bold text-white bg-[#6b8cff] rounded px-1 py-0.5 leading-none">USD</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(s.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      {(() => { const a = fmtAmount(s.totalAssets, s); return (
                        <div className="text-right">
                          <p className="text-[15px] font-medium text-gray-800 tabular-nums">{a.usd ?? a.krw}</p>
                          {a.usd && a.krw && <p className="text-[11px] text-gray-400 tabular-nums">≈{a.krw}</p>}
                        </div>
                      )})()}
                    </div>
                    <div className="flex items-center justify-end">
                      {(() => { const a = fmtAmount(s.totalLiab, s); return (
                        <div className="text-right">
                          <p className={`text-[15px] font-medium tabular-nums ${s.totalLiab > 0 ? 'text-[#d94f4f]' : 'text-gray-400'}`}>{a.usd ?? a.krw}</p>
                          {a.usd && a.krw && <p className="text-[11px] text-gray-400 tabular-nums">≈{a.krw}</p>}
                        </div>
                      )})()}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {(() => { const a = fmtAmount(s.netWorth, s); return (
                        <div className="text-right">
                          <p className={`text-[15px] font-semibold tabular-nums ${s.netWorth >= 0 ? 'text-[#2a9d5c]' : 'text-[#d94f4f]'}`}>{a.usd ?? a.krw}</p>
                          {a.usd && a.krw && <p className="text-[11px] text-gray-400 tabular-nums">≈{a.krw}</p>}
                          {evalTotals[s.id] !== undefined && evalTotals[s.id] > 0 && (
                            <p className="text-[11px] text-[#6b8cff] tabular-nums mt-0.5">
                              평가 {fmt(evalTotals[s.id])}
                            </p>
                          )}
                        </div>
                      )})()}
                      <button
                        onClick={e => { e.stopPropagation(); setSettingsModal({ id: s.id, name: s.name, decimalPlaces: s.decimalPlaces ?? 0, currency: s.currency ?? 'KRW', exchangeRate: s.exchangeRate ?? null }) }}
                        className="p-1 rounded-md hover:bg-gray-200 text-gray-300 hover:text-gray-500 flex-shrink-0 transition-colors">
                        <i className="ti ti-settings text-xs" />
                      </button>
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
          onClick={() => { setShowModal(true); setNewName(''); setCreateMode('fresh'); setNewCurrency('KRW'); setNewExchangeRate('') }}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#1a1f2e] text-white text-[14px] font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <i className="ti ti-plus text-[14px]" />
          섹션 만들기
        </button>
      </div>

      {/* 섹션 설정 모달 */}
      {settingsModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
          onClick={() => setSettingsModal(null)}>
          <div className="bg-white rounded-2xl p-5 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-gray-800 mb-4">섹션 설정 — {settingsModal.name}</h3>
            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-2">소수점 자리수</p>
                <div className="flex gap-2">
                  {[0, 1, 2, 3].map(n => (
                    <button
                      key={n}
                      onClick={() => setSettingsModal(prev => prev ? { ...prev, decimalPlaces: n } : prev)}
                      className={`flex-1 py-2 text-[13px] font-semibold rounded-lg transition-colors
                        ${settingsModal.decimalPlaces === n
                          ? 'bg-[#1a1f2e] text-white'
                          : 'border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {n}자리
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-2">
                  예: {(1234.5678).toFixed(settingsModal.decimalPlaces).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원
                </p>
              </div>
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-2">통화</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSettingsModal(prev => prev ? { ...prev, currency: 'KRW', exchangeRate: null } : prev)}
                    className={`flex-1 py-2 text-[13px] font-semibold rounded-lg transition-colors
                      ${settingsModal.currency === 'KRW' ? 'bg-[#1a1f2e] text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    KRW (원화)
                  </button>
                  <button
                    onClick={() => setSettingsModal(prev => prev ? { ...prev, currency: 'USD' } : prev)}
                    className={`flex-1 py-2 text-[13px] font-semibold rounded-lg transition-colors
                      ${settingsModal.currency === 'USD' ? 'bg-[#6b8cff] text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    USD (달러)
                  </button>
                </div>
                {settingsModal.currency === 'USD' && (
                  <div className="mt-2">
                    <p className="text-[11px] text-gray-400 mb-1">1 USD = ___원 (환율)</p>
                    <input
                      type="number"
                      placeholder="예: 1380"
                      value={settingsModal.exchangeRate ?? ''}
                      onChange={e => setSettingsModal(prev => prev ? { ...prev, exchangeRate: Number(e.target.value) || null } : prev)}
                      className="w-full border border-gray-200 text-[14px] text-gray-800 px-3 py-2 rounded-lg outline-none focus:border-[#6b8cff] placeholder-gray-300"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setSettingsModal(null)}
                  className="flex-1 py-2 text-[13px] font-semibold border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                  취소
                </button>
                <button onClick={saveSettings}
                  className="flex-1 py-2 text-[13px] font-semibold bg-[#1a1f2e] text-white rounded-lg hover:opacity-90">
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 섹션 선택 모달 */}
      {sectionSelectModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <i className="ti ti-database-import text-[#6b8cff] text-lg" />
              <h3 className="text-[15px] font-semibold text-gray-800">가져올 섹션 선택</h3>
            </div>
            <p className="text-[13px] text-gray-500 mb-4">데이터를 가져올 섹션을 선택한 후 확인하세요.</p>
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedImportSid(s.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors flex items-center gap-2
                    ${s.id === selectedImportSid
                      ? 'bg-[#1a1f2e] text-white border border-[#1a1f2e]'
                      : s.id === currentSid
                        ? 'bg-[#6b8cff]/10 text-[#6b8cff] border border-[#6b8cff]/30 hover:bg-[#6b8cff]/20'
                        : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  {s.id === selectedImportSid
                    ? <i className="ti ti-check text-xs flex-shrink-0" />
                    : s.id === currentSid
                      ? <span className="w-1.5 h-1.5 rounded-full bg-[#6b8cff] flex-shrink-0" />
                      : <span className="w-1.5 h-1.5 flex-shrink-0" />}
                  {s.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setSectionSelectModal(false); setPendingRawFiles(null); setSelectedImportSid(null) }}
                className="flex-1 py-2 text-[13px] font-semibold border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button
                onClick={() => { if (selectedImportSid !== null) handleSectionSelected(selectedImportSid) }}
                disabled={selectedImportSid === null}
                className="flex-1 py-2 text-[13px] font-semibold bg-[#1a1f2e] text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity">
                이 섹션에 가져오기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 파일 내 중복 확인 모달 */}
      {inFileDuplicateModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <i className="ti ti-alert-triangle text-amber-500 text-lg" />
              <h3 className="text-[15px] font-semibold text-gray-800">파일 내 중복 발견</h3>
            </div>
            <p className="text-[13px] text-gray-600 mb-4">
              가져올 파일 안에 동일한 항목이 <span className="font-semibold text-gray-800">{inFileDuplicateModal.count}건</span> 중복되어 있습니다.<br />
              중복 항목을 어떻게 처리할까요?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleInFileDuplicateChoice(false)}
                className="w-full py-2 text-[13px] font-semibold bg-[#1a1f2e] text-white rounded-lg hover:opacity-90 transition-opacity">
                중복 포함하여 가져오기
              </button>
              <button
                onClick={() => handleInFileDuplicateChoice(true)}
                className="w-full py-2 text-[13px] font-semibold border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                중복 제외하고 가져오기
              </button>
              <button
                onClick={() => { setInFileDuplicateModal(null); setPendingFiles(null) }}
                className="w-full py-2 text-[13px] font-medium text-gray-400 hover:text-gray-600 transition-colors">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 중복 데이터 확인 모달 */}
      {duplicateModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <i className="ti ti-alert-triangle text-amber-500 text-lg" />
              <h3 className="text-[15px] font-semibold text-gray-800">중복 데이터 발견</h3>
            </div>
            <p className="text-[13px] text-gray-600 mb-4">
              이미 저장된 데이터와 중복되는 <span className="font-semibold text-gray-800">{duplicateModal.count}건</span>이 있습니다.<br />
              중복 데이터를 어떻게 처리할까요?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleDuplicateChoice(false)}
                className="w-full py-2 text-[13px] font-semibold bg-[#1a1f2e] text-white rounded-lg hover:opacity-90 transition-opacity">
                중복 포함하여 가져오기
              </button>
              <button
                onClick={() => handleDuplicateChoice(true)}
                className="w-full py-2 text-[13px] font-semibold border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                중복 제외하고 가져오기
              </button>
              <button
                onClick={() => { setDuplicateModal(null); setPendingFiles(null) }}
                className="w-full py-2 text-[13px] font-medium text-gray-400 hover:text-gray-600 transition-colors">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 섹션 만들기 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
          onClick={() => { setShowModal(false); setNewCurrency('KRW'); setNewExchangeRate('') }}>
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
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-2">통화</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setNewCurrency('KRW'); setNewExchangeRate('') }}
                    className={`flex-1 text-[13px] font-semibold py-2 rounded-lg transition-colors
                      ${newCurrency === 'KRW' ? 'bg-[#1a1f2e] text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    KRW (원화)
                  </button>
                  <button
                    onClick={() => setNewCurrency('USD')}
                    className={`flex-1 text-[13px] font-semibold py-2 rounded-lg transition-colors
                      ${newCurrency === 'USD' ? 'bg-[#6b8cff] text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    USD (달러)
                  </button>
                </div>
                {newCurrency === 'USD' && (
                  <div className="mt-2">
                    <p className="text-[11px] text-gray-400 mb-1">1 USD = ___원 (환율)</p>
                    <input
                      type="number"
                      placeholder="예: 1380"
                      value={newExchangeRate}
                      onChange={e => setNewExchangeRate(e.target.value)}
                      className="w-full border border-gray-200 text-[14px] text-gray-800 px-3 py-2 rounded-lg outline-none focus:border-[#6b8cff] placeholder-gray-300"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowModal(false); setNewCurrency('KRW'); setNewExchangeRate('') }}
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
