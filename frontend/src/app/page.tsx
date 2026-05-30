'use client'

import { useEffect, useState } from 'react'
import { Users, Video, MessageSquare, Reply, TrendingUp, Search, Plus } from 'lucide-react'
import Link from 'next/link'
import { getStats, listCreators, type Creator } from '@/lib/api'
import { formatNumber, formatDate } from '@/lib/utils'

interface Stats { creators: number; videos: number; comments: number; replies: number }

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [creators, setCreators] = useState<Creator[]>([])

  useEffect(() => {
    getStats().then(setStats).catch(console.error)
    listCreators().then(setCreators).catch(console.error)
  }, [])

  const statCards = [
    { label: 'Creators', value: stats?.creators ?? 0, icon: Users, color: 'text-violet-400' },
    { label: 'Videos', value: stats?.videos ?? 0, icon: Video, color: 'text-blue-400' },
    { label: 'Comments', value: stats?.comments ?? 0, icon: MessageSquare, color: 'text-emerald-400' },
    { label: 'Replies', value: stats?.replies ?? 0, icon: Reply, color: 'text-amber-400' },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Your YouTube audience intelligence overview
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="text-2xl font-bold text-foreground">{formatNumber(value)}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Link href="/creators"
          className="flex items-center gap-3 p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors group">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Plus className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-medium text-sm text-foreground">Add Creator</div>
            <div className="text-xs text-muted-foreground">Import a new channel</div>
          </div>
        </Link>
        <Link href="/search"
          className="flex items-center gap-3 p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors group">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
            <Search className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="font-medium text-sm text-foreground">Search Comments</div>
            <div className="text-xs text-muted-foreground">Search across all creators</div>
          </div>
        </Link>
        <Link href="/analytics/pain-points"
          className="flex items-center gap-3 p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors group">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="font-medium text-sm text-foreground">Analyze Audience</div>
            <div className="text-xs text-muted-foreground">Pain points & insights</div>
          </div>
        </Link>
      </div>

      {/* Creators list */}
      {creators.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Imported Creators</h2>
            <Link href="/creators" className="text-sm text-primary hover:underline">View all</Link>
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-4 py-3 text-left text-muted-foreground font-medium">Creator</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Subscribers</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Videos</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Comments</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Last Synced</th>
                </tr>
              </thead>
              <tbody>
                {creators.slice(0, 10).map(c => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-3">
                      <Link href={`/creators/${c.id}`} className="flex items-center gap-2 hover:text-primary">
                        {c.thumbnail_url && (
                          <img src={c.thumbnail_url} alt="" className="w-7 h-7 rounded-full" />
                        )}
                        <span className="font-medium">{c.channel_name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatNumber(c.subscriber_count)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{c.total_videos_imported}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatNumber(c.total_comments)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatDate(c.last_synced_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creators.length === 0 && stats?.creators === 0 && (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No creators yet</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Import your first YouTube channel to get started
          </p>
          <Link href="/creators"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />
            Add Creator
          </Link>
        </div>
      )}
    </div>
  )
}
