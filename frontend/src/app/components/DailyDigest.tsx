import {
  AlarmClock,
  Check,
  Inbox,
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

function DigestItemRow({ item }: { item: DailyDigestItem }) {
  const category = categoryByBackend(item.category);
  const Icon = category.icon;
  return (
    <div className="min-w-0 rounded-lg border border-border bg-secondary/20 px-3 py-2">
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
    </div>
  );
}

function DigestColumn({
  title,
  icon: Icon,
  items,
  empty,
}: {
  title: string;
  icon: LucideIcon;
  items: DailyDigestItem[];
  empty: string;
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
          <DigestItemRow key={`${title}-${item.summary_id}`} item={item} />
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

export function DailyDigest({
  digest,
  loading,
  onApproveTopic,
  onDismissTopic,
}: DailyDigestProps) {
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

      <div className="grid gap-3 md:grid-cols-3">
        <DigestColumn
          title="Important"
          icon={Inbox}
          items={digest?.important_emails ?? []}
          empty="No important emails for this date."
        />
        <DigestColumn
          title="Deadlines"
          icon={AlarmClock}
          items={digest?.deadlines ?? []}
          empty="No deadlines on this date."
        />
        <DigestColumn
          title="Personal & Account/Service"
          icon={MailCheck}
          items={digest?.personal_service_updates ?? []}
          empty="No personal or account/service updates."
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
    </div>
  );
}
