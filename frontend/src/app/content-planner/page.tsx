'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  FileText, Calendar, Search as SearchIcon, Zap, Clock, CheckCircle2,
  ChevronDown, ChevronRight, Sparkles, Tag, Target, Eye, Lightbulb,
  List, BookOpen, Image, Hash, Send, Loader2, Trash2, Edit2, Check,
  X, CalendarDays, AlignLeft, TrendingUp,
} from 'lucide-react'
import {
  listRecommendations, Recommendation,
  generateBrief, listBriefs, updateBrief, deleteBrief, getCalendar,
  ContentBrief, BriefStatus, VideoOutlineSection, ThumbnailIdea,
} from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

type PageTab = 'briefs' | 'calendar'

const STATUS_COLORS: Record<BriefStatus, string> = {
  draft:     'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  ready:     'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  scheduled: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  published: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

const STATUS_FLOW: BriefStatus[] = ['draft', 'ready', 'scheduled', 'published']

const THUMBNAIL_STYLE_COLORS: Record<string, string> = {
  fear:      'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300',
  curiosity: 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300',
  value:     'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300',
  authority: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateShort(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ briefs }: { briefs: ContentBrief[] }) {
  const total = briefs.length
  const ready = briefs.filter(b => b.status === 'ready').length
  const scheduled = briefs.filter(b => b.status === 'scheduled').length
  const published = briefs.filter(b => b.status === 'published').length
  const avgDur = briefs.length
    ? Math.round(briefs.reduce((s, b) => s + (b.estimated_duration ?? 0), 0) / briefs.length)
    : 0

  const stats = [
    { label: 'Total Briefs', value: total, icon: FileText, color: 'text-indigo-500' },
    { label: 'Ready to Shoot', value: ready, icon: CheckCircle2, color: 'text-blue-500' },
    { label: 'Scheduled', value: scheduled, icon: CalendarDays, color: 'text-amber-500' },
    { label: 'Published', value: published, icon: TrendingUp, color: 'text-green-500' },
    { label: 'Avg Duration', value: `${avgDur}m`, icon: Clock, color: 'text-purple-500' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {stats.map(s => (
        <div key={s.label} className="bg-card border rounded-lg p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <s.icon className={`w-4 h-4 ${s.color}`} />
            <span className="text-xs text-muted-foreground">{s.label}</span>
          </div>
          <span className="text-2xl font-bold">{s.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Brief Detail Drawer ───────────────────────────────────────────────────────

function BriefDetail({
  brief,
  onClose,
  onUpdate,
  onDelete,
}: {
  brief: ContentBrief
  onClose: () => void
  onUpdate: (patch: Partial<ContentBrief>) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set(['outline', 'seo']))
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(brief.title ?? '')
  const [editingDate, setEditingDate] = useState(false)
  const [dateDraft, setDateDraft] = useState(
    brief.scheduled_date ? brief.scheduled_date.slice(0, 10) : ''
  )
  const [saving, setSaving] = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)

  const toggle = (key: string) =>
    setOpen(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  const saveTitle = async () => {
    setEditingTitle(false)
    if (titleDraft !== brief.title) onUpdate({ title: titleDraft })
  }

  const saveDate = async () => {
    setEditingDate(false)
    onUpdate({ scheduled_date: dateDraft ? new Date(dateDraft).toISOString() : null })
  }

  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(brief.status) + 1]
  const handleAdvance = () => onUpdate({ status: nextStatus })

  const totalDur = (brief.video_outline || []).reduce((s, sec) => s + (sec.duration_min ?? 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-background border-l shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-6 py-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  className="flex-1 text-lg font-semibold bg-muted rounded px-2 py-1 outline-none"
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                />
                <button onClick={saveTitle} className="p-1 text-green-600 hover:text-green-700"><Check className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h2 className="text-lg font-semibold leading-tight line-clamp-2">{brief.title || brief.topic}</h2>
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditingTitle(true)}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[brief.status]}`}>
                {brief.status}
              </span>
              {brief.classification && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  brief.classification === 'finniki'
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                    : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                }`}>
                  {brief.classification}
                </span>
              )}
              {brief.content_format && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 font-medium">
                  {brief.content_format}
                </span>
              )}
              {totalDur > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />{totalDur}m
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">
          {/* Brief Summary */}
          {brief.brief_summary && (
            <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-lg p-4">
              <p className="text-sm leading-relaxed text-indigo-900 dark:text-indigo-100">{brief.brief_summary}</p>
            </div>
          )}

          {/* Hook */}
          {brief.hook && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" /> Hook
              </h3>
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4 text-sm italic">
                "{brief.hook}"
              </div>
            </div>
          )}

          {/* Target Audience */}
          {brief.target_audience && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-2">
                <Target className="w-3.5 h-3.5" /> Target Audience
              </h3>
              <p className="text-sm">{brief.target_audience}</p>
            </div>
          )}

          {/* Video Outline */}
          {(brief.video_outline?.length ?? 0) > 0 && (
            <div>
              <button
                onClick={() => toggle('outline')}
                className="w-full flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 hover:text-foreground"
              >
                {open.has('outline') ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <List className="w-3.5 h-3.5" /> Video Outline
              </button>
              {open.has('outline') && (
                <div className="space-y-3">
                  {brief.video_outline.map((sec, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{sec.section}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />{sec.duration_min}m
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {sec.points.map((pt, j) => (
                          <li key={j} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                            {pt}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Thumbnail Ideas */}
          {(brief.thumbnail_ideas?.length ?? 0) > 0 && (
            <div>
              <button
                onClick={() => toggle('thumbnails')}
                className="w-full flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 hover:text-foreground"
              >
                {open.has('thumbnails') ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Image className="w-3.5 h-3.5" /> Thumbnail Ideas
              </button>
              {open.has('thumbnails') && (
                <div className="space-y-3">
                  {brief.thumbnail_ideas.map((th, i) => (
                    <div key={i} className={`border rounded-lg p-3 ${THUMBNAIL_STYLE_COLORS[th.style] ?? ''}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wide">{th.style}</span>
                        <span className="font-medium text-sm">— {th.concept}</span>
                      </div>
                      <p className="text-xs leading-relaxed">{th.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SEO */}
          {(brief.seo_primary_keyword || (brief.seo_secondary_keywords?.length ?? 0) > 0) && (
            <div>
              <button
                onClick={() => toggle('seo')}
                className="w-full flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 hover:text-foreground"
              >
                {open.has('seo') ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Hash className="w-3.5 h-3.5" /> SEO
              </button>
              {open.has('seo') && (
                <div className="space-y-3">
                  {brief.seo_primary_keyword && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Primary keyword</p>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium">
                        <SearchIcon className="w-3 h-3" />{brief.seo_primary_keyword}
                      </span>
                    </div>
                  )}
                  {(brief.seo_secondary_keywords?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Secondary keywords</p>
                      <div className="flex flex-wrap gap-2">
                        {brief.seo_secondary_keywords.map((kw, i) => (
                          <span key={i} className="px-2 py-1 bg-muted rounded text-xs">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(brief.seo_tags?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {brief.seo_tags.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-xs text-muted-foreground">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Schedule */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5" /> Scheduled Date
            </h3>
            {editingDate ? (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="border rounded px-2 py-1 text-sm bg-background"
                  value={dateDraft}
                  onChange={e => setDateDraft(e.target.value)}
                />
                <button onClick={saveDate} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-md">Save</button>
                <button onClick={() => setEditingDate(false)} className="text-xs text-muted-foreground">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm">{brief.scheduled_date ? fmtDate(brief.scheduled_date) : 'Not scheduled'}</span>
                <button
                  onClick={() => setEditingDate(true)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {brief.scheduled_date ? 'Change' : 'Set date'}
                </button>
              </div>
            )}
          </div>

          {/* Notes */}
          <NotesEditor brief={brief} onUpdate={onUpdate} />
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-background border-t px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {nextStatus && (
              <button
                onClick={handleAdvance}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
              >
                <Send className="w-3.5 h-3.5" /> Mark as {nextStatus}
              </button>
            )}
          </div>
          {delConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-destructive">Delete this brief?</span>
              <button onClick={onDelete} className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded text-xs">Yes, delete</button>
              <button onClick={() => setDelConfirm(false)} className="px-3 py-1.5 bg-muted rounded text-xs">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setDelConfirm(true)} className="text-destructive hover:text-destructive/80 p-2">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function NotesEditor({ brief, onUpdate }: { brief: ContentBrief; onUpdate: (p: Partial<ContentBrief>) => void }) {
  const [notes, setNotes] = useState(brief.notes ?? '')
  const timer = useRef<NodeJS.Timeout | null>(null)

  const handleChange = (val: string) => {
    setNotes(val)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onUpdate({ notes: val }), 800)
  }

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
        <AlignLeft className="w-3.5 h-3.5" /> Notes
      </h3>
      <textarea
        className="w-full border rounded-lg p-3 text-sm bg-background resize-none min-h-[80px]"
        placeholder="Add production notes…"
        value={notes}
        onChange={e => handleChange(e.target.value)}
      />
    </div>
  )
}

// ── Briefs Tab ────────────────────────────────────────────────────────────────

function BriefsTab({
  approved,
  briefs,
  generating,
  onGenerate,
  onSelectBrief,
  filterStatus,
  setFilterStatus,
  searchText,
  setSearchText,
}: {
  approved: Recommendation[]
  briefs: ContentBrief[]
  generating: Set<number>
  onGenerate: (rec: Recommendation) => void
  onSelectBrief: (b: ContentBrief) => void
  filterStatus: string
  setFilterStatus: (s: string) => void
  searchText: string
  setSearchText: (s: string) => void
}) {
  const alreadyGenerated = new Set(briefs.map(b => b.recommendation_id).filter(Boolean))

  const filteredBriefs = briefs.filter(b => {
    if (filterStatus && b.status !== filterStatus) return false
    if (searchText) {
      const q = searchText.toLowerCase()
      return (b.title ?? b.topic).toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="flex gap-6 h-full">
      {/* Left: approved recommendations queue */}
      <div className="w-80 flex-shrink-0 border-r pr-6">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          Approved — Generate Brief
          <span className="ml-auto text-xs text-muted-foreground">{approved.length}</span>
        </h3>
        <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
          {approved.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No approved recommendations yet.<br />Approve opportunities in AI Content Strategy.
            </p>
          )}
          {approved.map(rec => {
            const done = alreadyGenerated.has(rec.id)
            const busy = generating.has(rec.id)
            return (
              <div key={rec.id} className={`border rounded-lg p-3 space-y-1.5 ${done ? 'opacity-50' : ''}`}>
                <p className="text-sm font-medium line-clamp-2 leading-snug">{rec.suggested_title || rec.topic}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{rec.format}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    rec.classification === 'finniki'
                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                      : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                  }`}>{rec.classification}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">P:{rec.scores.priority}</span>
                </div>
                <button
                  disabled={done || busy}
                  onClick={() => onGenerate(rec)}
                  className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    done
                      ? 'bg-green-50 text-green-600 dark:bg-green-950/30 cursor-default'
                      : busy
                        ? 'bg-muted text-muted-foreground cursor-wait'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                >
                  {busy ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</> :
                   done ? <><CheckCircle2 className="w-3 h-3" /> Brief generated</> :
                   <><FileText className="w-3 h-3" /> Generate Brief</>}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right: saved briefs */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-background"
              placeholder="Search briefs…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>
          <select
            className="border rounded-lg px-3 py-2 text-sm bg-background"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_FLOW.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>

        {filteredBriefs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <FileText className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No briefs yet — generate one from an approved recommendation</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredBriefs.map(b => (
              <BriefCard key={b.id} brief={b} onClick={() => onSelectBrief(b)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BriefCard({ brief, onClick }: { brief: ContentBrief; onClick: () => void }) {
  const totalDur = (brief.video_outline || []).reduce((s, sec) => s + (sec.duration_min ?? 0), 0)
  return (
    <button
      onClick={onClick}
      className="text-left border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all bg-card space-y-3"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-snug line-clamp-2">{brief.title || brief.topic}</p>
          {brief.brief_summary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{brief.brief_summary}</p>
          )}
        </div>
        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[brief.status]}`}>
          {brief.status}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {brief.content_format && (
          <span className="flex items-center gap-1">
            <BookOpen className="w-3 h-3" />{brief.content_format}
          </span>
        )}
        {totalDur > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />{totalDur}m
          </span>
        )}
        {brief.seo_primary_keyword && (
          <span className="flex items-center gap-1 truncate max-w-[140px]">
            <SearchIcon className="w-3 h-3 flex-shrink-0" />{brief.seo_primary_keyword}
          </span>
        )}
        {brief.scheduled_date && (
          <span className="flex items-center gap-1 ml-auto">
            <CalendarDays className="w-3 h-3" />{fmtDateShort(brief.scheduled_date)}
          </span>
        )}
      </div>

      {(brief.video_outline?.length ?? 0) > 0 && (
        <div className="flex gap-1 overflow-hidden">
          {brief.video_outline.slice(0, 5).map((sec, i) => (
            <div
              key={i}
              className="flex-1 h-1.5 rounded-full bg-indigo-200 dark:bg-indigo-900"
              style={{ flexGrow: sec.duration_min }}
              title={`${sec.section} (${sec.duration_min}m)`}
            />
          ))}
        </div>
      )}
    </button>
  )
}

// ── Calendar Tab ──────────────────────────────────────────────────────────────

function CalendarTab({ onSelectBrief }: { onSelectBrief: (b: ContentBrief) => void }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [calBriefs, setCalBriefs] = useState<ContentBrief[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    getCalendar(year, month)
      .then(r => setCalBriefs(r.items))
      .finally(() => setLoading(false))
  }, [year, month])

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDow = new Date(year, month - 1, 1).getDay() // 0=Sun

  const byDay: Record<number, ContentBrief[]> = {}
  for (const b of calBriefs) {
    if (b.scheduled_date) {
      const d = new Date(b.scheduled_date).getDate()
      if (!byDay[d]) byDay[d] = []
      byDay[d].push(b)
    }
  }

  const cells: (null | number)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const todayDate = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : -1

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 border rounded-lg hover:bg-muted">&larr;</button>
          <h2 className="text-lg font-semibold w-36 text-center">{MONTH_NAMES[month - 1]} {year}</h2>
          <button onClick={nextMonth} className="p-2 border rounded-lg hover:bg-muted">&rarr;</button>
        </div>
        <div className="text-sm text-muted-foreground">
          {calBriefs.length} scheduled this month
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 bg-muted/50">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y border-t">
            {cells.map((day, i) => (
              <div
                key={i}
                className={`min-h-[100px] p-2 ${day === null ? 'bg-muted/20' : 'bg-background'} ${day === todayDate ? 'ring-inset ring-2 ring-primary/30' : ''}`}
              >
                {day !== null && (
                  <>
                    <span className={`text-xs font-medium ${day === todayDate ? 'text-primary' : 'text-muted-foreground'}`}>
                      {day}
                    </span>
                    <div className="mt-1 space-y-1">
                      {(byDay[day] ?? []).map(b => (
                        <button
                          key={b.id}
                          onClick={() => onSelectBrief(b)}
                          className={`w-full text-left text-[10px] px-1.5 py-1 rounded truncate leading-tight font-medium ${STATUS_COLORS[b.status]}`}
                          title={b.title ?? b.topic}
                        >
                          {b.title || b.topic}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ContentPlannerPage() {
  const [tab, setTab] = useState<PageTab>('briefs')
  const [visited] = useState(() => new Set<PageTab>(['briefs']))

  const [approved, setApproved] = useState<Recommendation[]>([])
  const [briefs, setBriefs] = useState<ContentBrief[]>([])
  const [generating, setGenerating] = useState<Set<number>>(new Set())
  const [selectedBrief, setSelectedBrief] = useState<ContentBrief | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    listRecommendations({ status: 'approved', pageSize: 200 }).then(r => setApproved(r.items))
    listBriefs({ pageSize: 200 }).then(r => setBriefs(r.items))
  }, [])

  const handleTabChange = (t: PageTab) => {
    visited.add(t)
    setTab(t)
  }

  const handleGenerate = async (rec: Recommendation) => {
    setGenerating(s => new Set(s).add(rec.id))
    try {
      const brief = await generateBrief({ recommendation_id: rec.id })
      setBriefs(prev => [brief, ...prev.filter(b => b.id !== brief.id)])
      setSelectedBrief(brief)
    } catch (e) {
      console.error(e)
    } finally {
      setGenerating(s => { const n = new Set(s); n.delete(rec.id); return n })
    }
  }

  const handleUpdate = async (patch: Partial<ContentBrief>) => {
    if (!selectedBrief) return
    await updateBrief(selectedBrief.id, patch as any)
    const updated = { ...selectedBrief, ...patch }
    setSelectedBrief(updated as ContentBrief)
    setBriefs(prev => prev.map(b => b.id === updated.id ? updated as ContentBrief : b))
  }

  const handleDelete = async () => {
    if (!selectedBrief) return
    await deleteBrief(selectedBrief.id)
    setBriefs(prev => prev.filter(b => b.id !== selectedBrief.id))
    setSelectedBrief(null)
  }

  const TABS: { key: PageTab; label: string; icon: React.ElementType }[] = [
    { key: 'briefs',   label: 'Content Briefs', icon: FileText },
    { key: 'calendar', label: 'Calendar',        icon: Calendar },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-screen-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-amber-500" />
            Content Planner
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Convert approved opportunities into production-ready briefs, outlines, and a content calendar.
          </p>
        </div>

        <SummaryBar briefs={briefs} />

        {/* Tabs */}
        <div className="flex gap-1 border-b mb-6">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        <div style={{ display: tab === 'briefs' ? undefined : 'none' }}>
          {visited.has('briefs') && (
            <BriefsTab
              approved={approved}
              briefs={briefs}
              generating={generating}
              onGenerate={handleGenerate}
              onSelectBrief={setSelectedBrief}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              searchText={searchText}
              setSearchText={setSearchText}
            />
          )}
        </div>
        <div style={{ display: tab === 'calendar' ? undefined : 'none' }}>
          {visited.has('calendar') && (
            <CalendarTab onSelectBrief={setSelectedBrief} />
          )}
        </div>

        {/* Brief Detail Drawer */}
        {selectedBrief && (
          <BriefDetail
            brief={selectedBrief}
            onClose={() => setSelectedBrief(null)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  )
}
