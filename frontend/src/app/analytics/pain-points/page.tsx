'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { getPainPoints, listCreators, type Creator, type PainPoint } from '@/lib/api'
import { CreatorFilter } from '@/components/analytics/CreatorFilter'

export default function PainPointsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [data, setData] = useState<PainPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { listCreators().then(setCreators) }, [])
  useEffect(() => { load() }, [selected])

  async function load() {
    setLoading(true)
    try {
      const res = await getPainPoints(selected.length ? selected : undefined)
      setData(res)
    } finally {
      setLoading(false)
    }
  }

  const maxFreq = Math.max(...data.map(d => d.frequency), 1)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Audience Pain Points</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Common problems and frustrations your audience mentions
        </p>
      </div>

      <CreatorFilter creators={creators} selected={selected} onChange={setSelected} />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Analyzing comments...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No pain points detected yet. Import some creators first.</div>
      ) : (
        <div className="space-y-3 mt-6">
          {data.map(item => (
            <div key={item.topic} className="bg-card border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === item.topic ? null : item.topic)}
                className="w-full flex items-center gap-4 p-4 hover:bg-secondary/20 transition-colors text-left"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <span className="font-medium">{item.topic}</span>
                    <span className="text-xs bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded-full">
                      {item.frequency} mentions
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-1.5">
                    <div
                      className="bg-amber-400 h-1.5 rounded-full"
                      style={{ width: `${(item.frequency / maxFreq) * 100}%` }}
                    />
                  </div>
                </div>
                {expanded === item.topic ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>

              {expanded === item.topic && item.example_comments.length > 0 && (
                <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Example Comments</p>
                  {item.example_comments.map((c, i) => (
                    <div key={i} className="text-sm p-3 bg-secondary/20 rounded-md border border-border text-muted-foreground">
                      &ldquo;{c}&rdquo;
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
