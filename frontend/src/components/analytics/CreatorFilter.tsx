'use client'

import type { Creator } from '@/lib/api'

interface Props {
  creators: Creator[]
  selected: number[]
  onChange: (ids: number[]) => void
}

export function CreatorFilter({ creators, selected, onChange }: Props) {
  if (creators.length === 0) return null

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <button
        onClick={() => onChange([])}
        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
          selected.length === 0
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/50'
        }`}
      >
        All Creators
      </button>
      {creators.map(c => (
        <button key={c.id} onClick={() => toggle(c.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${
            selected.includes(c.id)
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/50'
          }`}>
          {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-3.5 h-3.5 rounded-full" />}
          {c.channel_name}
        </button>
      ))}
    </div>
  )
}
