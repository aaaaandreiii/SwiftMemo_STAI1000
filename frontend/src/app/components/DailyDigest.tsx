import { useState } from "react";
import {
  AlarmClock,
  AlertTriangle,
  CalendarDays,
  Check,
  FileText,
  Loader2,
  MailCheck,
  Sparkles,
  Tag,
  X,
  type LucideIcon,
} from "lucide-react";
import { categoryByBackend, emailKindLabel } from "../data";
import type { DailyDigestItem, DailyDigestResponse, TopicSuggestion } from "../api";

interface DailyDigestProps {
  digest: DailyDigestResponse | null;
  loading: boolean;
  onApproveTopic: (topic: TopicSuggestion) => void;
  onDismissTopic: (topic: TopicSuggestion) => void;
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));

const formatFullDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

function DigestItemRow({
  item,
  onOpen,
}: {
  item: DailyDigestItem;
  onOpen: (item: DailyDigestItem) => void;
}) {
  const category = categoryByBackend(item.category);
  const Icon = category.icon;
  return (
    <button
      onClick={() => onOpen(item)}
      className="w-full min-w-0 rounded-lg border border-border bg-secondary/20 px-3 py-2 text-left transition-colors hover:border-[#10b981]/45 hover:bg-secondary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]/40"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
          style={{ background: category.color + "1a", color: category.color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
          <p className="truncate text-[0.7rem] text-muted-foreground">
            {emailKindLabel(item.email_kind)} · {formatDate(item.email_date)}
          </p>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{item.urgency_score}/5</span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {item.summary}
      </p>
    </button>
  );
}

function DigestColumn({
  title,
  icon: Icon,
  items,
  empty,
  onOpen,
}: {
  title: string;
  icon: LucideIcon;
  items: DailyDigestItem[];
  empty: string;
  onOpen: (item: DailyDigestItem) => void;
}) {
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{title}</span>
        <span className="font-mono">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.slice(0, 3).map((item) => (
          <DigestItemRow key={`${title}-${item.summary_id}`} item={item} onOpen={onOpen} />
        ))}
        {items.length === 0 && (
          <div className="rounded-lg border border-border bg-secondary/10 px-3 py-3 text-xs text-muted-foreground">
            {empty}
          </div>
        )}
      </div>
    </section>
  );
}

function DigestDetailModal({
  item,
  onClose,
}: {
  item: DailyDigestItem | null;
  onClose: () => void;
}) {
  if (!item) return null;
  const category = categoryByBackend(item.category);
  const Icon = category.icon;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close" />
      <article className="glass relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[0.68rem] uppercase tracking-widest text-muted-foreground">
              Email Summary
            </p>
            <h3 className="mt-1 text-lg font-semibold leading-snug text-foreground">
              {item.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-[#f43f5e]/50 hover:text-[#f43f5e]"
            title="Close digest details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <span className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: category.color }} />
            <span className="truncate">{category.key}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
            <MailCheck className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{item.sender}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{formatFullDate(item.email_date)}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
            <AlarmClock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {item.deadline_date ? `Deadline ${item.deadline_date}` : "No deadline"}
            </span>
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-border bg-secondary/25 px-2.5 py-1 font-mono text-xs text-muted-foreground">
            Urgency {item.urgency_score}/5
          </span>
          <span className="rounded-full border border-border bg-secondary/25 px-2.5 py-1 font-mono text-xs text-muted-foreground">
            Relevance {Math.round(item.relevance_score)}
          </span>
          <span className="rounded-full border border-border bg-secondary/25 px-2.5 py-1 font-mono text-xs text-muted-foreground">
            Campus {item.campus_match}
          </span>
        </div>

        {item.relevance_reasons.length > 0 && (
          <div className="mt-3 rounded-lg border border-[#10b981]/25 bg-[#10b981]/10 px-3 py-2">
            <p className="mb-1 text-xs font-medium text-[#6ee7b7]">Relevance Reasons</p>
            <div className="flex flex-wrap gap-1.5">
              {item.relevance_reasons.map((reason) => (
                <span
                  key={reason}
                  className="rounded-full bg-black/20 px-2 py-0.5 text-[0.7rem] text-[#bbf7d0]"
                >
                  {reason}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>

        <div className="mt-4 rounded-lg border border-border bg-black/25 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground/80">
            <FileText className="h-3.5 w-3.5" />
            Source Subject
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{item.source_subject}</p>
        </div>
      </article>
    </div>
  );
}

export function DailyDigest({
  digest,
  loading,
  onApproveTopic,
  onDismissTopic,
}: DailyDigestProps) {
  const [selectedItem, setSelectedItem] = useState<DailyDigestItem | null>(null);

  return (
    <div className="glass rounded-xl p-3">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
            Daily Digest
          </p>
          <h2 className="text-base font-semibold text-foreground">
            {digest ? formatDate(digest.digest_date) : "Loading"}
          </h2>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-[#34d399]" />}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DigestColumn
          title="Recommended for You"
          icon={Sparkles}
          items={digest?.recommended_for_you ?? []}
          empty="No profile matches for this date."
          onOpen={setSelectedItem}
        />
        <DigestColumn
          title="Urgent but not matched"
          icon={AlertTriangle}
          items={digest?.urgent_unmatched ?? []}
          empty="No unrelated urgent emails."
          onOpen={setSelectedItem}
        />
        <DigestColumn
          title="Deadlines"
          icon={AlarmClock}
          items={digest?.deadlines ?? []}
          empty="No deadlines on this date."
          onOpen={setSelectedItem}
        />
        <DigestColumn
          title="Personal & Account/Service"
          icon={MailCheck}
          items={digest?.personal_service_updates ?? []}
          empty="No personal or account/service updates."
          onOpen={setSelectedItem}
        />
      </div>

      <div className="mt-3 grid gap-3 border-t border-border pt-3 md:grid-cols-2">
        <section className="min-w-0">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Tag className="h-3.5 w-3.5" />
            <span>Recurring Topics</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(digest?.recurring_topics ?? []).slice(0, 8).map((topic) => (
              <span
                key={topic.id}
                className="rounded-lg border border-border bg-secondary/25 px-2 py-1 text-xs text-muted-foreground"
              >
                {topic.label} · {topic.source_count}
              </span>
            ))}
            {(digest?.recurring_topics ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">No recurring topics yet.</span>
            )}
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Suggested Interests</span>
          </div>
          <div className="space-y-1.5">
            {(digest?.suggested_interests ?? []).slice(0, 3).map((topic) => (
              <div
                key={topic.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-secondary/20 px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {topic.label}
                </span>
                <button
                  onClick={() => onApproveTopic(topic)}
                  className="grid h-6 w-6 place-items-center rounded-md text-[#34d399] hover:bg-[#10b981]/15"
                  title={`Approve ${topic.label}`}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDismissTopic(topic)}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-[#f43f5e]/15 hover:text-[#f43f5e]"
                  title={`Dismiss ${topic.label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {(digest?.suggested_interests ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">No pending suggestions.</span>
            )}
          </div>
        </section>
      </div>
      <DigestDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
