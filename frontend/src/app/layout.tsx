import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileSidebar } from '@/components/layout/MobileSidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'YouTube Intelligence',
  description: 'YouTube Audience Intelligence Platform',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <div className="flex h-screen overflow-hidden bg-background">
          {/* Desktop sidebar — hidden on mobile */}
          <div className="hidden md:block">
            <Sidebar />
          </div>

          {/* Mobile: hamburger button + slide-in drawer */}
          <MobileSidebar />

          <main className="flex-1 overflow-y-auto pb-16 md:pb-0 pt-14 md:pt-0">
            {children}
          </main>
        </div>

        {/* Mobile bottom navigation bar */}
        <MobileNav />

        <Toaster />
      </body>
    </html>
  )
}
