const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : '/api'

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export const getStats = () => fetchAPI<{
  creators: number; videos: number; comments: number; replies: number
}>('/stats')

// ─── Creators ────────────────────────────────────────────────────────────────

export const listCreators = () => fetchAPI<Creator[]>('/creators')

export const discoverCreator = (query: string) =>
  fetchAPI<CreatorDiscoveryResult>('/creators/discover', {
    method: 'POST',
    body: JSON.stringify({ query }),
  })

export const startImport = (channel_id: string, video_count: number) =>
  fetchAPI<{ job_id: string }>('/creators/import', {
    method: 'POST',
    body: JSON.stringify({ channel_id, video_count }),
  })

export const getImportStatus = (job_id: string) =>
  fetchAPI<ImportStatus>(`/creators/import/${job_id}/status`)

export const getImportStreamUrl = (job_id: string) =>
  `${API_BASE}/creators/import/${job_id}/stream`

export const deleteCreator = (id: number) =>
  fetchAPI(`/creators/${id}`, { method: 'DELETE' })

export const getCreatorVideos = (id: number, page = 1) =>
  fetchAPI<Video[]>(`/creators/${id}/videos?page=${page}&page_size=25`)

export const getCreatorComments = (id: number, page = 1, sort = 'likes') =>
  fetchAPI<PaginatedResponse<CommentRow>>(`/creators/${id}/comments?page=${page}&page_size=50&sort_by=${sort}`)

export async function getAllCreatorComments(id: number, sort = 'likes'): Promise<CommentRow[]> {
  const first = await fetchAPI<PaginatedResponse<CommentRow>>(
    `/creators/${id}/comments?page=1&page_size=50&sort_by=${sort}`
  )
  const all: CommentRow[] = [...first.items]
  for (let p = 2; p <= first.pages; p++) {
    const page = await fetchAPI<PaginatedResponse<CommentRow>>(
      `/creators/${id}/comments?page=${p}&page_size=50&sort_by=${sort}`
    )
    all.push(...page.items)
  }
  return all
}

// ─── Search ──────────────────────────────────────────────────────────────────

export const searchComments = (params: SearchParams) => {
  const q = new URLSearchParams({
    q: params.query,
    page: String(params.page || 1),
    page_size: String(params.pageSize || 50),
    ...(params.creatorIds?.length ? { creator_ids: params.creatorIds.join(',') } : {}),
    ...(params.minLikes != null ? { min_likes: String(params.minLikes) } : {}),
  })
  return fetchAPI<SearchResponse>(`/search/?${q}`)
}

export const keywordExplorer = (keyword: string, creatorIds?: number[]) => {
  const q = new URLSearchParams({ ...(creatorIds?.length ? { creator_ids: creatorIds.join(',') } : {}) })
  return fetchAPI<KeywordStats>(`/search/keyword/${encodeURIComponent(keyword)}?${q}`)
}

export const getSavedSearches = () => fetchAPI<SavedSearch[]>('/search/saved')

export const createSavedSearch = (name: string, query: string) =>
  fetchAPI<SavedSearch>('/search/saved', {
    method: 'POST',
    body: JSON.stringify({ name, query }),
  })

export const deleteSavedSearch = (id: number) =>
  fetchAPI(`/search/saved/${id}`, { method: 'DELETE' })

// ─── Analytics ───────────────────────────────────────────────────────────────

export const getPainPoints = (creatorIds?: number[]) => {
  const q = creatorIds?.length ? `?creator_ids=${creatorIds.join(',')}` : ''
  return fetchAPI<PainPoint[]>(`/analytics/pain-points${q}`)
}

export const getQuestions = (creatorIds?: number[]) => {
  const q = creatorIds?.length ? `?creator_ids=${creatorIds.join(',')}` : ''
  return fetchAPI<Question[]>(`/analytics/questions${q}`)
}

export const getPurchaseIntent = (creatorIds?: number[]) => {
  const q = creatorIds?.length ? `?creator_ids=${creatorIds.join(',')}` : ''
  return fetchAPI<PurchaseIntentComment[]>(`/analytics/purchase-intent${q}`)
}

export const getContentOpportunities = (creatorIds?: number[]) => {
  const q = creatorIds?.length ? `?creator_ids=${creatorIds.join(',')}` : ''
  return fetchAPI<ContentOpportunity[]>(`/analytics/content-opportunities${q}`)
}

export const getAudienceOverlap = (creatorIds?: number[], minCreators = 2) => {
  const params = new URLSearchParams({ min_creators: String(minCreators) })
  if (creatorIds?.length) params.set('creator_ids', creatorIds.join(','))
  return fetchAPI<AudienceOverlapUser[]>(`/analytics/audience-overlap?${params}`)
}

export const compareCreators = (creatorIds: number[]) =>
  fetchAPI<CreatorComparison[]>(`/analytics/compare?creator_ids=${creatorIds.join(',')}`)

// ─── Collections ─────────────────────────────────────────────────────────────

export const listCollections = () => fetchAPI<Collection[]>('/analytics/collections')

export const createCollection = (name: string, description?: string, color?: string) =>
  fetchAPI<Collection>('/analytics/collections', {
    method: 'POST',
    body: JSON.stringify({ name, description, color }),
  })

export const deleteCollection = (id: number) =>
  fetchAPI(`/analytics/collections/${id}`, { method: 'DELETE' })

export const addToCollection = (collectionId: number, commentIds: number[]) =>
  fetchAPI(`/analytics/collections/${collectionId}/items`, {
    method: 'POST',
    body: JSON.stringify({ comment_ids: commentIds }),
  })

export const getCollectionItems = (id: number, page = 1) =>
  fetchAPI<PaginatedResponse<CollectionItem>>(`/analytics/collections/${id}/items?page=${page}`)

// ─── Watchlists ───────────────────────────────────────────────────────────────

export const listWatchlists = () => fetchAPI<Watchlist[]>('/analytics/watchlists')

export const createWatchlist = (keyword: string, description?: string) =>
  fetchAPI<Watchlist>('/analytics/watchlists', {
    method: 'POST',
    body: JSON.stringify({ keyword, description }),
  })

export const deleteWatchlist = (id: number) =>
  fetchAPI(`/analytics/watchlists/${id}`, { method: 'DELETE' })

export const checkWatchlist = (id: number) =>
  fetchAPI<{ keyword: string; mention_count: number }>(`/analytics/watchlists/${id}/check`, { method: 'POST' })

// ─── Settings ─────────────────────────────────────────────────────────────────

export const getSettings = () => fetchAPI<AppSettings>('/settings')

export const updateSettings = (data: Partial<SettingsUpdate>) =>
  fetchAPI('/settings', { method: 'POST', body: JSON.stringify(data) })

// ─── Export URLs ─────────────────────────────────────────────────────────────

export const getExportUrl = (
  type: 'csv' | 'json' | 'markdown' | 'excel',
  params: { creatorIds?: number[]; query?: string; collectionId?: number; minLikes?: number }
) => {
  const ext = type === 'excel' ? 'excel' : type
  const q = new URLSearchParams()
  if (params.creatorIds?.length) q.set('creator_ids', params.creatorIds.join(','))
  if (params.query) q.set('query', params.query)
  if (params.collectionId) q.set('collection_id', String(params.collectionId))
  if (params.minLikes != null) q.set('min_likes', String(params.minLikes))
  return `${API_BASE}/export/comments/${ext}?${q}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Creator {
  id: number
  channel_id: string
  channel_name: string
  subscriber_count: number
  video_count: number
  channel_url: string
  thumbnail_url?: string
  description?: string
  country?: string
  created_at: string
  last_synced_at?: string
  total_comments: number
  total_videos_imported: number
}

export interface CreatorDiscoveryResult {
  channel_id: string
  channel_name: string
  subscriber_count: number
  video_count: number
  channel_url: string
  thumbnail_url?: string
  description?: string
  already_imported: boolean
}

export interface ImportStatus {
  job_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  channel_id: string
  channel_name?: string
  videos_total: number
  videos_imported: number
  comments_total: number
  comments_imported: number
  progress_pct: number
  message?: string
  error?: string
}

export interface Video {
  id: number
  creator_id: number
  video_id: string
  title: string
  url: string
  publish_date?: string
  views: number
  likes: number
  comment_count: number
  thumbnail_url?: string
  comments_imported: boolean
}

export interface CommentRow {
  id: number
  comment_id: string
  author_name?: string
  comment_text: string
  comment_date?: string
  likes: number
  reply_count: number
  video_title?: string
  creator_name?: string
  creator_id?: number
}

export interface SearchParams {
  query: string
  creatorIds?: number[]
  page?: number
  pageSize?: number
  minLikes?: number
}

export interface SearchResponse {
  results: CommentRow[]
  total: number
  page: number
  page_size: number
  query: string
}

export interface KeywordStats {
  keyword: string
  total_mentions: number
  unique_videos: number
  unique_creators: number
  avg_likes_on_mentions: number
  top_creators: Array<{ id: number; name: string; count: number }>
  top_videos: Array<{ id: number; title: string; creator: string; count: number; url?: string }>
  most_liked_comments: CommentRow[]
  most_replied_comments: CommentRow[]
  mention_trend: Array<{ date: string; count: number }>
}

export interface PainPoint {
  topic: string
  frequency: number
  example_comments: string[]
  category: string
}

export interface Question {
  question_text: string
  frequency: number
  example_comments: string[]
  creator_names?: string[]
}

export interface PurchaseIntentComment extends CommentRow {
  intent_score: number
  signals: string[]
  video_title: string
  creator_name: string
}

export interface ContentOpportunity {
  topic: string
  frequency: number
  example_comments: string[]
  creators_mentioning: string[]
}

export interface AudienceOverlapUser {
  author_name?: string
  author_channel_id?: string
  creator_count: number
  comment_count: number
  creators: string[]
}

export interface CreatorComparison {
  creator_id: number
  creator_name: string
  subscriber_count: number
  total_comments: number
  avg_likes_per_comment: number
  avg_replies_per_comment: number
  engagement_rate: number
  total_videos: number
  thumbnail_url?: string
}

export interface Collection {
  id: number
  name: string
  description?: string
  color: string
  created_at: string
  item_count: number
}

export interface CollectionItem {
  item_id: number
  comment_id: number
  comment_text: string
  author_name?: string
  likes: number
  comment_date?: string
  video_title: string
  creator_name: string
  note?: string
  added_at: string
}

export interface SavedSearch {
  id: number
  name: string
  query: string
  created_at: string
  last_run_at?: string
  result_count?: number
}

export interface Watchlist {
  id: number
  keyword: string
  description?: string
  created_at: string
  last_checked_at?: string
  mention_count: number
}

export interface AppSettings {
  youtube_api_key_set: boolean
  ai_provider: string
  ai_model: string
  openrouter_key_set: boolean
  quota_used: number
  quota_remaining: number
  last_api_call?: string
}

export interface SettingsUpdate {
  youtube_api_key?: string
  ai_provider?: string
  ai_model?: string
  openai_api_key?: string
  anthropic_api_key?: string
  gemini_api_key?: string
  ollama_base_url?: string
  openrouter_api_key?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface OpenRouterModel {
  id: string
  name: string
  context_length: number
}

export const getOpenRouterModels = (key?: string) =>
  fetchAPI<{ models: OpenRouterModel[] }>(
    `/settings/openrouter/models${key ? `?key=${encodeURIComponent(key)}` : ''}`
  )

export interface CompetitorVideo {
  id: number
  video_id: string
  title: string
  url?: string
  thumbnail_url?: string
  publish_date?: string
  views: number
  likes: number
  comment_count: number
  creator_id: number
  creator_name: string
  subscriber_count: number
  outlier_score: number | null
  views_per_hour: number
  hours_since_published: number
}

export const listCompetitors = () => fetchAPI<Creator[]>('/competitors')

export const addCompetitor = (creatorId: number) =>
  fetchAPI(`/competitors/${creatorId}`, { method: 'POST' })

export const removeCompetitor = (creatorId: number) =>
  fetchAPI(`/competitors/${creatorId}`, { method: 'DELETE' })

export const getCompetitorTopVideos = (params: {
  metric?: 'views' | 'outlier_score' | 'views_per_hour'
  period?: 'week' | 'month' | 'all'
  page?: number
  pageSize?: number
}) => {
  const q = new URLSearchParams({
    metric: params.metric ?? 'views',
    period: params.period ?? 'week',
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 50),
  })
  return fetchAPI<{ items: CompetitorVideo[]; total: number; page: number; pages: number }>(
    `/competitors/top-videos?${q}`
  )
}

export interface CompetitorInsight {
  insight: string | null
  model_used: string | null
  error?: string
}

// ─── Content Strategy AI Insights ────────────────────────────────────────────

export interface InsightStatus {
  last_run_at: string | null
  new_comments_since_last_run: number
  total_comments: number
  is_first_run: boolean
}

export interface AITopicData {
  angle: string
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
  hook: string
}

export interface AIGapData {
  why: string
  action: string
}

export interface ContentStrategyInsight {
  insight: string | null
  model_used: string | null
  error?: string
  comments_analyzed: number
  incremental_since: string | null
  last_run_at: string | null
  topics_found?: number
  // parsed sections
  volumeInsight?: string
  topicMap?: Record<string, AITopicData>
  gapMap?: Record<string, AIGapData>
  nextActions?: string[]
}

export const getInsightStatus = (creatorIds?: number[]) => {
  const q = creatorIds?.length ? `?creator_ids=${creatorIds.join(',')}` : ''
  return fetchAPI<InsightStatus>(`/analytics/competitor-insights/status${q}`)
}

export const runContentStrategyInsights = (creatorIds?: number[], incremental = true) => {
  const params = new URLSearchParams({ incremental: String(incremental) })
  if (creatorIds?.length) params.set('creator_ids', creatorIds.join(','))
  return fetchAPI<ContentStrategyInsight>(`/analytics/competitor-insights?${params}`, {
    method: 'POST',
  })
}

// ─── AI Content Strategy ─────────────────────────────────────────────────────

export type KanbanStatus = 'new' | 'trending' | 'high_engagement' | 'planned' | 'in_progress' | 'published' | 'archived'

export interface ContentCard {
  id: string
  topic: string
  original_topic: string
  type: 'question' | 'opportunity' | 'pain_point'
  category: string
  classification: 'finniki' | 'adjacent'
  frequency: number
  unique_users: number
  avg_likes: number
  scores: { demand: number; engagement: number; relevance: number; opportunity: number }
  format: 'long' | 'short' | 'both'
  format_confidence: number
  trend: 'growing' | 'stable' | 'declining'
  status: KanbanStatus
  example_comments: string[]
  creator_names: string[]
  notes: string
  custom_title: string
}

export interface ContentCardPage {
  items: ContentCard[]
  total: number
  page: number
  has_more: boolean
}

export interface CardBrief {
  brief: string | null
  error?: string
}

export interface StrategyVideo {
  id: number
  video_id: string
  title: string
}

export const getStrategyVideos = (creatorIds?: number[]) => {
  const params = new URLSearchParams()
  if (creatorIds?.length) params.set('creator_ids', creatorIds.join(','))
  return fetchAPI<StrategyVideo[]>(`/content-strategy/videos?${params}`)
}

export const getContentOpportunityCards = (params: {
  creatorIds?: number[]
  period?: number
  videoId?: number
  minScore?: number
  page?: number
  pageSize?: number
}) => {
  const p = new URLSearchParams({ period: String(params.period ?? 90), page: String(params.page ?? 1), page_size: String(params.pageSize ?? 50) })
  if (params.creatorIds?.length) p.set('creator_ids', params.creatorIds.join(','))
  if (params.videoId) p.set('video_id', String(params.videoId))
  if (params.minScore) p.set('min_score', String(params.minScore))
  return fetchAPI<ContentCardPage>(`/content-strategy/opportunities?${p}`)
}

export const updateCardStatuses = (updates: Record<string, KanbanStatus>) =>
  fetchAPI('/content-strategy/cards/status', {
    method: 'POST',
    body: JSON.stringify(updates),
  })

export const updateCardMeta = (cardId: string, meta: { notes?: string; custom_title?: string; archived?: boolean }) =>
  fetchAPI(`/content-strategy/cards/${cardId}/meta`, {
    method: 'PATCH',
    body: JSON.stringify(meta),
  })

export const generateCardBrief = (card: Pick<ContentCard, 'topic' | 'frequency' | 'example_comments' | 'classification' | 'category'>) =>
  fetchAPI<CardBrief>('/content-strategy/cards/brief', {
    method: 'POST',
    body: JSON.stringify(card),
  })

export const getContentTrends = (topics: string[], creatorIds?: number[], weeks = 12) => {
  const params = new URLSearchParams({ topics: topics.join(','), weeks: String(weeks) })
  if (creatorIds?.length) params.set('creator_ids', creatorIds.join(','))
  return fetchAPI<Record<string, Array<{ week: string; count: number }>>>(`/content-strategy/trends?${params}`)
}

export const getCompetitorInsights = (
  videoIds: number[],
  promptType: 'summary' | 'titles' | 'topics' | 'custom',
  customPrompt?: string,
) =>
  fetchAPI<CompetitorInsight>('/competitors/ai-insights', {
    method: 'POST',
    body: JSON.stringify({
      video_ids: videoIds,
      prompt_type: promptType,
      custom_prompt: customPrompt,
    }),
  })

// ─── Topic Intelligence ───────────────────────────────────────────────────────

export interface TopicTheme {
  id: string
  name: string
  total_mentions: number
  unique_users: number
  growth_rate: number
  trend: 'growing' | 'stable' | 'declining'
  finniki: boolean
  finniki_confidence: number
  top_keywords: string[]
  representative_questions: string[]
  all_questions: string[]
  related_videos: { title: string; count: number }[]
  summary: string
}

export interface TopicThemesResponse {
  themes: TopicTheme[]
  status: 'cached' | 'building' | 'ready'
  building: boolean
  error: string
}

export const getTopicThemes = (creatorIds?: number[], period = 90, forceRebuild = false) => {
  const params = new URLSearchParams({ period: String(period) })
  if (creatorIds?.length) params.set('creator_ids', creatorIds.join(','))
  if (forceRebuild) params.set('force_rebuild', 'true')
  return fetchAPI<TopicThemesResponse>(`/topic-intelligence/themes?${params}`)
}

export const rebuildTopicThemes = (creatorIds?: number[], period = 90) => {
  const params = new URLSearchParams({ period: String(period) })
  if (creatorIds?.length) params.set('creator_ids', creatorIds.join(','))
  return fetchAPI(`/topic-intelligence/rebuild?${params}`, { method: 'POST' })
}

export const getTopicThemeStatus = () =>
  fetchAPI<{ building: boolean; error: string; started_at: string | null }>('/topic-intelligence/status')

export const getTopicThemeDetail = (themeId: string, creatorIds?: number[], period = 90) => {
  const params = new URLSearchParams({ period: String(period) })
  if (creatorIds?.length) params.set('creator_ids', creatorIds.join(','))
  return fetchAPI<TopicTheme>(`/topic-intelligence/themes/${themeId}?${params}`)
}

// ─── Intent layer ─────────────────────────────────────────────────────────────

export interface IntentResult {
  intent: string
  intent_label: string
  summary: string
  period: number
  topic: string | null
  page_link: string
  preview: Record<string, unknown>
}

export const queryIntent = (query: string, creatorIds?: number[]) =>
  fetchAPI<IntentResult>('/intent/query', {
    method: 'POST',
    body: JSON.stringify({ query, creator_ids: creatorIds ?? [] }),
  })
