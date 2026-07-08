import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PanelRightOpen, Filter, Menu } from "lucide-react";
import { Toaster, toast } from "sonner";

import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Timeline, type TimelineDay } from "./components/Timeline";
import { Metrics, type MetricFilter } from "./components/Metrics";
import { AnnouncementCard } from "./components/AnnouncementCard";
import { CopilotDrawer } from "./components/CopilotDrawer";
import { AudioPlayer } from "./components/AudioPlayer";
import {
  getHealth,
  getPreferences,
  getSummaries,
  ingestMockData,
  processFeed,
  sendFeedback,
  updatePreferences,
} from "./api";
import {
  CATEGORIES,
  TENANTS,
  preferencesFromBackend,
  preferencesToBackend,
  summaryToAnnouncement,
  toBackendCategory,
  type Announcement,
  type CategoryKey,
} from "./data";

const ALL_ON = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.key]: true }),
  {} as Record<CategoryKey, boolean>,
);
const INGEST_CHUNK_SIZE = 20;

interface HealthState {
  online: boolean;
  latencyMs: number;
  provider: string;
}

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const sortDate = (value: string | null) =>
  value ? new Date(value + "T00:00:00").getTime() : Number.MAX_SAFE_INTEGER;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unexpected error";

export default function App() {
  const [tenant, setTenant] = useState(TENANTS[0]);
  const [query, setQuery] = useState("");
  const [prefs, setPrefs] = useState<Record<CategoryKey, boolean>>(ALL_ON);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>("visible");
  const [hidden, setHidden] = useState<string[]>([]);
  const [items, setItems] = useState<Announcement[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(true);

  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotMode, setCopilotMode] = useState<"chat" | "draft">("draft");
  const [context, setContext] = useState<Announcement | null>(null);
  const [audioTrack, setAudioTrack] = useState<Announcement | null>(null);

  const [ingesting, setIngesting] = useState(false);
  const [ingestCount, setIngestCount] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState<{ processed: number; rejected: number } | null>(
    null,
  );
  const [lastIngest, setLastIngest] = useState<{ accepted: number; rejected: number } | null>(
    null,
  );
  const [health, setHealth] = useState<HealthState>({
    online: false,
    latencyMs: 0,
    provider: "unknown",
  });
  const [mobileSidebar, setMobileSidebar] = useState(false);

  const refreshHealth = useCallback(async () => {
    const started = performance.now();
    try {
      const response = await getHealth();
      setHealth({
        online: response.status === "ok",
        latencyMs: Math.round(performance.now() - started),
        provider: response.llm_provider,
      });
    } catch {
      setHealth({ online: false, latencyMs: 0, provider: "unreachable" });
    }
  }, []);

  const refreshSummaries = useCallback(async (tenantId: string) => {
    const response = await getSummaries(tenantId, false);
    setItems(response.items.map(summaryToAnnouncement));
  }, []);

  const loadTenant = useCallback(async () => {
    setLoadingSummaries(true);
    setHidden([]);
    setSelectedDay(null);
    setMetricFilter("visible");
    setContext(null);
    setAudioTrack(null);
    try {
      const [preferences, summaries] = await Promise.all([
        getPreferences(tenant.id),
        getSummaries(tenant.id, false),
      ]);
      setPrefs(preferencesFromBackend(preferences.preferences));
      setItems(summaries.items.map(summaryToAnnouncement));
    } catch (error) {
      setItems([]);
      toast.error("Unable to load tenant data", {
        description: errorMessage(error),
      });
    } finally {
      setLoadingSummaries(false);
    }
  }, [tenant.id]);

  useEffect(() => {
    refreshHealth();
    const timer = window.setInterval(refreshHealth, 30000);
    return () => window.clearInterval(timer);
  }, [refreshHealth]);

  useEffect(() => {
    loadTenant();
  }, [loadTenant]);

  // ---- derived data ----
  const counts = useMemo(() => {
    const c = {} as Record<CategoryKey, number>;
    CATEGORIES.forEach((cat) => {
      c[cat.key] = items.filter((a) => a.category === cat.key).length;
    });
    return c;
  }, [items]);

  const scopedItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items
      .filter((a) => (selectedDay ? a.dueDate === selectedDay : true))
      .filter((a) =>
        term
          ? (a.title + a.summary + a.category + a.sourceSubject)
              .toLowerCase()
              .includes(term)
          : true,
      );
  }, [items, selectedDay, query]);

  const visibleFeedItems = useMemo(() => {
    return scopedItems
      .filter((a) => !hidden.includes(a.id))
      .filter((a) => prefs[a.category])
      .sort((a, b) => b.urgency - a.urgency || sortDate(a.dueDate) - sortDate(b.dueDate));
  }, [scopedItems, hidden, prefs]);

  const filteredOutItems = useMemo(() => {
    return scopedItems
      .filter((a) => hidden.includes(a.id) || !prefs[a.category])
      .sort((a, b) => b.urgency - a.urgency || sortDate(a.dueDate) - sortDate(b.dueDate));
  }, [scopedItems, hidden, prefs]);

  const criticalItems = useMemo(
    () => visibleFeedItems.filter((a) => a.urgency >= 4),
    [visibleFeedItems],
  );

  const feedItems = useMemo(() => {
    if (metricFilter === "critical") return criticalItems;
    if (metricFilter === "filtered") return filteredOutItems;
    return visibleFeedItems;
  }, [metricFilter, criticalItems, filteredOutItems, visibleFeedItems]);

  const metricFilterLabel =
    metricFilter === "critical"
      ? "Critical deadlines"
      : metricFilter === "filtered"
        ? "Filtered out"
        : null;

  const critical = criticalItems.length;
  const hiddenCount = filteredOutItems.length;

  const timelineDays: TimelineDay[] = useMemo(() => {
    const start = today();
    return Array.from({ length: 14 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const dayItems = items.filter((a) => a.dueDate === iso && prefs[a.category]);
      return {
        iso,
        dow: d.toLocaleDateString("en-US", { weekday: "short" }),
        day: d.getDate(),
        hasDeadline: dayItems.length > 0,
        urgent: dayItems.some((a) => a.urgency >= 4),
        count: dayItems.length,
      };
    });
  }, [items, prefs]);

  // ---- actions ----
  const togglePref = async (key: CategoryKey) => {
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      const response = await getPreferences(tenant.id);
      const merged = { ...response.preferences, ...preferencesToBackend(next) };
      const updated = await updatePreferences(tenant.id, merged);
      setPrefs(preferencesFromBackend(updated.preferences));
      await refreshSummaries(tenant.id);
    } catch (error) {
      setPrefs(previous);
      toast.error("Preference update failed", {
        description: errorMessage(error),
      });
    }
  };

  const handleIngest = async () => {
    if (ingesting) return;
    setIngesting(true);
    setIngestCount(0);
    try {
      let accepted = 0;
      let rejected = 0;
      let offset = 0;

      while (true) {
        const response = await ingestMockData(tenant.id, {
          limit: INGEST_CHUNK_SIZE,
          offset,
        });
        const batchCount = response.accepted_count + response.rejected_count;
        if (batchCount === 0) break;

        accepted += response.accepted_count;
        rejected += response.rejected_count;
        offset += batchCount;
        setIngestCount(accepted + rejected);
        setLastIngest({ accepted, rejected });

        if (batchCount < INGEST_CHUNK_SIZE) break;
      }

      setProcessed(null);
      await refreshSummaries(tenant.id);
      toast.success(`${accepted} announcements staged`, {
        description: `${rejected} rejected by guardrails · ingested in ${INGEST_CHUNK_SIZE}-record chunks.`,
      });
    } catch (error) {
      toast.error("Ingest failed", { description: errorMessage(error) });
    } finally {
      setIngesting(false);
      setIngestCount(null);
    }
  };

  const handleProcess = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const response = await processFeed(tenant.id, 25);
      await refreshSummaries(tenant.id);
      setProcessed({
        processed: response.processed_count,
        rejected: lastIngest?.rejected ?? 0,
      });
      toast.success("Feed processed", {
        description: `${response.processed_count} classified · ${
          lastIngest?.rejected ?? 0
        } rejected by guardrails · stored to ChromaDB.`,
      });
    } catch (error) {
      toast.error("Processing failed", { description: errorMessage(error) });
    } finally {
      setProcessing(false);
    }
  };

  const openDraft = (a: Announcement) => {
    setContext(a);
    setCopilotMode("draft");
    setCopilotOpen(true);
  };

  const hideCard = (id: string) => {
    setHidden((h) => [...h, id]);
    toast("Announcement hidden", {
      action: { label: "Undo", onClick: () => setHidden((h) => h.filter((x) => x !== id)) },
    });
  };

  const recategorize = async (id: string, cat: CategoryKey) => {
    const previous = items;
    const selected = items.find((a) => a.id === id);
    if (!selected) return;
    const backendCategory = toBackendCategory(cat);
    setItems((it) =>
      it.map((a) => (a.id === id ? { ...a, category: cat, backendCategory } : a)),
    );
    try {
      await sendFeedback(tenant.id, {
        summary_id: selected.summaryId,
        email_id: selected.emailId,
        override_category: backendCategory,
        notes: "Recategorized from the React triage feed.",
      });
      toast.success(`Recategorized to ${cat}`, { description: "Feedback logged." });
    } catch (error) {
      setItems(previous);
      toast.error("Feedback failed", { description: errorMessage(error) });
    }
  };

  const closeAudio = useCallback(() => setAudioTrack(null), []);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden text-foreground">
      <Header
        tenant={tenant}
        onTenantChange={(t) => {
          setTenant(t);
          toast(`Switched tenant -> ${t.name}`, { description: "Loading private archive..." });
        }}
        query={query}
        onQueryChange={setQuery}
        online={health.online}
      />

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[17rem_1fr]">
        {/* Sidebar — desktop */}
        <div className="hidden lg:block">
          <Sidebar
            prefs={prefs}
            onToggle={togglePref}
            counts={counts}
            onIngest={handleIngest}
            onProcess={handleProcess}
            ingesting={ingesting}
            ingestCount={ingestCount}
            processing={processing}
            processed={processed}
            latencyMs={health.latencyMs}
            online={health.online}
            provider={health.provider}
          />
        </div>

        {/* Sidebar — mobile drawer */}
        <AnimatePresence>
          {mobileSidebar && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileSidebar(false)}
                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 34 }}
                className="fixed bottom-0 left-0 top-16 z-50 w-72 lg:hidden"
              >
                <Sidebar
                  prefs={prefs}
                  onToggle={togglePref}
                  counts={counts}
                  onIngest={handleIngest}
                  onProcess={handleProcess}
                  ingesting={ingesting}
                  ingestCount={ingestCount}
                  processing={processing}
                  processed={processed}
                  latencyMs={health.latencyMs}
                  online={health.online}
                  provider={health.provider}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Main workspace */}
        <main className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {/* Mobile controls */}
              <div className="flex items-center gap-2 lg:hidden">
                <button
                  onClick={() => setMobileSidebar(true)}
                  className="glass inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm"
                >
                  <Menu className="h-4 w-4" /> Controls
                </button>
                <button
                  onClick={() => setCopilotOpen(true)}
                  className="glass inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm"
                >
                  <PanelRightOpen className="h-4 w-4" /> Copilot
                </button>
              </div>

              <Timeline days={timelineDays} selected={selectedDay} onSelect={setSelectedDay} />

              <Metrics
                visible={visibleFeedItems.length}
                critical={critical}
                hidden={hiddenCount}
                active={metricFilter}
                onSelect={setMetricFilter}
              />

              {/* Feed header */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Filter className="h-4 w-4" />
                  <span>
                    Triage Feed
                    {selectedDay && (
                      <span className="text-[#10b981]">
                        {" "}
                        · {new Date(selectedDay + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                    {metricFilterLabel && (
                      <span className="text-[#10b981]"> · {metricFilterLabel}</span>
                    )}
                  </span>
                </div>
                <button
                  onClick={() => setCopilotOpen(true)}
                  className="hidden items-center gap-1.5 rounded-xl border border-border bg-secondary/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-[#10b981]/40 hover:text-foreground lg:inline-flex"
                >
                  <PanelRightOpen className="h-4 w-4" /> Open Copilot
                </button>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-3 pb-6">
                <AnimatePresence mode="popLayout">
                  {feedItems.map((a) => (
                    <AnnouncementCard
                      key={a.id}
                      a={a}
                      onDraft={openDraft}
                      onListen={setAudioTrack}
                      onHide={hideCard}
                      onRecategorize={recategorize}
                      playing={audioTrack?.id === a.id}
                    />
                  ))}
                </AnimatePresence>

                {loadingSummaries && (
                  <div className="glass flex flex-col items-center gap-2 rounded-2xl py-16 text-center">
                    <Filter className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading tenant archive...</p>
                  </div>
                )}

                {!loadingSummaries && feedItems.length === 0 && (
                  <div className="glass flex flex-col items-center gap-2 rounded-2xl py-16 text-center">
                    <Filter className="h-8 w-8 text-muted-foreground" />
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {items.length === 0
                        ? "No summaries yet. Ingest mock data, then process the feed."
                        : "No announcements match your filters."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      <CopilotDrawer
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        context={context}
        onClearContext={() => setContext(null)}
        mode={copilotMode}
        onModeChange={setCopilotMode}
        announcements={items}
        tenantId={tenant.id}
      />

      <AudioPlayer track={audioTrack} tenantId={tenant.id} onClose={closeAudio} />

      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: "rgba(24,24,27,0.85)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
            color: "#fafafa",
          },
        }}
      />
    </div>
  );
}
