'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Bookmark, Download, ThumbsUp, MessageSquare, Calendar } from 'lucide-react'
import {
  searchComments, keywordExplorer, listCreators, getSavedSearches,
  createSavedSearch, getExportUrl,
  type Creator, type CommentRow, type SearchResponse, type KeywordStats, type SavedSearch,
} from '@/lib/api'
import { formatNumber, formatDate, truncate } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [mode, setMode] = useState<'search' | 'keyword'>('search')
  const [creators, setCreators] = useState<Creator[]>([])
  const [selectedCreators, setSelectedCreators] = useState<number[]>([])
  const [minLikes, setMinLikes] = useState<number | undefined>()
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [kwStats, setKwStats] = useState<KeywordStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveName, setSaveName] = useState('')

  useEffect(() => {
    listCreators().then(setCreators)
    getSavedSearches().then(setSavedSearches)
  }, [])

  async function handleSearch(q = query, p = 1) {
    if (!q.trim()) return
    setLoading(true)
    setActiveQuery(q)
    setPage(p)
    try {
      if (mode === 'search') {
        const res = await searchComments({
          query: q, creatorIds: selectedCreators, page: p, minLikes,
        })
        setResults(res)
        setKwStats(null)
      } else {
        const kw = await keywordExplorer(q, selectedCreators)
        setKwStats(kw)
        setResults(null)
      }
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveSearch() {
    if (!saveName.trim() || !activeQuery) return
    const saved = await createSavedSearch(saveName, activeQuery)
    setSavedSearches(prev => [saved, ...prev])
    setShowSaveDialog(false)
    setSaveName('')
  }

  function toggleCreator(id: number) {
    setSelectedCreators(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Search</h1>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-4 p-1 bg-secondary/30 rounded-lg w-fit">
        {(['search', 'keyword'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {m === 'keyword' ? 'Keyword Explorer' : 'Comment Search'}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={mode === 'search' ? 'Search comments...' : 'Enter keyword to analyze...'}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          onClick={() => handleSearch()}
          disabled={loading}
          className="px-5 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Creator filter */}
        {creators.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {creators.map(c => (
              <button key={c.id} onClick={() => toggleCreator(c.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  selectedCreators.includes(c.id)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}>
                {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-3.5 h-3.5 rounded-full" />}
                {c.channel_name}
              </button>
            ))}
          </div>
        )}

        {/* Min likes */}
        {mode === 'search' && (
          <input
            type="number"
            placeholder="Min likes"
            value={minLikes ?? ''}
            onChange={e => setMinLikes(e.target.value ? Number(e.target.value) : undefined)}
            className="w-24 px-3 py-1 bg-card border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}
      </div>

      {/* Saved searches */}
      {savedSearches.length > 0 && !activeQuery && (
        <div className="mb-6">
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium">Saved searches</p>
          <div className="flex flex-wrap gap-2">
            {savedSearches.map(s => (
              <button key={s.id} onClick={() => { setQuery(s.query); handleSearch(s.query) }}
                className="px-3 py-1 text-xs bg-secondary rounded-full hover:bg-secondary/80 transition-colors">
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search results */}
      {results && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{formatNumber(results.total)}</span> results for &ldquo;{results.query}&rdquo;
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowSaveDialog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary transition-colors">
                <Bookmark className="w-3.5 h-3.5" />
                Save Search
              </button>
              <a href={getExportUrl('csv', { query: activeQuery, creatorIds: selectedCreators })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary transition-colors">
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </a>
            </div>
          </div>

          <div className="space-y-3">
            {results.results.map(comment => (
              <CommentCard key={comment.id} comment={comment} />
            ))}
          </div>

          {/* Pagination */}
          {results.total > 50 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button onClick={() => handleSearch(activeQuery, page - 1)} disabled={page <= 1}
                className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-40 hover:bg-secondary transition-colors">
                Previous
              </button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <button onClick={() => handleSearch(activeQuery, page + 1)}
                disabled={page * 50 >= results.total}
                className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-40 hover:bg-secondary transition-colors">
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Keyword Explorer results */}
      {kwStats && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Mentions', value: formatNumber(kwStats.total_mentions) },
              { label: 'Unique Videos', value: kwStats.unique_videos },
              { label: 'Unique Creators', value: kwStats.unique_creators },
              { label: 'Avg Likes', value: kwStats.avg_likes_on_mentions.toFixed(1) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card border border-border rounded-lg p-4">
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="text-2xl font-bold mt-1">{value}</div>
              </div>
            ))}
          </div>

          {/* Trend chart */}
          {kwStats.mention_trend.length > 1 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-medium mb-4">Mention Trend</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={kwStats.mention_trend}>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top creators & videos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-medium mb-3">Top Creators</h3>
              <div className="space-y-2">
                {kwStats.top_creators.map(c => (
                  <div key={c.id} className="flex items-center justify-between">
                    <span className="text-sm">{c.name}</span>
                    <span className="text-sm font-medium text-primary">{c.count} mentions</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-medium mb-3">Top Videos</h3>
              <div className="space-y-2">
                {kwStats.top_videos.map(v => (
                  <div key={v.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{v.title}</span>
                    <span className="text-sm font-medium text-primary shrink-0">{v.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Most liked */}
          <div>
            <h3 className="font-medium mb-3">Most Liked Comments</h3>
            <div className="space-y-3">
              {kwStats.most_liked_comments.map((c: any) => (
                <CommentCard key={c.id} comment={c} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-80">
            <h3 className="font-semibold mb-4">Save Search</h3>
            <input
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Search name..."
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveDialog(false)}
                className="flex-1 py-2 border border-border rounded-md text-sm hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveSearch}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CommentCard({ comment }: { comment: CommentRow & { video_title?: string; creator_name?: string } }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-primary">{comment.creator_name}</span>
        <span className="text-xs text-muted-foreground truncate">{comment.video_title}</span>
      </div>
      <p className="text-sm text-foreground mb-2">{comment.comment_text}</p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium">{comment.author_name}</span>
        <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{comment.likes}</span>
        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{comment.reply_count}</span>
        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(comment.comment_date)}</span>
      </div>
    </div>
  )
}
