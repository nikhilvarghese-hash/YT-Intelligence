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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

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

  // Parse TOPICS section: "TOPIC: x | ANGLE: y | URGENCY: z | HOOK: h"
  const topicsRaw = get('TOPICS', 'GAPS')
  const topicMap: Record<string, AITopicData> = {}
  topicsRaw.split('\n').forEach(line => {
    const m = line.match(/TOPIC:\s*(.+?)\s*\|\s*ANGLE:\s*(.+?)\s*\|\s*URGENCY:\s*(HIGH|MEDIUM|LOW)\s*\|\s*HOOK:\s*(.+)/i)
    if (m) topicMap[m[1].trim()] = { angle: m[2].trim(), urgency: m[3].toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW', hook: m[4].trim() }
  })

  // Parse GAPS section: "GAP: x | WHY: y | ACTION: z"
  const gapsRaw = get('GAPS', 'NEXT')
  const gapMap: Record<string, AIGapData> = {}
  gapsRaw.split('\n').forEach(line => {
    const m = line.match(/GAP:\s*(.+?)\s*\|\s*WHY:\s*(.+?)\s*\|\s*ACTION:\s*(.+)/i)
    if (m) gapMap[m[1].trim()] = { why: m[2].trim(), action: m[3].trim() }
  })

  // Parse NEXT section: bullet points
  const nextRaw = get('NEXT', '___END___')
  const nextActions = nextRaw.split('\n').map(l => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean)

  return { volumeInsight, topicMap, gapMap, nextActions }
}

const TYPE_COLOR: Record<string, string> = {
  question: '#60a5fa',
  pain_point: '#f59e0b',
  opportunity: '#34d399',
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

  // AI insights state
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
    Promise.all([
      getQuestions(ids),
      getPainPoints(ids),
      getContentOpportunities(ids),
    ]).then(([q, p, o]) => {
      setQuestions(q)
      setPainPoints(p)
      setOpportunities(o)
    }).finally(() => setLoading(false))
  }, [selected])

  async function handleRunAI(incremental: boolean) {
    setRunningAI(true)
    setAiError('')
    setInsight(null)
    setShowInsight(true)
    try {
      const result = await runContentStrategyInsights(
        selected.length ? selected : undefined,
        incremental,
      )
      // Parse structured sections from the raw insight text
      const parsed = result.insight ? parseInsightSections(result.insight) : {}
      setInsight({ ...result, ...parsed })
      loadStatus(selected.length ? selected : undefined)
      if (result.error && !result.insight) setAiError(result.error)
    } catch (e: any) {
      setAiError(e.message)
    } finally {
      setRunningAI(false)
    }
  }

  const maxOpportunityFreq = useMemo(
    () => Math.max(...opportunities.map(o => o.frequency), 1),
    [opportunities]
  )

  const volumeData = useMemo(() => {
    const map = new Map<string, { label: string; frequency: number; type: string }>()
    questions.forEach(q => {
      const label = q.question_text.length > 50 ? q.question_text.slice(0, 50) + '…' : q.question_text
      if (!map.has(label) || map.get(label)!.frequency < q.frequency)
        map.set(label, { label, frequency: q.frequency, type: 'question' })
    })
    painPoints.forEach(p => {
      if (!map.has(p.topic) || map.get(p.topic)!.frequency < p.frequency)
        map.set(p.topic, { label: p.topic, frequency: p.frequency, type: 'pain_point' })
    })
    opportunities.forEach(o => {
      if (!map.has(o.topic) || map.get(o.topic)!.frequency < o.frequency)
        map.set(o.topic, { label: o.topic, frequency: o.frequency, type: 'opportunity' })
    })
    return Array.from(map.values()).sort((a, b) => b.frequency - a.frequency).slice(0, 25)
  }, [questions, painPoints, opportunities])

  const explorerData = useMemo(() => {
    if (explorerFilter === 'questions') return []
    let items = opportunities
    if (explorerFilter === 'high_demand') items = items.filter(o => o.frequency >= 100)
    if (explorerFilter === 'gaps') items = items.filter(o => (o.creators_mentioning?.length ?? 0) <= 1)
    return items
  }, [opportunities, explorerFilter])

  const gapStats = useMemo(() => ({
    totalTopics: opportunities.length + questions.length,
    highDemand: opportunities.filter(o => o.frequency >= 50).length,
    uncovered: opportunities.filter(o => (o.creators_mentioning?.length ?? 0) <= 1).length,
    recurringQuestions: questions.filter(q => q.frequency >= 10).length,
  }), [opportunities, questions])

  const uncoveredTopics = useMemo(() =>
    opportunities.filter(o => (o.creators_mentioning?.length ?? 0) <= 1)
      .sort((a, b) => b.frequency - a.frequency).slice(0, 20),
    [opportunities])

  const topicsNeedingDepth = useMemo(() =>
    questions.filter(q => q.frequency >= 10)
      .sort((a, b) => b.frequency - a.frequency).slice(0, 20),
    [questions])

  const isEmpty = !loading && questions.length === 0 && painPoints.length === 0 && opportunities.length === 0
  const totalTopicClusters = new Set([
    ...questions.map(q => q.question_text.split(' ').slice(0, 3).join(' ')),
    ...painPoints.map(p => p.topic),
    ...opportunities.map(o => o.topic),
  ]).size

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Competitor Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Audience question intelligence · incremental AI content strategy
        </p>
      </div>

      <CreatorFilter creators={creators} selected={selected} onChange={setSelected} />

      {/* Meta pills */}
      {!isEmpty && (
        <div className="flex flex-wrap gap-2 mb-5">
          {[
            { label: 'Comments', value: formatNumber(status?.total_comments ?? 0) },
            { label: 'Questions', value: formatNumber(questions.length) },
            { label: 'Topic Clusters', value: String(totalTopicClusters) },
            { label: 'Content Gaps', value: String(gapStats.uncovered) },
            { label: 'Channels', value: String(creators.length) },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-secondary/40 border border-border">
              <span className="text-muted-foreground">{label}:</span>
              <span className="font-semibold text-amber-400">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Content Strategy Panel ─────────────────────────────────────── */}
      <div className="mb-6 bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">AI Content Strategy</p>
              <p className="text-xs text-muted-foreground">
                {status?.is_first_run
                  ? 'Not yet run — will analyze all comments'
                  : status
                  ? `Last run ${timeAgoShort(status.last_run_at)} · ${formatNumber(status.new_comments_since_last_run)} new comments to analyze`
                  : 'Checking status…'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!status?.is_first_run && (
              <button
                onClick={() => handleRunAI(false)}
                disabled={runningAI || isEmpty}
                title="Re-analyze all comments"
                className="px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
              >
                Full Re-run
              </button>
            )}
            <button
              onClick={() => handleRunAI(true)}
              disabled={runningAI || isEmpty}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 disabled:opacity-40 transition-colors font-medium"
            >
              {runningAI
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
                : <><Zap className="w-3.5 h-3.5" /> {status?.is_first_run ? 'Run Analysis' : 'Run Incremental'}</>
              }
            </button>
          </div>
        </div>

        {/* New comments indicator */}
        {!status?.is_first_run && (status?.new_comments_since_last_run ?? 0) > 0 && !insight && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/5 border border-emerald-400/20 rounded-md px-3 py-2">
              <RefreshCw className="w-3 h-3" />
              {formatNumber(status!.new_comments_since_last_run)} new comments imported since last analysis — click Run Incremental to update insights
            </div>
          </div>
        )}

        {/* AI result */}
        {showInsight && (
          <div className="border-t border-border">
            {runningAI && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Analyzing {status?.is_first_run ? 'all comments' : `${formatNumber(status?.new_comments_since_last_run ?? 0)} new comments`}…
              </div>
            )}
            {!runningAI && aiError && !insight?.insight && (
              <div className="px-4 py-3 text-sm text-amber-400">{aiError}</div>
            )}
            {!runningAI && insight?.insight && (
              <div className="px-4 py-4 space-y-3">
                <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {insight.insight}
                </div>
                <div className="flex items-center gap-3 pt-1 border-t border-border text-xs text-muted-foreground flex-wrap">
                  {insight.comments_analyzed > 0 && (
                    <span>{formatNumber(insight.comments_analyzed)} comments analyzed</span>
                  )}
                  {insight.incremental_since && (
                    <span>Incremental since {new Date(insight.incremental_since).toLocaleDateString()}</span>
                  )}
                  {insight.model_used && <span>Model: {insight.model_used}</span>}
                  <button onClick={() => setShowInsight(false)} className="ml-auto hover:text-foreground">
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          { key: 'volume' as SubTab, label: '📊 Ranked by Volume' },
          { key: 'explorer' as SubTab, label: '🗂 Topic Explorer' },
          { key: 'gaps' as SubTab, label: '🎯 Gap Analysis' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              subTab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-16 text-muted-foreground">Analyzing comments…</div>}
      {isEmpty && !loading && (
        <div className="text-center py-16 border border-dashed border-border rounded-lg text-muted-foreground">
          No data yet. Import creators with comments to see intelligence here.
        </div>
      )}

      {/* ── RANKED BY VOLUME ─────────────────────────────────────────────── */}
      {!loading && !isEmpty && subTab === 'volume' && (
        <div>
          <div className="flex items-center gap-5 mb-4 flex-wrap">
            {[
              { color: TYPE_COLOR.question, label: 'Questions' },
              { color: TYPE_COLOR.pain_point, label: 'Pain Points' },
              { color: TYPE_COLOR.opportunity, label: 'Content Gaps' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                {label}
              </div>
            ))}
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <ResponsiveContainer width="100%" height={Math.max(420, volumeData.length * 34)}>
              <BarChart data={volumeData} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={240} tick={{ fontSize: 11, fill: '#d1d5db' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1c1c1e', border: '1px solid #2d2d2f', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#f3f4f6' }}
                  formatter={(v: number) => [v, 'mentions']}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="frequency" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {volumeData.map((entry, i) => (
                    <Cell key={i} fill={TYPE_COLOR[entry.type] ?? '#60a5fa'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {insight?.volumeInsight && (
            <div className="mt-4 flex items-start gap-2.5 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <Bot className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-foreground/80 leading-relaxed">{insight.volumeInsight}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Top {volumeData.length} topics by mention count
          </p>
        </div>
      )}

      {/* ── TOPIC EXPLORER ───────────────────────────────────────────────── */}
      {!loading && !isEmpty && subTab === 'explorer' && (
        <div>
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <span className="text-xs text-muted-foreground font-semibold mr-1">FILTER:</span>
            {([
              { key: 'all' as ExplorerFilter, label: 'All Topics' },
              { key: 'high_demand' as ExplorerFilter, label: 'High Demand (100+)' },
              { key: 'gaps' as ExplorerFilter, label: 'Gaps Only' },
              { key: 'questions' as ExplorerFilter, label: 'Questions' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setExplorerFilter(key); setExpanded(null) }}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  explorerFilter === key
                    ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {explorerFilter === 'questions' ? (
            <div className="space-y-2">
              {questions.map((q, i) => {
                const aiData = insight?.topicMap?.[q.question_text]
                  ?? Object.entries(insight?.topicMap ?? {}).find(([k]) => q.question_text.toLowerCase().includes(k.toLowerCase()))?.[1]
                return (
                <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpanded(expanded === `q-${i}` ? null : `q-${i}`)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-secondary/20 transition-colors text-left"
                  >
                    <HelpCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="flex-1 text-sm font-medium">{q.question_text}</span>
                    {aiData && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold shrink-0 ${
                        aiData.urgency === 'HIGH' ? 'bg-red-400/15 text-red-400' :
                        aiData.urgency === 'MEDIUM' ? 'bg-amber-400/15 text-amber-400' :
                        'bg-secondary text-muted-foreground'
                      }`}>{aiData.urgency}</span>
                    )}
                    <span className="text-xs bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full shrink-0">×{q.frequency}</span>
                    {expanded === `q-${i}` ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {expanded === `q-${i}` && (
                    <div className="px-4 pb-4 pt-3 border-t border-border space-y-4">
                      {aiData && (
                        <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                          <Bot className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                          <div className="text-xs space-y-1">
                            <p><span className="text-muted-foreground">Angle:</span> <span className="text-foreground/90">{aiData.angle}</span></p>
                            <p><span className="text-muted-foreground">Hook:</span> <span className="text-foreground/90">{aiData.hook}</span></p>
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Audience Questions</p>
                        <div className="space-y-2">
                          {q.example_comments.slice(0, 3).map((c, j) => (
                            <div key={j} className="text-sm p-3 bg-secondary/20 rounded-md text-muted-foreground border border-border border-l-2 border-l-blue-400/40">
                              &ldquo;{c}&rdquo;
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-amber-400 uppercase tracking-wide mb-2">💡 Video Ideas</p>
                        <div className="space-y-1.5">
                          {videoIdeas(q.question_text).map((idea, j) => (
                            <div key={j} className="flex items-start gap-2 text-sm text-amber-200/80 p-2 bg-amber-400/5 rounded border-l-2 border-amber-400/40">
                              <Lightbulb className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                              {idea}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                )
              })}
              {questions.length === 0 && <p className="text-center py-10 text-muted-foreground text-sm">No questions found.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {explorerData.map((o, i) => {
                const coverageCount = o.creators_mentioning?.length ?? 0
                const coveragePct = creators.length > 0 ? Math.round((coverageCount / creators.length) * 100) : 0
                const isGap = coverageCount === 0
                const aiData = insight?.topicMap?.[o.topic]
                  ?? Object.entries(insight?.topicMap ?? {}).find(([k]) => o.topic.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(o.topic.toLowerCase()))?.[1]
                const gapData = insight?.gapMap?.[o.topic]
                  ?? Object.entries(insight?.gapMap ?? {}).find(([k]) => o.topic.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(o.topic.toLowerCase()))?.[1]
                return (
                  <div key={i} className={`bg-card border rounded-lg overflow-hidden transition-colors ${
                    expanded === `o-${i}` ? 'border-blue-500/50' : 'border-border hover:border-border/80'
                  }`}>
                    <button
                      onClick={() => setExpanded(expanded === `o-${i}` ? null : `o-${i}`)}
                      className="w-full p-4 text-left hover:bg-secondary/10 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-bold text-sm leading-snug">{o.topic}</span>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xl font-black text-amber-400">{o.frequency.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">total Qs</div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        {coverageCount} channel{coverageCount !== 1 ? 's' : ''} covering · {coveragePct}% share
                      </div>
                      <div className="w-full bg-secondary rounded-full h-1 mb-2">
                        <div className="bg-amber-400 h-1 rounded-full" style={{ width: `${(o.frequency / maxOpportunityFreq) * 100}%` }} />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isGap
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 border border-red-400/20 font-semibold">⚠ No coverage</span>
                          : (o.creators_mentioning ?? []).slice(0, 3).map(c => (
                            <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">{c}</span>
                          ))
                        }
                        {aiData && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            aiData.urgency === 'HIGH' ? 'bg-red-400/15 text-red-400' :
                            aiData.urgency === 'MEDIUM' ? 'bg-amber-400/15 text-amber-400' :
                            'bg-secondary text-muted-foreground'
                          }`}>{aiData.urgency}</span>
                        )}
                        <span className="ml-auto">
                          {expanded === `o-${i}` ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </span>
                      </div>
                    </button>
                    {expanded === `o-${i}` && (
                      <div className="px-4 pb-4 pt-3 border-t border-border space-y-4">
                        {(aiData || gapData) && (
                          <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                            <Bot className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                            <div className="text-xs space-y-1">
                              {aiData?.angle && <p><span className="text-muted-foreground">Angle:</span> <span className="text-foreground/90">{aiData.angle}</span></p>}
                              {aiData?.hook && <p><span className="text-muted-foreground">Hook:</span> <span className="text-foreground/90">{aiData.hook}</span></p>}
                              {gapData?.why && <p><span className="text-muted-foreground">Opportunity:</span> <span className="text-foreground/90">{gapData.why}</span></p>}
                              {gapData?.action && (
                                <p className="mt-1 text-amber-400 font-medium">▶ {gapData.action}</p>
                              )}
                            </div>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Audience Questions</p>
                          <div className="space-y-2">
                            {o.example_comments.slice(0, 4).map((c, j) => (
                              <div key={j} className="text-sm p-3 bg-secondary/20 rounded-md text-muted-foreground border border-border border-l-2 border-l-border">
                                &ldquo;{c}&rdquo;
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-amber-400 uppercase tracking-wide mb-2">💡 Video Ideas</p>
                          <div className="space-y-1.5">
                            {videoIdeas(o.topic).map((idea, j) => (
                              <div key={j} className="flex items-start gap-2 text-sm text-amber-200/80 p-2 bg-amber-400/5 rounded border-l-2 border-amber-400/40">
                                <Lightbulb className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                                {idea}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {explorerData.length === 0 && (
                <p className="col-span-2 text-center py-10 text-muted-foreground text-sm">No topics match this filter.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── GAP ANALYSIS ─────────────────────────────────────────────────── */}
      {!loading && !isEmpty && subTab === 'gaps' && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Questions Analysed', value: questions.length, color: 'text-amber-400' },
              { label: 'High Demand (50+)', value: gapStats.highDemand, color: 'text-emerald-400' },
              { label: 'Topics w/ Thin Coverage', value: gapStats.uncovered, color: 'text-red-400' },
              { label: 'Recurring Questions', value: gapStats.recurringQuestions, color: 'text-blue-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-border rounded-lg p-4 text-center">
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1 font-semibold uppercase tracking-wide leading-tight">{label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-bold mb-1 pb-2 border-b border-border">
                🚨 High total demand — low coverage (biggest opportunity)
              </h2>
              <div className="space-y-2 mt-3">
                {uncoveredTopics.map((o, i) => {
                  const gapData = insight?.gapMap?.[o.topic]
                    ?? Object.entries(insight?.gapMap ?? {}).find(([k]) => o.topic.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(o.topic.toLowerCase()))?.[1]
                  return (
                  <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{o.topic}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Total demand: {o.frequency.toLocaleString()} questions ·{' '}
                          {(o.creators_mentioning?.length ?? 0) === 0 ? 'No creator coverage' : `${o.creators_mentioning?.length} channel(s)`}
                        </p>
                        {gapData?.why && (
                          <p className="text-xs text-primary/80 mt-1">{gapData.why}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-black text-amber-400">{o.frequency.toLocaleString()}</div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 border border-red-400/20 font-bold">UNDERCOVERED</span>
                      </div>
                    </div>
                    {gapData?.action && (
                      <div className="px-3 pb-3 pt-0">
                        <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded px-2.5 py-1.5">
                          <Lightbulb className="w-3 h-3 flex-shrink-0" />
                          <span className="font-medium">▶ {gapData.action}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })}
                {uncoveredTopics.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">All topics have creator coverage.</p>
                )}
              </div>
            </div>

            {insight?.nextActions && insight.nextActions.length > 0 && (
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Bot className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold">AI Recommended Next Actions</p>
                </div>
                <ul className="space-y-2">
                  {insight.nextActions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                      <span className="text-primary font-bold mt-0.5">•</span>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h2 className="text-sm font-bold mb-1 pb-2 border-b border-border">
                ✅ Topics needing more depth — recurring questions
              </h2>
              <div className="space-y-2 mt-3">
                {topicsNeedingDepth.map((q, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
                    <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold line-clamp-2">{q.question_text}</p>
                      {q.creator_names && q.creator_names.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {q.frequency} questions · across: {q.creator_names.slice(0, 2).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-black text-blue-400">{q.frequency}</div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20 font-bold">DEEP DIVE</span>
                    </div>
                  </div>
                ))}
                {topicsNeedingDepth.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No recurring questions found.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
