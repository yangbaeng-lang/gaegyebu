'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const MAIN_NAV = [
  { href: '/',          icon: 'ti-pencil',     label: '거래 입력' },
  { href: '/journal',   icon: 'ti-list',       label: '거래 내역' },
  { href: '/analytics', icon: 'ti-chart-bar',  label: '비용/수익' },
  { href: '/assets',    icon: 'ti-wallet',     label: '자산/부채' },
  { href: '/budget',    icon: 'ti-target',     label: '예산 관리' },
]

const MORE_NAV = [
  { href: '/charts',         icon: 'ti-chart-dots',      label: '차트'     },
  { href: '/pension',        icon: 'ti-pig-money',       label: '연금 결산' },
  { href: '/pension-charts', icon: 'ti-chart-bar',       label: '연금 차트' },
  { href: '/overview',       icon: 'ti-chart-area-line', label: '전체 현황' },
  { href: '/settings',       icon: 'ti-settings',        label: '설정'     },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const isMoreActive = MORE_NAV.some(n => isActive(n.href))

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute bottom-14 left-0 right-0 bg-[#1a1f2e] border-t border-white/10 px-4 py-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="grid grid-cols-5 gap-2">
              {MORE_NAV.map(n => {
                const active = isActive(n.href)
                return (
                  <Link key={n.href} href={n.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg transition-colors
                      ${active ? 'text-[#6b8cff]' : 'text-white/50'}`}>
                    <i className={`ti ${n.icon} text-xl`} />
                    <span className="text-[9px] leading-none text-center">{n.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden bg-[#1a1f2e] border-t border-white/10 flex-shrink-0"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch h-14">
          {MAIN_NAV.map(n => {
            const active = isActive(n.href)
            return (
              <Link key={n.href} href={n.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors
                  ${active ? 'text-[#6b8cff]' : 'text-white/50'}`}>
                <i className={`ti ${n.icon} text-xl`} />
                <span className="text-[9px] leading-none">{n.label}</span>
              </Link>
            )
          })}

          <button
            onClick={() => setMoreOpen(o => !o)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors
              ${isMoreActive || moreOpen ? 'text-[#6b8cff]' : 'text-white/50'}`}>
            <i className={`ti ${moreOpen ? 'ti-x' : 'ti-dots'} text-xl`} />
            <span className="text-[9px] leading-none">더보기</span>
          </button>
        </div>
      </nav>
    </>
  )
}
