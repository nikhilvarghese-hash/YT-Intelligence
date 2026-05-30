'use client'

import { useEffect, useState } from 'react'
import { HelpCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { getQuestions, listCreators, type Creator, type Question } from '@/lib/api'
import { CreatorFilter } from '@/components/analytics/CreatorFilter'

export default function QuestionsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [data, setData] = useState<Question[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => { listCreators().then(setCreators) }, [])
  useEffect(() => { load() }, [selected])

  async function load() {
    setLoading(true)
    try {
      const res = await getQuestions(selected.length ? selected : undefined)
      setData(res)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Question Mining</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Questions your audience is asking, ranked by frequency
        </p>
      </div>

      <CreatorFilter creators={creators} selected={selected} onChange={setSelected} />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Mining questions...</div>
      ) : (
        <div className="space-y-2 mt-6">
          {data.map((item, i) => (
            <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center gap-3 p-4 hover:bg-secondary/20 transition-colors text-left"
              >
                <span className="text-xs font-bold text-muted-foreground w-6 text-center">{i + 1}</span>
                <HelpCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span className="flex-1 text-sm font-medium">{item.question_text}</span>
                <span className="text-xs bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full shrink-0">
                  ×{item.frequency}
                </span>
                {expanded === i ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>

              {expanded === i && (
                <div className="px-4 pb-4 border-t border-border pt-3 space-y-2">
                  {item.creator_names && item.creator_names.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {item.creator_names.map(name => (
                        <span key={name} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{name}</span>
                      ))}
                    </div>
                  )}
                  {item.example_comments.slice(0, 4).map((c, j) => (
                    <div key={j} className="text-sm p-3 bg-secondary/20 rounded-md text-muted-foreground border border-border">
                      &ldquo;{c}&rdquo;
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {data.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">No questions found. Import creators with comments first.</div>
          )}
        </div>
      )}
    </div>
  )
}
