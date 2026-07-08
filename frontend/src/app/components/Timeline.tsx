import { motion } from "motion/react";

export interface TimelineDay {
  iso: string;
  dow: string;
  day: number;
  hasDeadline: boolean;
  urgent: boolean;
  count: number;
}

interface TimelineProps {
  days: TimelineDay[];
  selected: string | null;
  onSelect: (iso: string | null) => void;
}

export function Timeline({ days, selected, onSelect }: TimelineProps) {
  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
          Deadline Timeline
        </p>
        {selected && (
          <button
            onClick={() => onSelect(null)}
            className="text-xs text-[#10b981] hover:underline"
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const active = selected === d.iso;
          return (
            <button
              key={d.iso}
              onClick={() => onSelect(active ? null : d.iso)}
              className="relative flex shrink-0 flex-col items-center rounded-xl border px-3.5 py-2 transition-all"
              style={{
                borderColor: active ? "#10b981" : "var(--border)",
                background: active ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.02)",
              }}
            >
              <span className="text-[0.65rem] uppercase text-muted-foreground">{d.dow}</span>
              <span
                className={`font-mono text-lg leading-tight ${
                  active ? "text-[#10b981]" : "text-foreground"
                }`}
              >
                {d.day}
              </span>
              {d.hasDeadline && (
                <motion.span
                  animate={d.urgent ? { scale: [1, 1.4, 1] } : {}}
                  transition={{ duration: 1.6, repeat: Infinity }}
                  className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                  style={{
                    background: d.urgent ? "#f43f5e" : "#fbbf24",
                    boxShadow: `0 0 6px ${d.urgent ? "#f43f5e" : "#fbbf24"}`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
