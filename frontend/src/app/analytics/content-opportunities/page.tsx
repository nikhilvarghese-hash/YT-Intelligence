'use client'

import { useEffect, useState } from 'react'
import { Lightbulb, ChevronDown, ChevronRight } from 'lucide-react'
import { getContentOpportunities, listCreators, type Creator, type ContentOpportunity } from '@/lib/api'
import { CreatorFilter } from '@/components/analytics/CreatorFilter'

export default function ContentOpportunitiesPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [data, setData] = useState<ContentOpportunity[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => { listCreators().then(setCreators) }, [])
  useEffect(() => { load() }, [selected])

  async function load() {
    setLoading(true)
    try {
      const res = await getContentOpportunities(selected.length ? selected : undefined)
      setData(res)
    } finally {
      setLoading(false)
    }
  }

  const maxFreq = Math.max(...data.map(d => d.frequency), 1)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Content Opportunities</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Topics your audience wants more content about
        </p>
      </div>

      <CreatorFilter creators={creators} selected={selected} onChange={setSelected} />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Discovering opportunities...</div>
      ) : (
        <div className="space-y-3 mt-6">
          {data.map((item, i) => (
            <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center gap-4 p-4 hover:bg-secondary/20 transition-colors text-left"
              >
                <Lightbulb className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-medium text-sm">{item.topic}</span>
                    <span className="text-xs bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-full">
                      {item.frequency} mentions
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-1">
                    <div className="bg-yellow-400 h-1 rounded-full" style={{ width: `${(item.frequency / maxFreq) * 100}%` }} />
                  </div>
                  {item.creators_mentioning?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.creators_mentioning.slice(0, 3).map(c => (
                        <span key={c} className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
                {expanded === i ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>

              {expanded === i && (
                <div className="px-4 pb-4 border-t border-border pt-3 space-y-2">
                  {item.example_comments.map((c, j) => (
                    <div key={j} className="text-sm p-3 bg-secondary/20 rounded-md text-muted-foreground border border-border">
                      &ldquo;{c}&rdquo;
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {data.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">No content opportunities found yet.</div>
          )}
        </div>
      )}
    </div>
  )
}
