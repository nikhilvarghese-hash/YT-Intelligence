'use client'

import { useEffect, useState, useMemo } from 'react'
import { Users, Video, Play, Swords, Bot, Loader2, ChevronRight, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import {
  listCreators, listCompetitors, addCompetitor, removeCompetitor,
  getCompetitorTopVideos, getCompetitorInsights, getSettings,
  type Creator, type CompetitorVideo, type CompetitorInsight, type AppSettings,
} from '@/lib/api'
import { formatNumber, timeAgo } from '@/lib/utils'

type Metric = 'views' | 'outlier_score' | 'views_per_hour'
type Period = 'week' | 'month' | 'all'
type PromptType = 'summary' | 'titles' | 'topics' | 'custom'

function OutlierBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground text-xs">—</span>
  if (score < 1.5) return <span className="text-xs text-muted-foreground">{score.toFixed(1)}x</span>
  const cls =
    score >= 5 ? 'bg-violet-500 text-white' :
    score >= 2 ? 'bg-blue-500 text-white' :
    'bg-indigo-500 text-white'
  return <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cls}`}>{score.toFixed(1)}x</span>
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border animate-pulse">
      {[1,2,3,4,5,6].map(i => (
        <td key={i} className="px-3 py-3">
          <div className="h-3 bg-secondary rounded w-3/4" />
        </td>
      ))}
    </tr>
  )
}

export default function CompetitorsPage() {
  const [allCreators, setAllCreators] = useState<Creator[]>([])
  const [competitorIds, setCompetitorIds] = useState<Set<number>>(new Set())
  const [videos, setVideos] = useState<CompetitorVideo[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [metric, setMetric] = useState<Metric>('views')
  const [period, setPeriod] = useState<Period>('week')
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  // AI Insights state
  const [promptType, setPromptType] = useState<PromptType>('summary')
  const [customPrompt, setCustomPrompt] = useState('')
  const [insight, setInsight] = useState<CompetitorInsight | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)

  useEffect(() => {
    listCreators().then(setAllCreators)
    listCompetitors().then(cs => setCompetitorIds(new Set(cs.map(c => c.id))))
    getSettings().then(setSettings)
  }, [])

  useEffect(() => {
    if (competitorIds.size === 0) { setVideos([]); setTotal(0); return }
    setLoadingVideos(true)
    getCompetitorTopVideos({ metric, period, page, pageSize: 50 })
      .then(r => { setVideos(r.items); setTotal(r.total); setPages(r.pages) })
      .catch(console.error)
      .finally(() => setLoadingVideos(false))
  }, [competitorIds, metric, period, page])

  async function toggleCompetitor(id: number) {
    if (competitorIds.has(id)) {
      await removeCompetitor(id)
      setCompetitorIds(prev => { const s = new Set(prev); s.delete(id); return s })
    } else {
      await addCompetitor(id)
      setCompetitorIds(prev => new Set([...prev, id]))
    }
    setPage(1)
  }

  async function runInsights() {
    setLoadingInsight(true)
    setInsight(null)
    try {
      const ids = videos.slice(0, 30).map(v => v.id)
      const result = await getCompetitorInsights(ids, promptType, customPrompt || undefined)
      setInsight(result)
    } catch (e: any) {
      setInsight({ insight: null, model_used: null, error: e.message })
    } finally {
      setLoadingInsight(false)
    }
  }

  const hasAI = settings?.ai_provider && settings.ai_provider !== 'none'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Competitors</h1>
        <p className="text-sm text-muted-foreground mt-1">Top-performing videos from your competitor channels</p>
      </div>

      <div className="flex gap-6">
        {/* ── Left: video table ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Controls */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-1 bg-secondary/40 rounded-lg p-1">
              {(['views', 'outlier_score', 'views_per_hour'] as Metric[]).map(m => (
                <button key={m} onClick={() => { setMetric(m); setPage(1) }}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${metric === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  {m === 'views' ? 'Views' : m === 'outlier_score' ? 'Outlier' : 'VPH'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-secondary/40 rounded-lg p-1">
              {(['week', 'month', 'all'] as Period[]).map(p => (
                <button key={p} onClick={() => { setPeriod(p); setPage(1) }}
                  className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${period === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  {p === 'week' ? 'This week' : p === 'month' ? 'This month' : 'All time'}
                </button>
              ))}
            </div>
            {total > 0 && <span className="text-xs text-muted-foreground ml-auto">{total} videos</span>}
          </div>

          {competitorIds.size === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-lg">
              <Swords className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No competitors selected.</p>
              <p className="text-xs text-muted-foreground mt-1">Toggle creators in the panel on the right.</p>
            </div>
          ) : (
            <>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/20 text-xs text-muted-foreground">
                      <th className="px-3 py-2.5 text-left">Video</th>
                      <th className="px-3 py-2.5 text-right">Views</th>
                      <th className="px-3 py-2.5 text-right">Outlier</th>
                      <th className="px-3 py-2.5 text-right">VPH</th>
                      <th className="px-3 py-2.5 text-right">Published</th>
                      <th className="px-3 py-2.5 text-right">Creator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingVideos
                      ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
                      : videos.map(v => (
                        <tr key={v.id} className="border-b border-border last:border-0 hover:bg-secondary/10">
                          <td className="px-3 py-2.5">
                            <a href={v.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 group max-w-xs">
                              {v.thumbnail_url
                                ? <img src={v.thumbnail_url} alt="" className="w-16 h-9 object-cover rounded flex-shrink-0" />
                                : <div className="w-16 h-9 bg-secondary rounded flex-shrink-0 flex items-center justify-center">
                                    <Play className="w-3.5 h-3.5 text-muted-foreground" />
                                  </div>
                              }
                              <span className="text-xs font-medium line-clamp-2 group-hover:text-primary transition-colors">
                                {v.title}
                              </span>
                            </a>
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{formatNumber(v.views)}</td>
                          <td className="px-3 py-2.5 text-right"><OutlierBadge score={v.outlier_score} /></td>
                          <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{v.views_per_hour.toFixed(1)}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{timeAgo(v.publish_date)}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-muted-foreground truncate max-w-[100px]">{v.creator_name}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>

              {pages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loadingVideos}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-secondary rounded-md disabled:opacity-40 hover:bg-secondary/80 transition-colors">
                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                  </button>
                  <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
                  <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages || loadingVideos}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-secondary rounded-md disabled:opacity-40 hover:bg-secondary/80 transition-colors">
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}

          {/* AI Insights panel */}
          <div className="mt-6 bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">AI Insights</span>
              </div>
              <button
                onClick={runInsights}
                disabled={loadingInsight || videos.length === 0 || !hasAI}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                {loadingInsight ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Run
              </button>
            </div>

            {!hasAI ? (
              <p className="text-xs text-muted-foreground">
                <Link href="/settings" className="text-primary hover:underline">Add an AI provider in Settings</Link> to enable analysis.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {(['summary', 'titles', 'topics', 'custom'] as PromptType[]).map(pt => (
                    <button key={pt} onClick={() => setPromptType(pt)}
                      className={`px-3 py-1 text-xs rounded-full border capitalize transition-colors ${
                        promptType === pt ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}>
                      {pt}
                    </button>
                  ))}
                </div>

                {promptType === 'custom' && (
                  <textarea
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                    placeholder="Enter your custom analysis prompt…"
                    rows={2}
                    className="w-full px-3 py-2 mb-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                )}

                {loadingInsight && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Analysing {Math.min(videos.length, 30)} videos…
                  </div>
                )}

                {insight && !loadingInsight && (
                  <div className="space-y-2">
                    {insight.error ? (
                      <p className="text-xs text-amber-400">{insight.error}</p>
                    ) : (
                      <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed bg-secondary/20 rounded-md p-3 border border-border">
                        {insight.insight}
                      </div>
                    )}
                    {insight.model_used && (
                      <p className="text-xs text-muted-foreground">Model: {insight.model_used}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Right: competitor management ──────────────────────────── */}
        <div className="w-56 flex-shrink-0">
          <div className="bg-card border border-border rounded-lg p-3 sticky top-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Competitors</p>
              {allCreators.length > 0 && (
                <button
                  onClick={() => {
                    if (competitorIds.size === allCreators.length) {
                      allCreators.forEach(c => { if (competitorIds.has(c.id)) removeCompetitor(c.id) })
                      setCompetitorIds(new Set())
                    } else {
                      allCreators.forEach(c => { if (!competitorIds.has(c.id)) addCompetitor(c.id) })
                      setCompetitorIds(new Set(allCreators.map(c => c.id)))
                    }
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {competitorIds.size === allCreators.length ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            <div className="space-y-1">
              {allCreators.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  No creators imported yet.{' '}
                  <Link href="/creators" className="text-primary hover:underline">Add one →</Link>
                </p>
              )}
              {allCreators.map(c => {
                const active = competitorIds.has(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCompetitor(c.id)}
                    className={`w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors text-xs ${
                      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/50'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                      active ? 'bg-primary border-primary' : 'border-border'
                    }`}>
                      {active && <svg viewBox="0 0 10 8" fill="white" className="w-2 h-2"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.channel_name}</p>
                      <p className="text-muted-foreground">{formatNumber(c.subscriber_count)} subs</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
