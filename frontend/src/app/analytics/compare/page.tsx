'use client'

import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { compareCreators, listCreators, type Creator, type CreatorComparison } from '@/lib/api'
import { formatNumber } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts'

export default function CompareCreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [data, setData] = useState<CreatorComparison[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { listCreators().then(c => { setCreators(c); if (c.length >= 2) setSelected(c.slice(0, Math.min(4, c.length)).map(x => x.id)) }) }, [])
  useEffect(() => { if (selected.length >= 1) load() }, [selected])

  async function load() {
    setLoading(true)
    try {
      const res = await compareCreators(selected)
      setData(res)
    } finally {
      setLoading(false)
    }
  }

  function toggle(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Compare Creators</h1>
        <p className="text-sm text-muted-foreground mt-1">Side-by-side engagement metrics</p>
      </div>

      {/* Creator selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {creators.map(c => (
          <button key={c.id} onClick={() => toggle(c.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${
              selected.includes(c.id)
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/50'
            }`}>
            {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-3.5 h-3.5 rounded-full" />}
            {c.channel_name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading comparison...</div>
      ) : data.length > 0 ? (
        <div className="space-y-6">
          {/* Stats table */}
          <div className="bg-card border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/20">
                  <th className="px-4 py-3 text-left text-muted-foreground font-medium">Creator</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Comments</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Avg Likes</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Avg Replies</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Engagement</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Videos</th>
                </tr>
              </thead>
              <tbody>
                {data.map(c => (
                  <tr key={c.creator_id} className="border-b border-border last:border-0 hover:bg-secondary/10">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-7 h-7 rounded-full" />}
                        <span className="font-medium">{c.creator_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{formatNumber(c.total_comments)}</td>
                    <td className="px-4 py-3 text-right">{c.avg_likes_per_comment.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right">{c.avg_replies_per_comment.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-emerald-400">{(c.engagement_rate * 100).toFixed(3)}%</span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{c.total_videos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-medium mb-4 text-sm">Total Comments</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="creator_name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="total_comments" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-medium mb-4 text-sm">Avg Likes per Comment</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="creator_name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="avg_likes_per_comment" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          Select at least one creator to compare.
        </div>
      )}
    </div>
  )
}
