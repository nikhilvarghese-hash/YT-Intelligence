'use client'

import { useEffect, useState } from 'react'
import { FolderOpen, Plus, Trash2, X, Download } from 'lucide-react'
import {
  listCollections, createCollection, deleteCollection, getCollectionItems, getExportUrl,
  type Collection, type CollectionItem,
} from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'

const COLORS = ['#6366f1', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [active, setActive] = useState<Collection | null>(null)
  const [items, setItems] = useState<CollectionItem[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])

  useEffect(() => { load() }, [])

  async function load() {
    const data = await listCollections()
    setCollections(data)
  }

  async function openCollection(col: Collection) {
    setActive(col)
    const data = await getCollectionItems(col.id)
    setItems(data.items)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    await createCollection(newName, newDesc || undefined, newColor)
    setNewName(''); setNewDesc(''); setNewColor(COLORS[0])
    setShowCreate(false)
    load()
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this collection?')) return
    await deleteCollection(id)
    if (active?.id === id) { setActive(null); setItems([]) }
    load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Comment Collections</h1>
          <p className="text-sm text-muted-foreground mt-1">Organize comments into folders</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          New Collection
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {collections.map(col => (
          <div key={col.id}
            onClick={() => openCollection(col)}
            className={`bg-card border rounded-lg p-4 cursor-pointer transition-all hover:shadow-lg ${
              active?.id === col.id ? 'border-primary' : 'border-border hover:border-primary/40'
            }`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: col.color }} />
                <span className="font-medium">{col.name}</span>
              </div>
              <button onClick={e => { e.stopPropagation(); handleDelete(col.id) }}
                className="p-1 text-muted-foreground hover:text-red-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {col.description && (
              <p className="text-xs text-muted-foreground mt-1">{col.description}</p>
            )}
            <div className="flex items-center gap-2 mt-3">
              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{col.item_count} comments</span>
            </div>
          </div>
        ))}

        {collections.length === 0 && (
          <div className="col-span-3 text-center py-12 border border-dashed border-border rounded-lg text-muted-foreground">
            No collections yet. Create one to start organizing comments.
          </div>
        )}
      </div>

      {/* Collection contents */}
      {active && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: active.color }} />
              <h2 className="font-semibold">{active.name}</h2>
              <span className="text-sm text-muted-foreground">({items.length} comments)</span>
            </div>
            <a href={getExportUrl('csv', { collectionId: active.id })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary transition-colors">
              <Download className="w-3.5 h-3.5" />
              Export
            </a>
          </div>

          <div className="space-y-3">
            {items.map(item => (
              <div key={item.item_id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-primary">{item.creator_name}</span>
                  <span className="text-xs text-muted-foreground">{item.video_title}</span>
                </div>
                <p className="text-sm text-foreground mb-2">{item.comment_text}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{item.author_name}</span>
                  <span>{formatNumber(item.likes)} likes</span>
                  <span>{formatDate(item.comment_date)}</span>
                </div>
                {item.note && (
                  <div className="mt-2 text-xs italic text-muted-foreground bg-secondary/20 px-2 py-1 rounded">
                    Note: {item.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-80 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">New Collection</h3>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Collection name"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              <div>
                <p className="text-xs text-muted-foreground mb-2">Color</p>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setNewColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-white' : ''}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
              <button onClick={handleCreate}
                className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors">
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
