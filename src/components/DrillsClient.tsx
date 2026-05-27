"use client";

/**
 * Drill dashboard: list active Woodpecker drills + create new ones.
 *
 * A "drill" is a fixed set of N puzzles cycled until automatic — the
 * Woodpecker Method (Smith & Tikkanen 2018). The pedagogical bet is that
 * cycling builds pattern fluency much faster than chewing through fresh
 * puzzles forever, because the brain encodes a pattern only when it sees
 * it often enough in a tight window.
 *
 * This screen is intentionally lean: the value is in the solving view,
 * not the management UI.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Plus, Repeat2, Trash2 } from "lucide-react";
import { useNavTransition } from "@/components/NavProgress";
import { Button } from "@/components/ui/button";
import {
  CANONICAL_MOTIFS,
  MOTIF_LABELS,
  type CanonicalMotif,
} from "@/lib/motifs";

interface DrillSummary {
  id: string;
  motif: string;
  size: number;
  cycle: number;
  targetCycles: number;
  position: number;
  baselineMs: number | null;
  lastCycleMs: number | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

interface DrillsResponse {
  active: DrillSummary[];
  recentCompleted: DrillSummary[];
}

const SIZES: Array<{ value: 20 | 50 | 100; label: string; hint: string }> = [
  { value: 20, label: "20 puzzles", hint: "Try it out (~15 min/cycle)" },
  { value: 50, label: "50 puzzles", hint: "Standard (~45 min/cycle)" },
  { value: 100, label: "100 puzzles", hint: "Serious (~90 min/cycle)" },
];

function formatMotif(motif: string): string {
  if (motif === "mixed") return "Mixed";
  return MOTIF_LABELS[motif as CanonicalMotif] ?? motif;
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DrillsClient() {
  const [, navigate] = useNavTransition();
  const [data, setData] = useState<DrillsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [motif, setMotif] = useState<string>("mixed");
  const [size, setSize] = useState<20 | 50 | 100>(50);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/drills");
      if (res.ok) {
        const d = (await res.json()) as DrillsResponse;
        setData(d);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motif, size }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to create drill");
        return;
      }
      navigate(`/tactics/drills/${body.id}`);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleAbandon = async (id: string) => {
    try {
      const res = await fetch(`/api/drills/${id}`, { method: "DELETE" });
      if (res.ok) refresh();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading drills…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-10 space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/tactics")}
            className="-ml-2">
            <ChevronLeft size={18} className="mr-1" />
            Tactics
          </Button>
          <div className="flex items-center gap-2">
            <Repeat2 size={18} className="text-primary" />
            <h1 className="text-lg font-semibold text-foreground">
              Woodpecker Drills
            </h1>
          </div>
          <div className="w-[88px]" />
        </div>

        <p className="text-sm text-muted-foreground leading-snug">
          Pick a small set of puzzles, then cycle through them until you can
          solve each one fast. By cycle 5 you should be ~5× faster — that&apos;s
          the pattern moving from calculation into recognition. Completed
          drills are added to your review queue at 14 days so they stay sharp.
        </p>

        <section className="glass-card rounded-2xl p-4 lg:p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Start a new drill
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                Motif
              </label>
              <select
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="mixed">Mixed (any motif)</option>
                {CANONICAL_MOTIFS.map((m) => (
                  <option key={m} value={m}>
                    {MOTIF_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                Size
              </label>
              <select
                value={size}
                onChange={(e) =>
                  setSize(Number(e.target.value) as 20 | 50 | 100)
                }
                className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                {SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label} — {s.hint}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <p className="text-xs text-rose-400/90 leading-snug">{error}</p>
          )}
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="btn-primary-gradient">
            <Plus size={16} className="mr-2" />
            {creating ? "Creating…" : "Create drill"}
          </Button>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Active ({data?.active.length ?? 0})
          </h2>
          {data?.active.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No active drills. Start one above.
            </p>
          )}
          <ul className="space-y-2">
            {data?.active.map((d) => (
              <li
                key={d.id}
                className="glass-card rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {formatMotif(d.motif)} · {d.size} puzzles
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cycle {d.cycle}/{d.targetCycles} · Position {d.position}/
                    {d.size}
                    {d.lastCycleMs && (
                      <>
                        {" "}
                        · Last cycle {formatMs(d.lastCycleMs)}
                        {d.baselineMs && (
                          <>
                            {" "}
                            <span className="text-emerald-400/80">
                              (
                              {(
                                (d.baselineMs / Math.max(1, d.lastCycleMs)) *
                                1
                              ).toFixed(1)}
                              × baseline)
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    onClick={() => navigate(`/tactics/drills/${d.id}`)}>
                    Resume
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleAbandon(d.id)}
                    title="Abandon">
                    <Trash2 size={16} className="text-muted-foreground" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {data && data.recentCompleted.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recently completed
            </h2>
            <ul className="space-y-2">
              {data.recentCompleted.map((d) => {
                const speedup =
                  d.baselineMs && d.lastCycleMs && d.lastCycleMs > 0
                    ? d.baselineMs / d.lastCycleMs
                    : null;
                return (
                  <li
                    key={d.id}
                    className="glass-card rounded-xl p-4 flex items-center justify-between gap-3 opacity-80">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {formatMotif(d.motif)} · {d.size} puzzles
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Baseline {formatMs(d.baselineMs)} → final{" "}
                        {formatMs(d.lastCycleMs)}
                        {speedup && (
                          <>
                            {" "}
                            <span className="text-emerald-400/80">
                              ({speedup.toFixed(1)}× faster)
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
