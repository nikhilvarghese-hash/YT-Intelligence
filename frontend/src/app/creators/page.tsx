'use client'

import { useEffect, useState, useRef } from 'react'
import { Plus, Search, Trash2, ExternalLink, RefreshCw, X, CheckSquare, Square, PlayCircle, TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react'
import {
  listCreators, discoverCreator, startImport, getImportStreamUrl,
  deleteCreator, getVideoTopics,
  type Creator, type CreatorDiscoveryResult, type ImportStatus, type VideoTopic,
} from '@/lib/api'
import { formatNumber, formatDate } from '@/lib/utils'
import Link from 'next/link'

type Tab = 'creators' | 'sync-all' | 'topics'
const VIDEO_COUNT_OPTIONS = [10, 25, 50, 100, 500, 1000]

// ── Sync All Tab ──────────────────────────────────────────────────────────────

interface SyncAllState {
  status: 'idle' | 'running' | 'done'
  current: number  // index into queue
  results: Record<number, { progress: ImportStatus | null; done: boolean; error?: string }>
}

function SyncAllTab({ creators }: { creators: Creator[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set(creators.map(c => c.id)))
  const [videoCount, setVideoCount] = useState(25)
  const [state, setState] = useState<SyncAllState>({ status: 'idle', current: 0, results: {} })
  const esRef = useRef<EventSource | null>(null)
  const queueRef = useRef<Creator[]>([])
  const indexRef = useRef(0)

  useEffect(() => {
    setSelected(new Set(creators.map(c => c.id)))
  }, [creators])

  function toggleAll() {
    if (selected.size === creators.length) setSelected(new Set())
    else setSelected(new Set(creators.map(c => c.id)))
  }

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function syncNext(queue: Creator[], idx: number) {
    if (idx >= queue.length) {
      setState(prev => ({ ...prev, status: 'done' }))
      return
    }
    const creator = queue[idx]
    indexRef.current = idx
    setState(prev => ({ ...prev, current: idx }))

    startImport(creator.channel_id, videoCount)
      .then(({ job_id }) => {
        const es = new EventSource(getImportStreamUrl(job_id))
        esRef.current = es
        es.onmessage = (e) => {
          const prog: ImportStatus = JSON.parse(e.data)
          setState(prev => ({
            ...prev,
            results: { ...prev.results, [creator.id]: { progress: prog, done: false } },
          }))
          if (prog.status === 'completed') {
            es.close()
            setState(prev => ({
              ...prev,
              results: { ...prev.results, [creator.id]: { progress: prog, done: true } },
            }))
            syncNext(queue, idx + 1)
          } else if (prog.status === 'failed') {
            es.close()
            setState(prev => ({
              ...prev,
              results: { ...prev.results, [creator.id]: { progress: prog, done: true, error: prog.error || 'Failed' } },
            }))
            syncNext(queue, idx + 1)
          }
        }
        es.onerror = () => {
          es.close()
          setState(prev => ({
            ...prev,
            results: { ...prev.results, [creator.id]: { progress: null, done: true, error: 'Connection lost' } },
          }))
          syncNext(queue, idx + 1)
        }
      })
      .catch(err => {
        setState(prev => ({
          ...prev,
          results: { ...prev.results, [creator.id]: { progress: null, done: true, error: err.message } },
        }))
        syncNext(queue, idx + 1)
      })
  }

  function handleStart() {
    const queue = creators.filter(c => selected.has(c.id))
    if (!queue.length) return
    queueRef.current = queue
    setState({ status: 'running', current: 0, results: {} })
    syncNext(queue, 0)
  }

  function handleStop() {
    esRef.current?.close()
    setState(prev => ({ ...prev, status: 'done' }))
  }

  const queue = creators.filter(c => selected.has(c.id))
  const isRunning = state.status === 'running'

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Videos per creator</label>
          <div className="flex flex-wrap gap-1.5">
            {VIDEO_COUNT_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setVideoCount(n)}
                disabled={isRunning}
                className={`px-2.5 py-1 text-xs rounded border transition-colors disabled:opacity-40 ${
                  videoCount === n ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                }`}
              >
                Last {n}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {state.status === 'idle' || state.status === 'done' ? (
            <button
              onClick={handleStart}
              disabled={!selected.size}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              <PlayCircle className="w-4 h-4" />
              Sync {selected.size} Creator{selected.size !== 1 ? 's' : ''}
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 bg-destructive/80 text-white rounded-md text-sm font-medium hover:bg-destructive transition-colors"
            >
              <X className="w-4 h-4" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Creator list */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/20">
              <th className="px-4 py-3 w-10">
                <button onClick={toggleAll} disabled={isRunning} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
                  {selected.size === creators.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Creator</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Last Synced</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium w-80">Progress</th>
            </tr>
          </thead>
          <tbody>
            {creators.map((c, i) => {
              const res = state.results[c.id]
              const isActive = isRunning && queueRef.current[state.current]?.id === c.id
              const isDone = res?.done
              const hasError = !!res?.error
              const prog = res?.progress

              return (
                <tr key={c.id} className={`border-b border-border last:border-0 transition-colors ${isActive ? 'bg-primary/5' : 'hover:bg-secondary/10'}`}>
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(c.id)} disabled={isRunning} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
                      {selected.has(c.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-7 h-7 rounded-full flex-shrink-0" />}
                      <div>
                        <div className="font-medium">{c.channel_name}</div>
                        <div className="text-xs text-muted-foreground">{formatNumber(c.total_comments)} comments</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">{formatDate(c.last_synced_at)}</td>
                  <td className="px-4 py-3">
                    {isActive && prog && (
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>{prog.message || 'Syncing…'}</span>
                          <span>{prog.progress_pct?.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-1.5">
                          <div className="bg-primary h-1.5 rounded-full transition-all duration-500" style={{ width: `${prog.progress_pct || 0}%` }} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {prog.videos_imported}/{prog.videos_total} videos · {formatNumber(prog.comments_imported)} comments
                        </div>
                      </div>
                    )}
                    {isActive && !prog && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Starting…
                      </div>
                    )}
                    {isDone && !hasError && (
                      <div className="text-xs text-emerald-400 font-medium">
                        ✓ Done — {formatNumber(prog?.comments_imported || 0)} comments
                      </div>
                    )}
                    {isDone && hasError && (
                      <div className="text-xs text-red-400">{res.error}</div>
                    )}
                    {!isActive && !isDone && state.status === 'running' && selected.has(c.id) && (
                      <div className="text-xs text-muted-foreground">Queued…</div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {state.status === 'done' && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md text-sm text-emerald-400">
          Sync complete — {Object.values(state.results).filter(r => r.done && !r.error).length} of {queue.length} creators updated.
        </div>
      )}
    </div>
  )
}

// ── Topics Tab ────────────────────────────────────────────────────────────────

type FormatTab = 'all' | 'long' | 'shorts'

function TopicsTab({ creators }: { creators: Creator[] }) {
  const [selectedCreators, setSelectedCreators] = useState<number[]>([])
  const [format, setFormat] = useState<FormatTab>('all')
  const [topics, setTopics] = useState<VideoTopic[]>([])
  const [totalVideos, setTotalVideos] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<VideoTopic | null>(null)

  useEffect(() => { load() }, [selectedCreators, format])

  async function load() {
    setLoading(true); setError(''); setSelected(null)
    try {
      const fmt = format === 'all' ? undefined : format as 'shorts' | 'long'
      const res = await getVideoTopics(selectedCreators.length ? selectedCreators : undefined, fmt)
      setTopics(res.topics)
      setTotalVideos(res.total_videos)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleCreator(id: number) {
    setSelectedCreators(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Creator filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Creator:</span>
          <button
            onClick={() => setSelectedCreators([])}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              selectedCreators.length === 0 ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
            }`}
          >
            All
          </button>
          {creators.map(c => (
            <button
              key={c.id}
              onClick={() => toggleCreator(c.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                selectedCreators.includes(c.id) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-4 h-4 rounded-full" />}
              {c.channel_name}
            </button>
          ))}
        </div>

        {/* Format toggle */}
        <div className="ml-auto flex items-center gap-1 bg-secondary/40 rounded-lg p-1">
          {(['all', 'long', 'shorts'] as FormatTab[]).map(f => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                format === f ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'All' : f === 'long' ? 'Long Form' : 'Shorts'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-red-400">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading topics…
        </div>
      ) : (
        <div className="flex gap-4 min-h-[520px]">
          {/* Topic list */}
          <div className="w-72 flex-shrink-0 border border-border rounded-lg overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border bg-secondary/20 text-xs text-muted-foreground font-medium">
              {topics.length} topics · {formatNumber(totalVideos)} videos · ranked by engagement
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {topics.length === 0 && (
                <div className="text-center py-12 text-sm text-muted-foreground px-4">
                  No topics found. Import some videos first.
                </div>
              )}
              {topics.map((t, i) => (
                <button
                  key={t.keyword}
                  onClick={() => setSelected(t)}
                  className={`w-full text-left px-3 py-3 hover:bg-secondary/20 transition-colors flex items-start gap-2 ${
                    selected?.keyword === t.keyword ? 'bg-primary/10 border-l-2 border-primary' : ''
                  }`}
                >
                  <span className="text-xs text-muted-foreground w-5 flex-shrink-0 pt-0.5">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium capitalize truncate mb-0.5">{t.keyword}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatNumber(t.total_views)} views</span>
                      <span>·</span>
                      <span>{t.video_count} videos</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <TrendingUp className="w-3 h-3" />
                      <span>{formatNumber(t.avg_views)} avg views</span>
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-1" />
                </button>
              ))}
            </div>
          </div>

          {/* Detail panel */}
          <div className="flex-1 border border-border rounded-lg overflow-hidden">
            {!selected ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a topic to see top videos
              </div>
            ) : (
              <div className="h-full overflow-y-auto p-5 space-y-5">
                {/* Header */}
                <div>
                  <h2 className="text-xl font-semibold capitalize mb-2">{selected.keyword}</h2>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Total Views', value: formatNumber(selected.total_views) },
                      { label: 'Total Likes', value: formatNumber(selected.total_likes) },
                      { label: 'Total Comments', value: formatNumber(selected.total_comments) },
                      { label: 'Videos', value: String(selected.video_count) },
                    ].map(s => (
                      <div key={s.label} className="bg-secondary/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold">{s.value}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
                    <span>Avg views: <span className="text-foreground font-medium">{formatNumber(selected.avg_views)}</span></span>
                    <span>Avg likes: <span className="text-foreground font-medium">{formatNumber(selected.avg_likes)}</span></span>
                  </div>
                </div>

                {/* Top videos */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    Top Performing Videos
                  </h3>
                  <div className="space-y-3">
                    {selected.top_videos.map(v => (
                      <div key={v.id} className="flex gap-3 p-3 bg-secondary/20 rounded-lg border border-border hover:bg-secondary/30 transition-colors">
                        {v.thumbnail_url && (
                          <img src={v.thumbnail_url} alt="" className="w-24 h-14 object-cover rounded flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 mb-1">
                            {v.is_short && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-purple-500/15 text-purple-400 rounded flex-shrink-0">SHORT</span>
                            )}
                            {v.url ? (
                              <a href={v.url} target="_blank" rel="noopener noreferrer"
                                className="text-sm font-medium hover:text-primary line-clamp-2 leading-snug">
                                {v.title}
                              </a>
                            ) : (
                              <span className="text-sm font-medium line-clamp-2 leading-snug">{v.title}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{formatNumber(v.views)} views</span>
                            <span>{formatNumber(v.likes)} likes</span>
                            <span>{formatNumber(v.comments)} comments</span>
                            {v.publish_date && (
                              <span>{new Date(v.publish_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CreatorsPage() {
  const [tab, setTab] = useState<Tab>('creators')
  const [creators, setCreators] = useState<Creator[]>([])
  const [showImport, setShowImport] = useState(false)
  const [query, setQuery] = useState('')
  const [discovered, setDiscovered] = useState<CreatorDiscoveryResult | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [videoCount, setVideoCount] = useState(25)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportStatus | null>(null)
  const [error, setError] = useState('')
  const eventSourceRef = useRef<EventSource | null>(null)
  const [syncTarget, setSyncTarget] = useState<Creator | null>(null)
  const [syncVideoCount, setSyncVideoCount] = useState(25)
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [syncProgress, setSyncProgress] = useState<ImportStatus | null>(null)
  const syncEsRef = useRef<EventSource | null>(null)

  useEffect(() => { loadCreators() }, [])

  async function loadCreators() {
    try { setCreators(await listCreators()) } catch (e: any) { setError(e.message) }
  }

  async function handleDiscover() {
    if (!query.trim()) return
    setDiscovering(true); setDiscovered(null); setError('')
    try { setDiscovered(await discoverCreator(query)) } catch (e: any) { setError(e.message) } finally { setDiscovering(false) }
  }

  async function handleImport() {
    if (!discovered) return
    setImporting(true); setError('')
    try {
      const { job_id } = await startImport(discovered.channel_id, videoCount)
      const es = new EventSource(getImportStreamUrl(job_id))
      eventSourceRef.current = es
      es.onmessage = (e) => {
        const status: ImportStatus = JSON.parse(e.data)
        setImportProgress(status)
        if (status.status === 'completed') {
          es.close(); setImporting(false); loadCreators()
          setTimeout(() => { setShowImport(false); setDiscovered(null); setQuery(''); setImportProgress(null) }, 2000)
        } else if (status.status === 'failed') {
          es.close(); setImporting(false); setError(status.error || 'Import failed')
        }
      }
      es.onerror = () => { es.close(); setImporting(false) }
    } catch (e: any) { setError(e.message); setImporting(false) }
  }

  async function handleSync() {
    if (!syncTarget) return
    setSyncingId(syncTarget.id); setSyncProgress(null); setSyncTarget(null)
    try {
      const { job_id } = await startImport(syncTarget.channel_id, syncVideoCount)
      const es = new EventSource(getImportStreamUrl(job_id))
      syncEsRef.current = es
      es.onmessage = (e) => {
        const status: ImportStatus = JSON.parse(e.data)
        setSyncProgress(status)
        if (status.status === 'completed') {
          es.close(); setSyncingId(null); loadCreators()
          setTimeout(() => setSyncProgress(null), 3000)
        } else if (status.status === 'failed') {
          es.close(); setSyncingId(null)
          setError(status.error || 'Sync failed'); setSyncProgress(null)
        }
      }
      es.onerror = () => { es.close(); setSyncingId(null) }
    } catch (e: any) { setError(e.message); setSyncingId(null) }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete ${name} and all their data?`)) return
    try { await deleteCreator(id); setCreators(prev => prev.filter(c => c.id !== id)) }
    catch (e: any) { setError(e.message) }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Creators</h1>
          <p className="text-muted-foreground text-sm mt-1">{creators.length} channels imported</p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Creator
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-red-400">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-border">
        {(['creators', 'sync-all', 'topics'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'creators' ? 'Creators' : t === 'sync-all' ? 'Sync All' : 'Top Topics'}
          </button>
        ))}
      </div>

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">Import Creator</h2>
              <button onClick={() => { setShowImport(false); setDiscovered(null); setImportProgress(null) }}
                className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {!importing && !importProgress?.status.includes('completed') && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Channel name, URL, or ID</label>
                    <div className="flex gap-2">
                      <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleDiscover()}
                        placeholder="e.g. MrBeast or https://youtube.com/@mrbeast"
                        className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button onClick={handleDiscover} disabled={discovering}
                        className="px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50">
                        {discovering ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {discovered && (
                    <div className="p-4 bg-secondary/30 rounded-lg border border-border">
                      <div className="flex items-start gap-3">
                        {discovered.thumbnail_url && (
                          <img src={discovered.thumbnail_url} alt="" className="w-12 h-12 rounded-full" />
                        )}
                        <div className="flex-1">
                          <div className="font-medium">{discovered.channel_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatNumber(discovered.subscriber_count)} subscribers · {formatNumber(discovered.video_count)} videos
                          </div>
                          {discovered.already_imported && (
                            <span className="text-xs text-amber-400 mt-1 block">Already imported — will re-sync</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-4">
                        <label className="block text-sm font-medium mb-1.5">Videos to import</label>
                        <div className="flex flex-wrap gap-2">
                          {VIDEO_COUNT_OPTIONS.map(n => (
                            <button key={n} onClick={() => setVideoCount(n)}
                              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                                videoCount === n ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                              }`}>
                              Last {n}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Each video imports ~100-500 comments. More videos = more API quota used.
                        </p>
                      </div>
                      <button onClick={handleImport}
                        className="mt-4 w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                        Import {videoCount} Videos
                      </button>
                    </div>
                  )}
                </>
              )}

              {(importing || importProgress) ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{importProgress?.channel_name || 'Importing...'}</span>
                    <span className="text-muted-foreground">{importProgress?.progress_pct?.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${importProgress?.progress_pct || 0}%` }} />
                  </div>
                  <p className="text-sm text-muted-foreground">{importProgress?.message}</p>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Videos: {importProgress?.videos_imported}/{importProgress?.videos_total}</span>
                    <span>Comments: {formatNumber(importProgress?.comments_imported || 0)}</span>
                  </div>
                  {importProgress?.status === 'completed' && (
                    <div className="text-sm text-emerald-400 font-medium">✓ Import complete!</div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Tab content */}
      {tab === 'creators' && (
        creators.length > 0 ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/20">
                  <th className="px-4 py-3 text-left text-muted-foreground font-medium">Creator</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Subscribers</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Videos</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Comments</th>
                  <th className="px-4 py-3 text-right text-muted-foreground font-medium">Synced</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {creators.map(c => (
                  <>
                    <tr key={c.id} className="border-b border-border hover:bg-secondary/10">
                      <td className="px-4 py-3">
                        <Link href={`/creators/${c.id}`} className="flex items-center gap-2 hover:text-primary">
                          {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-8 h-8 rounded-full" />}
                          <div>
                            <div className="font-medium">{c.channel_name}</div>
                            <div className="text-xs text-muted-foreground">{c.country || ''}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatNumber(c.subscriber_count)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{c.total_videos_imported}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatNumber(c.total_comments)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs">{formatDate(c.last_synced_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <a href={c.channel_url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => { setSyncTarget(c); setSyncVideoCount(25) }}
                            disabled={syncingId === c.id}
                            title="Sync new videos & comments"
                            className="p-1.5 text-muted-foreground hover:text-primary rounded transition-colors disabled:opacity-40">
                            <RefreshCw className={`w-3.5 h-3.5 ${syncingId === c.id ? 'animate-spin' : ''}`} />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id, c.channel_name)}
                            className="p-1.5 text-muted-foreground hover:text-red-400 rounded transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {syncingId === c.id && syncProgress && (
                      <tr key={`${c.id}-progress`} className="border-b border-border last:border-0 bg-secondary/10">
                        <td colSpan={6} className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground">{syncProgress.message || 'Syncing…'}</span>
                                <span className="text-muted-foreground">
                                  {syncProgress.videos_imported}/{syncProgress.videos_total} videos · {formatNumber(syncProgress.comments_imported)} comments · {syncProgress.progress_pct?.toFixed(0)}%
                                </span>
                              </div>
                              <div className="w-full bg-secondary rounded-full h-1">
                                <div className="bg-primary h-1 rounded-full transition-all duration-500"
                                  style={{ width: `${syncProgress.progress_pct || 0}%` }} />
                              </div>
                            </div>
                            {syncProgress.status === 'completed' && (
                              <span className="text-xs text-emerald-400 flex-shrink-0">✓ Done</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 border border-dashed border-border rounded-lg">
            <p className="text-muted-foreground">No creators imported yet. Click "Add Creator" to get started.</p>
          </div>
        )
      )}

      {tab === 'sync-all' && (
        creators.length > 0 ? (
          <SyncAllTab creators={creators} />
        ) : (
          <div className="text-center py-16 border border-dashed border-border rounded-lg">
            <p className="text-muted-foreground">No creators imported yet.</p>
          </div>
        )
      )}

      {tab === 'topics' && (
        creators.length > 0 ? (
          <TopicsTab creators={creators} />
        ) : (
          <div className="text-center py-16 border border-dashed border-border rounded-lg">
            <p className="text-muted-foreground">No creators imported yet.</p>
          </div>
        )
      )}

      {/* Per-creator sync modal */}
      {syncTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                {syncTarget.thumbnail_url && (
                  <img src={syncTarget.thumbnail_url} alt="" className="w-8 h-8 rounded-full" />
                )}
                <div>
                  <h2 className="font-semibold text-sm">{syncTarget.channel_name}</h2>
                  <p className="text-xs text-muted-foreground">Last synced: {formatDate(syncTarget.last_synced_at)}</p>
                </div>
              </div>
              <button onClick={() => setSyncTarget(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Videos to sync</label>
                <p className="text-xs text-muted-foreground mb-3">
                  Checks the most recent N videos for new comments since the last sync.
                </p>
                <div className="flex flex-wrap gap-2">
                  {VIDEO_COUNT_OPTIONS.map(n => (
                    <button key={n} onClick={() => setSyncVideoCount(n)}
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        syncVideoCount === n ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                      }`}>
                      Last {n}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleSync}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                Start Sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
