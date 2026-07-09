import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PanelRightOpen, Filter, Menu } from "lucide-react";
import { Toaster, toast } from "sonner";

import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import type { FeedWorkflowState } from "./components/Sidebar";
import { SettingsSidebar } from "./components/SettingsSidebar";
import { Timeline, type CalendarDeadlineItem, type TimelineDay } from "./components/Timeline";
import { Metrics, type MetricFilter } from "./components/Metrics";
import { DailyDigest } from "./components/DailyDigest";
import { AnnouncementCard } from "./components/AnnouncementCard";
import { CopilotDrawer } from "./components/CopilotDrawer";
import { AudioPlayer } from "./components/AudioPlayer";
import {
  approveTopic,
  dismissTopic,
  getDailyDigest,
  getHealth,
  getPreferences,
  getProcessingNotes,
  getProfile,
  getSummaries,
  ingestMockData,
  processFeed,
  resetDemoData,
  sendFeedback,
  updateProfile,
  updatePreferences,
  type DailyDigestResponse,
  type IngestedEmail,
  type TenantProfile,
  type TopicSuggestion,
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
const PROCESS_BATCH_SIZE = 1;

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

const todayIso = () => today().toISOString().slice(0, 10);

const sortDate = (value: string | null) =>
  value ? new Date(value + "T00:00:00").getTime() : Number.MAX_SAFE_INTEGER;

const relevanceTier = (item: Announcement) => {
  if (item.campusMatch === "mismatch") return -1;
  if (item.campusMatch === "match" || item.relevanceScore >= 18) return 1;
  return 0;
};

const sortAnnouncements = (a: Announcement, b: Announcement) =>
  relevanceTier(b) - relevanceTier(a) ||
  b.urgency - a.urgency ||
  sortDate(a.dueDate) - sortDate(b.dueDate) ||
  b.relevanceScore - a.relevanceScore;

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
    classified: 0,
    skipped: 0,
    processed: 0,
    batch: 0,
  });
  const [health, setHealth] = useState<HealthState>({
    online: false,
    latencyMs: 0,
    provider: "unknown",
  });
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [processingNotes, setProcessingNotes] = useState<IngestedEmail[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [resettingDemoData, setResettingDemoData] = useState(false);
  const [dailyDigest, setDailyDigest] = useState<DailyDigestResponse | null>(null);
  const [loadingDigest, setLoadingDigest] = useState(false);

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

  const refreshProcessingNotes = useCallback(async (tenantId: string) => {
    setLoadingNotes(true);
    setNotesError(null);
    try {
      const response = await getProcessingNotes(tenantId);
      setProcessingNotes(response.items);
    } catch (error) {
      setNotesError(errorMessage(error));
    } finally {
      setLoadingNotes(false);
    }
  }, []);

  const refreshDailyDigest = useCallback(async (tenantId: string, digestDate: string) => {
    setLoadingDigest(true);
    try {
      const response = await getDailyDigest(tenantId, digestDate);
      setDailyDigest(response);
    } catch (error) {
      setDailyDigest(null);
      toast.error("Unable to load daily digest", {
        description: errorMessage(error),
      });
    } finally {
      setLoadingDigest(false);
    }
  }, []);

  const loadTenant = useCallback(async () => {
    setLoadingSummaries(true);
    setHidden([]);
    setSelectedDay(null);
    setMetricFilter("visible");
    setContext(null);
    setAudioTrack(null);
    setProcessingNotes([]);
    setNotesError(null);
    setDailyDigest(null);
    try {
      const [preferences, summaries, tenantProfile, digest] = await Promise.all([
        getPreferences(tenant.id),
        getSummaries(tenant.id, false),
        getProfile(tenant.id),
        getDailyDigest(tenant.id, todayIso()),
      ]);
      setPrefs(preferencesFromBackend(preferences.preferences));
      setItems(summaries.items.map(summaryToAnnouncement));
      setProfile(tenantProfile);
      setDailyDigest(digest);
    } catch (error) {
      setItems([]);
      setProfile(null);
      toast.error("Unable to load profile data", {
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

  useEffect(() => {
    if (settingsOpen) {
      refreshProcessingNotes(tenant.id);
    }
  }, [settingsOpen, tenant.id, refreshProcessingNotes]);

  useEffect(() => {
    refreshDailyDigest(tenant.id, selectedDay ?? todayIso());
  }, [tenant.id, selectedDay, refreshDailyDigest]);

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
        return (
          a.title +
          a.summary +
          a.category +
          a.sourceSubject +
          a.relevanceReasons.join(" ") +
          topicLabels
        )
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
      .sort(sortAnnouncements);
  }, [scopedItems, hidden, prefs, customTopics]);

  const filteredOutItems = useMemo(() => {
    return scopedItems
      .filter(
        (a) =>
          hidden.includes(a.id) ||
          !prefs[a.category] ||
          matchedCustomTopics(a, customTopics).some((topic) => !topic.enabled),
      )
      .sort(sortAnnouncements);
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
        ? "Not Shown"
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

  const timelineDeadlineItems: CalendarDeadlineItem[] = useMemo(
    () =>
      items
        .filter((a) => a.dueDate)
        .filter((a) => !hidden.includes(a.id))
        .filter((a) => prefs[a.category])
        .filter((a) => !matchedCustomTopics(a, customTopics).some((topic) => !topic.enabled))
        .map((a) => ({
          id: a.id,
          title: a.title,
          dueDate: a.dueDate,
          urgency: a.urgency,
          category: a.category,
        })),
    [items, hidden, prefs, customTopics],
  );

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
      classified: 0,
      skipped: 0,
      processed: 0,
      batch: 1,
    });
    try {
      let classified = 0;
      let skipped = 0;
      let offset = 0;
      let fetchBatch = 1;

      while (true) {
        const response = await ingestMockData(tenant.id, {
          limit: INGEST_CHUNK_SIZE,
          offset,
        });
        const batchCount = response.accepted_count + response.rejected_count;
        if (batchCount === 0) break;

        classified += response.accepted_count;
        skipped += response.rejected_count;
        offset += batchCount;
        setFeedWorkflow({
          stage: "fetching",
          fetched: classified + skipped,
          classified,
          skipped,
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
        fetched: classified + skipped,
        classified,
        skipped,
        processed,
        batch: processBatch,
      });

      while (processed < classified) {
        setFeedWorkflow({
          stage: "processing",
          fetched: classified + skipped,
          classified,
          skipped,
          processed,
          batch: processBatch,
        });
        const response = await processFeed(tenant.id, PROCESS_BATCH_SIZE, 0);
        processed += response.processed_count;
        setFeedWorkflow({
          stage: "processing",
          fetched: classified + skipped,
          classified,
          skipped,
          processed,
          batch: processBatch,
        });
        await refreshSummaries(tenant.id);
        if (response.processed_count === 0) break;
        processBatch += 1;
      }

      await refreshSummaries(tenant.id);
      await refreshDailyDigest(tenant.id, selectedDay ?? todayIso());
      if (settingsOpen) {
        await refreshProcessingNotes(tenant.id);
      }
      setFeedWorkflow({
        stage: "completed",
        fetched: classified + skipped,
        classified,
        skipped,
        processed,
        batch: Math.max(processBatch - 1, 0),
      });
      toast.success("Preview feed synced", {
        description: `${classified} accepted · ${skipped} rejected · ${processed} summarized.`,
      });
    } catch (error) {
      const description = errorMessage(error);
      setFeedWorkflow((current) => ({
        ...current,
        stage: "error",
        error: description,
      }));
      toast.error("Sync failed", { description });
    }
  };

  const openDraft = (a: Announcement) => {
    setContext(a);
    setCopilotMode("draft");
    setCopilotOpen(true);
  };

  const hideCard = (id: string) => {
    setHidden((h) => [...h, id]);
    toast("Email summary hidden", {
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
        notes: "Recategorized from the React priority inbox.",
      });
      toast.success(`Recategorized to ${cat}`, { description: "Feedback logged." });
    } catch (error) {
      setItems(previous);
      toast.error("Feedback failed", { description: errorMessage(error) });
    }
  };

  const saveProfile = async (payload: Omit<TenantProfile, "user_id" | "updated_at">) => {
    setProfileSaving(true);
    try {
      const updated = await updateProfile(tenant.id, payload);
      setProfile(updated);
      await Promise.all([
        refreshSummaries(tenant.id),
        refreshDailyDigest(tenant.id, selectedDay ?? todayIso()),
      ]);
      toast.success("Profile context saved");
    } catch (error) {
      toast.error("Profile save failed", { description: errorMessage(error) });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleResetDemoData = async () => {
    if (resettingDemoData) return;
    setResettingDemoData(true);
    try {
      const response = await resetDemoData(tenant.id);
      setItems([]);
      setHidden([]);
      setSelectedDay(null);
      setMetricFilter("visible");
      setContext(null);
      setAudioTrack(null);
      setProcessingNotes([]);
      setFeedWorkflow({
        stage: "idle",
        fetched: 0,
        classified: 0,
        skipped: 0,
        processed: 0,
        batch: 0,
      });
      await Promise.all([
        refreshSummaries(tenant.id),
        refreshProcessingNotes(tenant.id),
        refreshDailyDigest(tenant.id, todayIso()),
      ]);
      toast.success("Processed preview data cleared", {
        description: `${response.deleted.emails ?? 0} emails · ${
          response.deleted.triage_summaries ?? 0
        } summaries removed.`,
      });
    } catch (error) {
      toast.error("Preview reset failed", { description: errorMessage(error) });
    } finally {
      setResettingDemoData(false);
    }
  };

  const approveSuggestedTopic = async (topic: TopicSuggestion) => {
    try {
      const response = await approveTopic(tenant.id, topic.id);
      setProfile(response.profile);
      const alreadyLocal = customTopics.some(
        (item) => item.label.toLowerCase() === response.topic.label.toLowerCase(),
      );
      if (!alreadyLocal) {
        updateTopics((topics) => [
          ...topics,
          { id: makeTopicId(response.topic.label), label: response.topic.label, enabled: true },
        ]);
      }
      await refreshDailyDigest(tenant.id, selectedDay ?? todayIso());
      toast.success("Interest approved", { description: response.topic.label });
    } catch (error) {
      toast.error("Topic approval failed", { description: errorMessage(error) });
    }
  };

  const dismissSuggestedTopic = async (topic: TopicSuggestion) => {
    try {
      await dismissTopic(tenant.id, topic.id);
      await refreshDailyDigest(tenant.id, selectedDay ?? todayIso());
      toast("Interest suggestion dismissed", { description: topic.label });
    } catch (error) {
      toast.error("Topic dismissal failed", { description: errorMessage(error) });
    }
  };

  const closeAudio = useCallback(() => setAudioTrack(null), []);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden text-foreground">
      <Header
        tenant={tenant}
        onTenantChange={(t) => {
          setTenant(t);
          toast(`Switched profile to ${t.name}`, { description: "Loading Your Announcements..." });
        }}
        query={query}
        onQueryChange={setQuery}
        onSettingsOpen={() => setSettingsOpen(true)}
        online={health.online}
      />

      <AnimatePresence>
        {settingsOpen && (
          <SettingsSidebar
            open={settingsOpen}
            tenantName={tenant.name}
            processingNotes={processingNotes}
            loadingNotes={loadingNotes}
            notesError={notesError}
            profile={profile}
            profileSaving={profileSaving}
            resettingDemoData={resettingDemoData}
            onClose={() => setSettingsOpen(false)}
            onRefreshNotes={() => refreshProcessingNotes(tenant.id)}
            onSaveProfile={saveProfile}
            onResetDemoData={handleResetDemoData}
          />
        )}
      </AnimatePresence>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[17rem_1fr]">
        {/* Sidebar — desktop */}
        <div className="hidden min-h-0 overflow-hidden lg:block">
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
                className="fixed bottom-0 left-0 top-16 z-50 min-h-0 w-72 overflow-hidden lg:hidden"
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

              <Timeline
                days={timelineDays}
                deadlineItems={timelineDeadlineItems}
                selected={selectedDay}
                onSelect={setSelectedDay}
              />

              <DailyDigest
                digest={dailyDigest}
                loading={loadingDigest}
                onApproveTopic={approveSuggestedTopic}
                onDismissTopic={dismissSuggestedTopic}
              />

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
                    Email Feed
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
                    <p className="text-sm text-muted-foreground">Loading Your Announcements...</p>
                  </div>
                )}

                {!loadingSummaries && feedItems.length === 0 && (
                  <div className="glass flex flex-col items-center gap-2 rounded-2xl py-16 text-center">
                    <Filter className="h-8 w-8 text-muted-foreground" />
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {items.length === 0
                        ? "No summaries yet. Sync to load announcements."
                        : "No email summaries match your filters."}
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
