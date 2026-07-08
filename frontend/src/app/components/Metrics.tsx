import { Inbox, AlarmClock, EyeOff } from "lucide-react";
import { motion } from "motion/react";

interface MetricsProps {
  visible: number;
  critical: number;
  hidden: number;
}

const cards = (m: MetricsProps) => [
  { label: "Visible in feed", value: m.visible, icon: Inbox, color: "#10b981" },
  { label: "Critical deadlines", value: m.critical, icon: AlarmClock, color: "#f43f5e" },
  { label: "Filtered out", value: m.hidden, icon: EyeOff, color: "#94a3b8" },
];

export function Metrics(props: MetricsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {cards(props).map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className="glass flex items-center gap-3 rounded-2xl p-3.5"
          >
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{ background: c.color + "1a", color: c.color }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
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
          </div>
        );
      })}
    </div>
  );
}
