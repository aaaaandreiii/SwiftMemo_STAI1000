import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PanelRightOpen, Filter, Menu } from "lucide-react";
import { Toaster, toast } from "sonner";

import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import type { FeedWorkflowState } from "./components/Sidebar";
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
  matchedCustomTopics,
  preferencesFromBackend,
  preferencesToBackend,
  readCustomTopics,
  summaryToAnnouncement,
  toBackendCategory,
  writeCustomTopics,
  type Announcement,
  type CategoryKey,
  type CustomTopic,
} from "./data";

const ALL_ON = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.key]: true }),
  {} as Record<CategoryKey, boolean>,
);
const INGEST_CHUNK_SIZE = 20;
const PROCESS_BATCH_SIZE = 10;

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

const makeTopicId = (label: string) =>
  `topic-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;

export default function App() {
  const [tenant, setTenant] = useState(TENANTS[0]);
  const [query, setQuery] = useState("");
  const [prefs, setPrefs] = useState<Record<CategoryKey, boolean>>(ALL_ON);
  const [customTopics, setCustomTopics] = useState<CustomTopic[]>(() =>
    readCustomTopics(TENANTS[0].id),
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>("visible");
  const [hidden, setHidden] = useState<string[]>([]);
  const [items, setItems] = useState<Announcement[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(true);

  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotMode, setCopilotMode] = useState<"chat" | "draft">("draft");
  const [context, setContext] = useState<Announcement | null>(null);
  const [audioTrack, setAudioTrack] = useState<Announcement | null>(null);

  const [feedWorkflow, setFeedWorkflow] = useState<FeedWorkflowState>({
    stage: "idle",
    fetched: 0,
    accepted: 0,
    rejected: 0,
    processed: 0,
    batch: 0,
  });
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
    setCustomTopics(readCustomTopics(tenant.id));
  }, [tenant.id]);

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
      .filter((a) => {
        if (!term) return true;
        const topicLabels = matchedCustomTopics(a, customTopics)
          .map((topic) => topic.label)
          .join(" ");
        return (a.title + a.summary + a.category + a.sourceSubject + topicLabels)
          .toLowerCase()
          .includes(term);
      });
  }, [items, selectedDay, query, customTopics]);

  const topicCounts = useMemo(
    () =>
      customTopics.reduce(
        (acc, topic) => ({
          ...acc,
          [topic.id]: items.filter((a) =>
            matchedCustomTopics(a, [topic]).some((match) => match.id === topic.id),
          ).length,
        }),
        {} as Record<string, number>,
      ),
    [customTopics, items],
  );

  const visibleFeedItems = useMemo(() => {
    return scopedItems
      .filter((a) => !hidden.includes(a.id))
      .filter((a) => prefs[a.category])
      .filter((a) => !matchedCustomTopics(a, customTopics).some((topic) => !topic.enabled))
      .sort((a, b) => b.urgency - a.urgency || sortDate(a.dueDate) - sortDate(b.dueDate));
  }, [scopedItems, hidden, prefs, customTopics]);

  const filteredOutItems = useMemo(() => {
    return scopedItems
      .filter(
        (a) =>
          hidden.includes(a.id) ||
          !prefs[a.category] ||
          matchedCustomTopics(a, customTopics).some((topic) => !topic.enabled),
      )
      .sort((a, b) => b.urgency - a.urgency || sortDate(a.dueDate) - sortDate(b.dueDate));
  }, [scopedItems, hidden, prefs, customTopics]);

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

  const updateTopics = (updater: (topics: CustomTopic[]) => CustomTopic[]) => {
    setCustomTopics((current) => {
      const next = updater(current);
      writeCustomTopics(tenant.id, next);
      return next;
    });
  };

  const addCustomTopic = (label: string) => {
    const cleaned = label.trim();
    if (!cleaned) return;
    const duplicate = customTopics.some(
      (topic) => topic.label.toLowerCase() === cleaned.toLowerCase(),
    );
    if (duplicate) {
      toast("Topic already exists", { description: cleaned });
      return;
    }
    updateTopics((topics) => [
      ...topics,
      { id: makeTopicId(cleaned), label: cleaned, enabled: true },
    ]);
    toast.success("Topic added", { description: `${cleaned} will match future summaries.` });
  };

  const toggleCustomTopic = (id: string) => {
    updateTopics((topics) =>
      topics.map((topic) =>
        topic.id === id ? { ...topic, enabled: !topic.enabled } : topic,
      ),
    );
  };

  const removeCustomTopic = (id: string) => {
    updateTopics((topics) => topics.filter((topic) => topic.id !== id));
  };

  const handleFetchAndProcess = async () => {
    if (feedWorkflow.stage === "fetching" || feedWorkflow.stage === "processing") return;
    setFeedWorkflow({
      stage: "fetching",
      fetched: 0,
      accepted: 0,
      rejected: 0,
      processed: 0,
      batch: 1,
    });
    try {
      let accepted = 0;
      let rejected = 0;
      let offset = 0;
      let fetchBatch = 1;

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
        setFeedWorkflow({
          stage: "fetching",
          fetched: accepted + rejected,
          accepted,
          rejected,
          processed: 0,
          batch: fetchBatch,
        });

        if (batchCount < INGEST_CHUNK_SIZE) break;
        fetchBatch += 1;
      }

      await refreshSummaries(tenant.id);

      let processed = 0;
      let processBatch = 1;
      setFeedWorkflow({
        stage: "processing",
        fetched: accepted + rejected,
        accepted,
        rejected,
        processed,
        batch: processBatch,
      });

      for (let processOffset = 0; processOffset < accepted; processOffset += PROCESS_BATCH_SIZE) {
        const response = await processFeed(tenant.id, PROCESS_BATCH_SIZE, processOffset);
        processed += response.processed_count;
        setFeedWorkflow({
          stage: "processing",
          fetched: accepted + rejected,
          accepted,
          rejected,
          processed,
          batch: processBatch,
        });
        await refreshSummaries(tenant.id);
        if (response.processed_count === 0) break;
        processBatch += 1;
      }

      await refreshSummaries(tenant.id);
      setFeedWorkflow({
        stage: "completed",
        fetched: accepted + rejected,
        accepted,
        rejected,
        processed,
        batch: Math.max(processBatch - 1, 0),
      });
      toast.success("Mock feed fetched and processed", {
        description: `${accepted} accepted · ${rejected} rejected · ${processed} summarized.`,
      });
    } catch (error) {
      const description = errorMessage(error);
      setFeedWorkflow((current) => ({
        ...current,
        stage: "error",
        error: description,
      }));
      toast.error("Fetch and process failed", { description });
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
            customTopics={customTopics}
            topicCounts={topicCounts}
            onAddTopic={addCustomTopic}
            onToggleTopic={toggleCustomTopic}
            onRemoveTopic={removeCustomTopic}
            onFetchProcess={handleFetchAndProcess}
            workflow={feedWorkflow}
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
                  customTopics={customTopics}
                  topicCounts={topicCounts}
                  onAddTopic={addCustomTopic}
                  onToggleTopic={toggleCustomTopic}
                  onRemoveTopic={removeCustomTopic}
                  onFetchProcess={handleFetchAndProcess}
                  workflow={feedWorkflow}
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
                      topicMatches={matchedCustomTopics(a, customTopics)}
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
