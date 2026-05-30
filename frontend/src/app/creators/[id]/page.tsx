'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Video, MessageSquare, Users, Play, Download, Loader2, RefreshCw, X } from 'lucide-react'
import {
  listCreators, getCreatorVideos, getCreatorComments, getAllCreatorComments,
  startImport, getImportStreamUrl,
  type Creator, type Video as VideoType, type CommentRow, type PaginatedResponse, type ImportStatus,
} from '@/lib/api'
import { formatNumber, formatDate, truncate } from '@/lib/utils'

type Tab = 'videos' | 'comments'

export default function CreatorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const creatorId = Number(id)

  const [creator, setCreator] = useState<Creator | null>(null)
  const [videos, setVideos] = useState<VideoType[]>([])
  const [comments, setComments] = useState<PaginatedResponse<CommentRow> | null>(null)
  const [tab, setTab] = useState<Tab>('videos')
  const [videoPage, setVideoPage] = useState(1)
  const [commentPage, setCommentPage] = useState(1)
  const [commentSort, setCommentSort] = useState('likes')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadPeriod, setDownloadPeriod] = useState<'all' | '3y' | '1y' | '6m' | '3m'>('all')
  const [showSync, setShowSync] = useState(false)
  const [syncVideoCount, setSyncVideoCount] = useState(25)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<ImportStatus | null>(null)

  useEffect(() => {
    listCreators()
      .then(all => {
        const found = all.find(c => c.id === creatorId)
        if (!found) setError('Creator not found')
        else setCreator(found)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [creatorId])

  useEffect(() => {
    if (!creator) return
    getCreatorVideos(creatorId, videoPage).catch(console.error).then(v => v && setVideos(v))
  }, [creator, creatorId, videoPage])

  useEffect(() => {
    if (!creator || tab !== 'comments') return
    getCreatorComments(creatorId, commentPage, commentSort)
      .catch(console.error)
      .then(r => r && setComments(r))
  }, [creator, creatorId, tab, commentPage, commentSort])

  async function handleSync() {
    if (!creator) return
    setSyncing(true)
    setSyncProgress(null)
    try {
      const { job_id } = await startImport(creator.channel_id, syncVideoCount)
      const es = new EventSource(getImportStreamUrl(job_id))
      es.onmessage = (e) => {
        const status: ImportStatus = JSON.parse(e.data)
        setSyncProgress(status)
        if (status.status === 'completed') {
          es.close()
          setSyncing(false)
          // refresh creator stats and videos
          listCreators().then(all => {
            const updated = all.find(c => c.id === creatorId)
            if (updated) setCreator(updated)
          })
          getCreatorVideos(creatorId, 1).then(setVideos)
        } else if (status.status === 'failed') {
          es.close()
          setSyncing(false)
          setError(status.error || 'Sync failed')
        }
      }
      es.onerror = () => { es.close(); setSyncing(false) }
    } catch (e: any) {
      setError(e.message)
      setSyncing(false)
    }
  }

  function periodCutoff(period: typeof downloadPeriod): Date | null {
    if (period === 'all') return null
    const now = new Date()
    if (period === '3y') return new Date(now.getFullYear() - 3, now.getMonth(), now.getDate())
    if (period === '1y') return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    if (period === '6m') return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
    if (period === '3m') return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
    return null
  }

  async function handleDownload(fmt: 'csv' | 'json' | 'excel') {
    setDownloading(true)
    try {
      let rows = await getAllCreatorComments(creatorId)
      const cutoff = periodCutoff(downloadPeriod)
      if (cutoff) {
        rows = rows.filter(r => r.comment_date && new Date(r.comment_date) >= cutoff)
      }

      const channelId = creator?.channel_id ?? ''
      const periodLabel = downloadPeriod === 'all' ? 'all' : downloadPeriod
      const filename = `${creator?.channel_name ?? 'comments'}_comments_${periodLabel}`

      const syncedUpTo = creator?.last_synced_at
        ? new Date(creator.last_synced_at).toISOString().slice(0, 10)
        : ''

      const mapped = rows.map(r => ({
        'Author': r.author_name ?? '',
        'Channel ID': channelId,
        'Date': r.comment_date ? new Date(r.comment_date).toISOString().slice(0, 10) : '',
        'Replies': r.reply_count,
        'Likes': r.likes,
        'Comment': r.comment_text,
        'Video': r.video_title ?? '',
        'Data Synced Up To': syncedUpTo,
      }))

      if (fmt === 'json') {
        const blob = new Blob([JSON.stringify(mapped, null, 2)], { type: 'application/json' })
        triggerDownload(blob, `${filename}.json`)
      } else if (fmt === 'csv') {
        const headers = Object.keys(mapped[0] ?? {})
        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const csv = [headers.join(','), ...mapped.map(r => headers.map(h => escape(r[h as keyof typeof r])).join(','))].join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        triggerDownload(blob, `${filename}.csv`)
      } else {
        const XLSX = await import('xlsx')
        const ws = XLSX.utils.json_to_sheet(mapped)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Comments')
        XLSX.writeFile(wb, `${filename}.xlsx`)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDownloading(false)
    }
  }

  function triggerDownload(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (error || !creator) {
    return (
      <div className="p-6">
        <Link href="/creators" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to creators
        </Link>
        <p className="text-red-400">{error || 'Creator not found'}</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/creators" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to creators
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        {creator.thumbnail_url && (
          <img src={creator.thumbnail_url} alt="" className="w-16 h-16 rounded-full flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{creator.channel_name}</h1>
            <a href={creator.channel_url} target="_blank" rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          {creator.country && <p className="text-sm text-muted-foreground">{creator.country}</p>}
          {creator.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{creator.description}</p>
          )}
          {creator.last_synced_at && (
            <p className="text-xs text-muted-foreground mt-1">Last synced: {formatDate(creator.last_synced_at)}</p>
          )}
        </div>
        <button
          onClick={() => setShowSync(v => !v)}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-secondary border border-border rounded-md hover:border-primary/50 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      {/* Sync panel */}
      {showSync && !syncing && !syncProgress && (
        <div className="mb-6 p-4 bg-card border border-border rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Sync new videos &amp; comments</p>
            <button onClick={() => setShowSync(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Fetches the latest videos and their comments since the last sync.
          </p>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-xs text-muted-foreground">Videos to check:</span>
            {[10, 25, 50, 100].map(n => (
              <button
                key={n}
                onClick={() => setSyncVideoCount(n)}
                className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                  syncVideoCount === n
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                Last {n}
              </button>
            ))}
          </div>
          <button
            onClick={() => { handleSync(); setShowSync(false) }}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors"
          >
            Start Sync
          </button>
        </div>
      )}

      {/* Sync progress */}
      {(syncing || syncProgress) && (
        <div className="mb-6 p-4 bg-card border border-border rounded-lg space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {syncProgress?.status === 'completed' ? 'Sync complete' : 'Syncing…'}
            </span>
            <span className="text-muted-foreground">{syncProgress?.progress_pct?.toFixed(0) ?? 0}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${syncProgress?.progress_pct ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{syncProgress?.message}</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Videos: {syncProgress?.videos_imported ?? 0}/{syncProgress?.videos_total ?? '…'}</span>
            <span>Comments: {formatNumber(syncProgress?.comments_imported ?? 0)}</span>
          </div>
          {syncProgress?.status === 'completed' && (
            <button
              onClick={() => setSyncProgress(null)}
              className="text-xs text-emerald-400 hover:underline"
            >
              ✓ Done — dismiss
            </button>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Subscribers', value: formatNumber(creator.subscriber_count), icon: Users, color: 'text-violet-400' },
          { label: 'Videos', value: formatNumber(creator.video_count), icon: Play, color: 'text-blue-400' },
          { label: 'Imported Videos', value: String(creator.total_videos_imported), icon: Video, color: 'text-amber-400' },
          { label: 'Comments', value: formatNumber(creator.total_comments), icon: MessageSquare, color: 'text-emerald-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="text-xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      {/* Export panel */}
      <div className="mb-6 p-4 bg-card border border-border rounded-lg">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-sm font-medium">Download Comments</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatNumber(creator.total_comments)} total comments
              {creator.last_synced_at && ` · data up to ${formatDate(creator.last_synced_at)}`}
            </p>
          </div>
          {downloading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing download…
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs text-muted-foreground">Time range:</span>
          {([
            { value: 'all', label: 'All time' },
            { value: '3y',  label: 'Last 3 years' },
            { value: '1y',  label: 'Last 1 year' },
            { value: '6m',  label: 'Last 6 months' },
            { value: '3m',  label: 'Last 3 months' },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setDownloadPeriod(value)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                downloadPeriod === value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Format:</span>
          {(['csv', 'json', 'excel'] as const).map(fmt => (
            <button
              key={fmt}
              onClick={() => handleDownload(fmt)}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:border-primary/50 hover:text-primary transition-colors uppercase disabled:opacity-40 font-medium"
            >
              <Download className="w-3 h-3" />
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {(['videos', 'comments'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Videos tab */}
      {tab === 'videos' && (
        <div>
          {videos.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No videos imported.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {videos.map(v => (
                  <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer"
                    className="flex gap-3 p-3 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors group">
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} alt="" className="w-28 h-16 object-cover rounded flex-shrink-0" />
                    ) : (
                      <div className="w-28 h-16 bg-secondary rounded flex-shrink-0 flex items-center justify-center">
                        <Video className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
                        {v.title}
                      </p>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{formatNumber(v.views)} views</span>
                        <span>{formatNumber(v.likes)} likes</span>
                        <span>{formatNumber(v.comment_count)} comments</span>
                      </div>
                      {v.publish_date && (
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(v.publish_date)}</p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setVideoPage(p => Math.max(1, p - 1))}
                  disabled={videoPage === 1}
                  className="px-3 py-1.5 text-sm bg-secondary rounded-md disabled:opacity-40 hover:bg-secondary/80 transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-muted-foreground">Page {videoPage}</span>
                <button
                  onClick={() => setVideoPage(p => p + 1)}
                  disabled={videos.length < 25}
                  className="px-3 py-1.5 text-sm bg-secondary rounded-md disabled:opacity-40 hover:bg-secondary/80 transition-colors"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Comments tab */}
      {tab === 'comments' && (
        <div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-sm text-muted-foreground">Sort by:</span>
            {(['likes', 'date', 'replies'] as const).map(s => (
              <button
                key={s}
                onClick={() => { setCommentSort(s); setCommentPage(1) }}
                className={`px-3 py-1 text-xs rounded-md border transition-colors capitalize ${
                  commentSort === s
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {!comments ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
          ) : comments.items.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No comments found.</p>
          ) : (
            <>
              <div className="space-y-3">
                {comments.items.map(c => (
                  <div key={c.id} className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-sm font-medium">{c.author_name || 'Anonymous'}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                        <span>{formatNumber(c.likes)} likes</span>
                        {c.reply_count > 0 && <span>{c.reply_count} replies</span>}
                      </div>
                    </div>
                    <p className="text-sm text-foreground/90">{truncate(c.comment_text, 200)}</p>
                    {c.video_title && (
                      <p className="text-xs text-muted-foreground mt-2 truncate">
                        on: {c.video_title}
                      </p>
                    )}
                    {c.comment_date && (
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(c.comment_date)}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setCommentPage(p => Math.max(1, p - 1))}
                  disabled={commentPage === 1}
                  className="px-3 py-1.5 text-sm bg-secondary rounded-md disabled:opacity-40 hover:bg-secondary/80 transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-muted-foreground">
                  Page {commentPage} of {comments.pages}
                </span>
                <button
                  onClick={() => setCommentPage(p => p + 1)}
                  disabled={commentPage >= comments.pages}
                  className="px-3 py-1.5 text-sm bg-secondary rounded-md disabled:opacity-40 hover:bg-secondary/80 transition-colors"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
