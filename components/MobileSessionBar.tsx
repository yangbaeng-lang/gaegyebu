'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from '@/lib/SessionContext'

type SessionItem = { id: number; name: string }

export default function MobileSessionBar() {
  const { refreshKey, switchSession: contextSwitch } = useSession()
  const [sessions,   setSessions]   = useState<SessionItem[]>([])
  const [currentSid, setCurrentSid] = useState(1)
  const [open,       setOpen]       = useState(false)

  useEffect(() => {
    fetch('/api/sessions', { cache: 'no-cache' }).then(r => r.json()).then(d => {
      setSessions(d.sessions ?? [])
      setCurrentSid(d.current ?? 1)
    })
  }, [refreshKey])

  const switchSession = async (id: number) => {
    setOpen(false)
    await contextSwitch(id)
  }

  const current = sessions.find(s => s.id === currentSid)

  return (
    <>
      {/* 섹션 표시 바 */}
      <div className="md:hidden flex items-center justify-between px-4 h-9 bg-[#1a1f2e] border-b border-white/10 flex-shrink-0">
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-white/70 active:text-white">
          <i className="ti ti-layers-subtract text-xs" />
          <span className="text-xs font-medium">{current?.name ?? '기본 섹션'}</span>
          <i className="ti ti-chevron-down text-[10px] text-white/40" />
        </button>
        <Link href="/settings"
          className="flex items-center gap-1 text-[11px] text-white/40 active:text-white/80">
          <i className="ti ti-settings text-xs" />
          <span>계정 관리</span>
        </Link>
      </div>

      {/* 섹션 선택 바텀 시트 */}
      {open && (
        <div className="md:hidden fixed inset-0 z-[200] flex flex-col justify-end"
          onClick={() => setOpen(false)}>
          <div className="bg-black/40 absolute inset-0" />
          <div className="relative bg-[#1e2436] rounded-t-2xl pb-8 pt-4 px-4"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <p className="text-xs text-white/40 font-medium uppercase tracking-wider mb-3">섹션 선택</p>
            <div className="space-y-1">
              {sessions.map(s => (
                <button key={s.id} onClick={() => switchSession(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors
                    ${s.id === currentSid
                      ? 'bg-[#6b8cff]/20 text-white'
                      : 'text-white/60 hover:bg-white/[0.06]'}`}>
                  <i className={`ti ${s.id === currentSid ? 'ti-check text-[#6b8cff]' : 'ti-circle text-white/20'} text-sm`} />
                  <span className="text-sm font-medium">{s.name}</span>
                </button>
              ))}
            </div>
            <Link href="/sections"
              className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl text-white/40 hover:bg-white/[0.06] transition-colors border-t border-white/10 pt-3"
              onClick={() => setOpen(false)}>
              <i className="ti ti-layout-list text-sm" />
              <span className="text-sm">섹션 관리</span>
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
