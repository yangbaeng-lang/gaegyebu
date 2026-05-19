import type { Metadata, Viewport } from 'next'
import SideNav from '@/components/SideNav'
import BottomNav from '@/components/BottomNav'
import MobileSessionBar from '@/components/MobileSessionBar'
import { SessionProvider } from '@/lib/SessionContext'
import './globals.css'

export const metadata: Metadata = { title: '가계부', description: '개인 가계부' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
      </head>
      <body className="flex bg-gray-50 overflow-hidden">
        <SessionProvider>
          <SideNav />
          <div className="flex-1 flex flex-col overflow-hidden">
            <MobileSessionBar />
            <main className="flex-1 flex flex-col overflow-hidden">
              {children}
            </main>
            <BottomNav />
          </div>
        </SessionProvider>
      </body>
    </html>
  )
}
