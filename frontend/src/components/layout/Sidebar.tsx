'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Search, BarChart3, Lightbulb,
  ShoppingCart, TrendingUp, GitCompare, BookOpen, Bell,
  FolderOpen, Settings, Youtube, HelpCircle, Swords, Brain, Telescope, Sparkles, CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Intent Search', href: '/intent', icon: Sparkles },
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
  { label: 'Topic Intelligence',  href: '/topic-intelligence',  icon: Telescope },
  { label: 'Content Planner',     href: '/content-planner',     icon: CalendarDays },
  { divider: true },
  { label: 'Collections', href: '/collections', icon: FolderOpen },
  { label: 'Watchlists', href: '/watchlists', icon: Bell },
  { label: 'Reports', href: '/reports', icon: BookOpen },
  { divider: true },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const path = usePathname()

  return (
    <aside className="w-56 flex-shrink-0 border-r border-border flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
          <Youtube className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-sm text-foreground">YT Intelligence</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {nav.map((item, i) => {
          if ('divider' in item) {
            return <div key={i} className="my-1 border-t border-border" />
          }
          if ('section' in item) {
            return (
              <p key={i} className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {item.section}
              </p>
            )
          }
          const Icon = item.icon
          const active = path === item.href || (item.href !== '/' && path.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
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

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground">YouTube Intelligence v1.0</p>
      </div>
    </aside>
  )
}
