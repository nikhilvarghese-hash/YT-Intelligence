'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Sparkles, Swords, Brain, Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const BOTTOM_NAV = [
  { label: 'Home',    href: '/',                  icon: LayoutDashboard },
  { label: 'Ask AI',  href: '/intent',             icon: Sparkles },
  { label: 'Creators',href: '/creators',           icon: Users },
  { label: 'Compete', href: '/competitor-analytics', icon: Swords },
  { label: 'Strategy',href: '/ai-content-strategy', icon: Brain },
  { label: 'Settings',href: '/settings',           icon: Settings },
]

export function MobileNav() {
  const path = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border safe-bottom">
      <div className="flex items-stretch h-16">
        {BOTTOM_NAV.map((item) => {
          const active = path === item.href || (item.href !== '/' && path.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] transition-colors',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <Icon className={cn('w-5 h-5', active && 'drop-shadow-[0_0_6px_hsl(var(--primary))]')} />
              <span className="leading-none">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
