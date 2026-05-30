'use client'

import { useEffect, useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Lightbulb, HelpCircle } from 'lucide-react'
import {
  getQuestions, getPainPoints, getContentOpportunities, listCreators,
  type Creator, type Question, type PainPoint, type ContentOpportunity,
} from '@/lib/api'
import { CreatorFilter } from '@/components/analytics/CreatorFilter'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

type SubTab = 'volume' | 'explorer' | 'gaps'
type ExplorerFilter = 'all' | 'high_demand' | 'gaps' | 'questions'

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

  useEffect(() => { listCreators().then(setCreators) }, [])

  useEffect(() => {
    const ids = selected.length ? selected : undefined
    setLoading(true)
    setExpanded(null)
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

  const maxOpportunityFreq = useMemo(
    () => Math.max(...opportunities.map(o => o.frequency), 1),
    [opportunities]
  )

  const volumeData = useMemo(() => {
    const map = new Map<string, { label: string; frequency: number; type: string }>()
    questions.forEach(q => {
      const label = q.question_text.length > 48 ? q.question_text.slice(0, 48) + '…' : q.question_text
      if (!map.has(label) || map.get(label)!.frequency < q.frequency) {
        map.set(label, { label, frequency: q.frequency, type: 'question' })
      }
    })
    painPoints.forEach(p => {
      if (!map.has(p.topic) || map.get(p.topic)!.frequency < p.frequency) {
        map.set(p.topic, { label: p.topic, frequency: p.frequency, type: 'pain_point' })
      }
    })
    opportunities.forEach(o => {
      if (!map.has(o.topic) || map.get(o.topic)!.frequency < o.frequency) {
        map.set(o.topic, { label: o.topic, frequency: o.frequency, type: 'opportunity' })
      }
    })
    return Array.from(map.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 25)
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
    opportunities
      .filter(o => (o.creators_mentioning?.length ?? 0) <= 1)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20),
    [opportunities]
  )

  const topicsNeedingDepth = useMemo(() =>
    questions
      .filter(q => q.frequency >= 10)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20),
    [questions]
  )

  const isEmpty = !loading && questions.length === 0 && painPoints.length === 0 && opportunities.length === 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Competitor Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Audience question intelligence extracted from imported channel comments
        </p>
      </div>

      <CreatorFilter creators={creators} selected={selected} onChange={setSelected} />

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          { key: 'volume' as SubTab, label: 'Ranked by Volume' },
          { key: 'explorer' as SubTab, label: 'Topic Explorer' },
          { key: 'gaps' as SubTab, label: 'Gap Analysis' },
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

      {loading && (
        <div className="text-center py-16 text-muted-foreground">Analyzing comments…</div>
      )}

      {isEmpty && (
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
              <BarChart
                data={volumeData}
                layout="vertical"
                margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={230}
                  tick={{ fontSize: 11, fill: '#d1d5db' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1c1c1e',
                    border: '1px solid #2d2d2f',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
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
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Top {volumeData.length} topics by mention count across questions, pain points, and content gaps
          </p>
        </div>
      )}

      {/* ── TOPIC EXPLORER ───────────────────────────────────────────────── */}
      {!loading && !isEmpty && subTab === 'explorer' && (
        <div>
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {([
              { key: 'all' as ExplorerFilter, label: 'All' },
              { key: 'high_demand' as ExplorerFilter, label: 'High Demand (100+)' },
              { key: 'gaps' as ExplorerFilter, label: 'Gaps Only' },
              { key: 'questions' as ExplorerFilter, label: 'Questions' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setExplorerFilter(key); setExpanded(null) }}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  explorerFilter === key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Questions filter */}
          {explorerFilter === 'questions' && (
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpanded(expanded === `q-${i}` ? null : `q-${i}`)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-secondary/20 transition-colors text-left"
                  >
                    <HelpCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="flex-1 text-sm font-medium">{q.question_text}</span>
                    <span className="text-xs bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full shrink-0">
                      ×{q.frequency}
                    </span>
                    {expanded === `q-${i}`
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {expanded === `q-${i}` && (
                    <div className="px-4 pb-4 pt-3 border-t border-border space-y-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Real Audience Comments
                        </p>
                        <div className="space-y-2">
                          {q.example_comments.slice(0, 3).map((c, j) => (
                            <div key={j} className="text-sm p-3 bg-secondary/20 rounded-md text-muted-foreground border border-border">
                              &ldquo;{c}&rdquo;
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Video Ideas
                        </p>
                        <div className="space-y-1.5">
                          {videoIdeas(q.question_text).map((idea, j) => (
                            <div key={j} className="flex items-start gap-2 text-sm text-foreground/80">
                              <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                              {idea}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {questions.length === 0 && (
                <p className="text-center py-10 text-muted-foreground text-sm">No questions found.</p>
              )}
            </div>
          )}

          {/* Opportunities card grid */}
          {explorerFilter !== 'questions' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {explorerData.map((o, i) => (
                <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpanded(expanded === `o-${i}` ? null : `o-${i}`)}
                    className="w-full p-4 text-left hover:bg-secondary/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-medium text-sm leading-snug">{o.topic}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                        o.frequency >= 100
                          ? 'bg-emerald-400/15 text-emerald-400'
                          : 'bg-yellow-400/10 text-yellow-400'
                      }`}>
                        {o.frequency} mentions
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-1 mb-2">
                      <div
                        className="bg-emerald-400 h-1 rounded-full"
                        style={{ width: `${(o.frequency / maxOpportunityFreq) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1 min-w-0">
                        {(o.creators_mentioning ?? []).slice(0, 2).map(c => (
                          <span key={c} className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded truncate max-w-[120px]">
                            {c}
                          </span>
                        ))}
                        {(o.creators_mentioning?.length ?? 0) === 0 && (
                          <span className="text-xs text-red-400/80">No creator coverage</span>
                        )}
                      </div>
                      {expanded === `o-${i}`
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    </div>
                  </button>

                  {expanded === `o-${i}` && (
                    <div className="px-4 pb-4 pt-3 border-t border-border space-y-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Real Audience Comments
                        </p>
                        <div className="space-y-2">
                          {o.example_comments.slice(0, 3).map((c, j) => (
                            <div key={j} className="text-sm p-3 bg-secondary/20 rounded-md text-muted-foreground border border-border">
                              &ldquo;{c}&rdquo;
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Video Ideas
                        </p>
                        <div className="space-y-1.5">
                          {videoIdeas(o.topic).map((idea, j) => (
                            <div key={j} className="flex items-start gap-2 text-sm text-foreground/80">
                              <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                              {idea}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {explorerData.length === 0 && (
                <p className="col-span-2 text-center py-10 text-muted-foreground text-sm">
                  No topics match this filter.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── GAP ANALYSIS ─────────────────────────────────────────────────── */}
      {!loading && !isEmpty && subTab === 'gaps' && (
        <div>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Topics Analyzed', value: gapStats.totalTopics, color: 'text-violet-400' },
              { label: 'High Demand (50+)', value: gapStats.highDemand, color: 'text-emerald-400' },
              { label: 'Uncovered Gaps', value: gapStats.uncovered, color: 'text-red-400' },
              { label: 'Recurring Questions', value: gapStats.recurringQuestions, color: 'text-blue-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Uncovered topics */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <h2 className="font-semibold text-sm">Uncovered Topics</h2>
                <span className="text-xs text-muted-foreground">({uncoveredTopics.length})</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                High audience demand with minimal or zero creator coverage.
              </p>
              <div className="space-y-2">
                {uncoveredTopics.map((o, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                    <span className="text-xs font-bold text-muted-foreground w-5 text-right mt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{o.topic}</p>
                      {o.example_comments[0] && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          &ldquo;{o.example_comments[0]}&rdquo;
                        </p>
                      )}
                    </div>
                    <span className="text-xs bg-red-400/10 text-red-400 px-2 py-0.5 rounded-full shrink-0 mt-0.5">
                      {o.frequency}×
                    </span>
                  </div>
                ))}
                {uncoveredTopics.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    All topics have creator coverage.
                  </p>
                )}
              </div>
            </div>

            {/* Topics needing depth */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <h2 className="font-semibold text-sm">Topics Needing More Depth</h2>
                <span className="text-xs text-muted-foreground">({topicsNeedingDepth.length})</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Recurring questions showing the audience wants deeper content.
              </p>
              <div className="space-y-2">
                {topicsNeedingDepth.map((q, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                    <span className="text-xs font-bold text-muted-foreground w-5 text-right mt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2">{q.question_text}</p>
                      {q.creator_names && q.creator_names.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Across: {q.creator_names.slice(0, 2).join(', ')}
                        </p>
                      )}
                    </div>
                    <span className="text-xs bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full shrink-0 mt-0.5">
                      {q.frequency}×
                    </span>
                  </div>
                ))}
                {topicsNeedingDepth.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No recurring questions found.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
