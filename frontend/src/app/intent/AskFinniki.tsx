'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Search, Loader2, Sparkles, AlertCircle, Copy, Check,
  Database, TrendingUp, MessageSquare, BarChart2, RefreshCw,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  askFinnikiStream,
  getFinnikiIndexStatus,
  triggerFinnikiIndex,
  type FinnikiMeta,
  type FinnikiIndexStatus,
} from '@/lib/api'

const SUGGESTED = [
  'What topics are trending with my audience?',
  'What concerns occur most frequently in comments?',
  'What questions are viewers repeatedly asking?',
  'Which topics deserve long-form content?',
  'Which topics are ideal for Shorts?',
  'What content should we create next?',
  'What misconceptions exist in the comments?',
  'Which audience questions generate the highest engagement?',
]

interface Message {
  id: string
  query: string
  response: string
  meta: FinnikiMeta | null
  error: string | null
  streaming: boolean
}

export function AskFinniki() {
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [indexStatus, setIndexStatus] = useState<FinnikiIndexStatus | null>(null)
  const [showStatus, setShowStatus] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<boolean>(false)

  useEffect(() => {
    getFinnikiIndexStatus().then(setIndexStatus).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleIndex = async () => {
    await triggerFinnikiIndex()
    setTimeout(() => getFinnikiIndexStatus().then(setIndexStatus).catch(() => {}), 1000)
  }

  const submit = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return

    const id = Date.now().toString()
    const msg: Message = { id, query: trimmed, response: '', meta: null, error: null, streaming: true }
    setMessages(prev => [...prev, msg])
    setQuery('')
    abortRef.current = false

    try {
      for await (const event of askFinnikiStream(trimmed)) {
        if (abortRef.current) break

        if (event.type === 'meta') {
          setMessages(prev => prev.map(m =>
            m.id === id ? { ...m, meta: event as unknown as FinnikiMeta } : m
          ))
        } else if (event.type === 'chunk') {
          setMessages(prev => prev.map(m =>
            m.id === id ? { ...m, response: m.response + (event.text as string) } : m
          ))
        } else if (event.type === 'error') {
          setMessages(prev => prev.map(m =>
            m.id === id ? { ...m, error: event.message as string, streaming: false } : m
          ))
          return
        } else if (event.type === 'done') {
          setMessages(prev => prev.map(m =>
            m.id === id ? { ...m, streaming: false } : m
          ))
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === id
          ? { ...m, error: 'Connection failed. Is the backend running?', streaming: false }
          : m
      ))
    }

    // Refresh index status after query
    getFinnikiIndexStatus().then(setIndexStatus).catch(() => {})
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submit(query)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(query)
    }
  }

  const copyResponse = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const isStreaming = messages.some(m => m.streaming)

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">

      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Ask Finniki
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Evidence-based audience intelligence — answers grounded in real audience data
            </p>
          </div>
          <button
            onClick={() => setShowStatus(s => !s)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border rounded-md px-3 py-1.5 transition-colors"
          >
            <Database className="w-3.5 h-3.5" />
            Knowledge Base
            {showStatus ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Index status panel */}
        {showStatus && indexStatus && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg text-sm">
            <div className="flex items-center justify-between">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-muted-foreground text-xs">Documents indexed</p>
                  <p className="font-semibold">{indexStatus.indexed_documents.toLocaleString()} / {indexStatus.total_documents.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Chunks</p>
                  <p className="font-semibold">{indexStatus.total_chunks.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Embeddings</p>
                  <p className="font-semibold">{indexStatus.total_embeddings.toLocaleString()}</p>
                </div>
              </div>
              <button
                onClick={handleIndex}
                disabled={indexStatus.is_indexing}
                className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${indexStatus.is_indexing ? 'animate-spin' : ''}`} />
                {indexStatus.is_indexing ? 'Indexing…' : 'Sync Knowledge Base'}
              </button>
            </div>
            {indexStatus.pending_documents > 0 && (
              <p className="text-amber-600 text-xs mt-2">
                {indexStatus.pending_documents} documents pending indexing. Click "Sync Knowledge Base" to process.
              </p>
            )}
            {indexStatus.total_documents === 0 && (
              <p className="text-amber-600 text-xs mt-2">
                No documents indexed yet. Sync your creators first, then click "Sync Knowledge Base".
              </p>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto">
            <p className="text-center text-muted-foreground text-sm mb-6">
              Ask any question about your audience. Finniki answers using evidence from comments, questions, and video performance data.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED.map((s, i) => (
                <button
                  key={i}
                  onClick={() => submit(s)}
                  className="text-left text-sm px-4 py-3 border rounded-lg hover:bg-muted/50 hover:border-primary/40 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className="max-w-3xl mx-auto space-y-4">
            {/* User query */}
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 max-w-xl text-sm">
                {msg.query}
              </div>
            </div>

            {/* Response */}
            <div className="space-y-3">
              {/* Meta card */}
              {msg.meta && !msg.error && (
                <ConfidenceCard meta={msg.meta} />
              )}

              {/* Streaming / response */}
              <div className="border rounded-xl overflow-hidden">
                {msg.error ? (
                  <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/20">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-400">{msg.error}</p>
                  </div>
                ) : (
                  <div className="p-5">
                    {msg.streaming && !msg.response && (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analysing audience evidence…
                      </div>
                    )}
                    {msg.response && (
                      <MarkdownResponse text={msg.response} streaming={msg.streaming} />
                    )}
                  </div>
                )}

                {/* Footer */}
                {!msg.streaming && !msg.error && msg.response && (
                  <div className="border-t px-5 py-2.5 flex items-center justify-between bg-muted/30">
                    <span className="text-xs text-muted-foreground">
                      {msg.meta
                        ? `${msg.meta.stats.comments_analysed} comments · ${msg.meta.stats.videos_referenced} videos · ${msg.meta.retrieval_ms}ms retrieval`
                        : ''}
                    </span>
                    <button
                      onClick={() => copyResponse(msg.id, msg.response)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied === msg.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t px-6 py-4 bg-background">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3 border rounded-xl focus-within:border-primary/60 bg-background transition-colors p-3">
            <textarea
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask anything about your audience…"
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground leading-relaxed max-h-40"
              style={{ height: 'auto' }}
              onInput={e => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = t.scrollHeight + 'px'
              }}
            />
            <button
              type="submit"
              disabled={!query.trim() || isStreaming}
              className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-2">
            Press Enter to send · Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  )
}

function ConfidenceCard({ meta }: { meta: FinnikiMeta }) {
  const pct = Math.round(meta.confidence * 100)
  const level = pct >= 70 ? 'High' : pct >= 40 ? 'Medium' : 'Low'
  const color = pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500'
  const bg    = pct >= 70 ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : pct >= 40 ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800' : 'bg-red-50 border-red-200'

  return (
    <div className={`border rounded-xl p-4 ${bg}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Evidence Quality</span>
        <span className={`text-sm font-bold ${color}`}>{level} Confidence ({pct}%)</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat icon={<MessageSquare className="w-3.5 h-3.5" />} label="Comments" value={meta.stats.comments_analysed} />
        <Stat icon={<BarChart2 className="w-3.5 h-3.5" />} label="Videos" value={meta.stats.videos_referenced} />
        <Stat icon={<TrendingUp className="w-3.5 h-3.5" />} label="Evidence chunks" value={meta.retrieved_chunks} />
      </div>
      {Object.keys(meta.stats.top_intents).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(meta.stats.top_intents).slice(0, 4).map(([k, v]) => (
            <span key={k} className="text-xs bg-background/70 border rounded-full px-2 py-0.5">
              {k} ({v})
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <p className="font-semibold text-xs">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function MarkdownResponse({ text, streaming }: { text: string; streaming: boolean }) {
  const lines = text.split('\n')

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return <h2 key={i} className="text-base font-semibold mt-4 mb-2 first:mt-0">{line.slice(3)}</h2>
        }
        if (line.startsWith('### ')) {
          return <h3 key={i} className="text-sm font-semibold mt-3 mb-1">{line.slice(4)}</h3>
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <li key={i} className="ml-4 list-disc text-sm">{line.slice(2)}</li>
        }
        if (line.startsWith('> ')) {
          return (
            <blockquote key={i} className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground my-1">
              {line.slice(2)}
            </blockquote>
          )
        }
        if (line === '') {
          return <div key={i} className="h-2" />
        }
        return <p key={i} className="text-sm">{line}</p>
      })}
      {streaming && <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-0.5 rounded-sm" />}
    </div>
  )
}
