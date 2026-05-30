'use client'

import { useEffect, useState } from 'react'
import { ShoppingCart, ThumbsUp, Download } from 'lucide-react'
import { getPurchaseIntent, listCreators, getExportUrl, type Creator, type PurchaseIntentComment } from '@/lib/api'
import { CreatorFilter } from '@/components/analytics/CreatorFilter'
import { formatDate, formatNumber } from '@/lib/utils'

export default function PurchaseIntentPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [data, setData] = useState<PurchaseIntentComment[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { listCreators().then(setCreators) }, [])
  useEffect(() => { load() }, [selected])

  async function load() {
    setLoading(true)
    try {
      const res = await getPurchaseIntent(selected.length ? selected : undefined)
      setData(res)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Purchase Intent</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Comments indicating buying intent or product interest
          </p>
        </div>
        <a href={getExportUrl('csv', { creatorIds: selected })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary transition-colors">
          <Download className="w-3.5 h-3.5" />
          Export
        </a>
      </div>

      <CreatorFilter creators={creators} selected={selected} onChange={setSelected} />

      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <ShoppingCart className="w-4 h-4" />
        <span>{data.length} purchase intent signals detected</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Detecting purchase intent...</div>
      ) : (
        <div className="space-y-3">
          {data.map((item, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-primary">{item.creator_name}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">{item.video_title}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <div className="w-16 bg-secondary rounded-full h-1.5">
                    <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${item.intent_score * 100}%` }} />
                  </div>
                  <span className="text-xs text-emerald-400 font-medium">{(item.intent_score * 100).toFixed(0)}%</span>
                </div>
              </div>

              <p className="text-sm text-foreground mb-3">{item.comment_text}</p>

              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground font-medium">{item.author_name}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ThumbsUp className="w-3 h-3" />{formatNumber(item.likes)}
                </span>
                {item.signals?.map(s => (
                  <span key={s} className="text-xs bg-emerald-400/10 text-emerald-400 px-2 py-0.5 rounded-full">{s}</span>
                ))}
                <span className="text-xs text-muted-foreground ml-auto">{formatDate(item.comment_date)}</span>
              </div>
            </div>
          ))}
          {data.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">No purchase intent signals found.</div>
          )}
        </div>
      )}
    </div>
  )
}
