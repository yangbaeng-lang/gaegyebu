'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/',          icon: 'ti-pencil',     label: '거래 입력' },
  { href: '/journal',   icon: 'ti-list',       label: '거래 내역' },
  { href: '/analytics', icon: 'ti-chart-bar',  label: '비용/수익' },
  { href: '/assets',    icon: 'ti-wallet',     label: '자산/부채' },
  { href: '/budget',    icon: 'ti-target',     label: '예산 관리' },
  { href: '/charts',    icon: 'ti-chart-dots', label: '차트'     },
]

export default function BottomNav() {
  const pathname = usePathname()
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav className="md:hidden bg-[#1a1f2e] border-t border-white/10 flex-shrink-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-stretch h-14">
        {NAV.map(n => {
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
      </div>
    </nav>
  )
}
