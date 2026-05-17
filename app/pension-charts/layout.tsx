'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/pension-charts',             label: '그룹별 차트', icon: 'ti-chart-bar'       },
  { href: '/pension-charts/overview',    label: '직접투자 연금', icon: 'ti-chart-area-line' },
  { href: '/pension-charts/breakdown',   label: '세부내역 비율', icon: 'ti-chart-pie'       },
]

export default function PensionChartsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full">
      {/* 탭 바 */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-6 flex items-end gap-0">
        {TABS.map(tab => {
          const active = tab.href === '/pension-charts'
            ? pathname === '/pension-charts'
            : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                active
                  ? 'border-[#6b8cff] text-[#6b8cff]'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
              }`}>
              <i className={`ti ${tab.icon} text-sm`} />
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* 페이지 콘텐츠 */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
