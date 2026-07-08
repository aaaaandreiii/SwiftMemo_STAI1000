import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Send,
  Copy,
  RefreshCw,
  Sparkles,
  FileText,
  Check,
  Pin,
  Square,
  Plus,
  ThumbsUp,
  ThumbsDown,
  Baby,
  ChevronLeft,
  Mail,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "./Markdown";
import { categoryMeta, type Announcement } from "../data";
import {
  chatArchive,
  generateDraft as requestDraft,
  type SourceDocument,
} from "../api";

type Mode = "chat" | "draft";

interface Source {
  id: string;
  title: string;
  subject: string;
  date: string;
  snippet: string;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  streaming?: boolean;
  feedback?: "up" | "down";
}

interface CopilotProps {
  open: boolean;
  onClose: () => void;
  context: Announcement | null;
  onClearContext: () => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  announcements: Announcement[];
  tenantId: string;
}

const QUICK_ACTIONS = [
  "Ask for an extension",
  "Confirm attendance",
  "Request payment plan options",
  "Ask for clarification",
];

const SUGGESTED_PROMPTS = [
  { icon: FileText, label: "Summarize my urgent deadlines" },
  { icon: Mail, label: "What do I need to pay this week?" },
  { icon: Lightbulb, label: "Explain the MFA rollout steps" },
  { icon: Sparkles, label: "Show me a GPA formula" },
];

const TOKEN_LIMIT = 4000;
const uid = () => Math.random().toString(36).slice(2, 9);
const estTokens = (msgs: ChatMsg[]) =>
  Math.round(msgs.reduce((n, m) => n + m.text.length, 0) / 4);

function greeting(): ChatMsg {
  return {
    id: uid(),
    role: "assistant",
    text: "Hi, I'm your **SwiftMemo copilot**. I search your private, tenant-scoped archive to answer questions about deadlines, requirements, and where to submit. Pick a suggestion below or ask me anything.",
  };
}

const toSources = (sources: SourceDocument[]): Source[] =>
  sources.map((source) => ({
    id: source.id,
    title: source.subject,
    subject: source.subject,
    date: source.date,
    snippet: source.snippet,
  }));

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unexpected error";

export function CopilotDrawer({
  open,
  onClose,
  context,
  onClearContext,
  mode,
  onModeChange,
  announcements,
  tenantId,
}: CopilotProps) {
  // ---- draft state ----
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [genDrafting, setGenDrafting] = useState(false);
  const [copied, setCopied] = useState(false);

  // ---- chat state ----
  const [messages, setMessages] = useState<ChatMsg[]>([greeting()]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [preview, setPreview] = useState<Announcement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamTimer = useRef<ReturnType<typeof setInterval>>();
  const lastQuery = useRef<string>("");

  const tokens = estTokens(messages);
  const nearLimit = tokens > TOKEN_LIMIT * 0.75;
  const hasConversation = messages.length > 1;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => clearInterval(streamTimer.current), []);

  // ---- draft generation ----
  const generateDraft = async () => {
    if (genDrafting) return;
    setGenDrafting(true);
    setDraft("");
    const subject = context ? context.title : "the selected announcement";
    const requestPrompt =
      prompt.trim() || `Draft a professional reply about ${subject}.`;
    try {
      const response = await requestDraft(
        tenantId,
        requestPrompt,
        `draft-${tenantId}`,
        context?.emailId,
      );
      setDraft(response.draft);
    } catch (error) {
      toast.error("Draft generation failed", { description: errorMessage(error) });
    } finally {
      setGenDrafting(false);
    }
  };

  const copyDraft = () => {
    navigator.clipboard?.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ---- streaming chat ----
  const streamAnswer = useCallback(
    (msgId: string, full: string, sources: Source[]) => {
      clearInterval(streamTimer.current);
      setStreaming(true);
      // reveal a few characters per tick for a token-like effect
      let i = 0;
      const step = () => {
        i = Math.min(full.length, i + Math.ceil(Math.random() * 4) + 2);
        const slice = full.slice(0, i);
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, text: slice } : m)),
        );
        if (i >= full.length) {
          clearInterval(streamTimer.current);
          setStreaming(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, streaming: false, sources } : m,
            ),
          );
        }
      };
      streamTimer.current = setInterval(step, 28);
    },
    [],
  );

  const requestAnswer = useCallback(
    async (msgId: string, question: string) => {
      clearInterval(streamTimer.current);
      setStreaming(true);
      const contextualQuestion = context
        ? `${question}\n\nSelected announcement: ${context.sourceSubject} (email_id: ${context.emailId}).`
        : question;
      try {
        const response = await chatArchive(tenantId, contextualQuestion, `chat-${tenantId}`);
        streamAnswer(msgId, response.answer, toSources(response.sources));
      } catch (error) {
        clearInterval(streamTimer.current);
        setStreaming(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  text: `I could not reach the archive service.\n\n${errorMessage(error)}`,
                  streaming: false,
                  sources: [],
                }
              : m,
          ),
        );
      }
    },
    [context, streamAnswer, tenantId],
  );

  const ask = (question: string) => {
    if (!question.trim() || streaming) return;
    lastQuery.current = question;
    const userMsg: ChatMsg = { id: uid(), role: "user", text: question };
    const aId = uid();
    const assistant: ChatMsg = { id: aId, role: "assistant", text: "", streaming: true };
    setMessages((m) => [...m, userMsg, assistant]);
    setChatInput("");
    requestAnswer(aId, question);
  };

  const stopGeneration = () => {
    clearInterval(streamTimer.current);
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  };

  const regenerate = () => {
    if (!lastQuery.current || streaming) return;
    // drop last assistant message and re-answer
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === "assistant");
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.slice(0, realIdx);
    });
    const aId = uid();
    setMessages((m) => [...m, { id: aId, role: "assistant", text: "", streaming: true }]);
    requestAnswer(aId, lastQuery.current);
  };

  const explainSimpler = () => {
    if (!lastQuery.current || streaming) return;
    ask(`Explain this more simply: ${lastQuery.current}`);
  };

  const setFeedback = (id: string, fb: "up" | "down") =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, feedback: m.feedback === fb ? undefined : fb } : m)),
    );

  const newChat = () => {
    clearInterval(streamTimer.current);
    setStreaming(false);
    setMessages([greeting()]);
    lastQuery.current = "";
  };

  const openSource = (source: string | Source) => {
    const id = typeof source === "string" ? source : source.id;
    const subject = typeof source === "string" ? null : source.subject;
    const a = announcements.find(
      (x) =>
        x.id === id ||
        x.summaryId === id ||
        x.emailId === id ||
        id.includes(x.emailId) ||
        (subject ? x.sourceSubject === subject : false),
    );
    if (a) setPreview(a);
  };

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant" && !m.streaming)?.id;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="glass fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col rounded-none border-y-0 border-r-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#006432] to-[#10b981] text-white">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
                  Copilot
                </span>
              </div>
              <div className="flex items-center gap-1">
                {mode === "chat" && hasConversation && (
                  <button
                    onClick={newChat}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[#10b981]/40 hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> New
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>

            {/* Segmented control */}
            <div className="p-4 pb-2">
              <div className="relative grid grid-cols-2 rounded-xl border border-border bg-secondary/40 p-1">
                <motion.span
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  className="absolute inset-y-1 w-[calc(50%-4px)] rounded-lg bg-[#10b981]/20"
                  style={{ left: mode === "chat" ? 4 : "50%" }}
                />
                {(["chat", "draft"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => onModeChange(m)}
                    className={`relative z-10 py-1.5 text-sm font-medium transition-colors ${
                      mode === m ? "text-[#34d399]" : "text-muted-foreground"
                    }`}
                  >
                    {m === "chat" ? "Chat Archive" : "Draft Assistant"}
                  </button>
                ))}
              </div>
            </div>

            {/* Context chip */}
            {context && (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-[#10b981]/30 bg-[#10b981]/10 px-3 py-2">
                <Pin className="h-3.5 w-3.5 shrink-0 text-[#10b981]" />
                <span className="flex-1 truncate text-xs text-foreground/90">
                  {context.title}
                </span>
                <button
                  onClick={onClearContext}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Body */}
            {mode === "draft" ? (
              <div className="flex flex-1 flex-col overflow-hidden p-4 pt-2">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {QUICK_ACTIONS.map((qa) => (
                    <button
                      key={qa}
                      onClick={() => setPrompt(qa)}
                      className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-[#10b981]/40 hover:text-foreground"
                    >
                      {qa}
                    </button>
                  ))}
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe what you'd like to say…"
                  className="h-20 w-full resize-none rounded-xl border border-border bg-input/60 p-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-[#10b981]/50 focus:ring-2 focus:ring-[#10b981]/20"
                />
                <button
                  onClick={generateDraft}
                  disabled={genDrafting}
                  className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#006432] to-[#10b981] py-2.5 text-sm font-semibold text-white transition-all hover:shadow-[0_4px_20px_-4px_rgba(16,185,129,0.6)] active:scale-[0.98] disabled:opacity-70"
                >
                  {genDrafting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {genDrafting ? "Generating…" : "Generate Draft"}
                </button>

                <div className="mt-3 flex-1 overflow-hidden rounded-xl border border-border bg-black/30">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="font-mono text-xs text-muted-foreground">draft.txt</span>
                    {draft && (
                      <div className="flex gap-1">
                        <button
                          onClick={generateDraft}
                          className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-foreground"
                          title="Regenerate"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={copyDraft}
                          className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-[#10b981]"
                          title="Copy"
                        >
                          {copied ? (
                            <Check className="h-3.5 w-3.5 text-[#10b981]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="h-full overflow-y-auto p-3 pb-10">
                    {draft ? (
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
                        {draft}
                      </pre>
                    ) : (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        Your generated draft will appear here.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative flex flex-1 flex-col overflow-hidden">
                <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 pt-2">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className="max-w-[88%]">
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 shadow ${
                            m.role === "user"
                              ? "bg-gradient-to-br from-[#006432] to-[#10b981] text-sm leading-relaxed text-white"
                              : "border border-border bg-secondary/50 text-foreground/90"
                          }`}
                        >
                          {m.role === "assistant" ? (
                            <>
                              <Markdown onCite={openSource}>{m.text || "​"}</Markdown>
                              {m.streaming && (
                                <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-[#10b981]" />
                              )}
                            </>
                          ) : (
                            m.text
                          )}
                        </div>

                        {/* Source chips */}
                        {m.sources && m.sources.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {m.sources.map((s, j) => {
                              const a = announcements.find((x) => x.id === s.id);
                              const color = a ? categoryMeta(a.category).color : "#10b981";
                              return (
                                <button
                                  key={s.id}
                                  onClick={() => openSource(s)}
                                  className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-black/30 px-2 py-1 text-left transition-colors hover:border-[#10b981]/50"
                                >
                                  <span
                                    className="grid h-4 w-4 shrink-0 place-items-center rounded text-[0.6rem] font-semibold"
                                    style={{ background: color + "33", color }}
                                  >
                                    {j + 1}
                                  </span>
                                  <span className="truncate text-[0.72rem] text-muted-foreground group-hover:text-foreground">
                                    {s.title}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Quick actions / elicitations under the latest completed answer */}
                        {m.role === "assistant" && !m.streaming && m.id === lastAssistantId && hasConversation && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <button
                              onClick={regenerate}
                              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[0.7rem] text-muted-foreground transition-colors hover:border-[#10b981]/40 hover:text-foreground"
                            >
                              <RefreshCw className="h-3 w-3" /> Regenerate
                            </button>
                            <button
                              onClick={explainSimpler}
                              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[0.7rem] text-muted-foreground transition-colors hover:border-[#10b981]/40 hover:text-foreground"
                            >
                              <Baby className="h-3 w-3" /> Explain simpler
                            </button>
                            <span className="mx-0.5 h-4 w-px bg-border" />
                            <button
                              onClick={() => setFeedback(m.id, "up")}
                              className={`grid h-6 w-6 place-items-center rounded-full transition-colors hover:bg-secondary/50 ${
                                m.feedback === "up" ? "text-[#10b981]" : "text-muted-foreground"
                              }`}
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setFeedback(m.id, "down")}
                              className={`grid h-6 w-6 place-items-center rounded-full transition-colors hover:bg-secondary/50 ${
                                m.feedback === "down" ? "text-[#f43f5e]" : "text-muted-foreground"
                              }`}
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Blank-canvas suggested prompts */}
                  {!hasConversation && (
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      {SUGGESTED_PROMPTS.map((s) => (
                        <button
                          key={s.label}
                          onClick={() => ask(s.label)}
                          className="group flex items-center gap-2.5 rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-left text-sm transition-colors hover:border-[#10b981]/50 hover:bg-[#10b981]/10"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#10b981]/15 text-[#34d399]">
                            <s.icon className="h-4 w-4" />
                          </span>
                          <span className="text-foreground/90">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Token / context meter */}
                <div className="px-4 pb-1">
                  <div className="flex items-center justify-between text-[0.65rem] text-muted-foreground">
                    <span className="font-mono">
                      Context {tokens.toLocaleString()} / {TOKEN_LIMIT.toLocaleString()} tokens
                    </span>
                    {nearLimit && (
                      <button
                        onClick={newChat}
                        className="inline-flex items-center gap-1 text-[#fbbf24] hover:underline"
                      >
                        <AlertTriangle className="h-3 w-3" /> Clear context
                      </button>
                    )}
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary/50">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (tokens / TOKEN_LIMIT) * 100)}%`,
                        background: nearLimit ? "#fbbf24" : "#10b981",
                      }}
                    />
                  </div>
                </div>

                {/* Composer */}
                <div className="border-t border-border p-3">
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-input/60 px-3 py-1.5 focus-within:border-[#10b981]/50 focus-within:ring-2 focus-within:ring-[#10b981]/20">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && ask(chatInput)}
                      placeholder="Ask about your announcements…"
                      disabled={streaming}
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                    />
                    {streaming ? (
                      <button
                        onClick={stopGeneration}
                        className="flex items-center gap-1 rounded-lg bg-[#f43f5e]/20 px-2.5 py-1.5 text-xs font-medium text-[#f43f5e] transition-colors hover:bg-[#f43f5e]/30"
                        title="Stop generating"
                      >
                        <Square className="h-3.5 w-3.5 fill-current" /> Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => ask(chatInput)}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-[#10b981]/20 text-[#34d399] transition-colors hover:bg-[#10b981]/30"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Source preview overlay — the actual referenced email */}
                <AnimatePresence>
                  {preview && (
                    <motion.div
                      initial={{ x: "100%" }}
                      animate={{ x: 0 }}
                      exit={{ x: "100%" }}
                      transition={{ type: "spring", stiffness: 340, damping: 34 }}
                      className="absolute inset-0 z-10 flex flex-col bg-popover"
                    >
                      <div className="flex items-center gap-2 border-b border-border p-4">
                        <button
                          onClick={() => setPreview(null)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                        >
                          <ChevronLeft className="h-[18px] w-[18px]" />
                        </button>
                        <span className="text-sm text-muted-foreground">Source email</span>
                        <span
                          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                          style={{
                            background: categoryMeta(preview.category).color + "1f",
                            color: categoryMeta(preview.category).color,
                          }}
                        >
                          {preview.category}
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <h3 className="text-[1.05rem] leading-snug">{preview.title}</h3>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {preview.sender}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          Received{" "}
                          {new Date(preview.received + "T00:00:00").toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <div className="mt-4 rounded-xl border border-border bg-black/30 p-4 text-sm leading-relaxed text-foreground/90">
                          {preview.original}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
