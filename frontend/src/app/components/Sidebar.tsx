import { useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  Cpu,
  Download,
  Loader2,
  CheckCircle2,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { CATEGORIES, type CategoryKey, type CustomTopic } from "../data";

export interface FeedWorkflowState {
  stage: "idle" | "fetching" | "processing" | "completed" | "error";
  fetched: number;
  classified: number;
  skipped: number;
  processed: number;
  batch: number;
  error?: string;
}

interface SidebarProps {
  prefs: Record<CategoryKey, boolean>;
  onToggle: (key: CategoryKey) => void;
  counts: Record<CategoryKey, number>;
  customTopics: CustomTopic[];
  topicCounts: Record<string, number>;
  onAddTopic: (label: string) => void;
  onToggleTopic: (id: string) => void;
  onRemoveTopic: (id: string) => void;
  onFetchProcess: () => void;
  workflow: FeedWorkflowState;
  latencyMs: number;
  online: boolean;
  provider: string;
}

function StatRow({ icon: Icon, label, value, tone }: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="font-mono text-xs" style={{ color: tone }}>
        {value}
      </span>
    </div>
  );
}

export function Sidebar({
  prefs,
  onToggle,
  counts,
  customTopics,
  topicCounts,
  onAddTopic,
  onToggleTopic,
  onRemoveTopic,
  onFetchProcess,
  workflow,
  latencyMs,
  online,
  provider,
}: SidebarProps) {
  const [addingTopic, setAddingTopic] = useState(false);
  const [topicLabel, setTopicLabel] = useState("");

  const workflowActive = workflow.stage === "fetching" || workflow.stage === "processing";

  const submitTopic = () => {
    const cleaned = topicLabel.trim();
    if (!cleaned) return;
    onAddTopic(cleaned);
    setTopicLabel("");
    setAddingTopic(false);
  };

  const workflowLabel =
    workflow.stage === "fetching"
      ? `Fetching batch ${workflow.batch || 1}...`
      : workflow.stage === "processing"
        ? `Summarizing item ${workflow.batch || 1}...`
        : workflow.stage === "error"
          ? "Retry Fetch & Process"
          : "Fetch & Process Mock Data";

  return (
    <aside className="glass flex h-full flex-col gap-5 overflow-y-auto rounded-none border-y-0 border-l-0 p-4">
      {/* System status */}
      <section>
        <p className="mb-2 font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
          System Status
        </p>
        <div className="rounded-xl border border-border bg-secondary/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                  online ? "bg-[#10b981]" : "bg-[#f43f5e]"
                }`}
              />
              <span
                className={`relative h-2 w-2 rounded-full ${
                  online ? "bg-[#10b981]" : "bg-[#f43f5e]"
                }`}
              />
            </span>
            <span className={`text-sm ${online ? "text-[#10b981]" : "text-[#f43f5e]"}`}>
              {online ? "FastAPI Online" : "FastAPI Offline"}
            </span>
          </div>
          <StatRow icon={Cpu} label="LLM Provider" value={provider} tone="#34d399" />
          <StatRow
            icon={Activity}
            label="Latency"
            value={latencyMs > 0 ? `${latencyMs} ms` : "n/a"}
            tone="#fbbf24"
          />
        </div>
      </section>

      {/* Actions */}
      <section className="space-y-2">
        <button
          onClick={onFetchProcess}
          disabled={workflowActive}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#006432] to-[#10b981] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_20px_-4px_rgba(16,185,129,0.5)] transition-all hover:shadow-[0_6px_28px_-4px_rgba(16,185,129,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34d399]/60 active:scale-[0.98] disabled:opacity-70"
        >
          {workflowActive ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {workflowLabel}
        </button>

        {workflow.stage !== "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-lg px-3 py-2 text-xs ${
              workflow.stage === "error"
                ? "bg-[#f43f5e]/10 text-[#fda4af]"
                : "bg-[#10b981]/10 text-[#34d399]"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {workflowActive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {workflow.stage === "fetching" &&
                `${workflow.fetched} fetched · ${workflow.classified} classified · ${workflow.skipped} skipped`}
              {workflow.stage === "processing" &&
                `${workflow.processed}/${workflow.classified} summarized · one at a time`}
              {workflow.stage === "completed" &&
                `${workflow.processed} summarized · ${workflow.skipped} skipped`}
              {workflow.stage === "error" && "Fetch/process failed"}
            </div>
            {workflow.error && (
              <p className="mt-1 max-h-8 overflow-hidden text-[0.68rem] text-muted-foreground">
                {workflow.error}
              </p>
            )}
          </motion.div>
        )}
      </section>

      {/* Preferences */}
      <section className="flex-1">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
            Preferences
          </p>
          <button
            onClick={() => setAddingTopic((value) => !value)}
            className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground transition-all hover:border-[#10b981]/50 hover:text-[#34d399] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]/40"
            title="Add custom topic"
          >
            {addingTopic ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </div>
        {addingTopic && (
          <div className="mb-2 flex gap-1.5">
            <input
              value={topicLabel}
              onChange={(event) => setTopicLabel(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submitTopic()}
              placeholder="Topic or concept"
              className="min-w-0 flex-1 rounded-lg border border-border bg-input/60 px-2.5 py-1.5 text-xs outline-none transition-all placeholder:text-muted-foreground focus:border-[#10b981]/50 focus:ring-2 focus:ring-[#10b981]/20"
            />
            <button
              onClick={submitTopic}
              className="rounded-lg bg-[#10b981]/20 px-2.5 text-xs font-medium text-[#34d399] transition-colors hover:bg-[#10b981]/30"
            >
              Add
            </button>
          </div>
        )}
        <div className="space-y-1">
          {CATEGORIES.map((c) => {
            const on = prefs[c.key];
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                onClick={() => onToggle(c.key)}
                className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-secondary/40"
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition-colors"
                  style={{
                    borderColor: on ? c.color + "66" : "var(--border)",
                    background: on ? c.color + "1a" : "transparent",
                    color: on ? c.color : "var(--muted-foreground)",
                  }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span
                  className={`flex-1 text-left text-sm transition-colors ${
                    on ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {c.key}
                </span>
                <span className="font-mono text-[0.7rem] text-muted-foreground">
                  {counts[c.key] ?? 0}
                </span>
                {/* switch */}
                <span
                  className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                  style={{ background: on ? c.color : "rgba(255,255,255,0.15)" }}
                >
                  <motion.span
                    layout
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
                    animate={{ left: on ? 18 : 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </span>
              </button>
            );
          })}
          {customTopics.length > 0 && (
            <div className="pt-2">
              <p className="px-2.5 pb-1 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                Custom Topics
              </p>
              <div className="space-y-1">
                {customTopics.map((topic) => (
                  <div
                    key={topic.id}
                    className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all hover:bg-secondary/40 hover:shadow-[0_0_18px_-12px_#10b981]"
                  >
                    <button
                      onClick={() => onToggleTopic(topic.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]/40"
                    >
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-xs font-semibold transition-colors"
                        style={{
                          borderColor: topic.enabled ? "#10b98166" : "var(--border)",
                          background: topic.enabled ? "#10b9811a" : "transparent",
                          color: topic.enabled ? "#34d399" : "var(--muted-foreground)",
                        }}
                      >
                        #
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-sm transition-colors ${
                          topic.enabled ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {topic.label}
                      </span>
                      <span className="font-mono text-[0.7rem] text-muted-foreground">
                        {topicCounts[topic.id] ?? 0}
                      </span>
                      <span
                        className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                        style={{
                          background: topic.enabled ? "#10b981" : "rgba(255,255,255,0.15)",
                        }}
                      >
                        <motion.span
                          layout
                          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
                          animate={{ left: topic.enabled ? 18 : 2 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                      </span>
                    </button>
                    <button
                      onClick={() => onRemoveTopic(topic.id)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-[#f43f5e]/10 hover:text-[#f43f5e] group-hover:opacity-100 focus-visible:opacity-100"
                      title={`Remove ${topic.label}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
