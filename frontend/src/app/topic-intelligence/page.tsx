'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  Telescope, Loader2, RefreshCw, TrendingUp, TrendingDown,
  Minus, ChevronRight, ChevronDown, Users, MessageSquare,
  Video, Sparkles, AlertCircle, X, Filter,
} from 'lucide-react'
import {
  getTopicThemes, rebuildTopicThemes, getTopicThemeStatus,
  listCreators, type TopicTheme, type Creator,
} from '@/lib/api'
import { CreatorFilter } from '@/components/analytics/CreatorFilter'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TREND_ICON = ({ trend }: { trend: string }) =>
  trend === 'growing'    ? <TrendingUp  className="w-3.5 h-3.5 text-emerald-400" />
  : trend === 'declining'  ? <TrendingDown className="w-3.5 h-3.5 text-red-400" />
  : <Minus className="w-3.5 h-3.5 text-muted-foreground" />

const TREND_LABEL: Record<string, string> = {
  growing: 'Growing', stable: 'Stable', declining: 'Declining',
}
const TREND_COLOR: Record<string, string> = {
  growing: 'text-emerald-400', stable: 'text-muted-foreground', declining: 'text-red-400',
}

function growthLabel(rate: number): string {
  const pct = Math.abs(Math.round(rate * 100))
  if (rate > 0) return `+${pct}%`
  if (rate < 0) return `-${pct}%`
  return '0%'
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ themes }: { themes: TopicTheme[] }) {
  const stats = useMemo(() => ({
    total:      themes.length,
    finniki:    themes.filter(t => t.finniki).length,
    nonFinniki: themes.filter(t => !t.finniki).length,
    growing:    themes.filter(t => t.trend === 'growing').length,
    mentions:   themes.reduce((s, t) => s + t.total_mentions, 0),
    users:      themes.reduce((s, t) => s + t.unique_users, 0),
  }), [themes])

  return (
    <div className="grid grid-cols-6 gap-3 px-6 py-3 border-b border-border flex-shrink-0">
      {[
        { label: 'Total Themes',    value: stats.total,      color: 'text-foreground'    },
        { label: 'Finniki',         value: stats.finniki,    color: 'text-amber-400'     },
        { label: 'Non-Finniki',     value: stats.nonFinniki, color: 'text-muted-foreground' },
        { label: 'Growing',         value: stats.growing,    color: 'text-emerald-400'   },
        { label: 'Total Mentions',  value: stats.mentions,   color: 'text-blue-400'      },
        { label: 'Unique Users',    value: stats.users,      color: 'text-violet-400'    },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-card border border-border rounded-lg px-3 py-2.5">
          <div className={`text-xl font-black ${color}`}>{value.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Theme card ────────────────────────────────────────────────────────────────

function ThemeCard({ theme, onSelect }: { theme: TopicTheme; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors cursor-pointer group">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
              theme.finniki ? 'bg-amber-400/15 text-amber-400' : 'bg-secondary text-muted-foreground'
            }`}>
              {theme.finniki ? 'Finniki' : 'Adjacent'}
            </span>
            {theme.finniki && (
              <span className="text-xs text-muted-foreground">{Math.round(theme.finniki_confidence * 100)}% conf.</span>
            )}
          </div>
          <h3 className="text-sm font-bold leading-snug group-hover:text-primary transition-colors">{theme.name}</h3>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
      </div>

      {/* Summary */}
      {theme.summary && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{theme.summary}</p>
      )}

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <p className="text-sm font-black text-foreground">{theme.total_mentions.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">mentions</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-black text-foreground">{theme.unique_users.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">users</p>
        </div>
        <div className="text-center">
          <p className={`text-sm font-black ${TREND_COLOR[theme.trend]}`}>{growthLabel(theme.growth_rate)}</p>
          <p className="text-xs text-muted-foreground">growth</p>
        </div>
      </div>

      {/* Trend */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <TREND_ICON trend={theme.trend} />
          <span className={`text-xs font-semibold ${TREND_COLOR[theme.trend]}`}>{TREND_LABEL[theme.trend]}</span>
        </div>
        <span className="text-xs text-muted-foreground">{theme.representative_questions.length} questions</span>
      </div>

      {/* Keywords */}
      <div className="flex flex-wrap gap-1">
        {theme.top_keywords.slice(0, 5).map(kw => (
          <span key={kw} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{kw}</span>
        ))}
      </div>
    </div>
  )
}

// ── Theme detail drawer ───────────────────────────────────────────────────────

function ThemeDetail({ theme, onClose }: { theme: TopicTheme; onClose: () => void }) {
  return (
    <div className="absolute inset-y-0 right-0 w-[480px] bg-card border-l border-border flex flex-col shadow-2xl z-30">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                theme.finniki ? 'bg-amber-400/15 text-amber-400' : 'bg-secondary text-muted-foreground'
              }`}>
                {theme.finniki ? 'Finniki' : 'Adjacent'}
              </span>
              {theme.finniki && (
                <span className="text-xs text-muted-foreground">
                  {Math.round(theme.finniki_confidence * 100)}% confidence
                </span>
              )}
              <div className="flex items-center gap-1 ml-auto">
                <TREND_ICON trend={theme.trend} />
                <span className={`text-xs font-semibold ${TREND_COLOR[theme.trend]}`}>
                  {TREND_LABEL[theme.trend]}
                </span>
              </div>
            </div>
            <h2 className="text-base font-bold">{theme.name}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3 px-5 py-4 border-b border-border">
          <div className="bg-secondary/20 rounded-lg p-3 text-center">
            <p className="text-lg font-black">{theme.total_mentions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Mentions</p>
          </div>
          <div className="bg-secondary/20 rounded-lg p-3 text-center">
            <p className="text-lg font-black">{theme.unique_users.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Unique Users</p>
          </div>
          <div className="bg-secondary/20 rounded-lg p-3 text-center">
            <p className={`text-lg font-black ${TREND_COLOR[theme.trend]}`}>{growthLabel(theme.growth_rate)}</p>
            <p className="text-xs text-muted-foreground">Growth Rate</p>
          </div>
        </div>

        {/* Summary */}
        {theme.summary && (
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">AI Summary</p>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">{theme.summary}</p>
          </div>
        )}

        {/* Keywords */}
        <div className="px-5 py-4 border-b border-border">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Top Keywords</p>
          <div className="flex flex-wrap gap-1.5">
            {theme.top_keywords.map(kw => (
              <span key={kw} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">{kw}</span>
            ))}
          </div>
        </div>

        {/* Representative questions */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-1.5 mb-3">
            <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Representative Questions ({theme.all_questions.length} total)
            </p>
          </div>
          <div className="space-y-2">
            {theme.representative_questions.map((q, i) => (
              <div key={i} className="text-xs p-2.5 bg-secondary/20 rounded-lg text-foreground/80 border-l-2 border-blue-400/30 leading-relaxed">
                &ldquo;{q}&rdquo;
              </div>
            ))}
          </div>
        </div>

        {/* Related videos */}
        {theme.related_videos.length > 0 && (
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-1.5 mb-3">
              <Video className="w-3.5 h-3.5 text-violet-400" />
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Related Videos</p>
            </div>
            <div className="space-y-2">
              {theme.related_videos.map((v, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <p className="text-foreground/80 truncate flex-1 mr-3">{v.title}</p>
                  <span className="text-muted-foreground flex-shrink-0">{v.count} comments</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All questions (collapsible) */}
        {theme.all_questions.length > theme.representative_questions.length && (
          <AllQuestionsSection questions={theme.all_questions} />
        )}
      </div>
    </div>
  )
}

function AllQuestionsSection({ questions }: { questions: string[] }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const PER_PAGE = 20
  const shown = questions.slice(0, page * PER_PAGE)

  return (
    <div className="px-5 py-4">
      <button onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors w-full">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        All Questions ({questions.length})
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {shown.map((q, i) => (
            <div key={i} className="text-xs text-muted-foreground py-1 border-b border-border/50 last:border-0">
              {q}
            </div>
          ))}
          {shown.length < questions.length && (
            <button onClick={() => setPage(p => p + 1)}
              className="text-xs text-primary hover:underline pt-1">
              Show {Math.min(PER_PAGE, questions.length - shown.length)} more
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Building overlay ──────────────────────────────────────────────────────────

function BuildingBanner({ startedAt }: { startedAt?: string }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex items-center gap-3 mx-6 my-3 p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs">
      <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
      <div>
        <p className="font-semibold text-primary">Building topic clusters…</p>
        <p className="text-muted-foreground">
          Extracting questions, clustering semantically, enriching with AI.
          This takes 10–30 seconds.
          {elapsed > 5 && ` (${elapsed}s elapsed)`}
        </p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TopicIntelligencePage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [period, setPeriod] = useState(90)
  const [themes, setThemes] = useState<TopicTheme[]>([])
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState('')
  const [status, setStatus] = useState<'idle' | 'cached' | 'building' | 'ready'>('idle')
  const [lastBuilt, setLastBuilt] = useState<string | null>(null)
  const [selectedTheme, setSelectedTheme] = useState<TopicTheme | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  // Filters
  const [filterFinniki, setFilterFinniki] = useState<'all' | 'finniki' | 'adjacent'>('all')
  const [filterTrend, setFilterTrend] = useState<'all' | 'growing' | 'stable' | 'declining'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { listCreators().then(setCreators) }, [])

  const load = useCallback((forceRebuild = false) => {
    getTopicThemes(selected.length ? selected : undefined, period, forceRebuild)
      .then(res => {
        setThemes(res.themes)
        setBuilding(res.building)
        setBuildError(res.error)
        setStatus(res.status)
      })
      .catch(console.error)
  }, [selected, period])

  useEffect(() => { load() }, [load])

  // Poll while building
  useEffect(() => {
    if (!building) {
      clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(() => {
      getTopicThemeStatus().then(s => {
        setBuilding(s.building)
        setBuildError(s.error)
        if (!s.building) {
          clearInterval(pollRef.current)
          load()
        }
      }).catch(console.error)
    }, 2500)
    return () => clearInterval(pollRef.current)
  }, [building, load])

  async function handleRebuild() {
    setBuilding(true)
    setBuildError('')
    setStatus('building')
    await rebuildTopicThemes(selected.length ? selected : undefined, period).catch(console.error)
  }

  const filtered = useMemo(() => themes.filter(t => {
    if (filterFinniki === 'finniki' && !t.finniki) return false
    if (filterFinniki === 'adjacent' && t.finniki) return false
    if (filterTrend !== 'all' && t.trend !== filterTrend) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) &&
        !t.top_keywords.some(k => k.includes(search.toLowerCase()))) return false
    return true
  }), [themes, filterFinniki, filterTrend, search])

  const hasData = themes.length > 0

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Telescope className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold">Topic Intelligence</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Semantic clusters from audience questions — dynamically generated, AI-named
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasData && (
              <span className="text-xs text-muted-foreground">
                {status === 'cached' ? 'Cached' : 'Live'}
              </span>
            )}
            <button
              onClick={handleRebuild}
              disabled={building}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium">
              <RefreshCw className={`w-3.5 h-3.5 ${building ? 'animate-spin' : ''}`} />
              {building ? 'Building…' : hasData ? 'Rebuild' : 'Build Clusters'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary bar (only when data exists) */}
      {hasData && <SummaryBar themes={themes} />}

      {/* Filters */}
      <div className="px-6 py-2.5 border-b border-border flex-shrink-0 flex items-center gap-3 flex-wrap">
        <CreatorFilter creators={creators} selected={selected} onChange={setSelected} />

        {/* Period */}
        <div className="flex items-center gap-1">
          {[30, 90, 180].map(d => (
            <button key={d} onClick={() => setPeriod(d)}
              className={`px-2.5 py-1 text-xs rounded border transition-colors ${period === d ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
              {d}d
            </button>
          ))}
        </div>

        <span className="text-border">|</span>

        {/* Finniki filter */}
        {(['all', 'finniki', 'adjacent'] as const).map(v => (
          <button key={v} onClick={() => setFilterFinniki(v)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              filterFinniki === v
                ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                : 'border-border text-muted-foreground hover:border-amber-400/50'
            }`}>
            {v === 'all' ? 'All' : v === 'finniki' ? 'Finniki' : 'Non-Finniki'}
          </button>
        ))}

        <span className="text-border">|</span>

        {/* Trend filter */}
        {(['all', 'growing', 'stable', 'declining'] as const).map(v => (
          <button key={v} onClick={() => setFilterTrend(v)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              filterTrend === v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
            }`}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}

        <input
          type="text" placeholder="Search themes…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary w-40 ml-auto" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <div className="h-full overflow-y-auto">
          {/* Building state */}
          {building && <BuildingBanner />}

          {/* Error */}
          {buildError && !building && (
            <div className="mx-6 my-3 flex items-center gap-2 text-xs text-red-400 p-3 bg-red-400/5 border border-red-400/20 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {buildError}
            </div>
          )}

          {/* Empty state */}
          {!building && !hasData && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <Telescope className="w-10 h-10 text-muted-foreground/30 mb-4" />
              <h2 className="text-sm font-bold mb-2">No topic clusters yet</h2>
              <p className="text-xs text-muted-foreground mb-4 max-w-sm">
                Click <strong>Build Clusters</strong> to analyse your audience comments and generate AI-powered topic themes.
                First run takes 15–30 seconds. Results are cached for 6 hours.
              </p>
              <button onClick={handleRebuild}
                className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium">
                Build Clusters
              </button>
            </div>
          )}

          {/* Theme grid */}
          {hasData && !building && (
            <div className="p-5">
              {filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  No themes match the current filters.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-muted-foreground">
                      Showing {filtered.length} of {themes.length} themes
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Finniki</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-secondary inline-block" />Adjacent</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map(theme => (
                      <ThemeCard
                        key={theme.id}
                        theme={theme}
                        onSelect={() => setSelectedTheme(theme)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Detail drawer */}
        {selectedTheme && (
          <ThemeDetail
            theme={selectedTheme}
            onClose={() => setSelectedTheme(null)}
          />
        )}
      </div>
    </div>
  )
}
