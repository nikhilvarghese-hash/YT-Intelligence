'use client'

import { useState, useRef, FormEvent } from 'react'
import Link from 'next/link'
import { Search, ArrowRight, Loader2, Sparkles, AlertCircle } from 'lucide-react'
import { queryIntent, IntentResult } from '@/lib/api'
import { AskFinniki } from './AskFinniki'

const EXAMPLES = [
  'What topics are my audience asking about?',
  'Show me content gaps I can fill',
  'What pain points keep coming up in comments?',
  'Which competitor videos are performing best?',
  'What are the top purchase intent signals?',
]

function PreviewSection({ preview }: { preview: Record<string, unknown> }) {
  const type = preview.type as string

  if (type === 'error') {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load preview: {String(preview.detail)}
      </p>
    )
  }

  if (type === 'none' || !preview.items) {
    return (
      <p className="text-sm text-muted-foreground">
        No preview available — open the full page to explore.
      </p>
    )
  }

  const items = preview.items as Record<string, unknown>[]

  if (type === 'themes') {
    return (
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span>{String(item.label)}</span>
            <span className="text-xs text-muted-foreground">{String(item.size)} signals</span>
          </li>
        ))}
      </ul>
    )
  }

  if (type === 'questions') {
    return (
      <ul className="space-y-1 list-disc list-inside">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-muted-foreground">
            {String((item as { question_text?: string }).question_text ?? JSON.stringify(item))}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="space-y-1 list-disc list-inside">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-muted-foreground">
          {String(typeof item === 'object' ? Object.values(item)[0] : item)}
        </li>
      ))}
    </ul>
  )
}

function IntentSearch() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<IntentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await queryIntent(q)
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function useExample(ex: string) {
    setQuery(ex)
    setResult(null)
    setError(null)
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col items-center min-h-full px-6 py-16 gap-8">
      <div className="text-center space-y-2 max-w-lg">
        <div className="flex items-center justify-center gap-2 text-primary mb-2">
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-semibold uppercase tracking-widest">Intent Search</span>
        </div>
        <h1 className="text-2xl font-bold">Ask anything about your audience</h1>
        <p className="text-muted-foreground text-sm">
          Type a question in plain English and we'll route it to the right analysis.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. What topics are my audience asking about?"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Ask
          </button>
        </div>
      </form>

      {!result && !loading && (
        <div className="flex flex-wrap gap-2 justify-center max-w-xl">
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              onClick={() => useExample(ex)}
              className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm max-w-xl w-full bg-destructive/10 px-4 py-3 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="w-full max-w-xl space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded mb-1">
                {result.intent_label}
              </span>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
            </div>
            <Link
              href={result.page_link}
              className="flex-shrink-0 flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open full view <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="border border-border rounded-lg p-4 bg-secondary/30 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Preview
            </p>
            <PreviewSection preview={result.preview} />
          </div>

          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Period: {result.period} days</span>
            {result.topic && <span>Topic filter: {result.topic}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

type Tab = 'intent' | 'finniki'

export default function IntentPage() {
  const [tab, setTab] = useState<Tab>('intent')

  return (
    <div className="flex flex-col h-screen">
      {/* Tab bar */}
      <div className="border-b bg-background px-6">
        <div className="flex gap-0">
          {([
            { id: 'intent' as Tab, label: 'Intent Search' },
            { id: 'finniki' as Tab, label: 'Ask Finniki', badge: 'AI' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {'badge' in t && (
                <span className="text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-1.5 py-0.5 rounded-full">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'intent' ? <IntentSearch /> : <AskFinniki />}
      </div>
    </div>
  )
}
