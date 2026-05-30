'use client'

import { useEffect, useState } from 'react'
import { Bell, Plus, Trash2, RefreshCw, X } from 'lucide-react'
import {
  listWatchlists, createWatchlist, deleteWatchlist, checkWatchlist,
  type Watchlist,
} from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'

export default function WatchlistsPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [desc, setDesc] = useState('')
  const [checking, setChecking] = useState<number | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const data = await listWatchlists()
    setWatchlists(data)
  }

  async function handleCreate() {
    if (!keyword.trim()) return
    await createWatchlist(keyword, desc || undefined)
    setKeyword(''); setDesc('')
    setShowCreate(false)
    load()
  }

  async function handleDelete(id: number) {
    await deleteWatchlist(id)
    setWatchlists(prev => prev.filter(w => w.id !== id))
  }

  async function handleCheck(id: number) {
    setChecking(id)
    try {
      const result = await checkWatchlist(id)
      setWatchlists(prev => prev.map(w =>
        w.id === id ? { ...w, mention_count: result.mention_count, last_checked_at: new Date().toISOString() } : w
      ))
    } finally {
      setChecking(null)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Watchlists</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor keywords across all imported comments</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          Add Keyword
        </button>
      </div>

      <div className="space-y-3">
        {watchlists.map(w => (
          <div key={w.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{w.keyword}</span>
                <span className="text-sm text-primary font-bold">{formatNumber(w.mention_count)} mentions</span>
              </div>
              {w.description && <p className="text-xs text-muted-foreground mt-0.5">{w.description}</p>}
              <p className="text-xs text-muted-foreground mt-0.5">
                Last checked: {w.last_checked_at ? formatDate(w.last_checked_at) : 'Never'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleCheck(w.id)} disabled={checking === w.id}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${checking === w.id ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => handleDelete(w.id)}
                className="p-2 text-muted-foreground hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {watchlists.length === 0 && (
          <div className="text-center py-12 border border-dashed border-border rounded-lg text-muted-foreground">
            No watchlists yet. Add keywords to monitor.
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-80 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Add Watchlist Keyword</h3>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input value={keyword} onChange={e => setKeyword(e.target.value)}
                placeholder="Keyword to monitor..."
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              <button onClick={handleCreate}
                className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors">
                Add Keyword
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
