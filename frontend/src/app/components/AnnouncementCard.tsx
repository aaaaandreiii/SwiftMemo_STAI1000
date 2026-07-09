import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CalendarPlus,
  CheckCircle2,
  MessageSquareReply,
  Volume2,
  Tags,
  EyeOff,
  ChevronDown,
  Mail,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  CATEGORIES,
  categoryMeta,
  type Announcement,
  type CategoryKey,
  type CustomTopic,
} from "../data";

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return Math.round((d.getTime() - TODAY.getTime()) / 86400000);
}

function countdownLabel(iso: string | null) {
  const n = daysUntil(iso);
  if (n === null) return { text: "No deadline", tone: "#94a3b8" };
  if (n < 0) return { text: "Overdue", tone: "#f43f5e" };
  if (n === 0) return { text: "Due today", tone: "#f43f5e" };
  if (n <= 3) return { text: `Due in ${n} day${n > 1 ? "s" : ""}`, tone: "#f43f5e" };
  if (n <= 7) return { text: `Due in ${n} days`, tone: "#fbbf24" };
  return { text: `Due in ${n} days`, tone: "#34d399" };
}

function fmtDate(iso: string | null) {
  if (!iso) return "Archive";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface CardProps {
  a: Announcement;
  onDraft: (a: Announcement) => void;
  onListen: (a: Announcement) => void;
  onHide: (id: string) => void;
  onRecategorize: (id: string, cat: CategoryKey) => void;
  playing: boolean;
  topicMatches: CustomTopic[];
}

export function AnnouncementCard({
  a,
  onDraft,
  onListen,
  onHide,
  onRecategorize,
  playing,
  topicMatches,
}: CardProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [schoolworkAdded, setSchoolworkAdded] = useState(false);
  const meta = categoryMeta(a.category);
  const MetaIcon = meta.icon;
  const cd = countdownLabel(a.dueDate);
  const high = a.urgency >= 4;
  const showSchoolworkAutomation = a.category === "Academic" && Boolean(a.dueDate);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="glass group relative overflow-hidden rounded-2xl p-4 transition-all"
      style={
        high
          ? { boxShadow: `inset 0 0 0 1px ${cd.tone}55, 0 0 32px -12px ${cd.tone}` }
          : undefined
      }
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ boxShadow: `inset 0 0 0 1px ${meta.color}55, 0 0 34px -16px ${meta.color}` }}
      />
      {high && (
        <span
          className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full opacity-30 blur-3xl"
          style={{ background: cd.tone }}
        />
      )}

      {/* Header row */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: meta.color + "1f", color: meta.color }}
          >
            <MetaIcon className="h-3.5 w-3.5" />
            {a.category}
          </span>
          {/* urgency dots */}
          <span className="flex items-center gap-1" title={`Urgency ${a.urgency}/5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: i <= a.urgency ? cd.tone : "rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </span>
        </div>

        <span
          className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-xs"
          style={{ background: cd.tone + "1f", color: cd.tone }}
        >
          {cd.text} · {fmtDate(a.dueDate)}
        </span>
      </div>

      {topicMatches.length > 0 && (
        <div className="relative mt-2 flex flex-wrap gap-1.5">
          {topicMatches.map((topic) => (
            <span
              key={topic.id}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem]"
              style={{
                borderColor: topic.enabled ? "#10b98144" : "var(--border)",
                background: topic.enabled ? "#10b98114" : "rgba(255,255,255,0.03)",
                color: topic.enabled ? "#6ee7b7" : "var(--muted-foreground)",
              }}
            >
              #{topic.label}
            </span>
          ))}
        </div>
      )}

      {/* Title + summary */}
      <h3 className="relative mt-3 text-[1.05rem] leading-snug">{a.title}</h3>
      <p className="relative mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {a.summary}
      </p>

      {/* Bullets */}
      <ul className="relative mt-3 space-y-1.5">
        {a.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#10b981]" />
            {b}
          </li>
        ))}
      </ul>

      {showSchoolworkAutomation && (
        <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
          {schoolworkAdded ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#10b981]/35 bg-[#10b981]/10 px-2.5 py-1 text-xs text-[#34d399]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Added to tasks/calendar
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/30 px-2.5 py-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                TODO preview
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/30 px-2.5 py-1 text-xs text-muted-foreground">
                <CalendarPlus className="h-3.5 w-3.5" />
                Calendar preview
              </span>
              <button
                onClick={() => {
                  setSchoolworkAdded(true);
                  toast.success("Schoolwork preview added", {
                    description: "Local tasks/calendar state only.",
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#10b981]/35 px-2.5 py-1 text-xs text-[#34d399] transition-colors hover:bg-[#10b981]/10"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Add preview
              </button>
            </>
          )}
        </div>
      )}

      {/* Show original */}
      <button
        onClick={() => setShowOriginal((v) => !v)}
        className="relative mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-[#10b981]"
      >
        <Mail className="h-3.5 w-3.5" />
        {showOriginal ? "Hide original email" : "Show original email"}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${showOriginal ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {showOriginal && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-border bg-black/30 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-1.5 font-mono text-[0.7rem] text-foreground/70">{a.sender}</p>
              {a.original}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer toolbar */}
      <div className="relative mt-4 flex items-center gap-2 border-t border-border pt-3">
        <button
          onClick={() => onDraft(a)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#10b981]/15 px-3 py-1.5 text-xs font-medium text-[#34d399] transition-colors hover:bg-[#10b981]/25"
        >
          <MessageSquareReply className="h-4 w-4" />
          Draft Reply
        </button>
        <button
          onClick={() => onListen(a)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            playing
              ? "bg-[#10b981]/25 text-[#34d399]"
              : "bg-secondary/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Volume2 className="h-4 w-4" />
          {playing ? "Playing…" : "Listen"}
        </button>

        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="relative grid h-8 w-8 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-secondary/50 hover:text-foreground"
              title="Recategorize"
            >
              <Tags className="h-4 w-4" />
              <Pencil className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-popover p-0.5 text-[#34d399]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass w-44">
              {CATEGORIES.map((c) => (
                <DropdownMenuItem
                  key={c.key}
                  onClick={() => onRecategorize(a.id, c.key)}
                  className="gap-2 text-sm"
                >
                  <c.icon className="h-4 w-4" style={{ color: c.color }} />
                  {c.key}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => onHide(a.id)}
            title="Hide"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-[#f43f5e]"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.article>
  );
}
