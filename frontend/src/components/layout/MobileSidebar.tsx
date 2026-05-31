'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Search, BarChart3, Lightbulb,
  ShoppingCart, GitCompare, BookOpen, Bell,
  FolderOpen, Settings, Youtube, HelpCircle, Swords, Brain, Telescope, Sparkles, CalendarDays,
  Menu, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Ask Finniki / Intent', href: '/intent', icon: Sparkles },
  { label: 'Creators', href: '/creators', icon: Users },
  { label: 'Competitors', href: '/competitors', icon: Swords },
  { label: 'Search', href: '/search', icon: Search },
  { divider: true },
  { label: 'Pain Points', href: '/analytics/pain-points', icon: HelpCircle },
  { label: 'Questions', href: '/analytics/questions', icon: HelpCircle },
  { label: 'Purchase Intent', href: '/analytics/purchase-intent', icon: ShoppingCart },
  { label: 'Content Ideas', href: '/analytics/content-opportunities', icon: Lightbulb },
  { label: 'Audience Overlap', href: '/analytics/audience-overlap', icon: GitCompare },
  { label: 'Compare Creators', href: '/analytics/compare', icon: BarChart3 },
  { label: 'Competitor Analytics', href: '/competitor-analytics', icon: Swords },
  { divider: true },
  { section: 'AI Content Strategy' },
  { label: 'AI Content Strategy', href: '/ai-content-strategy', icon: Brain },
  { label: 'Topic Intelligence', href: '/topic-intelligence', icon: Telescope },
  { label: 'Content Planner', href: '/content-planner', icon: CalendarDays },
  { divider: true },
  { label: 'Collections', href: '/collections', icon: FolderOpen },
  { label: 'Watchlists', href: '/watchlists', icon: Bell },
  { label: 'Reports', href: '/reports', icon: BookOpen },
  { divider: true },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export function MobileSidebar() {
  const [open, setOpen] = useState(false)
  const path = usePathname()

  // Close on route change
  useEffect(() => { setOpen(false) }, [path])

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Hamburger button — top-left on mobile */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 p-2 rounded-lg bg-background border border-border shadow-lg"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          'md:hidden fixed top-0 left-0 h-full w-72 z-50 bg-background border-r border-border flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <Youtube className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm">YT Intelligence</span>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-secondary" aria-label="Close menu">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {nav.map((item, i) => {
            if ('divider' in item) return <div key={i} className="my-1 border-t border-border" />
            if ('section' in item) return (
              <p key={i} className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {item.section}
              </p>
            )
            const Icon = item.icon
            const active = path === item.href || (item.href !== '/' && path.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">YouTube Intelligence v1.0</p>
        </div>
      </aside>
    </>
  )
}
