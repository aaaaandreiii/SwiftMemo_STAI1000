import { useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  Cpu,
  Download,
  Zap,
  Loader2,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { CATEGORIES, type CategoryKey } from "../data";

interface SidebarProps {
  prefs: Record<CategoryKey, boolean>;
  onToggle: (key: CategoryKey) => void;
  counts: Record<CategoryKey, number>;
  onIngest: () => void;
  onProcess: () => void;
  ingesting: boolean;
  ingestCount: number | null;
  processing: boolean;
  processed: { processed: number; rejected: number } | null;
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
  onIngest,
  onProcess,
  ingesting,
  ingestCount,
  processing,
  processed,
  latencyMs,
  online,
  provider,
}: SidebarProps) {
  const [progress, setProgress] = useState(0);

  const handleProcess = () => {
    if (processing) return;
    setProgress(0);
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(timer);
          return 100;
        }
        return p + 8;
      });
    }, 90);
    onProcess();
  };

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
          onClick={onIngest}
          disabled={ingesting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#006432] to-[#10b981] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_20px_-4px_rgba(16,185,129,0.5)] transition-all hover:shadow-[0_6px_28px_-4px_rgba(16,185,129,0.7)] active:scale-[0.98] disabled:opacity-70"
        >
          {ingesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {ingesting
            ? `Ingesting${ingestCount !== null ? ` ${ingestCount}` : ""}…`
            : "Ingest Mock Data"}
        </button>

        <button
          onClick={handleProcess}
          disabled={processing}
          className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-[#10b981]/40 disabled:opacity-70"
        >
          {processing && (
            <span
              className="absolute inset-0 bg-[#10b981]/15 transition-all"
              style={{ width: `${progress}%` }}
            />
          )}
          <span className="relative flex items-center gap-2">
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 text-[#10b981]" />
            )}
            {processing ? "Processing Feed…" : "Process Feed"}
          </span>
        </button>

        {processed && !processing && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1.5 rounded-lg bg-[#10b981]/10 px-3 py-2 text-xs text-[#34d399]"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {processed.processed} processed · {processed.rejected} rejected
          </motion.div>
        )}
      </section>

      {/* Preferences */}
      <section className="flex-1">
        <p className="mb-2 font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
          Preferences
        </p>
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
        </div>
      </section>
    </aside>
  );
}
