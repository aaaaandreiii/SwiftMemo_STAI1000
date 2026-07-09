import { useState } from "react";
import { motion } from "motion/react";
import {
  Bell,
  BellRing,
  Loader2,
  Mail,
  RefreshCw,
  ShieldAlert,
  Unplug,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { IngestedEmail } from "../api";

interface SettingsSidebarProps {
  open: boolean;
  tenantName: string;
  rejectedEmails: IngestedEmail[];
  loadingRejected: boolean;
  rejectedError: string | null;
  onClose: () => void;
  onRefreshRejected: () => void;
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));

export function SettingsSidebar({
  open,
  tenantName,
  rejectedEmails,
  loadingRejected,
  rejectedError,
  onClose,
  onRefreshRejected,
}: SettingsSidebarProps) {
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailSyncing, setGmailSyncing] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(false);

  const connectGmail = () => {
    setGmailConnected(true);
    toast.success("Gmail demo connected", {
      description: "UI-only state. No OAuth account was linked.",
    });
  };

  const syncGmail = () => {
    if (gmailSyncing) return;
    setGmailSyncing(true);
    window.setTimeout(() => {
      setGmailSyncing(false);
      toast.success("Gmail demo synced", {
        description: "Mock sync completed. No messages left this browser.",
      });
    }, 900);
  };

  const disconnectGmail = () => {
    setGmailConnected(false);
    toast("Gmail demo disconnected", {
      description: "Local connection state cleared.",
    });
  };

  const toggleNotifications = () => {
    setNotificationsOn((value) => {
      const next = !value;
      toast(next ? "Demo notifications enabled" : "Demo notifications paused", {
        description: "No browser push subscription was created.",
      });
      return next;
    });
  };

  if (!open) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm"
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="glass fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col overflow-hidden rounded-none border-y-0 border-r-0 p-4 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
              Settings
            </p>
            <h2 className="text-lg font-semibold text-foreground">{tenantName}</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-[#f43f5e]/50 hover:text-[#f43f5e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f43f5e]/40"
            title="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          <section className="space-y-3">
            <p className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
              Integrations
            </p>
            <div className="space-y-2 rounded-xl border border-border bg-secondary/25 p-2">
              {!gmailConnected ? (
                <button
                  onClick={connectGmail}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground transition-all hover:border-[#10b981]/50 hover:shadow-[0_0_18px_-10px_#10b981] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]/40"
                >
                  <Mail className="h-3.5 w-3.5 text-[#34d399]" />
                  Connect Gmail
                </button>
              ) : (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    onClick={syncGmail}
                    disabled={gmailSyncing}
                    className="flex items-center justify-center gap-2 rounded-lg border border-[#10b981]/40 bg-[#10b981]/10 px-3 py-2 text-xs text-[#34d399] transition-all hover:shadow-[0_0_18px_-10px_#10b981] disabled:opacity-70"
                  >
                    {gmailSyncing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {gmailSyncing ? "Syncing" : "Sync Gmail"}
                  </button>
                  <button
                    onClick={disconnectGmail}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-[#f43f5e]/50 hover:text-[#f43f5e]"
                    title="Disconnect Gmail demo"
                  >
                    <Unplug className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 px-1 text-[0.7rem] text-muted-foreground">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    gmailConnected ? "bg-[#10b981]" : "bg-muted-foreground"
                  }`}
                />
                {gmailConnected ? "Demo connection active" : "No real Google account linked"}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-secondary/25 p-2">
              <button
                onClick={toggleNotifications}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]/40"
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {notificationsOn ? (
                    <BellRing className="h-4 w-4 text-[#34d399]" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                  Push notifications
                </span>
                <span
                  className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                  style={{ background: notificationsOn ? "#10b981" : "rgba(255,255,255,0.15)" }}
                >
                  <motion.span
                    layout
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
                    animate={{ left: notificationsOn ? 18 : 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </span>
              </button>
              <p className="px-1 text-[0.68rem] text-muted-foreground">
                {notificationsOn
                  ? "Demo status: local alerts enabled."
                  : "Demo permission only. Browser Push API is not subscribed."}
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                  Rejected Emails
                </p>
                <p className="text-xs text-muted-foreground">
                  {rejectedEmails.length} filtered by guardrails
                </p>
              </div>
              <button
                onClick={onRefreshRejected}
                disabled={loadingRejected}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition-all hover:border-[#10b981]/50 hover:text-[#34d399] disabled:opacity-60"
                title="Refresh rejected emails"
              >
                {loadingRejected ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {rejectedError && (
              <div className="rounded-lg border border-[#f43f5e]/30 bg-[#f43f5e]/10 px-3 py-2 text-xs text-[#fda4af]">
                {rejectedError}
              </div>
            )}

            {!loadingRejected && !rejectedError && rejectedEmails.length === 0 && (
              <div className="rounded-lg border border-border bg-secondary/20 px-3 py-4 text-sm text-muted-foreground">
                No rejected emails for this tenant.
              </div>
            )}

            <div className="space-y-2">
              {rejectedEmails.map((item) => (
                <article
                  key={item.email.id}
                  className="rounded-lg border border-border bg-secondary/20 p-3"
                >
                  <div className="mb-2 flex items-start gap-2">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#f43f5e]/40 bg-[#f43f5e]/10 text-[#fda4af]">
                      <ShieldAlert className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-sm font-medium text-foreground">
                        {item.email.subject}
                      </h3>
                      <p className="truncate text-[0.7rem] text-muted-foreground">
                        {item.email.sender} · {formatDate(item.email.date)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-[#fda4af]">{item.guardrail.reason}</p>
                  <p className="mt-1 line-clamp-3 text-[0.72rem] leading-relaxed text-muted-foreground">
                    {item.email.body}
                  </p>
                  <p className="mt-2 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                    Confidence {Math.round(item.guardrail.confidence * 100)}%
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </motion.aside>
    </>
  );
}
