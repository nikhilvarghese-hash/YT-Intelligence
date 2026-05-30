'use client'

import { useEffect, useState, useMemo } from 'react'
import { Key, Bot, Activity, Save, Eye, EyeOff } from 'lucide-react'
import { getSettings, updateSettings, getOpenRouterModels, type AppSettings, type SettingsUpdate, type OpenRouterModel } from '@/lib/api'
import { formatNumber, formatDate } from '@/lib/utils'

function ModelSearch({
  models, value, onChange,
}: { models: OpenRouterModel[]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    if (!query.trim()) return models
    const q = query.toLowerCase()
    return models.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
  }, [models, query])

  return (
    <div className="space-y-1.5">
      <input
        type="text"
        placeholder="Search models…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <select
        size={6}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1 bg-background border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {filtered.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{filtered.length} of {models.length} models</p>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [form, setForm] = useState<SettingsUpdate>({})
  const [showKeys, setShowKeys] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState('')

  useEffect(() => {
    getSettings().then(s => {
      setSettings(s)
      setForm({ ai_provider: s.ai_provider, ai_model: s.ai_model })
    })
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await updateSettings(form)
      const updated = await getSettings()
      setSettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function handleLoadModels() {
    setLoadingModels(true)
    setModelsError('')
    try {
      const { models } = await getOpenRouterModels(form.openrouter_api_key)
      setOpenRouterModels(models)
    } catch (e: any) {
      setModelsError('Could not load models — check your API key')
    } finally {
      setLoadingModels(false)
    }
  }

  const providers = [
    { id: 'openrouter', label: 'OpenRouter', desc: 'Access 200+ models via one API key — recommended' },
    { id: 'none', label: 'None (Rule-based)', desc: 'Uses pattern matching — no API needed' },
    { id: 'openai', label: 'OpenAI', desc: 'GPT-4o-mini recommended for cost' },
    { id: 'anthropic', label: 'Anthropic', desc: 'Claude Haiku for cost efficiency' },
    { id: 'gemini', label: 'Google Gemini', desc: 'Gemini 1.5 Flash' },
    { id: 'ollama', label: 'Ollama (Local)', desc: 'Run models locally — free, private' },
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure API keys and AI provider</p>
      </div>

      {/* Quota */}
      {settings && (
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="font-medium">YouTube API Quota</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Used Today</div>
              <div className="text-xl font-bold text-amber-400">{formatNumber(settings.quota_used)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Remaining</div>
              <div className="text-xl font-bold text-emerald-400">{formatNumber(settings.quota_remaining)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Last API Call</div>
              <div className="text-sm font-medium">{settings.last_api_call ? formatDate(settings.last_api_call) : '—'}</div>
            </div>
          </div>
          <div className="mt-3 w-full bg-secondary rounded-full h-2">
            <div className="bg-amber-400 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (settings.quota_used / 10000) * 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Daily quota: 10,000 units</p>
        </div>
      )}

      {/* YouTube API Key */}
      <div className="bg-card border border-border rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Key className="w-4 h-4 text-primary" />
          <h2 className="font-medium">YouTube Data API v3</h2>
          {settings?.youtube_api_key_set && (
            <span className="text-xs bg-emerald-400/10 text-emerald-400 px-2 py-0.5 rounded-full">Active</span>
          )}
        </div>
        <div className="relative">
          <input
            type={showKeys ? 'text' : 'password'}
            placeholder="AIza..."
            value={form.youtube_api_key || ''}
            onChange={e => setForm(f => ({ ...f, youtube_api_key: e.target.value }))}
            className="w-full pr-10 px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
          <button onClick={() => setShowKeys(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showKeys ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Get your key at <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.cloud.google.com</a>. Enable YouTube Data API v3.
        </p>
      </div>

      {/* AI Provider */}
      <div className="bg-card border border-border rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-primary" />
          <h2 className="font-medium">AI Provider</h2>
          <span className="text-xs text-muted-foreground">(optional — enhances analysis)</span>
        </div>

        <div className="space-y-2 mb-4">
          {providers.map(p => (
            <button key={p.id} onClick={() => setForm(f => ({ ...f, ai_provider: p.id }))}
              className={`w-full text-left p-3 rounded-md border transition-colors ${
                form.ai_provider === p.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
              }`}>
              <div className={`font-medium text-sm ${form.ai_provider === p.id ? 'text-primary' : ''}`}>{p.label}</div>
              <div className="text-xs text-muted-foreground">{p.desc}</div>
            </button>
          ))}
        </div>

        {form.ai_provider && form.ai_provider !== 'none' && (
          <div className="space-y-3 pt-3 border-t border-border">
            {/* OpenRouter */}
            {form.ai_provider === 'openrouter' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    OpenRouter API Key
                    <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer"
                      className="ml-2 text-primary hover:underline">Get key →</a>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={showKeys ? 'text' : 'password'}
                      placeholder="sk-or-..."
                      value={form.openrouter_api_key || ''}
                      onChange={e => setForm(f => ({ ...f, openrouter_api_key: e.target.value }))}
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {form.openrouter_api_key && (
                      <button onClick={handleLoadModels} disabled={loadingModels}
                        className="px-3 py-2 border border-border rounded-md text-sm hover:bg-secondary transition-colors disabled:opacity-50">
                        {loadingModels ? '…' : 'Load Models'}
                      </button>
                    )}
                  </div>
                  {modelsError && <p className="text-xs text-red-400 mt-1">{modelsError}</p>}
                  {settings?.openrouter_key_set && !form.openrouter_api_key && (
                    <p className="text-xs text-emerald-400 mt-1">✓ Key saved</p>
                  )}
                </div>

                {/* Quick picks grouped by tier */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Quick pick</p>
                  {[
                    {
                      group: 'Auto',
                      models: [
                        { id: 'openrouter/auto', label: 'Auto', desc: 'OpenRouter picks the best available model' },
                      ],
                    },
                    {
                      group: 'Free',
                      models: [
                        { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B' },
                        { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B' },
                        { id: 'google/gemma-2-9b-it:free', label: 'Gemma 2 9B' },
                        { id: 'qwen/qwen-2-7b-instruct:free', label: 'Qwen 2 7B' },
                      ],
                    },
                    {
                      group: 'Fast',
                      models: [
                        { id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5' },
                        { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
                        { id: 'anthropic/claude-haiku', label: 'Claude Haiku' },
                        { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
                      ],
                    },
                    {
                      group: 'Premium',
                      models: [
                        { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet' },
                        { id: 'openai/gpt-4o', label: 'GPT-4o' },
                        { id: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5' },
                        { id: 'x-ai/grok-3-mini-beta', label: 'Grok 3 Mini' },
                      ],
                    },
                  ].map(({ group, models }) => (
                    <div key={group} className="mb-2">
                      <p className="text-xs text-muted-foreground/60 mb-1">{group}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {models.map(m => (
                          <button key={m.id} onClick={() => setForm(f => ({ ...f, ai_model: m.id }))}
                            title={'desc' in m ? (m as any).desc : m.id}
                            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                              form.ai_model === m.id
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:border-primary/50'
                            }`}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Full model list (loaded on demand) */}
                {openRouterModels.length > 0 && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Browse all <span className="text-muted-foreground/60">({openRouterModels.length} models)</span>
                    </label>
                    <ModelSearch
                      models={openRouterModels}
                      value={form.ai_model || ''}
                      onChange={id => setForm(f => ({ ...f, ai_model: id }))}
                    />
                  </div>
                )}

                {form.ai_model && (
                  <p className="text-xs text-muted-foreground font-mono">Selected: {form.ai_model}</p>
                )}
              </div>
            )}

            {form.ai_provider === 'openai' && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">OpenAI API Key</label>
                <input type={showKeys ? 'text' : 'password'} placeholder="sk-..."
                  value={form.openai_api_key || ''}
                  onChange={e => setForm(f => ({ ...f, openai_api_key: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            )}
            {form.ai_provider === 'anthropic' && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Anthropic API Key</label>
                <input type={showKeys ? 'text' : 'password'} placeholder="sk-ant-..."
                  value={form.anthropic_api_key || ''}
                  onChange={e => setForm(f => ({ ...f, anthropic_api_key: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            )}
            {form.ai_provider === 'gemini' && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Gemini API Key</label>
                <input type={showKeys ? 'text' : 'password'}
                  value={form.gemini_api_key || ''}
                  onChange={e => setForm(f => ({ ...f, gemini_api_key: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            )}
            {form.ai_provider === 'ollama' && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Ollama Base URL</label>
                <input type="text" placeholder="http://localhost:11434"
                  value={form.ollama_base_url || ''}
                  onChange={e => setForm(f => ({ ...f, ollama_base_url: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            )}

            {form.ai_provider !== 'openrouter' && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Model (optional)</label>
                <input type="text" placeholder="e.g. gpt-4o-mini, claude-haiku-4-5-20251001"
                  value={form.ai_model || ''}
                  onChange={e => setForm(f => ({ ...f, ai_model: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            )}
          </div>
        )}
      </div>

      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
      </button>
    </div>
  )
}
