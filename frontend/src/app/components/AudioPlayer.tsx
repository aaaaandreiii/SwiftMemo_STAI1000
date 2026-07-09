import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Play, Pause, SkipBack, SkipForward, X, Volume2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Announcement } from "../data";
import { getSummaryAudio } from "../api";

interface AudioPlayerProps {
  track: Announcement | null;
  tenantId: string;
  onClose: () => void;
}

const SPEEDS = [1, 1.25, 1.5];

export function AudioPlayer({ track, tenantId, onClose }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [duration, setDuration] = useState(1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fallback, setFallback] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!track) {
      setAudioUrl(null);
      setProgress(0);
      setPlaying(false);
      setFallback(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setFallback(false);
    setProgress(0);
    setPlaying(false);

    getSummaryAudio(tenantId, track.summaryId)
      .then(({ blob, fallback: isFallback }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
        setFallback(isFallback);
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error("Audio summary failed", {
          description: error instanceof Error ? error.message : "Unexpected error",
        });
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [onClose, tenantId, track]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = speed;
  }, [speed, audioUrl]);

  useEffect(() => {
    if (!audioUrl || !audioRef.current) return;
    audioRef.current
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, [audioUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setPlaying(true));
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seekBy = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), duration);
  };

  const cur = Math.floor(progress * duration);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <AnimatePresence>
      {track && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="glass fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl"
        >
          <audio
            ref={audioRef}
            src={audioUrl ?? undefined}
            onLoadedMetadata={(event) => {
              const nextDuration = event.currentTarget.duration;
              setDuration(Number.isFinite(nextDuration) ? nextDuration : 1);
            }}
            onTimeUpdate={(event) => {
              const audio = event.currentTarget;
              const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 1;
              setProgress(nextDuration > 0 ? audio.currentTime / nextDuration : 0);
            }}
            onEnded={() => {
              setPlaying(false);
              setProgress(1);
            }}
          />

          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#10b981]/15 text-[#34d399]">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Volume2 className="h-5 w-5" />}
          </span>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-sm">
                <span className="text-muted-foreground">
                  {loading ? "Loading audio" : fallback ? "Preview audio" : "Briefing"} ·{" "}
                </span>
                {track.title}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {fmt(cur)} / {fmt(Math.floor(duration))}
              </span>
            </div>

            {/* Waveform / progress */}
            <div className="relative flex h-6 items-center gap-[2px] overflow-hidden">
              {Array.from({ length: 64 }).map((_, i) => {
                const active = i / 64 <= progress;
                const h = 20 + Math.abs(Math.sin(i * 0.7)) * 70;
                return (
                  <motion.span
                    key={i}
                    className="w-full rounded-full"
                    animate={
                      playing && active
                        ? { scaleY: [1, 0.5 + Math.abs(Math.sin(i)) * 0.8, 1] }
                        : {}
                    }
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.02 }}
                    style={{
                      height: `${h}%`,
                      background: active ? "#10b981" : "rgba(255,255,255,0.12)",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Controls */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => seekBy(-5)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              onClick={togglePlay}
              disabled={!audioUrl}
              className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#006432] to-[#10b981] text-white shadow-[0_4px_16px_-4px_rgba(16,185,129,0.7)] disabled:opacity-60"
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
            <button
              onClick={() => seekBy(5)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
              className="ml-1 rounded-lg border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              {speed}x
            </button>
            <button
              onClick={onClose}
              className="ml-1 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-[#f43f5e]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
