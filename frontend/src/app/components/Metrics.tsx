import { Inbox, AlarmClock, EyeOff } from "lucide-react";
import { motion } from "motion/react";

export type MetricFilter = "visible" | "critical" | "filtered";

interface MetricsProps {
  visible: number;
  critical: number;
  hidden: number;
  active: MetricFilter;
  onSelect: (filter: MetricFilter) => void;
}

const cards = (m: Pick<MetricsProps, "visible" | "critical" | "hidden">) => [
  { id: "visible" as const, label: "Showing", value: m.visible, icon: Inbox, color: "#10b981" },
  {
    id: "critical" as const,
    label: "Critical deadlines",
    value: m.critical,
    icon: AlarmClock,
    color: "#f43f5e",
  },
  { id: "filtered" as const, label: "Not Shown", value: m.hidden, icon: EyeOff, color: "#94a3b8" },
];

export function Metrics(props: MetricsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {cards(props).map((c) => {
        const Icon = c.icon;
        const active = props.active === c.id;
        return (
          <button
            key={c.label}
            type="button"
            aria-pressed={active}
            onClick={() => props.onSelect(c.id)}
            className="glass group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl p-3.5 text-left transition-all hover:border-[#10b981]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]/50"
            style={active ? { boxShadow: `inset 0 0 0 1px ${c.color}99` } : undefined}
          >
            <span
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
              style={{ boxShadow: `inset 0 0 0 1px ${c.color}55, 0 0 26px -16px ${c.color}` }}
            />
            <span
              className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{ background: c.color + "1a", color: c.color }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="relative z-10 min-w-0">
              <motion.div
                key={c.value}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-mono text-2xl leading-none"
              >
                {c.value}
              </motion.div>
              <div className="truncate text-xs text-muted-foreground">{c.label}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
