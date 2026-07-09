import {
  GraduationCap,
  Wallet,
  ShieldCheck,
  HeartPulse,
  CalendarDays,
  ClipboardList,
  Presentation,
  Globe2,
  Library,
  Megaphone,
  ShieldX,
  Cpu,
  Building2,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";
import type { BackendCategory, SummaryItem } from "./api";

export type CategoryKey =
  | "Academic"
  | "Finance"
  | "Campus Access"
  | "Health & Safety"
  | "Events"
  | "Canvas Tasks"
  | "Webinars, Seminars, Workshops"
  | "Exchange Student Programs"
  | "Library"
  | "Advertisement"
  | "Spam"
  | "IT Services"
  | "Administrative"
  | "Other";

export interface Category {
  key: CategoryKey;
  backendKey: BackendCategory;
  icon: LucideIcon;
  color: string; // accent color for badges/glow
}

export const CATEGORIES: Category[] = [
  { key: "Academic", backendKey: "academic", icon: GraduationCap, color: "#34d399" },
  { key: "Finance", backendKey: "finance", icon: Wallet, color: "#fbbf24" },
  { key: "Campus Access", backendKey: "campus_access", icon: ShieldCheck, color: "#38bdf8" },
  { key: "Health & Safety", backendKey: "health_safety", icon: HeartPulse, color: "#f43f5e" },
  { key: "Events", backendKey: "events", icon: CalendarDays, color: "#a78bfa" },
  { key: "Canvas Tasks", backendKey: "canvas_tasks", icon: ClipboardList, color: "#22c55e" },
  {
    key: "Webinars, Seminars, Workshops",
    backendKey: "webinars_seminars_workshops",
    icon: Presentation,
    color: "#fb7185",
  },
  {
    key: "Exchange Student Programs",
    backendKey: "exchange_programs",
    icon: Globe2,
    color: "#60a5fa",
  },
  { key: "Library", backendKey: "library", icon: Library, color: "#f59e0b" },
  { key: "Advertisement", backendKey: "advertisement", icon: Megaphone, color: "#fb923c" },
  { key: "Spam", backendKey: "spam", icon: ShieldX, color: "#ef4444" },
  { key: "IT Services", backendKey: "it_services", icon: Cpu, color: "#22d3ee" },
  { key: "Administrative", backendKey: "administrative", icon: Building2, color: "#94a3b8" },
  { key: "Other", backendKey: "other", icon: CircleHelp, color: "#cbd5e1" },
];

export const categoryMeta = (key: CategoryKey): Category =>
  CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[0];

export const categoryByBackend = (key: BackendCategory): Category =>
  CATEGORIES.find((c) => c.backendKey === key) ?? CATEGORIES[CATEGORIES.length - 1];

export const toBackendCategory = (key: CategoryKey): BackendCategory =>
  categoryMeta(key).backendKey;

const EMAIL_KIND_LABELS: Record<string, string> = {
  institutional: "Official DLSU Email",
  institutional_email: "Official DLSU Email",
  lms_notification: "Canvas Updates",
  service_notification: "Account/Service Update",
};

export function emailKindLabel(kind: string): string {
  const normalized = kind.toLowerCase();
  if (EMAIL_KIND_LABELS[normalized]) return EMAIL_KIND_LABELS[normalized];
  return normalized
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const preferencesFromBackend = (
  preferences: Partial<Record<BackendCategory, boolean>>,
): Record<CategoryKey, boolean> =>
  CATEGORIES.reduce(
    (acc, category) => ({
      ...acc,
      [category.key]: preferences[category.backendKey] ?? true,
    }),
    {} as Record<CategoryKey, boolean>,
  );

export const preferencesToBackend = (
  preferences: Record<CategoryKey, boolean>,
): Record<BackendCategory, boolean> =>
  CATEGORIES.reduce(
    (acc, category) => ({
      ...acc,
      [category.backendKey]: preferences[category.key],
    }),
    {} as Record<BackendCategory, boolean>,
  );

export interface Tenant {
  id: string;
  name: string;
  role: string;
  initials: string;
}

export const TENANTS: Tenant[] = [
  { id: "andrei", name: "Andrei Balingit", role: "BS Computer Science · III", initials: "ALB" },
  { id: "audric", name: "Audric Filipino", role: "BS Computer Science · III", initials: "AJF" },
  { id: "sophia", name: "Sophia Avelino", role: "BS Computer Science · III", initials: "SKA" },
];

export interface Announcement {
  id: string;
  summaryId: string;
  emailId: string;
  backendCategory: BackendCategory;
  category: CategoryKey;
  urgency: 1 | 2 | 3 | 4 | 5;
  title: string;
  summary: string;
  bullets: string[];
  dueDate: string | null; // ISO date
  received: string; // ISO date
  original: string;
  sender: string;
  sourceSubject: string;
  visibleInFeed: boolean;
  relevanceScore: number;
  relevanceReasons: string[];
  campusMatch: "match" | "mismatch" | "neutral";
}

export interface CustomTopic {
  id: string;
  label: string;
  enabled: boolean;
}

export function summaryToAnnouncement(item: SummaryItem): Announcement {
  const category = categoryByBackend(item.category);
  return {
    id: item.summary_id,
    summaryId: item.summary_id,
    emailId: item.email_id,
    backendCategory: item.category,
    category: category.key,
    urgency: item.urgency_score,
    title: item.title,
    summary: item.summary,
    bullets: summaryBullets(item),
    dueDate: item.deadline_date,
    received: item.email_date.slice(0, 10),
    original: `${item.source_subject}\n\n${item.summary}`,
    sender: item.sender,
    sourceSubject: item.source_subject,
    visibleInFeed: item.visible_in_feed,
    relevanceScore: item.relevance_score,
    relevanceReasons: item.relevance_reasons,
    campusMatch: item.campus_match,
  };
}

export function matchedCustomTopics(
  announcement: Announcement,
  topics: CustomTopic[],
): CustomTopic[] {
  const searchable = normalizeTopicText(
    [
      announcement.title,
      announcement.summary,
      announcement.sourceSubject,
      announcement.sender,
      announcement.original,
    ].join(" "),
  );
  return topics.filter((topic) => {
    const needle = normalizeTopicText(topic.label);
    return needle.length > 0 && searchable.includes(needle);
  });
}

export function topicStorageKey(tenantId: string): string {
  return `swiftmemo:${tenantId}:custom-topics`;
}

export function readCustomTopics(tenantId: string): CustomTopic[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(topicStorageKey(tenantId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((topic) => ({
        id: typeof topic.id === "string" ? topic.id : crypto.randomUUID(),
        label: typeof topic.label === "string" ? topic.label.trim() : "",
        enabled: typeof topic.enabled === "boolean" ? topic.enabled : true,
      }))
      .filter((topic) => topic.label.length > 0);
  } catch {
    return [];
  }
}

export function writeCustomTopics(tenantId: string, topics: CustomTopic[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(topicStorageKey(tenantId), JSON.stringify(topics));
}

function summaryBullets(item: SummaryItem): string[] {
  const sentences = item.summary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 2);
  const deadline = item.deadline_date ? `Deadline: ${item.deadline_date}` : null;
  const category = `Category: ${categoryByBackend(item.category).key}`;
  const relevance = item.relevance_reasons[0] ? `Recommended: ${item.relevance_reasons[0]}` : null;
  return [...sentences, deadline, relevance, category].filter(Boolean) as string[];
}

function normalizeTopicText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
