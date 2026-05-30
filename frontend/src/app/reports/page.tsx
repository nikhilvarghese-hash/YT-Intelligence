'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Download, FileText, BarChart3, TrendingUp } from 'lucide-react'
import {
  listCreators, getPainPoints, getQuestions, getPurchaseIntent,
  getContentOpportunities, compareCreators, getExportUrl,
  type Creator,
} from '@/lib/api'
import { CreatorFilter } from '@/components/analytics/CreatorFilter'
import { formatNumber, formatDate } from '@/lib/utils'

type ReportType = 'audience' | 'creator' | 'market'

export default function ReportsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [reportType, setReportType] = useState<ReportType>('audience')
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<string | null>(null)

  useEffect(() => { listCreators().then(c => { setCreators(c); setSelected(c.map(x => x.id)) }) }, [])

  async function generateReport() {
    setGenerating(true)
    setReport(null)
    try {
      const ids = selected.length ? selected : undefined
      let md = ''

      if (reportType === 'audience') {
        const [painPoints, questions, intent, content] = await Promise.all([
          getPainPoints(ids),
          getQuestions(ids),
          getPurchaseIntent(ids),
          getContentOpportunities(ids),
        ])

        const creatorNames = creators.filter(c => !ids || ids.includes(c.id)).map(c => c.channel_name)

        md = `# Audience Intelligence Report
**Creators:** ${creatorNames.join(', ') || 'All'}
**Generated:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

---

## Top Audience Pain Points

${painPoints.slice(0, 8).map((p, i) => `### ${i + 1}. ${p.topic}
**Frequency:** ${p.frequency} mentions

${p.example_comments.slice(0, 2).map(c => `> "${c}"`).join('\n\n')}
`).join('\n')}

---

## Most Asked Questions

${questions.slice(0, 10).map((q, i) => `${i + 1}. **${q.question_text}** *(asked ${q.frequency} times)*`).join('\n')}

---

## Purchase Intent Signals

${intent.slice(0, 10).map(c => `- **${c.author_name || 'User'}** on *${c.video_title}*
  > "${c.comment_text.slice(0, 150)}"
  Signals: ${c.signals?.join(', ')}`).join('\n\n')}

---

## Content Opportunities

${content.slice(0, 8).map((o, i) => `${i + 1}. **${o.topic}** — ${o.frequency} mentions across ${o.creators_mentioning?.length || 0} creators`).join('\n')}
`

      } else if (reportType === 'creator') {
        const creatorIds = selected.length ? selected : creators.slice(0, 5).map(c => c.id)
        const comparison = await compareCreators(creatorIds)
        const creatorObjs = creators.filter(c => creatorIds.includes(c.id))

        md = `# Creator Report
**Generated:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

---

## Engagement Statistics

| Creator | Comments | Avg Likes | Avg Replies | Engagement |
|---------|----------|-----------|-------------|------------|
${comparison.map(c => `| ${c.creator_name} | ${formatNumber(c.total_comments)} | ${c.avg_likes_per_comment.toFixed(1)} | ${c.avg_replies_per_comment.toFixed(1)} | ${(c.engagement_rate * 100).toFixed(3)}% |`).join('\n')}

---

## Creator Profiles

${creatorObjs.map(c => `### ${c.channel_name}
- **Subscribers:** ${formatNumber(c.subscriber_count)}
- **Videos Imported:** ${c.total_videos_imported}
- **Comments Collected:** ${formatNumber(c.total_comments)}
- **Channel:** ${c.channel_url}
- **Last Synced:** ${formatDate(c.last_synced_at)}
`).join('\n')}
`

      } else {
        // Market report
        const ids = selected.length ? selected : undefined
        const [painPoints, content, questions] = await Promise.all([
          getPainPoints(ids),
          getContentOpportunities(ids),
          getQuestions(ids),
        ])

        md = `# Market Intelligence Report
**Generated:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
**Scope:** ${creators.filter(c => !ids || ids.includes(c.id)).map(c => c.channel_name).join(', ')}

---

## Cross-Creator Pain Points

${painPoints.slice(0, 10).map((p, i) => `${i + 1}. **${p.topic}** — ${p.frequency} total mentions`).join('\n')}

---

## Emerging Topics & Demand

${content.slice(0, 10).map((o, i) => `${i + 1}. **${o.topic}** — ${o.frequency} mentions, ${o.creators_mentioning?.length || 0} creators`).join('\n')}

---

## Common Problems (Questions)

${questions.slice(0, 10).map((q, i) => `${i + 1}. ${q.question_text} *(${q.frequency} times)*`).join('\n')}
`
      }

      setReport(md)
    } finally {
      setGenerating(false)
    }
  }

  function downloadReport() {
    if (!report) return
    const blob = new Blob([report], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${reportType}-report-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reportTypes = [
    { id: 'audience', label: 'Audience Report', icon: TrendingUp, desc: 'Pain points, questions, purchase intent' },
    { id: 'creator', label: 'Creator Report', icon: BarChart3, desc: 'Engagement stats and comparisons' },
    { id: 'market', label: 'Market Report', icon: FileText, desc: 'Cross-creator trends and opportunities' },
  ] as const

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Research Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Generate downloadable intelligence reports</p>
      </div>

      {/* Report type */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {reportTypes.map(({ id, label, icon: Icon, desc }) => (
          <button key={id} onClick={() => setReportType(id)}
            className={`text-left p-4 rounded-lg border transition-all ${
              reportType === id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
            }`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${reportType === id ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`font-medium text-sm ${reportType === id ? 'text-primary' : ''}`}>{label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </button>
        ))}
      </div>

      <CreatorFilter creators={creators} selected={selected} onChange={setSelected} />

      <button onClick={generateReport} disabled={generating}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors mb-6">
        <BookOpen className="w-4 h-4" />
        {generating ? 'Generating...' : 'Generate Report'}
      </button>

      {report && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Report Preview</h2>
            <button onClick={downloadReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary transition-colors">
              <Download className="w-3.5 h-3.5" />
              Download .md
            </button>
          </div>
          <div className="bg-card border border-border rounded-lg p-6 prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-foreground font-mono leading-relaxed">{report}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
