'use client'
import { useState, useEffect, useRef } from 'react'
import { useSession } from '@/lib/SessionContext'

type Memo = {
  id: number
  sessionId: number
  date: string
  title: string
  content: string
  starred: boolean
  createdAt: string
  updatedAt: string
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = DOW[new Date(y, m - 1, d).getDay()]
  return `${y}. ${m}. ${d}. (${dow})`
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function MemoPage() {
  const { refreshKey, currentSid } = useSession()

  const [unlocked, setUnlocked]         = useState(false)
  const [pwInput, setPwInput]           = useState('')
  const [pwError, setPwError]           = useState(false)
  const [pwChecking, setPwChecking]     = useState(false)
  const pwRef                           = useRef<HTMLInputElement>(null)

  const PAGE_SIZE = 13

  const [memos, setMemos]               = useState<Memo[]>([])
  const [page, setPage]                 = useState(0)
  const [loading, setLoading]           = useState(true)
  const [modal, setModal]               = useState<'new' | 'edit' | null>(null)
  const [selected, setSelected]         = useState<Memo | null>(null)
  const [formDate, setFormDate]         = useState('')
  const [formTitle, setFormTitle]       = useState('')
  const [formContent, setFormContent]   = useState('')
  const [saving, setSaving]             = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [toast, setToast]               = useState('')

  useEffect(() => {
    if (sessionStorage.getItem('memo_unlocked') === '1') {
      setUnlocked(true)
    } else {
      setTimeout(() => pwRef.current?.focus(), 50)
    }
  }, [])

  const handleUnlock = async () => {
    if (!pwInput) return
    setPwChecking(true)
    setPwError(false)
    try {
      const res = await fetch('/api/auth/memo', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: pwInput }),
      })
      if (res.ok) {
        sessionStorage.setItem('memo_unlocked', '1')
        setUnlocked(true)
      } else {
        setPwError(true)
        setPwInput('')
        setTimeout(() => pwRef.current?.focus(), 50)
      }
    } finally {
      setPwChecking(false)
    }
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }

  const fetchMemos = async (keepPage = false) => {
    setLoading(true)
    try {
      const res  = await fetch('/api/memos')
      const data = await res.json()
      setMemos(data)
      if (!keepPage) setPage(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMemos() }, [refreshKey, currentSid])

  const openNewModal = () => {
    setFormDate(todayStr())
    setFormTitle('')
    setFormContent('')
    setSelected(null)
    setModal('new')
  }

  const openEditModal = (memo: Memo) => {
    setFormDate(memo.date)
    setFormTitle(memo.title)
    setFormContent(memo.content)
    setSelected(memo)
    setModal('edit')
  }

  const closeModal = () => {
    setModal(null)
    setSelected(null)
  }

  const handleSave = async () => {
    if (!formDate) return
    setSaving(true)
    try {
      if (modal === 'new') {
        await fetch('/api/memos', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ date: formDate, title: formTitle, content: formContent }),
        })
      } else if (selected) {
        await fetch(`/api/memos/${selected.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ date: formDate, title: formTitle, content: formContent }),
        })
      }
      closeModal()
      showToast('저장되었습니다')
      fetchMemos()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    await fetch(`/api/memos/${id}`, { method: 'DELETE' })
    setConfirmDeleteId(null)
    showToast('삭제되었습니다')
    const remaining = memos.length - 1
    const maxPage = Math.max(0, Math.ceil(remaining / PAGE_SIZE) - 1)
    if (page > maxPage) setPage(maxPage)
    fetchMemos(true)
  }

  const toggleStarred = async (e: React.MouseEvent, memo: Memo) => {
    e.stopPropagation()
    const next = !memo.starred
    setMemos(prev =>
      [...prev.map(m => m.id === memo.id ? { ...m, starred: next } : m)]
        .sort((a, b) => {
          if (a.starred !== b.starred) return a.starred ? -1 : 1
          if (a.date !== b.date) return b.date.localeCompare(a.date)
          return b.createdAt.localeCompare(a.createdAt)
        })
    )
    await fetch(`/api/memos/${memo.id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ starred: next }),
    })
  }

  if (!unlocked) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-xs mx-4 flex flex-col items-center gap-5">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <i className="ti ti-lock text-2xl text-gray-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-800">비공개 메모</p>
            <p className="text-xs text-gray-400 mt-1">비밀번호를 입력하세요</p>
          </div>
          <div className="w-full">
            <input
              ref={pwRef}
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false) }}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              placeholder="비밀번호"
              className={`w-full text-sm border rounded-lg px-3 h-10 focus:outline-none text-center tracking-widest transition-colors ${
                pwError ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-blue-400'
              }`}
            />
            {pwError && (
              <p className="text-xs text-red-400 text-center mt-1.5">비밀번호가 틀렸습니다</p>
            )}
          </div>
          <button
            onClick={handleUnlock}
            disabled={!pwInput || pwChecking}
            className="w-full py-2.5 text-sm bg-[#1a1f2e] text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {pwChecking ? '확인 중...' : '입장'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-5 h-10 flex items-center flex-shrink-0 gap-3">
        <span className="text-sm font-medium text-gray-800 flex-1">메모</span>
        <button
          onClick={openNewModal}
          title="새 메모 작성"
          className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          <i className="ti ti-edit text-base" />
        </button>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-300 text-sm">
            불러오는 중...
          </div>
        ) : memos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-300">
            <i className="ti ti-notes text-4xl mb-2" />
            <p className="text-sm">메모가 없습니다</p>
            <p className="text-xs mt-1">우측 상단 버튼으로 새 메모를 추가하세요</p>
          </div>
        ) : (
          <>
          <div className="space-y-2 max-w-2xl mx-auto">
            {memos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(memo => (
              <div
                key={memo.id}
                onClick={() => { if (confirmDeleteId !== memo.id) openEditModal(memo) }}
                className={`border rounded-xl px-4 py-3 cursor-pointer transition-all group ${
                  memo.starred
                    ? 'bg-amber-50 border-amber-200 hover:border-amber-300 hover:shadow-sm'
                    : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* 즐겨찾기 아이콘 */}
                  <button
                    onClick={e => toggleStarred(e, memo)}
                    className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors ${
                      memo.starred
                        ? 'text-amber-400 hover:text-amber-300'
                        : 'text-gray-300 hover:text-amber-400 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <i className={`ti ${memo.starred ? 'ti-star-filled' : 'ti-star'} text-sm`} />
                  </button>

                  {/* 날짜 */}
                  <span className={`text-xs flex-shrink-0 ${memo.starred ? 'text-amber-600' : 'text-gray-400'}`}>
                    {formatDate(memo.date)}
                  </span>

                  {/* 제목 */}
                  {memo.title && (
                    <span className={`text-sm font-medium truncate ${memo.starred ? 'text-amber-900' : 'text-gray-800'}`}>
                      {memo.title}
                    </span>
                  )}

                  {/* 우측 여백 + 삭제 버튼 */}
                  <div className="ml-auto flex-shrink-0">
                    {confirmDeleteId !== memo.id ? (
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDeleteId(memo.id) }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50"
                      >
                        <i className="ti ti-trash text-xs" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <span className="text-xs text-red-400">삭제?</span>
                        <button
                          onClick={() => handleDelete(memo.id)}
                          className="text-xs px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          예
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs px-2 py-0.5 border border-gray-200 text-gray-500 rounded hover:bg-gray-50"
                        >
                          아니오
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* 페이지 컨트롤 */}
          {memos.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 mt-4 max-w-2xl mx-auto">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <i className="ti ti-chevron-left text-sm" />
              </button>
              <span className="text-xs text-gray-400 tabular-nums">
                {page + 1} / {Math.ceil(memos.length / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setPage(p => Math.min(Math.ceil(memos.length / PAGE_SIZE) - 1, p + 1))}
                disabled={page >= Math.ceil(memos.length / PAGE_SIZE) - 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <i className="ti ti-chevron-right text-sm" />
              </button>
            </div>
          )}
          </>
        )}
      </div>

      {/* 모달 */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-gray-800">
                {modal === 'new' ? '새 메모' : '메모 수정'}
              </h2>
              <button
                onClick={closeModal}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <i className="ti ti-x text-sm" />
              </button>
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">날짜</label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 h-9 focus:outline-none focus:border-blue-400 bg-white"
              />
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">제목</label>
              <input
                type="text"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="제목을 입력하세요 (선택)"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 h-9 focus:outline-none focus:border-blue-400"
              />
            </div>

            <div className="mb-5">
              <label className="text-xs text-gray-500 block mb-1">내용</label>
              <textarea
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                rows={8}
                placeholder="메모 내용을 입력하세요..."
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400 resize-none leading-relaxed"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formDate}
                className="flex-1 py-2 text-xs bg-[#1a1f2e] text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
