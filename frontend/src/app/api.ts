export const BACKEND_CATEGORIES = [
  "academic",
  "finance",
  "campus_access",
  "health_safety",
  "events",
  "it_services",
  "administrative",
  "other",
] as const;

export type BackendCategory = (typeof BACKEND_CATEGORIES)[number];

export interface HealthResponse {
  status: string;
  app: string;
  llm_provider: string;
  chroma_collection: string;
}

export interface EmailRecord {
  id: string;
  sender: string;
  subject: string;
  date: string;
  body: string;
}

export interface GuardrailResult {
  is_valid: boolean;
  reason: string;
  confidence: number;
  is_institutional: boolean;
  email_kind: string;
}

export interface IngestedEmail {
  email: EmailRecord;
  guardrail: GuardrailResult;
}

export interface IngestResponse {
  accepted_count: number;
  rejected_count: number;
  accepted: IngestedEmail[];
  rejected: IngestedEmail[];
}

export interface ProcessResponse {
  processed_count: number;
}

export interface RejectedEmailsResponse {
  user_id: string;
  count: number;
  items: IngestedEmail[];
}

export interface ProcessingNotesResponse {
  user_id: string;
  count: number;
  items: IngestedEmail[];
}

export interface TenantProfile {
  user_id: string;
  role: string;
  affiliation: string;
  interests: string[];
  deadlines: string[];
  schedules: string[];
  freeform_context: string;
  updated_at: string | null;
}

export interface TopicSuggestion {
  id: string;
  label: string;
  source_count: number;
  status: "pending" | "active" | "dismissed";
  sample_subjects: string[];
  created_at: string;
  updated_at: string;
}

export interface TopicSuggestionsResponse {
  user_id: string;
  count: number;
  items: TopicSuggestion[];
}

export interface TopicActionResponse {
  topic: TopicSuggestion;
  profile: TenantProfile;
}

export interface DailyDigestItem {
  summary_id: string;
  email_id: string;
  source_subject: string;
  sender: string;
  email_date: string;
  title: string;
  summary: string;
  deadline_date: string | null;
  category: BackendCategory;
  urgency_score: 1 | 2 | 3 | 4 | 5;
  visible_in_feed: boolean;
  email_kind: string;
  is_institutional: boolean;
}

export interface DailyDigestResponse {
  user_id: string;
  digest_date: string;
  important_emails: DailyDigestItem[];
  deadlines: DailyDigestItem[];
  personal_service_updates: DailyDigestItem[];
  recurring_topics: TopicSuggestion[];
  suggested_interests: TopicSuggestion[];
}

export interface PreferencesResponse {
  user_id: string;
  preferences: Record<BackendCategory, boolean>;
}

export interface SummaryItem {
  summary_id: string;
  email_id: string;
  source_subject: string;
  sender: string;
  email_date: string;
  title: string;
  summary: string;
  deadline_date: string | null;
  category: BackendCategory;
  urgency_score: 1 | 2 | 3 | 4 | 5;
  visible_in_feed: boolean;
  created_at: string;
}

export interface SummariesResponse {
  user_id: string;
  count: number;
  items: SummaryItem[];
}

export interface SourceDocument {
  id: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface ChatResponse {
  answer: string;
  session_id: string;
  sources: SourceDocument[];
}

export interface DraftResponse {
  draft: string;
  session_id: string;
  sources: SourceDocument[];
}

export interface FeedbackResponse {
  id: string;
  status: string;
}

export interface SummaryAudioResponse {
  blob: Blob;
  fallback: boolean;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function errorDetailFromResponse(raw: string, status: number, statusText: string): string {
  try {
    const payload = raw ? JSON.parse(raw) : null;
    if (typeof payload.detail === "string") return payload.detail;
    if (payload?.detail) return JSON.stringify(payload.detail);
  } catch {
    // Fall through to HTML/text cleanup below.
  }

  if (status === 524 || /error code\s*524/i.test(raw) || /cloudflare/i.test(raw)) {
    return (
      "That hosted request timed out at the edge; the backend may still be finishing it. "
      + "Retry safely, because already summarized emails are skipped."
    );
  }

  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || statusText || `Request failed with status ${status}`;
}

async function request<T>(
  path: string,
  options: RequestInit & { userId?: string } = {},
): Promise<T> {
  const { userId, headers, ...init } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(userId ? { "X-User-ID": userId } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    const raw = await response.text();
    const detail = errorDetailFromResponse(raw, response.status, response.statusText);
    throw new Error(detail || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export function ingestMockData(
  userId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<IngestResponse> {
  return request<IngestResponse>("/api/ingest", {
    method: "POST",
    userId,
    body: JSON.stringify({ load_mock: true, ...options }),
  });
}

export function processFeed(userId: string, limit = 25, offset = 0): Promise<ProcessResponse> {
  return request<ProcessResponse>("/api/process", {
    method: "POST",
    userId,
    body: JSON.stringify({ limit, offset }),
  });
}

export function getSummaries(userId: string, visibleOnly = false): Promise<SummariesResponse> {
  return request<SummariesResponse>(`/api/summaries?visible_only=${visibleOnly}`, { userId });
}

export function getRejectedEmails(userId: string): Promise<RejectedEmailsResponse> {
  return request<RejectedEmailsResponse>("/api/rejected", { userId });
}

export function getProcessingNotes(userId: string): Promise<ProcessingNotesResponse> {
  return request<ProcessingNotesResponse>("/api/processing-notes", { userId });
}

export function getProfile(userId: string): Promise<TenantProfile> {
  return request<TenantProfile>("/api/profile", { userId });
}

export function updateProfile(
  userId: string,
  profile: Omit<TenantProfile, "user_id" | "updated_at">,
): Promise<TenantProfile> {
  return request<TenantProfile>("/api/profile", {
    method: "PUT",
    userId,
    body: JSON.stringify(profile),
  });
}

export function getTopicSuggestions(userId: string): Promise<TopicSuggestionsResponse> {
  return request<TopicSuggestionsResponse>("/api/topics/suggestions", { userId });
}

export function approveTopic(userId: string, topicId: string): Promise<TopicActionResponse> {
  return request<TopicActionResponse>(`/api/topics/${encodeURIComponent(topicId)}/approve`, {
    method: "POST",
    userId,
  });
}

export function dismissTopic(userId: string, topicId: string): Promise<TopicActionResponse> {
  return request<TopicActionResponse>(`/api/topics/${encodeURIComponent(topicId)}/dismiss`, {
    method: "POST",
    userId,
  });
}

export function getDailyDigest(userId: string, digestDate: string): Promise<DailyDigestResponse> {
  return request<DailyDigestResponse>(
    `/api/digest/daily?date=${encodeURIComponent(digestDate)}`,
    { userId },
  );
}

export function getPreferences(userId: string): Promise<PreferencesResponse> {
  return request<PreferencesResponse>("/api/preferences", { userId });
}

export function updatePreferences(
  userId: string,
  preferences: Record<BackendCategory, boolean>,
): Promise<PreferencesResponse> {
  return request<PreferencesResponse>("/api/preferences", {
    method: "PUT",
    userId,
    body: JSON.stringify({ preferences }),
  });
}

export function chatArchive(
  userId: string,
  message: string,
  sessionId = "default",
): Promise<ChatResponse> {
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    userId,
    body: JSON.stringify({ message, session_id: sessionId, top_k: 4 }),
  });
}

export function generateDraft(
  userId: string,
  prompt: string,
  sessionId = "default",
  emailId?: string,
): Promise<DraftResponse> {
  return request<DraftResponse>("/api/draft", {
    method: "POST",
    userId,
    body: JSON.stringify({ prompt, session_id: sessionId, top_k: 4, email_id: emailId }),
  });
}

export function sendFeedback(
  userId: string,
  payload: {
    summary_id?: string;
    email_id?: string;
    override_category: BackendCategory;
    notes?: string;
  },
): Promise<FeedbackResponse> {
  return request<FeedbackResponse>("/api/feedback", {
    method: "POST",
    userId,
    body: JSON.stringify(payload),
  });
}

export async function getSummaryAudio(
  userId: string,
  summaryId: string,
): Promise<SummaryAudioResponse> {
  const response = await fetch(
    `${API_BASE}/api/summary/audio/${encodeURIComponent(summaryId)}`,
    {
      headers: { "X-User-ID": userId },
    },
  );
  if (!response.ok) {
    throw new Error(`Audio request failed with status ${response.status}`);
  }
  return {
    blob: await response.blob(),
    fallback: response.headers.get("X-SwiftMemo-Audio-Fallback") === "true",
  };
}
