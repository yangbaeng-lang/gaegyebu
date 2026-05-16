'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

const NAV = [
  { href: '/',          icon: 'ti-pencil',     label: '거래 입력' },
  { href: '/journal',   icon: 'ti-list',       label: '거래 내역' },
  { href: '/analytics', icon: 'ti-chart-bar',  label: '비용/수익' },
  { href: '/assets',    icon: 'ti-wallet',     label: '자산/부채' },
  { href: '/budget',    icon: 'ti-target',     label: '예산 관리' },
  { href: '/charts',    icon: 'ti-chart-dots', label: '차트'     },
]

type SessionItem = { id: number; name: string }

export default function SideNav() {
  const pathname = usePathname()

  const [sessions,    setSessions]    = useState<SessionItem[]>([])
  const [currentSid,  setCurrentSid]  = useState(1)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [renamingId,  setRenamingId]  = useState<number | null>(null)
  const [confirmDelId, setConfirmDelId] = useState<number | null>(null)
  const [renameText,  setRenameText]  = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const fetchSessions = () => {
    fetch('/api/sessions').then(r => r.json()).then(d => {
      setSessions(d.sessions ?? [])
      setCurrentSid(d.current ?? 1)
    })
  }

  useEffect(() => { fetchSessions() }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const switchSession = async (id: number) => {
    await fetch(`/api/sessions/${id}`, { method: 'POST' })
    setMenuOpen(false)
    sessionStorage.setItem('sectionSwitch', '1')
    window.location.reload()
  }

  const deleteSession = async (id: number) => {
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    setConfirmDelId(null)
    fetchSessions()
    if (id === currentSid) window.location.reload()
  }

  const startRename = (s: SessionItem) => {
    setRenamingId(s.id)
    setRenameText(s.name)
  }

  const saveRename = async (id: number) => {
    if (!renameText.trim()) return
    await fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameText.trim() }),
    })
    setRenamingId(null)
    fetchSessions()
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const currentSession = sessions.find(s => s.id === currentSid)

  return (
    <aside className="hidden md:flex md:flex-col md:w-48 bg-[#1a1f2e] md:flex-shrink-0">
      {/* 타이틀 */}
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-center">
        <span className="text-white font-semibold text-[1.2rem]">자산관리</span>
      </div>

      {/* 섹션 선택기 */}
      <div ref={menuRef} className="relative px-3 py-2 border-b border-white/10">
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors text-left">
          <div className="flex items-center gap-1.5 min-w-0">
            <i className="ti ti-layers-subtract text-[14px] text-white/50 flex-shrink-0" />
            <span className="text-[14px] text-white/80 truncate font-semibold">{currentSession?.name ?? '기본 섹션'}</span>
          </div>
          <i className={`ti ${menuOpen ? 'ti-chevron-up' : 'ti-chevron-down'} text-[10px] text-white/40 flex-shrink-0`} />
        </button>

        {menuOpen && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-[#252b3b] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
            {/* 섹션 목록 */}
            <div className="py-1">
              {sessions.map(s => (
                <div key={s.id}
                  className={`flex items-center gap-1 px-2 py-1.5 mx-1 rounded-lg group cursor-pointer
                    ${s.id === currentSid ? 'bg-[#6b8cff]/20' : 'hover:bg-white/[0.06]'}`}
                  onClick={() => s.id !== currentSid && switchSession(s.id)}>
                  {renamingId === s.id ? (
                    <input
                      autoFocus
                      value={renameText}
                      onChange={e => setRenameText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveRename(s.id); if (e.key === 'Escape') setRenamingId(null) }}
                      onBlur={() => saveRename(s.id)}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 bg-white/10 text-white text-[14px] px-1.5 py-0.5 rounded outline-none min-w-0"
                    />
                  ) : (
                    <>
                      <i className={`ti ${s.id === currentSid ? 'ti-check text-[#6b8cff]' : 'ti-circle text-white/20'} text-[10px] flex-shrink-0`} />
                      <span className={`flex-1 text-[14px] truncate font-semibold ${s.id === currentSid ? 'text-white' : 'text-white/70'}`}>{s.name}</span>
                      {confirmDelId === s.id ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <span className="text-[10px] text-red-400">삭제?</span>
                          <button onClick={e => { e.stopPropagation(); deleteSession(s.id) }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/80 text-white hover:bg-red-500">예</button>
                          <button onClick={e => { e.stopPropagation(); setConfirmDelId(null) }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 hover:bg-white/20">아니오</button>
                        </div>
                      ) : (
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => { e.stopPropagation(); startRename(s) }}
                            className="w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80">
                            <i className="ti ti-pencil text-[9px]" />
                          </button>
                          {s.id !== 1 && (
                            <button
                              onClick={e => { e.stopPropagation(); setConfirmDelId(s.id) }}
                              className="w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/20 text-white/40 hover:text-red-400">
                              <i className="ti ti-trash text-[9px]" />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* 섹션관리 */}
            <div className="border-t border-white/10 px-2 py-2">
              <Link href="/sections" onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors text-[14px] font-semibold">
                <i className="ti ti-layout-list text-[14px]" />
                섹션 관리
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 네비게이션 메뉴 */}
      <nav className="flex-1 py-3">
        <p className="px-4 pb-2 text-base font-medium text-white uppercase tracking-wider">메뉴</p>
        {NAV.map(n => {
          const active = isActive(n.href)
          return (
            <Link key={n.href} href={n.href}
              className={`flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-base transition-colors relative
                ${active
                  ? 'text-white bg-[#6b8cff]'
                  : 'text-white hover:bg-white/[0.08]'
                }`}>
              <i className={`ti ${n.icon} text-base w-4 flex-shrink-0`} />
              <span className="font-semibold">{n.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/10 py-3">
        <Link href="/overview"
          className={`flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-base transition-colors
            ${pathname === '/overview'
              ? 'text-white bg-[#6b8cff]'
              : 'text-white hover:bg-white/[0.08]'
            }`}>
          <i className="ti ti-chart-area-line text-base w-4 flex-shrink-0" />
          <span className="font-semibold">전체 현황</span>
        </Link>
        <Link href="/settings"
          className={`flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-base transition-colors
            ${pathname === '/settings'
              ? 'text-white bg-[#6b8cff]'
              : 'text-white hover:bg-white/[0.08]'
            }`}>
          <i className="ti ti-settings text-base w-4 flex-shrink-0" />
          <span className="font-semibold">설정</span>
        </Link>
      </div>
    </aside>
  )
}
