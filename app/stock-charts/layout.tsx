'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/stock-charts/detail', label: '세부내역 차트', icon: 'ti-chart-histogram' },
]

export default function StockChartsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 bg-white border-b border-gray-100 flex items-end gap-0 overflow-x-auto scrollbar-hide">
        {TABS.map(tab => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                active
                  ? 'border-[#22c55e] text-[#22c55e]'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
              }`}>
              <i className={`ti ${tab.icon} text-sm`} />
              {tab.label}
            </Link>
          )
        })}
      </div>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
