'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronRight, Lightbulb, HelpCircle, Bot, Loader2, RefreshCw, Zap } from 'lucide-react'
import {
  getQuestions, getPainPoints, getContentOpportunities, listCreators,
  getInsightStatus, runContentStrategyInsights,
  type Creator, type Question, type PainPoint, type ContentOpportunity,
  type InsightStatus, type ContentStrategyInsight, type AITopicData, type AIGapData,
} from '@/lib/api'
import { CreatorFilter } from '@/components/analytics/CreatorFilter'
import { formatNumber } from '@/lib/utils'

type SubTab = 'volume' | 'explorer' | 'gaps'
type ExplorerFilter = 'all' | 'high_demand' | 'gaps' | 'questions'

function parseInsightSections(raw: string): Partial<ContentStrategyInsight> {
  const get = (marker: string, next: string) => {
    const s = raw.indexOf(`===${marker}===`)
    if (s === -1) return ''
    const e = raw.indexOf(`===${next}===`)
    return raw.slice(s + marker.length + 6, e === -1 ? undefined : e).trim()
  }
  const volumeInsight = get('VOLUME', 'TOPICS')
  const topicsRaw = get('TOPICS', 'GAPS')
  const topicMap: Record<string, AITopicData> = {}
  topicsRaw.split('\n').forEach(line => {
    const m = line.match(/TOPIC:\s*(.+?)\s*\|\s*ANGLE:\s*(.+?)\s*\|\s*URGENCY:\s*(HIGH|MEDIUM|LOW)\s*\|\s*HOOK:\s*(.+)/i)
    if (m) topicMap[m[1].trim()] = { angle: m[2].trim(), urgency: m[3].toUpperCase() as 'HIGH'|'MEDIUM'|'LOW', hook: m[4].trim() }
  })
  const gapsRaw = get('GAPS', 'NEXT')
  const gapMap: Record<string, AIGapData> = {}
  gapsRaw.split('\n').forEach(line => {
    const m = line.match(/GAP:\s*(.+?)\s*\|\s*WHY:\s*(.+?)\s*\|\s*ACTION:\s*(.+)/i)
    if (m) gapMap[m[1].trim()] = { why: m[2].trim(), action: m[3].trim() }
  })
  const nextRaw = get('NEXT', '___END___')
  const nextActions = nextRaw.split('\n').map(l => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean)
  return { volumeInsight, topicMap, gapMap, nextActions }
}

function videoIdeas(topic: string): string[] {
  return [
    `How to ${topic} (Step-by-Step)`,
    `${topic}: Complete Beginner's Guide`,
    `The Truth About ${topic} Nobody Talks About`,
    `${topic} Explained in Under 10 Minutes`,
  ]
}

function timeAgoShort(iso: string | null): string {
  if (!iso) return 'never'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function aiData(insight: ContentStrategyInsight | null, key: string) {
  if (!insight?.topicMap) return undefined
  return insight.topicMap[key] ?? Object.entries(insight.topicMap).find(([k]) =>
    key.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(key.toLowerCase())
  )?.[1]
}

function gapData(insight: ContentStrategyInsight | null, key: string) {
  if (!insight?.gapMap) return undefined
  return insight.gapMap[key] ?? Object.entries(insight.gapMap).find(([k]) =>
    key.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(key.toLowerCase())
  )?.[1]
}

export default function CompetitorAnalyticsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [painPoints, setPainPoints] = useState<PainPoint[]>([])
  const [opportunities, setOpportunities] = useState<ContentOpportunity[]>([])
  const [loading, setLoading] = useState(false)
  const [subTab, setSubTab] = useState<SubTab>('volume')
  const [explorerFilter, setExplorerFilter] = useState<ExplorerFilter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [status, setStatus] = useState<InsightStatus | null>(null)
  const [insight, setInsight] = useState<ContentStrategyInsight | null>(null)
  const [runningAI, setRunningAI] = useState(false)
  const [aiError, setAiError] = useState('')
  const [showInsight, setShowInsight] = useState(false)

  useEffect(() => { listCreators().then(setCreators) }, [])

  const loadStatus = useCallback((ids?: number[]) => {
    getInsightStatus(ids?.length ? ids : undefined).then(setStatus).catch(() => {})
  }, [])

  useEffect(() => {
    const ids = selected.length ? selected : undefined
    setLoading(true)
    setExpanded(null)
    loadStatus(ids)
    Promise.all([getQuestions(ids), getPainPoints(ids), getContentOpportunities(ids)])
      .then(([q, p, o]) => { setQuestions(q); setPainPoints(p); setOpportunities(o) })
      .finally(() => setLoading(false))
  }, [selected])

  async function handleRunAI(incremental: boolean) {
    setRunningAI(true)
    setAiError('')
    setInsight(null)
    setShowInsight(true)
    try {
      const result = await runContentStrategyInsights(selected.length ? selected : undefined, incremental)
      const parsed = result.insight ? parseInsightSections(result.insight) : {}
      setInsight({ ...result, ...parsed })
      loadStatus(selected.length ? selected : undefined)
      if (result.error && !result.insight) setAiError(result.error)
    } catch (e: any) { setAiError(e.message) }
    finally { setRunningAI(false) }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const volumeData = useMemo(() => {
    const map = new Map<string, { label: string; frequency: number; type: string; covered: boolean; coverageCount: number }>()
    questions.forEach(q => {
      const label = q.question_text.length > 52 ? q.question_text.slice(0, 52) + '…' : q.question_text
      if (!map.has(label) || map.get(label)!.frequency < q.frequency)
        map.set(label, { label, frequency: q.frequency, type: 'question', covered: (q.creator_names?.length ?? 0) > 0, coverageCount: q.creator_names?.length ?? 0 })
    })
    painPoints.forEach(p => {
      if (!map.has(p.topic) || map.get(p.topic)!.frequency < p.frequency)
        map.set(p.topic, { label: p.topic, frequency: p.frequency, type: 'pain_point', covered: true, coverageCount: 1 })
    })
    opportunities.forEach(o => {
      if (!map.has(o.topic) || map.get(o.topic)!.frequency < o.frequency)
        map.set(o.topic, { label: o.topic, frequency: o.frequency, type: 'opportunity', covered: (o.creators_mentioning?.length ?? 0) > 0, coverageCount: o.creators_mentioning?.length ?? 0 })
    })
    return Array.from(map.values()).sort((a, b) => b.frequency - a.frequency).slice(0, 25)
  }, [questions, painPoints, opportunities])

  const maxFreq = useMemo(() => Math.max(...volumeData.map(d => d.frequency), 1), [volumeData])
  const maxOppFreq = useMemo(() => Math.max(...opportunities.map(o => o.frequency), 1), [opportunities])

  const explorerData = useMemo(() => {
    if (explorerFilter === 'questions') return []
    let items = opportunities
    if (explorerFilter === 'high_demand') items = items.filter(o => o.frequency >= 100)
    if (explorerFilter === 'gaps') items = items.filter(o => (o.creators_mentioning?.length ?? 0) <= 1)
    return items
  }, [opportunities, explorerFilter])

  const gapStats = useMemo(() => ({
    totalQuestions: questions.length,
    highDemand: opportunities.filter(o => o.frequency >= 50).length,
    thinCoverage: opportunities.filter(o => (o.creators_mentioning?.length ?? 0) <= 1).length,
    recurringQuestions: questions.filter(q => q.frequency >= 10).length,
  }), [opportunities, questions])

  const uncoveredTopics = useMemo(() =>
    opportunities.filter(o => (o.creators_mentioning?.length ?? 0) <= 1).sort((a, b) => b.frequency - a.frequency).slice(0, 20),
    [opportunities])

  const strongTopics = useMemo(() =>
    opportunities.filter(o => (o.creators_mentioning?.length ?? 0) >= 2).sort((a, b) => b.frequency - a.frequency).slice(0, 20),
    [opportunities])

  const isEmpty = !loading && questions.length === 0 && painPoints.length === 0 && opportunities.length === 0
  const totalClusters = new Set([...questions.map(q => q.question_text.split(' ').slice(0, 3).join(' ')), ...painPoints.map(p => p.topic), ...opportunities.map(o => o.topic)]).size

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-7 py-5 border-b border-border">
        <h1 className="text-lg font-bold text-foreground tracking-tight">Audience Question Intelligence</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Live from imported channel comments</p>
        {!isEmpty && (
          <div className="flex flex-wrap gap-3 mt-2.5">
            {[
              { label: 'Total comments', value: formatNumber(status?.total_comments ?? 0) },
              { label: 'Questions extracted', value: formatNumber(questions.length) },
              { label: 'Topic clusters', value: String(totalClusters) },
              { label: 'Content gaps', value: String(gapStats.thinCoverage) },
              { label: 'Channels', value: String(creators.length) },
            ].map(({ label, value }) => (
              <div key={label} className="text-xs px-2.5 py-1 rounded-full bg-secondary/60 border border-border font-semibold">
                {label}: <span className="text-amber-400">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Creator filter ──────────────────────────────────────────────── */}
      <div className="px-7 pt-4">
        <CreatorFilter creators={creators} selected={selected} onChange={setSelected} />
      </div>

      {/* ── AI Content Strategy Panel ───────────────────────────────────── */}
      <div className="px-7 pb-4">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Bot className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-xs font-bold text-foreground">AI Content Strategy</p>
                <p className="text-xs text-muted-foreground">
                  {status?.is_first_run ? 'Not yet run — will analyse all comments'
                    : status ? `Last run ${timeAgoShort(status.last_run_at)} · ${formatNumber(status.new_comments_since_last_run)} new comments`
                    : 'Checking…'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!status?.is_first_run && (
                <button onClick={() => handleRunAI(false)} disabled={runningAI || isEmpty}
                  className="px-3 py-1.5 text-xs border border-border rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40">
                  Full Re-run
                </button>
              )}
              <button onClick={() => handleRunAI(true)} disabled={runningAI || isEmpty}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 text-black text-xs rounded font-bold hover:bg-amber-300 disabled:opacity-40 transition-colors">
                {runningAI ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analysing…</>
                  : <><Zap className="w-3.5 h-3.5" />{status?.is_first_run ? 'Run Analysis' : 'Run Incremental'}</>}
              </button>
            </div>
          </div>

          {!status?.is_first_run && (status?.new_comments_since_last_run ?? 0) > 0 && !insight && (
            <div className="px-4 pb-3">
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded px-3 py-2">
                <RefreshCw className="w-3 h-3" />
                {formatNumber(status!.new_comments_since_last_run)} new comments since last analysis
              </div>
            </div>
          )}

          {showInsight && (
            <div className="border-t border-border">
              {runningAI && <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />Analysing…</div>}
              {!runningAI && aiError && <div className="px-4 py-3 text-xs text-amber-400">{aiError}</div>}
              {!runningAI && insight?.insight && (
                <div className="px-4 py-4">
                  <div className="text-xs text-foreground/85 whitespace-pre-wrap leading-relaxed">{insight.insight}</div>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border text-xs text-muted-foreground flex-wrap">
                    {insight.comments_analyzed > 0 && <span>{formatNumber(insight.comments_analyzed)} comments analysed</span>}
                    {insight.incremental_since && <span>Since {new Date(insight.incremental_since).toLocaleDateString()}</span>}
                    {insight.model_used && <span>Model: {insight.model_used}</span>}
                    <button onClick={() => setShowInsight(false)} className="ml-auto hover:text-foreground">Dismiss</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 px-7 border-b border-border">
        {([
          { key: 'volume' as SubTab, label: '📊 Ranked by Volume' },
          { key: 'explorer' as SubTab, label: '🗂 Topic Explorer' },
          { key: 'gaps' as SubTab, label: '🎯 Gap Analysis' },
        ]).map(({ key, label }) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`px-4 py-2.5 text-xs font-bold rounded-t transition-colors border-b-2 -mb-px ${
              subTab === key
                ? 'text-white bg-secondary border-amber-400'
                : 'text-muted-foreground bg-transparent border-transparent hover:text-foreground'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="px-7 py-5">
        {loading && <div className="text-center py-16 text-muted-foreground text-sm">Analysing comments…</div>}
        {isEmpty && !loading && (
          <div className="text-center py-16 border border-dashed border-border rounded-lg text-muted-foreground text-sm">
            No data yet. Import creators with comments to see intelligence here.
          </div>
        )}

        {/* ── RANKED BY VOLUME ─────────────────────────────────────────── */}
        {!loading && !isEmpty && subTab === 'volume' && (
          <div>
            {/* Legend */}
            <div className="flex flex-wrap gap-5 mb-5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
                Creator covers this topic
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/40" />
                Not covered — gap
              </div>
              <div className="text-xs text-muted-foreground ml-2">
                Bar shows total audience questions · tag = creator coverage
              </div>
            </div>

            {/* AI volume insight */}
            {insight?.volumeInsight && (
              <div className="flex items-start gap-2 mb-5 p-3 bg-amber-400/5 border border-amber-400/20 rounded-lg">
                <Bot className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-foreground/80 leading-relaxed">{insight.volumeInsight}</p>
              </div>
            )}

            {/* Custom CSS bars */}
            <div className="space-y-1.5">
              {volumeData.map((d, i) => {
                const pct = Math.round((d.frequency / maxFreq) * 100)
                const isCovered = d.coverageCount > 0
                const tag = isCovered ? `${d.coverageCount} ch.` : 'GAP'
                const ai = aiData(insight, d.label)
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-52 text-right text-xs text-foreground/80 truncate flex-shrink-0" title={d.label}>
                      {d.label}
                    </div>
                    <div className="flex-1 bg-secondary/40 rounded h-7 overflow-hidden relative">
                      <div
                        className={`h-full rounded flex items-center pl-2.5 relative transition-all ${
                          isCovered
                            ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                            : 'bg-gradient-to-r from-muted-foreground/50 to-muted-foreground/40'
                        }`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      >
                        <span className="text-xs font-bold text-white/90 z-10">{d.frequency.toLocaleString()}</span>
                        <span className="absolute right-2 text-xs font-bold text-white/70">{tag}</span>
                      </div>
                      {ai && (
                        <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold px-1.5 py-0.5 rounded ${
                          ai.urgency === 'HIGH' ? 'text-red-400' : ai.urgency === 'MEDIUM' ? 'text-amber-400' : 'text-muted-foreground'
                        }`}>{ai.urgency}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── TOPIC EXPLORER ───────────────────────────────────────────── */}
        {!loading && !isEmpty && subTab === 'explorer' && (
          <div>
            {/* Filter row */}
            <div className="flex flex-wrap gap-2 mb-5 items-center">
              <span className="text-xs text-muted-foreground font-bold tracking-wide mr-1">FILTER:</span>
              {([
                { key: 'all' as ExplorerFilter, label: 'All Topics' },
                { key: 'high_demand' as ExplorerFilter, label: 'High Demand (100+)' },
                { key: 'gaps' as ExplorerFilter, label: 'Low Coverage' },
                { key: 'questions' as ExplorerFilter, label: 'Questions' },
              ]).map(({ key, label }) => (
                <button key={key} onClick={() => { setExplorerFilter(key); setExpanded(null) }}
                  className={`px-3 py-1.5 text-xs rounded-full border font-semibold transition-colors ${
                    explorerFilter === key
                      ? 'bg-amber-400 border-amber-400 text-black'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:border-amber-400/50 hover:text-foreground'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Questions list */}
            {explorerFilter === 'questions' && (
              <div className="space-y-2">
                {questions.map((q, i) => {
                  const ai = aiData(insight, q.question_text)
                  return (
                    <div key={i} className={`bg-card border rounded-lg overflow-hidden transition-colors ${expanded === `q-${i}` ? 'border-amber-400/50' : 'border-border'}`}>
                      <button onClick={() => setExpanded(expanded === `q-${i}` ? null : `q-${i}`)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors text-left">
                        <HelpCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="flex-1 text-xs font-semibold">{q.question_text}</span>
                        {ai && <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          ai.urgency === 'HIGH' ? 'bg-red-400/15 text-red-400' : ai.urgency === 'MEDIUM' ? 'bg-amber-400/15 text-amber-400' : 'bg-secondary text-muted-foreground'
                        }`}>{ai.urgency}</span>}
                        <span className="text-xs bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded-full shrink-0 font-bold">×{q.frequency}</span>
                        {expanded === `q-${i}` ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                      {expanded === `q-${i}` && (
                        <div className="px-4 pb-4 pt-3 border-t border-border space-y-3">
                          {ai && (
                            <div className="flex items-start gap-2 p-2.5 bg-amber-400/5 border border-amber-400/20 rounded">
                              <Bot className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                              <div className="text-xs space-y-0.5">
                                {ai.angle && <p><span className="text-muted-foreground">Angle:</span> {ai.angle}</p>}
                                {ai.hook && <p><span className="text-muted-foreground">Hook:</span> {ai.hook}</p>}
                              </div>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Audience Questions</p>
                            {q.example_comments.slice(0, 3).map((c, j) => (
                              <div key={j} className="text-xs p-2.5 bg-secondary/20 rounded mb-1.5 text-muted-foreground border-l-2 border-amber-400/30 leading-relaxed">
                                &ldquo;{c}&rdquo;
                              </div>
                            ))}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">💡 Video Ideas</p>
                            {videoIdeas(q.question_text).map((idea, j) => (
                              <div key={j} className="text-xs p-2 bg-amber-400/5 rounded mb-1 text-amber-200/80 border-l-2 border-amber-400/40">{idea}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {questions.length === 0 && <p className="text-center py-10 text-muted-foreground text-xs">No questions found.</p>}
              </div>
            )}

            {/* Opportunities card grid */}
            {explorerFilter !== 'questions' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {explorerData.map((o, i) => {
                  const coverageCount = o.creators_mentioning?.length ?? 0
                  const coveragePct = creators.length > 0 ? Math.round((coverageCount / creators.length) * 100) : 0
                  const isGap = coverageCount === 0
                  const ai = aiData(insight, o.topic)
                  const gap = gapData(insight, o.topic)
                  return (
                    <div key={i} onClick={() => setExpanded(expanded === `o-${i}` ? null : `o-${i}`)}
                      className={`bg-card border rounded-xl p-4 cursor-pointer transition-colors ${
                        expanded === `o-${i}` ? 'border-blue-500/50' : 'border-border hover:border-border/60'
                      }`}>
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div>
                          <p className="text-sm font-bold text-foreground leading-snug">{o.topic}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {coverageCount} channel{coverageCount !== 1 ? 's' : ''} · {coveragePct}% share
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-2xl font-black text-amber-400 leading-none">{o.frequency.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">total Qs</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-secondary rounded-full h-1 mb-2.5">
                        <div className="bg-amber-400 h-1 rounded-full" style={{ width: `${(o.frequency / maxOppFreq) * 100}%` }} />
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isGap
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 border border-red-400/20 font-bold">⚠ No coverage</span>
                          : (o.creators_mentioning ?? []).slice(0, 3).map(c => (
                            <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">{c}</span>
                          ))
                        }
                        {ai && <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          ai.urgency === 'HIGH' ? 'bg-red-400/15 text-red-400' : ai.urgency === 'MEDIUM' ? 'bg-amber-400/15 text-amber-400' : 'bg-secondary text-muted-foreground'
                        }`}>{ai.urgency}</span>}
                        <span className="ml-auto text-muted-foreground">
                          {expanded === `o-${i}` ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </span>
                      </div>

                      {/* Expanded */}
                      {expanded === `o-${i}` && (
                        <div className="mt-3 pt-3 border-t border-border space-y-3" onClick={e => e.stopPropagation()}>
                          {(ai || gap) && (
                            <div className="flex items-start gap-2 p-2.5 bg-amber-400/5 border border-amber-400/20 rounded">
                              <Bot className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                              <div className="text-xs space-y-0.5">
                                {ai?.angle && <p><span className="text-muted-foreground">Angle:</span> {ai.angle}</p>}
                                {ai?.hook && <p><span className="text-muted-foreground">Hook:</span> {ai.hook}</p>}
                                {gap?.why && <p><span className="text-muted-foreground">Opportunity:</span> {gap.why}</p>}
                                {gap?.action && <p className="text-amber-400 font-medium mt-1">▶ {gap.action}</p>}
                              </div>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Audience Questions</p>
                            {o.example_comments.slice(0, 4).map((c, j) => (
                              <div key={j} className="text-xs p-2.5 bg-secondary/20 rounded mb-1.5 text-muted-foreground border-l-2 border-border leading-relaxed">
                                &ldquo;{c}&rdquo;
                              </div>
                            ))}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">💡 Video Ideas</p>
                            {videoIdeas(o.topic).map((idea, j) => (
                              <div key={j} className="text-xs p-2 bg-amber-400/5 rounded mb-1 text-amber-200/80 border-l-2 border-amber-400/40">{idea}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {explorerData.length === 0 && <p className="col-span-2 text-center py-10 text-muted-foreground text-xs">No topics match this filter.</p>}
              </div>
            )}
          </div>
        )}

        {/* ── GAP ANALYSIS ─────────────────────────────────────────────── */}
        {!loading && !isEmpty && subTab === 'gaps' && (
          <div>
            {/* Stats row */}
            <div className="flex gap-3 mb-6 flex-wrap">
              {[
                { num: gapStats.totalQuestions, label: 'TOTAL QUESTIONS ANALYSED', color: 'text-amber-400' },
                { num: questions.filter(q => q.creator_names && q.creator_names.length > 0).length, label: 'YOUR CHANNEL QUESTIONS', color: 'text-amber-400' },
                { num: gapStats.thinCoverage, label: 'TOPICS WITH THIN COVERAGE', color: 'text-red-400' },
              ].map(({ num, label, color }) => (
                <div key={label} className="flex-1 min-w-[140px] bg-card border border-border rounded-lg px-4 py-3.5 text-center">
                  <div className={`text-3xl font-black ${color}`}>{num}</div>
                  <div className="text-xs text-muted-foreground mt-1 font-bold tracking-wide leading-tight">{label}</div>
                </div>
              ))}
            </div>

            {/* AI next actions */}
            {insight?.nextActions && insight.nextActions.length > 0 && (
              <div className="mb-6 p-4 bg-amber-400/5 border border-amber-400/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2.5">
                  <Bot className="w-4 h-4 text-amber-400" />
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">AI Recommended Next Actions</p>
                </div>
                {insight.nextActions.map((action, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-foreground/80 mb-1.5">
                    <span className="text-amber-400 font-bold mt-0.5">•</span>{action}
                  </div>
                ))}
              </div>
            )}

            {/* Gaps section */}
            <div className="mb-6">
              <div className="text-sm font-bold pb-2 mb-3 border-b border-border">
                🚨 High total demand — low coverage (biggest opportunity)
              </div>
              <div className="space-y-2">
                {uncoveredTopics.map((o, i) => {
                  const gap = gapData(insight, o.topic)
                  return (
                    <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{o.topic}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Total demand: {o.frequency.toLocaleString()} questions · {(o.creators_mentioning?.length ?? 0) === 0 ? 'No coverage' : `${o.creators_mentioning?.length} channel(s)`}
                          </p>
                          {gap?.why && <p className="text-xs text-primary/80 mt-1">{gap.why}</p>}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <div className="text-base font-black text-amber-400">{o.frequency.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">0 ch. coverage</div>
                          </div>
                          <span className="text-xs px-2.5 py-1 rounded-full bg-red-400/10 text-red-400 border border-red-400/20 font-bold">UNDERCOVERED</span>
                        </div>
                      </div>
                      {gap?.action && (
                        <div className="px-4 pb-3">
                          <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded px-2.5 py-1.5 font-medium">
                            <Lightbulb className="w-3 h-3 flex-shrink-0" />▶ {gap.action}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {uncoveredTopics.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">All topics have creator coverage.</p>}
              </div>
            </div>

            {/* Strong topics */}
            <div>
              <div className="text-sm font-bold pb-2 mb-3 border-b border-border">
                ✅ Topics with strong creator coverage
              </div>
              <div className="space-y-2">
                {strongTopics.map((o, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 bg-card border border-border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{o.topic}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(o.creators_mentioning ?? []).join(', ').slice(0, 60)}
                        {(o.creators_mentioning?.length ?? 0) > 0 && ` · ${o.creators_mentioning!.length} creators`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-base font-black text-amber-400">{o.frequency.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">{o.creators_mentioning?.length ?? 0} channels</div>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20 font-bold">STRONG</span>
                    </div>
                  </div>
                ))}
                {strongTopics.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No strongly covered topics yet.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
