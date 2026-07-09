import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

export interface TimelineDay {
  iso: string;
  dow: string;
  day: number;
  hasDeadline: boolean;
  urgent: boolean;
  count: number;
}

export interface CalendarDeadlineItem {
  id: string;
  title: string;
  dueDate: string | null;
  urgency: number;
  category: string;
}

interface TimelineProps {
  days: TimelineDay[];
  deadlineItems: CalendarDeadlineItem[];
  selected: string | null;
  onSelect: (iso: string | null) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const parseIsoDate = (iso: string) => new Date(`${iso}T00:00:00`);

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);

const daysInMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

const sameMonth = (iso: string, month: Date) => {
  const date = parseIsoDate(iso);
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
};

function buildMonthGrid(month: Date): Array<string | null> {
  const first = startOfMonth(month);
  const leadingBlanks = first.getDay();
  const grid: Array<string | null> = Array.from({ length: leadingBlanks }, () => null);
  for (let day = 1; day <= daysInMonth(month); day += 1) {
    grid.push(toIsoDate(new Date(month.getFullYear(), month.getMonth(), day)));
  }
  while (grid.length % 7 !== 0) {
    grid.push(null);
  }
  return grid;
}

export function Timeline({ days, deadlineItems, selected, onSelect }: TimelineProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(selected ? parseIsoDate(selected) : new Date()),
  );

  const deadlinesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarDeadlineItem[]>();
    deadlineItems.forEach((item) => {
      if (!item.dueDate) return;
      const current = grouped.get(item.dueDate) ?? [];
      current.push(item);
      grouped.set(
        item.dueDate,
        current.sort((a, b) => b.urgency - a.urgency || a.title.localeCompare(b.title)),
      );
    });
    return grouped;
  }, [deadlineItems]);

  const monthDays = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const monthDeadlines = useMemo(
    () =>
      deadlineItems
        .filter((item) => item.dueDate && sameMonth(item.dueDate, visibleMonth))
        .sort(
          (a, b) =>
            String(a.dueDate).localeCompare(String(b.dueDate)) ||
            b.urgency - a.urgency ||
            a.title.localeCompare(b.title),
        ),
    [deadlineItems, visibleMonth],
  );

  const openCalendar = () => {
    setVisibleMonth(startOfMonth(selected ? parseIsoDate(selected) : new Date()));
    setCalendarOpen(true);
  };

  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
          Deadline Timeline
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={openCalendar}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-2 text-xs text-muted-foreground transition-colors hover:border-[#10b981]/45 hover:text-[#34d399] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]/40"
            title="Open monthly deadline calendar"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Month
          </button>
          {selected && (
            <button
              onClick={() => onSelect(null)}
              className="text-xs text-[#10b981] hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>
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

      {calendarOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
          <button
            className="absolute inset-0 cursor-default"
            onClick={() => setCalendarOpen(false)}
            aria-label="Close month calendar"
          />
          <motion.section
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="glass relative grid max-h-[88vh] w-full max-w-5xl grid-rows-[auto_1fr] overflow-hidden rounded-2xl p-4 shadow-2xl"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[0.68rem] uppercase tracking-widest text-muted-foreground">
                  Deadline Calendar
                </p>
                <h2 className="text-xl font-semibold text-foreground">
                  {monthFormatter.format(visibleMonth)}
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-[#10b981]/45 hover:text-[#34d399]"
                  title="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setVisibleMonth(startOfMonth(new Date()))}
                  className="h-8 rounded-lg border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:border-[#10b981]/45 hover:text-[#34d399]"
                >
                  This month
                </button>
                <button
                  onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-[#10b981]/45 hover:text-[#34d399]"
                  title="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCalendarOpen(false)}
                  className="ml-1 grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-[#f43f5e]/50 hover:text-[#f43f5e]"
                  title="Close calendar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="min-w-0">
                  <div className="mb-2 grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((day) => (
                      <div
                        key={day}
                        className="px-1 text-center font-mono text-[0.68rem] uppercase tracking-widest text-muted-foreground"
                      >
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {monthDays.map((iso, index) => {
                      if (!iso) {
                        return (
                          <div
                            key={`blank-${index}`}
                            className="min-h-[5.25rem] rounded-lg border border-transparent"
                          />
                        );
                      }

                      const date = parseIsoDate(iso);
                      const dayDeadlines = deadlinesByDate.get(iso) ?? [];
                      const active = selected === iso;
                      const urgent = dayDeadlines.some((item) => item.urgency >= 4);

                      return (
                        <button
                          key={iso}
                          onClick={() => onSelect(active ? null : iso)}
                          className="min-h-[5.25rem] rounded-lg border bg-secondary/15 p-2 text-left transition-colors hover:border-[#10b981]/45 hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]/40"
                          style={{
                            borderColor: active
                              ? "#10b981"
                              : dayDeadlines.length > 0
                                ? urgent
                                  ? "#f43f5e66"
                                  : "#fbbf2466"
                                : "var(--border)",
                          }}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={`font-mono text-sm ${
                                active ? "text-[#34d399]" : "text-foreground"
                              }`}
                            >
                              {date.getDate()}
                            </span>
                            {dayDeadlines.length > 0 && (
                              <span
                                className="rounded-full px-1.5 py-0.5 font-mono text-[0.65rem]"
                                style={{
                                  background: urgent ? "#f43f5e1f" : "#fbbf241f",
                                  color: urgent ? "#fda4af" : "#fde68a",
                                }}
                              >
                                {dayDeadlines.length}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 space-y-1">
                            {dayDeadlines.slice(0, 2).map((item) => (
                              <p
                                key={item.id}
                                className="line-clamp-1 text-[0.68rem] text-muted-foreground"
                              >
                                {item.title}
                              </p>
                            ))}
                            {dayDeadlines.length > 2 && (
                              <p className="text-[0.65rem] text-[#34d399]">
                                +{dayDeadlines.length - 2} more
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <aside className="min-h-0 rounded-xl border border-border bg-secondary/15 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">Month Deadlines</p>
                    <span className="font-mono text-xs text-muted-foreground">
                      {monthDeadlines.length}
                    </span>
                  </div>
                  <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                    {monthDeadlines.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => item.dueDate && onSelect(item.dueDate)}
                        className="w-full rounded-lg border border-border bg-black/15 px-3 py-2 text-left transition-colors hover:border-[#10b981]/45"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {item.dueDate ? shortDateFormatter.format(parseIsoDate(item.dueDate)) : ""}
                          </span>
                          <span
                            className="font-mono text-[0.68rem]"
                            style={{ color: item.urgency >= 4 ? "#fda4af" : "#fde68a" }}
                          >
                            {item.urgency}/5
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/90">
                          {item.title}
                        </p>
                        <p className="mt-1 text-[0.68rem] text-muted-foreground">
                          {item.category}
                        </p>
                      </button>
                    ))}
                    {monthDeadlines.length === 0 && (
                      <div className="rounded-lg border border-border bg-black/15 px-3 py-4 text-xs text-muted-foreground">
                        No deadlines in this month.
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </motion.section>
        </div>
      )}
    </div>
  );
}
