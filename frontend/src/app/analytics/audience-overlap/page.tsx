'use client'

import { useEffect, useState } from 'react'
import { Users2, ExternalLink } from 'lucide-react'
import { getAudienceOverlap, listCreators, type Creator, type AudienceOverlapUser } from '@/lib/api'
import { CreatorFilter } from '@/components/analytics/CreatorFilter'

export default function AudienceOverlapPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [data, setData] = useState<AudienceOverlapUser[]>([])
  const [loading, setLoading] = useState(false)
  const [minCreators, setMinCreators] = useState(2)

  useEffect(() => { listCreators().then(setCreators) }, [])
  useEffect(() => { load() }, [selected, minCreators])

  async function load() {
    setLoading(true)
    try {
      const res = await getAudienceOverlap(selected.length ? selected : undefined, minCreators)
      setData(res)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Audience Overlap</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Users who comment across multiple creators
        </p>
      </div>

      <CreatorFilter creators={creators} selected={selected} onChange={setSelected} />

      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-muted-foreground">Min creators followed:</label>
        <div className="flex gap-1">
          {[2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setMinCreators(n)}
              className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                minCreators === n ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
              }`}>{n}+</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Analyzing audience overlap...</div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {data.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/20">
                  <th className="px-4 py-3 text-left text-muted-foreground font-medium">User</th>
                  <th className="px-4 py-3 text-center text-muted-foreground font-medium">Creators</th>
                  <th className="px-4 py-3 text-center text-muted-foreground font-medium">Comments</th>
                  <th className="px-4 py-3 text-left text-muted-foreground font-medium">Follows</th>
                </tr>
              </thead>
              <tbody>
                {data.map((user, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/10">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Users2 className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{user.author_name || 'Unknown'}</div>
                          {user.author_channel_id && (
                            <a href={`https://youtube.com/channel/${user.author_channel_id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1">
                              View channel <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {user.creator_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{user.comment_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.creators.map(c => (
                          <span key={c} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{c}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No overlapping audience found. Import multiple creators to see overlaps.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
