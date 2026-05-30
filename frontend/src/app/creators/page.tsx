'use client'

import { useEffect, useState, useRef } from 'react'
import { Plus, Search, Trash2, ExternalLink, RefreshCw, X } from 'lucide-react'
import {
  listCreators, discoverCreator, startImport, getImportStreamUrl,
  deleteCreator, type Creator, type CreatorDiscoveryResult, type ImportStatus,
} from '@/lib/api'
import { formatNumber, formatDate } from '@/lib/utils'
import Link from 'next/link'

const VIDEO_COUNT_OPTIONS = [10, 25, 50, 100, 500, 1000]

export default function CreatorsPage() {
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

  useEffect(() => {
    loadCreators()
  }, [])

  async function loadCreators() {
    try {
      const data = await listCreators()
      setCreators(data)
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleDiscover() {
    if (!query.trim()) return
    setDiscovering(true)
    setDiscovered(null)
    setError('')
    try {
      const result = await discoverCreator(query)
      setDiscovered(result)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDiscovering(false)
    }
  }

  async function handleImport() {
    if (!discovered) return
    setImporting(true)
    setError('')
    try {
      const { job_id } = await startImport(discovered.channel_id, videoCount)
      const url = getImportStreamUrl(job_id)
      const es = new EventSource(url)
      eventSourceRef.current = es

      es.onmessage = (e) => {
        const status: ImportStatus = JSON.parse(e.data)
        setImportProgress(status)
        if (status.status === 'completed') {
          es.close()
          setImporting(false)
          loadCreators()
          setTimeout(() => {
            setShowImport(false)
            setDiscovered(null)
            setQuery('')
            setImportProgress(null)
          }, 2000)
        } else if (status.status === 'failed') {
          es.close()
          setImporting(false)
          setError(status.error || 'Import failed')
        }
      }
      es.onerror = () => {
        es.close()
        setImporting(false)
      }
    } catch (e: any) {
      setError(e.message)
      setImporting(false)
    }
  }

  async function handleSync() {
    if (!syncTarget) return
    setSyncingId(syncTarget.id)
    setSyncProgress(null)
    setSyncTarget(null)
    try {
      const { job_id } = await startImport(syncTarget.channel_id, syncVideoCount)
      const es = new EventSource(getImportStreamUrl(job_id))
      syncEsRef.current = es
      es.onmessage = (e) => {
        const status: ImportStatus = JSON.parse(e.data)
        setSyncProgress(status)
        if (status.status === 'completed') {
          es.close()
          setSyncingId(null)
          loadCreators()
          setTimeout(() => setSyncProgress(null), 3000)
        } else if (status.status === 'failed') {
          es.close()
          setSyncingId(null)
          setError(status.error || 'Sync failed')
          setSyncProgress(null)
        }
      }
      es.onerror = () => { es.close(); setSyncingId(null) }
    } catch (e: any) {
      setError(e.message)
      setSyncingId(null)
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete ${name} and all their data?`)) return
    try {
      await deleteCreator(id)
      setCreators(prev => prev.filter(c => c.id !== id))
    } catch (e: any) {
      setError(e.message)
    }
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
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-red-400">
          {error}
        </div>
      )}

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
                      <button
                        onClick={handleDiscover}
                        disabled={discovering}
                        className="px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50"
                      >
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
                            <button
                              key={n}
                              onClick={() => setVideoCount(n)}
                              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                                videoCount === n
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border hover:border-primary/50'
                              }`}
                            >
                              Last {n}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Each video imports ~100-500 comments. More videos = more API quota used.
                        </p>
                      </div>

                      <button
                        onClick={handleImport}
                        className="mt-4 w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                      >
                        Import {videoCount} Videos
                      </button>
                    </div>
                  )}
                </>
              )}

              {importing || importProgress ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{importProgress?.channel_name || 'Importing...'}</span>
                    <span className="text-muted-foreground">{importProgress?.progress_pct?.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-500"
                      style={{ width: `${importProgress?.progress_pct || 0}%` }}
                    />
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

      {/* Creators table */}
      {creators.length > 0 ? (
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
                        {c.thumbnail_url && (
                          <img src={c.thumbnail_url} alt="" className="w-8 h-8 rounded-full" />
                        )}
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
                              <div
                                className="bg-primary h-1 rounded-full transition-all duration-500"
                                style={{ width: `${syncProgress.progress_pct || 0}%` }}
                              />
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
      )}

      {/* Sync modal */}
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
                  <p className="text-xs text-muted-foreground">
                    Last synced: {formatDate(syncTarget.last_synced_at)}
                  </p>
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
                    <button
                      key={n}
                      onClick={() => setSyncVideoCount(n)}
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        syncVideoCount === n
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      Last {n}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleSync}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Start Sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
