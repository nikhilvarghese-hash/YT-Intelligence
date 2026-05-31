'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  Brain, Loader2, TrendingUp, TrendingDown, Minus, X,
  Sparkles, LayoutGrid, Tags, BarChart2, Bot, Calendar,
  Archive, Pencil, Check, StickyNote, Users, Video,
  SlidersHorizontal,
} from 'lucide-react'
import {
  getContentOpportunityCards, updateCardStatuses, updateCardMeta,
  generateCardBrief, getContentTrends, listCreators, getStrategyVideos,
  type ContentCard, type KanbanStatus, type Creator, type StrategyVideo,
} from '@/lib/api'
import { CreatorFilter } from '@/components/analytics/CreatorFilter'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ── Constants ─────────────────────────────────────────────────────────────────

type PageTab = 'opportunities' | 'clusters' | 'recommendations' | 'analytics'

const KANBAN_COLS: { id: KanbanStatus; label: string; accent: string; bg: string }[] = [
  { id: 'new',             label: 'New Ideas',           accent: 'border-border',         bg: 'bg-secondary/20' },
  { id: 'trending',        label: '🔥 Trending Requests', accent: 'border-amber-400/60',   bg: 'bg-amber-400/5'  },
  { id: 'high_engagement', label: '⚡ High Engagement',   accent: 'border-blue-400/60',    bg: 'bg-blue-400/5'   },
  { id: 'planned',         label: '📋 Planned',           accent: 'border-violet-400/60',  bg: 'bg-violet-400/5' },
  { id: 'in_progress',     label: '🎬 In Progress',       accent: 'border-emerald-400/60', bg: 'bg-emerald-400/5'},
  { id: 'published',       label: '✅ Published',         accent: 'border-green-400/60',   bg: 'bg-green-400/5'  },
  { id: 'archived',        label: '📦 Archived',          accent: 'border-border/40',      bg: 'bg-secondary/10' },
]

const FORMAT_LABELS: Record<string, string> = { long: 'Long', short: 'Short', both: 'Both' }
const FORMAT_COLORS: Record<string, string> = {
  long:  'bg-blue-400/15 text-blue-400',
  short: 'bg-emerald-400/15 text-emerald-400',
  both:  'bg-violet-400/15 text-violet-400',
}
const SCORE_COLOR = (s: number) =>
  s >= 75 ? 'text-emerald-400' : s >= 50 ? 'text-amber-400' : s >= 30 ? 'text-blue-400' : 'text-muted-foreground'

const AREA_COLORS = ['#f59e0b', '#60a5fa', '#34d399', '#a78bfa', '#f87171', '#fb923c', '#38bdf8', '#4ade80']

const KANBAN_COL_LIMIT = 15

// ── Helpers ───────────────────────────────────────────────────────────────────

const TREND_ICON = ({ trend }: { trend: string }) =>
  trend === 'growing'   ? <TrendingUp  className="w-3 h-3 text-emerald-400" />
  : trend === 'declining' ? <TrendingDown className="w-3 h-3 text-red-400" />
  : <Minus className="w-3 h-3 text-muted-foreground" />

function parseBrief(text: string) {
  const get = (a: string, b: string) => {
    const s = text.indexOf(`===${a}===`); if (s === -1) return ''
    const e = text.indexOf(`===${b}===`)
    return text.slice(s + a.length + 6, e === -1 ? undefined : e).trim()
  }
  const numbered = (raw: string) =>
    raw.split('\n').filter(l => /^\d\./.test(l.trim())).map(l => l.replace(/^\d\.\s*/, '').trim()).filter(Boolean)
  return {
    titles:            numbered(get('TITLES', 'HOOK')),
    hook:              get('HOOK', 'TALKING_POINTS'),
    talkingPoints:     numbered(get('TALKING_POINTS', 'TARGET_AUDIENCE')),
    targetAudience:    get('TARGET_AUDIENCE', 'QUESTIONS_TO_ANSWER'),
    questionsToAnswer: numbered(get('QUESTIONS_TO_ANSWER', '___END___')),
  }
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ScoreBadge({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  const color = SCORE_COLOR(score)
  return size === 'lg'
    ? <div className={`text-3xl font-black ${color}`}>{score}</div>
    : <span className={`text-xs font-black px-1.5 py-0.5 rounded bg-secondary ${color}`}>{score}</span>
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-bold ${color}`}>{value}</span>
      </div>
      <div className="w-full bg-secondary rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color.replace('text-', 'bg-')}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function ClassBadge({ c }: { c: ContentCard }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${c.classification === 'finniki' ? 'bg-amber-400/15 text-amber-400' : 'bg-secondary text-muted-foreground'}`}>
      {c.classification === 'finniki' ? 'FN' : 'ADJ'}
    </span>
  )
}

// ── Kanban card ───────────────────────────────────────────────────────────────

function KanbanCard({ card, onClick }: { card: ContentCard; onClick: () => void }) {
  return (
    <div onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-primary/30 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-semibold line-clamp-2 flex-1 group-hover:text-primary transition-colors">{card.topic}</p>
        <ScoreBadge score={card.scores.opportunity} />
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${FORMAT_COLORS[card.format]}`}>{FORMAT_LABELS[card.format]}</span>
        <ClassBadge c={card} />
        <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{card.category}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{card.frequency} mentions</span>
          {card.unique_users > 0 && (
            <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{card.unique_users}</span>
          )}
        </div>
        <TREND_ICON trend={card.trend} />
      </div>
      {card.notes && <p className="text-xs text-muted-foreground/60 italic mt-1.5 line-clamp-1">📝 {card.notes}</p>}
    </div>
  )
}

// ── Opportunities (Kanban) tab ────────────────────────────────────────────────

function OpportunitiesTab({ filtered, loading, onCardClick }: {
  filtered: ContentCard[]
  loading: boolean
  onCardClick: (c: ContentCard) => void
}) {
  const [colLimits, setColLimits] = useState<Record<string, number>>(() =>
    Object.fromEntries(KANBAN_COLS.map(c => [c.id, KANBAN_COL_LIMIT]))
  )

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
  if (filtered.length === 0) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data yet. Import creators with comments first.</div>

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden">
      <div className="flex gap-3 p-4 h-full min-w-max">
        {KANBAN_COLS.map(col => {
          const allColCards = filtered.filter(c => c.status === col.id)
          const limit = colLimits[col.id]
          const shown = allColCards.slice(0, limit)
          return (
            <div key={col.id} className={`flex flex-col w-64 h-full bg-card border-2 ${col.accent} rounded-xl overflow-hidden`}>
              <div className={`px-3 py-2.5 ${col.bg} border-b border-border flex-shrink-0`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{col.label}</span>
                  <span className="text-xs bg-secondary px-1.5 py-0.5 rounded-full text-muted-foreground">{allColCards.length}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {shown.map(card => (
                  <KanbanCard key={card.id} card={card} onClick={() => onCardClick(card)} />
                ))}
                {allColCards.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No cards</p>}
                {allColCards.length > limit && (
                  <button
                    onClick={() => setColLimits(prev => ({ ...prev, [col.id]: prev[col.id] + KANBAN_COL_LIMIT }))}
                    className="w-full text-xs text-primary/60 hover:text-primary py-2 text-center border border-dashed border-border rounded-lg transition-colors">
                    Show {Math.min(KANBAN_COL_LIMIT, allColCards.length - limit)} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Topic Clusters tab ────────────────────────────────────────────────────────

function ClustersTab({ filtered, onCardClick }: { filtered: ContentCard[]; onCardClick: (c: ContentCard) => void }) {
  const clusterMap = useMemo(() => {
    const m = new Map<string, ContentCard[]>()
    filtered.filter(c => c.status !== 'archived').forEach(c => {
      const l = m.get(c.category) ?? []; l.push(c); m.set(c.category, l)
    })
    return m
  }, [filtered])

  return (
    <div className="h-full overflow-y-auto p-5">
      {Array.from(clusterMap.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([cat, catCards]) => (
          <div key={cat} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Tags className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold">{cat}</h2>
              <span className="text-xs text-muted-foreground">({catCards.length} topics)</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {catCards.reduce((s, c) => s + c.frequency, 0)} total mentions
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {catCards.sort((a, b) => b.scores.opportunity - a.scores.opportunity).map(card => (
                <button key={card.id} onClick={() => onCardClick(card)}
                  className="text-left p-3 bg-card border border-border rounded-lg hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs font-semibold line-clamp-2 flex-1">{card.topic}</p>
                    <span className={`text-xs font-black ${SCORE_COLOR(card.scores.opportunity)}`}>{card.scores.opportunity}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${FORMAT_COLORS[card.format]}`}>{FORMAT_LABELS[card.format]}</span>
                    <ClassBadge c={card} />
                    <TREND_ICON trend={card.trend} />
                    <span className="text-xs text-muted-foreground ml-auto">{card.frequency}×</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}

// ── Content Recommendations tab (infinite scroll) ─────────────────────────────

function RecommendationsTab({ filtered, onCardClick }: { filtered: ContentCard[]; onCardClick: (c: ContentCard) => void }) {
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 18
  const sentinelRef = useRef<HTMLDivElement>(null)

  const top = useMemo(() =>
    [...filtered].filter(c => c.status !== 'archived').sort((a, b) => b.scores.opportunity - a.scores.opportunity),
    [filtered]
  )
  const shown = top.slice(0, page * PAGE_SIZE)
  const hasMore = shown.length < top.length

  useEffect(() => { setPage(1) }, [filtered])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setPage(p => p + 1)
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore])

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold mb-1">Top Content Recommendations</h2>
        <p className="text-xs text-muted-foreground">Highest-opportunity topics sorted by priority score. Click any card to open the detail panel.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((card, idx) => (
          <div key={card.id} className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors cursor-pointer"
            onClick={() => onCardClick(card)}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                  <ClassBadge c={card} />
                </div>
                <p className="text-sm font-semibold line-clamp-2">{card.topic}</p>
              </div>
              <div className={`text-2xl font-black ${SCORE_COLOR(card.scores.opportunity)}`}>{card.scores.opportunity}</div>
            </div>
            <div className="space-y-1.5 mb-3">
              <ScoreBar label="Demand"     value={card.scores.demand}     color="text-amber-400" />
              <ScoreBar label="Engagement" value={card.scores.engagement} color="text-blue-400" />
              <ScoreBar label="Relevance"  value={card.scores.relevance}  color="text-violet-400" />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`px-1.5 py-0.5 rounded font-bold ${FORMAT_COLORS[card.format]}`}>{FORMAT_LABELS[card.format]}-form</span>
              <span className="truncate">{card.category}</span>
              <TREND_ICON trend={card.trend} />
              <span className="ml-auto">{card.frequency}×</span>
            </div>
            {card.unique_users > 0 && (
              <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />{card.unique_users} unique users
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && (
          <div className="col-span-3 text-center py-16 text-muted-foreground text-sm">
            No data. Import creators with comments first.
          </div>
        )}
      </div>
      {hasMore && <div ref={sentinelRef} className="h-10 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
    </div>
  )
}

// ── Analytics tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({ filtered, selected, trendData, setTrendData }: {
  filtered: ContentCard[]
  selected: number[]
  trendData: Record<string, Array<{ week: string; count: number }>>
  setTrendData: (d: Record<string, Array<{ week: string; count: number }>>) => void
}) {
  const [loadingTrends, setLoadingTrends] = useState(false)
  const [tablePage, setTablePage] = useState(1)
  const TABLE_PAGE_SIZE = 50
  const sentinelRef = useRef<HTMLDivElement>(null)

  const scoredCards = useMemo(() =>
    [...filtered].filter(c => c.status !== 'archived').sort((a, b) => b.scores.opportunity - a.scores.opportunity),
    [filtered]
  )
  const shownRows = scoredCards.slice(0, tablePage * TABLE_PAGE_SIZE)
  const hasMoreRows = shownRows.length < scoredCards.length

  useEffect(() => { setTablePage(1) }, [filtered])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMoreRows) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setTablePage(p => p + 1)
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMoreRows])

  const loadTrends = useCallback(async (topCards: ContentCard[]) => {
    const topics = topCards.slice(0, 8).map(c => c.original_topic || c.topic)
    if (!topics.length) return
    setLoadingTrends(true)
    getContentTrends(topics, selected.length ? selected : undefined)
      .then(setTrendData).catch(console.error).finally(() => setLoadingTrends(false))
  }, [selected, setTrendData])

  useEffect(() => {
    if (filtered.length > 0 && Object.keys(trendData).length === 0) {
      loadTrends(filtered.slice(0, 8))
    }
  }, [filtered, trendData, loadTrends])

  const trendChartData = useMemo(() => {
    const topics = Object.keys(trendData)
    if (!topics.length) return []
    const weeks = trendData[topics[0]]?.map(d => d.week) ?? []
    return weeks.map((week, i) => {
      const row: Record<string, string | number> = { week: week.slice(5) }
      topics.forEach(t => { row[t.slice(0, 20)] = trendData[t][i]?.count ?? 0 })
      return row
    })
  }, [trendData])

  const trendTopics = Object.keys(trendData).map(t => t.slice(0, 20))

  return (
    <div className="h-full overflow-y-auto p-5 space-y-6">
      {/* Scoring table */}
      <div>
        <h2 className="text-sm font-bold mb-3">Content Scoring — {scoredCards.length} opportunities</h2>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/20 text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-semibold">Topic</th>
                <th className="px-3 py-2.5 text-center font-semibold">Category</th>
                <th className="px-3 py-2.5 text-center font-semibold">Mentions</th>
                <th className="px-3 py-2.5 text-center font-semibold">Users</th>
                <th className="px-3 py-2.5 text-center font-semibold">Demand</th>
                <th className="px-3 py-2.5 text-center font-semibold">Engage</th>
                <th className="px-3 py-2.5 text-center font-semibold">Relevance</th>
                <th className="px-3 py-2.5 text-center font-semibold">Priority</th>
                <th className="px-3 py-2.5 text-center font-semibold">Format</th>
                <th className="px-3 py-2.5 text-center font-semibold">Trend</th>
              </tr>
            </thead>
            <tbody>
              {shownRows.map(card => (
                <tr key={card.id} className="border-b border-border last:border-0 hover:bg-secondary/10">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold line-clamp-1 max-w-[200px]">{card.topic}</p>
                    <span className={`text-xs ${card.classification === 'finniki' ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {card.classification === 'finniki' ? 'Finniki' : 'Adjacent'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{card.category}</td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{card.frequency}</td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{card.unique_users || '—'}</td>
                  <td className="px-3 py-2.5 text-center"><span className={SCORE_COLOR(card.scores.demand)}>{card.scores.demand}</span></td>
                  <td className="px-3 py-2.5 text-center"><span className={SCORE_COLOR(card.scores.engagement)}>{card.scores.engagement}</span></td>
                  <td className="px-3 py-2.5 text-center"><span className={SCORE_COLOR(card.scores.relevance)}>{card.scores.relevance}</span></td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`font-black text-sm ${SCORE_COLOR(card.scores.opportunity)}`}>{card.scores.opportunity}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`px-1.5 py-0.5 rounded font-bold ${FORMAT_COLORS[card.format]}`}>{FORMAT_LABELS[card.format]}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center"><div className="flex justify-center"><TREND_ICON trend={card.trend} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMoreRows && <div ref={sentinelRef} className="py-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
        </div>
      </div>

      {/* Trend chart */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold">Topic Mention Trends (12 weeks)</h2>
          <button onClick={() => loadTrends(filtered.slice(0, 8))} className="text-xs text-primary hover:underline">Refresh</button>
        </div>
        {loadingTrends && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />Loading trend data…
          </div>
        )}
        {!loadingTrends && trendChartData.length > 0 && (
          <>
            <div className="bg-card border border-border rounded-xl p-4">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trendChartData} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1c1c1e', border: '1px solid #2d2d2f', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#f3f4f6' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {trendTopics.map((topic, i) => (
                    <Area key={topic} type="monotone" dataKey={topic}
                      stroke={AREA_COLORS[i % AREA_COLORS.length]}
                      fill={AREA_COLORS[i % AREA_COLORS.length] + '20'}
                      strokeWidth={2} dot={false} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              {[
                { title: 'Rising Themes', icon: TrendingUp, color: 'text-emerald-400', filter: 'growing', badge: '↑', badgeColor: 'text-emerald-400' },
                { title: 'Declining Themes', icon: TrendingDown, color: 'text-red-400', filter: 'declining', badge: '↓', badgeColor: 'text-red-400' },
              ].map(({ title, icon: Icon, color, filter, badge, badgeColor }) => {
                const items = filtered.filter(c => c.trend === filter).slice(0, 6)
                return (
                  <div key={filter} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className={`w-4 h-4 ${color}`} />
                      <h3 className="text-xs font-bold">{title}</h3>
                    </div>
                    {items.length === 0
                      ? <p className="text-xs text-muted-foreground py-2">None found.</p>
                      : items.map(c => (
                          <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                            <p className="text-xs text-foreground/80 truncate flex-1">{c.topic}</p>
                            <span className={`text-xs font-bold ml-2 ${badgeColor}`}>{badge}</span>
                          </div>
                        ))
                    }
                  </div>
                )
              })}
            </div>
          </>
        )}
        {!loadingTrends && trendChartData.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <p>Comments need date data for trend analysis.</p>
            <button onClick={() => loadTrends(filtered.slice(0, 8))} className="mt-2 text-xs text-primary hover:underline">Try loading trends</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card Detail Panel ─────────────────────────────────────────────────────────

function CardDetailPanel({ card: initialCard, onClose, onMove, onMetaChange }: {
  card: ContentCard
  onClose: () => void
  onMove: (id: string, status: KanbanStatus) => void
  onMetaChange: (id: string, patch: Partial<ContentCard>) => void
}) {
  const [card, setCard] = useState(initialCard)
  const [brief, setBrief] = useState<ReturnType<typeof parseBrief> | null>(null)
  const [generatingBrief, setGeneratingBrief] = useState(false)
  const [briefError, setBriefError] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(card.topic)
  const [notes, setNotes] = useState(card.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setCard(initialCard)
    setTitleDraft(initialCard.topic)
    setNotes(initialCard.notes ?? '')
    setBrief(null)
    setBriefError('')
    setEditingTitle(false)
  }, [initialCard.id])

  async function handleGenerateBrief() {
    setGeneratingBrief(true); setBriefError(''); setBrief(null)
    try {
      const res = await generateCardBrief(card)
      if (res.error && !res.brief) { setBriefError(res.error); return }
      if (res.brief) setBrief(parseBrief(res.brief))
    } catch (e: any) { setBriefError(e.message) }
    finally { setGeneratingBrief(false) }
  }

  async function saveTitle() {
    if (!titleDraft.trim() || titleDraft === card.topic) { setEditingTitle(false); return }
    await updateCardMeta(card.id, { custom_title: titleDraft.trim() })
    const updated = { ...card, topic: titleDraft.trim(), custom_title: titleDraft.trim() }
    setCard(updated)
    onMetaChange(card.id, { topic: titleDraft.trim(), custom_title: titleDraft.trim() })
    setEditingTitle(false)
  }

  function handleNotesChange(val: string) {
    setNotes(val)
    clearTimeout(notesTimer.current)
    setSavingNotes(true)
    notesTimer.current = setTimeout(async () => {
      await updateCardMeta(card.id, { notes: val }).catch(console.error)
      onMetaChange(card.id, { notes: val })
      setSavingNotes(false)
    }, 800)
  }

  async function handleArchive() {
    await updateCardMeta(card.id, { archived: true })
    await updateCardStatuses({ [card.id]: 'archived' })
    onMove(card.id, 'archived')
    onMetaChange(card.id, { status: 'archived' })
    onClose()
  }

  async function handleMove(status: KanbanStatus) {
    if (status === 'archived') { handleArchive(); return }
    await updateCardStatuses({ [card.id]: status })
    const updated = { ...card, status }
    setCard(updated)
    onMove(card.id, status)
    onMetaChange(card.id, { status })
  }

  const visibleCols = KANBAN_COLS.filter(c => c.id !== 'archived')

  return (
    <div className="absolute inset-y-0 right-0 w-[420px] bg-card border-l border-border flex flex-col shadow-2xl z-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-5 py-4 border-b border-border flex-shrink-0">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                className="flex-1 text-sm font-bold bg-background border border-primary rounded px-2 py-1 focus:outline-none" />
              <button onClick={saveTitle} className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
              <button onClick={() => setEditingTitle(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex items-start gap-1.5 group">
              <p className="text-sm font-bold leading-snug flex-1">{card.topic}</p>
              <button onClick={() => { setEditingTitle(true); setTitleDraft(card.topic) }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground mt-0.5">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground">{card.category}</span>
            <ClassBadge c={card} />
            <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${FORMAT_COLORS[card.format]}`}>{FORMAT_LABELS[card.format]}-form</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ScoreBadge score={card.scores.opportunity} size="lg" />
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Scores */}
        <div className="px-5 py-4 border-b border-border space-y-2.5">
          <ScoreBar label="Demand"      value={card.scores.demand}      color="text-amber-400" />
          <ScoreBar label="Engagement"  value={card.scores.engagement}  color="text-blue-400" />
          <ScoreBar label="Relevance"   value={card.scores.relevance}   color="text-violet-400" />
          <ScoreBar label="Priority"    value={card.scores.opportunity} color={SCORE_COLOR(card.scores.opportunity)} />
        </div>

        {/* Stats */}
        <div className="px-5 py-3 border-b border-border">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-base font-black text-amber-400">{card.frequency}</p>
              <p className="text-xs text-muted-foreground">mentions</p>
            </div>
            <div>
              <p className="text-base font-black">{card.unique_users || '—'}</p>
              <p className="text-xs text-muted-foreground">users</p>
            </div>
            <div>
              <p className="text-base font-black">{card.avg_likes.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">avg likes</p>
            </div>
            <div className="flex flex-col items-center">
              <TREND_ICON trend={card.trend} />
              <p className="text-xs text-muted-foreground capitalize mt-0.5">{card.trend}</p>
            </div>
          </div>
        </div>

        {/* Move to column */}
        <div className="px-5 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Move to column</p>
          <div className="flex flex-wrap gap-1.5">
            {visibleCols.map(col => (
              <button key={col.id} onClick={() => handleMove(col.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  card.status === col.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                }`}>
                {col.label.replace(/^[^\s]+\s/, '')}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="px-5 py-3 border-b border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">Notes</p>
            {savingNotes && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ml-auto" />}
          </div>
          <textarea
            value={notes} onChange={e => handleNotesChange(e.target.value)}
            placeholder="Add notes about this opportunity…"
            rows={3}
            className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary resize-none text-foreground placeholder:text-muted-foreground" />
        </div>

        {/* Archive */}
        <div className="px-5 py-3 border-b border-border">
          <button onClick={handleArchive}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-red-400 transition-colors">
            <Archive className="w-3.5 h-3.5" />Archive this card
          </button>
        </div>

        {/* Example comments */}
        {card.example_comments.length > 0 && (
          <div className="px-5 py-4 border-b border-border">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Audience Comments</p>
            <div className="space-y-2">
              {card.example_comments.slice(0, 3).map((c, i) => (
                <div key={i} className="text-xs p-2.5 bg-secondary/20 rounded text-muted-foreground border-l-2 border-amber-400/30 leading-relaxed">
                  &ldquo;{c}&rdquo;
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Brief */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <p className="text-xs font-bold">AI Content Brief</p>
            </div>
            <button onClick={handleGenerateBrief} disabled={generatingBrief}
              className="flex items-center gap-1 text-xs bg-amber-400 text-black px-2.5 py-1 rounded font-bold hover:bg-amber-300 disabled:opacity-50 transition-colors">
              {generatingBrief ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
              {brief ? 'Regenerate' : 'Generate'}
            </button>
          </div>
          {briefError && <p className="text-xs text-red-400 mb-2">{briefError}</p>}
          {generatingBrief && <p className="text-xs text-muted-foreground">Generating brief…</p>}
          {brief && !generatingBrief && (
            <div className="space-y-4">
              {brief.titles.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wide mb-1.5">Suggested Titles</p>
                  {brief.titles.map((t, i) => (
                    <div key={i} className="text-xs p-2 bg-amber-400/5 border border-amber-400/20 rounded mb-1.5 font-medium">{t}</div>
                  ))}
                </div>
              )}
              {brief.hook && (
                <div>
                  <p className="text-xs font-bold text-blue-400 uppercase tracking-wide mb-1.5">Hook Script</p>
                  <div className="text-xs p-2.5 bg-blue-400/5 border border-blue-400/20 rounded leading-relaxed text-foreground/80">{brief.hook}</div>
                </div>
              )}
              {brief.talkingPoints.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-violet-400 uppercase tracking-wide mb-1.5">Talking Points</p>
                  {brief.talkingPoints.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs mb-1.5">
                      <span className="text-violet-400 font-bold mt-0.5">{i + 1}.</span>
                      <span className="text-foreground/80">{p}</span>
                    </div>
                  ))}
                </div>
              )}
              {brief.targetAudience && (
                <div>
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-wide mb-1.5">Target Audience</p>
                  <p className="text-xs text-foreground/80">{brief.targetAudience}</p>
                </div>
              )}
              {brief.questionsToAnswer.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Questions to Answer</p>
                  {brief.questionsToAnswer.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs mb-1.5">
                      <span className="text-muted-foreground mt-0.5">Q{i + 1}.</span>
                      <span className="text-foreground/80">{q}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AIContentStrategyPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [videos, setVideos] = useState<StrategyVideo[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [cards, setCards] = useState<ContentCard[]>([])
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState(90)
  const [pageTab, setPageTab] = useState<PageTab>('opportunities')
  const [visited, setVisited] = useState<Set<PageTab>>(new Set(['opportunities']))

  // Filters
  const [search, setSearch] = useState('')
  const [filterFormat, setFilterFormat] = useState<string>('all')
  const [filterClass, setFilterClass] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterVideoId, setFilterVideoId] = useState<number | undefined>()
  const [minScore, setMinScore] = useState(0)
  const [showArchived, setShowArchived] = useState(false)

  const [activeCard, setActiveCard] = useState<ContentCard | null>(null)
  const [trendData, setTrendData] = useState<Record<string, Array<{ week: string; count: number }>>>({})

  useEffect(() => { listCreators().then(setCreators) }, [])

  // Fetch video list when creators change
  useEffect(() => {
    if (selected.length > 0) {
      getStrategyVideos(selected).then(setVideos).catch(console.error)
    } else {
      getStrategyVideos().then(setVideos).catch(console.error)
    }
    setFilterVideoId(undefined)
  }, [selected])

  const load = useCallback(() => {
    setLoading(true)
    getContentOpportunityCards({
      creatorIds: selected.length ? selected : undefined,
      period,
      videoId: filterVideoId,
      minScore: minScore > 0 ? minScore : undefined,
    })
      .then(res => setCards(res.items))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selected, period, filterVideoId, minScore])

  useEffect(() => { load() }, [load])

  function switchTab(tab: PageTab) {
    setPageTab(tab)
    setVisited(prev => new Set([...prev, tab]))
  }

  function handleMove(id: string, status: KanbanStatus) {
    setCards(prev => prev.map(c => c.id === id ? { ...c, status } : c))
    if (activeCard?.id === id) setActiveCard(prev => prev ? { ...prev, status } : prev)
  }

  function handleMetaChange(id: string, patch: Partial<ContentCard>) {
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    if (activeCard?.id === id) setActiveCard(prev => prev ? { ...prev, ...patch } : prev)
  }

  const categories = useMemo(() =>
    ['all', ...Array.from(new Set(cards.map(c => c.category))).sort()],
    [cards]
  )

  const filtered = useMemo(() => cards.filter(c => {
    if (!showArchived && c.status === 'archived') return false
    if (search && !c.topic.toLowerCase().includes(search.toLowerCase()) && !c.category.toLowerCase().includes(search.toLowerCase())) return false
    if (filterFormat !== 'all' && c.format !== filterFormat) return false
    if (filterClass !== 'all' && c.classification !== filterClass) return false
    if (filterCategory !== 'all' && c.category !== filterCategory) return false
    return true
  }), [cards, search, filterFormat, filterClass, filterCategory, showArchived])

  const stats = useMemo(() => ({
    total:        filtered.filter(c => c.status !== 'archived').length,
    trending:     filtered.filter(c => c.trend === 'growing').length,
    highPriority: filtered.filter(c => c.scores.opportunity >= 70).length,
    finniki:      filtered.filter(c => c.classification === 'finniki' && c.status !== 'archived').length,
    nonFinniki:   filtered.filter(c => c.classification !== 'finniki' && c.status !== 'archived').length,
  }), [filtered])

  const TABS: { key: PageTab; icon: typeof LayoutGrid; label: string }[] = [
    { key: 'opportunities',   icon: LayoutGrid, label: 'Opportunities' },
    { key: 'clusters',        icon: Tags,        label: 'Topic Clusters' },
    { key: 'recommendations', icon: Sparkles,    label: 'Content Recommendations' },
    { key: 'analytics',       icon: BarChart2,   label: 'Analytics' },
  ]

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold">AI Content Strategy</h1>
        </div>
        <p className="text-xs text-muted-foreground">Transform audience comments into a prioritised content pipeline</p>
      </div>

      {/* Summary cards */}
      <div className="px-6 py-3 border-b border-border flex-shrink-0">
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Content Opportunities', value: stats.total,        color: 'text-foreground' },
            { label: 'Trending Topics',        value: stats.trending,     color: 'text-amber-400' },
            { label: 'High Priority',          value: stats.highPriority, color: 'text-emerald-400' },
            { label: 'Finniki Topics',         value: stats.finniki,      color: 'text-amber-400' },
            { label: 'Non-Finniki Topics',     value: stats.nonFinniki,   color: 'text-muted-foreground' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-lg px-3 py-2.5">
              <div className={`text-xl font-black ${color}`}>{loading ? '—' : value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-2.5 border-b border-border flex-shrink-0 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <CreatorFilter creators={creators} selected={selected} onChange={setSelected} />

          {/* Date range */}
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            {[30, 90, 180].map(d => (
              <button key={d} onClick={() => setPeriod(d)}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${period === d ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                {d}d
              </button>
            ))}
          </div>

          {/* Video filter */}
          {videos.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-muted-foreground" />
              <select value={filterVideoId ?? ''} onChange={e => setFilterVideoId(e.target.value ? Number(e.target.value) : undefined)}
                className="px-2 py-1 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-muted-foreground max-w-[180px]">
                <option value="">All Videos</option>
                {videos.map(v => <option key={v.id} value={v.id}>{v.title.slice(0, 40)}</option>)}
              </select>
            </div>
          )}

          {/* Min score */}
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Min score</span>
            <input type="number" min={0} max={100} step={5} value={minScore}
              onChange={e => setMinScore(Number(e.target.value))}
              className="w-14 px-2 py-1 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          {/* Topic search */}
          <input type="text" placeholder="Search topics…" value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary w-40" />

          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto" />}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Format */}
          {[
            { label: 'All Formats', value: 'all' },
            { label: 'Long', value: 'long' },
            { label: 'Short', value: 'short' },
            { label: 'Both', value: 'both' },
          ].map(({ label, value }) => (
            <button key={value} onClick={() => setFilterFormat(value)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${filterFormat === value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
              {label}
            </button>
          ))}

          <span className="text-border">|</span>

          {/* Classification */}
          {[
            { label: 'All', value: 'all' },
            { label: 'Finniki', value: 'finniki' },
            { label: 'Non-Finniki', value: 'adjacent' },
          ].map(({ label, value }) => (
            <button key={value} onClick={() => setFilterClass(value)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${filterClass === value ? 'border-amber-400 bg-amber-400/10 text-amber-400' : 'border-border text-muted-foreground hover:border-amber-400/50'}`}>
              {label}
            </button>
          ))}

          <span className="text-border">|</span>

          {/* Category */}
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="px-2 py-1 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-muted-foreground">
            {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
          </select>

          {/* Show archived toggle */}
          <button onClick={() => setShowArchived(p => !p)}
            className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${showArchived ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
            <Archive className="w-3 h-3" />Archived
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 border-b border-border flex-shrink-0">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => switchTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              pageTab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Tab panels — lazy mount after first visit */}
      <div className="flex-1 overflow-hidden relative">
        <div className={pageTab === 'opportunities' ? 'h-full' : 'hidden'}>
          {visited.has('opportunities') && (
            <OpportunitiesTab filtered={filtered} loading={loading} onCardClick={setActiveCard} />
          )}
        </div>

        <div className={pageTab === 'clusters' ? 'h-full' : 'hidden'}>
          {visited.has('clusters') && (
            <ClustersTab filtered={filtered} onCardClick={setActiveCard} />
          )}
        </div>

        <div className={pageTab === 'recommendations' ? 'h-full' : 'hidden'}>
          {visited.has('recommendations') && (
            <RecommendationsTab filtered={filtered} onCardClick={setActiveCard} />
          )}
        </div>

        <div className={pageTab === 'analytics' ? 'h-full' : 'hidden'}>
          {visited.has('analytics') && (
            <AnalyticsTab filtered={filtered} selected={selected} trendData={trendData} setTrendData={setTrendData} />
          )}
        </div>

        {/* Card detail panel */}
        {activeCard && (
          <CardDetailPanel
            card={activeCard}
            onClose={() => setActiveCard(null)}
            onMove={handleMove}
            onMetaChange={handleMetaChange}
          />
        )}
      </div>
    </div>
  )
}
