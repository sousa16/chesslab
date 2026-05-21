"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { ChevronLeft, Plus, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";

interface AggregatedGap {
  positionFen: string;
  opponentMove: string | null;
  precedingSans: string[];
  occurrences: number;
  sampleGameUrls: string[];
}

interface GapResult {
  gamesFetched: number;
  gamesAnalyzed: number;
  whiteGaps: AggregatedGap[];
  blackGaps: AggregatedGap[];
  errors: string[];
}

const TIME_CLASS_OPTIONS: { key: string; label: string }[] = [
  { key: "bullet", label: "Bullet" },
  { key: "blitz", label: "Blitz" },
  { key: "rapid", label: "Rapid" },
  { key: "classical", label: "Classical" },
];

export default function GapAnalysisClient() {
  const router = useRouter();
  const [chesscomUsername, setChesscomUsername] = useState("");
  const [lichessUsername, setLichessUsername] = useState("");
  const [color, setColor] = useState<"white" | "black" | "both">("both");
  const [timeClasses, setTimeClasses] = useState<string[]>([
    "blitz",
    "rapid",
    "classical",
  ]);
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const [maxGames, setMaxGames] = useState("200");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleBack = () => {
    router.push("/home");
    router.refresh();
  };

  const toggleTimeClass = (key: string) => {
    setTimeClasses((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
  };

  const handleAnalyze = async () => {
    setError(null);
    setResult(null);
    if (!chesscomUsername.trim() && !lichessUsername.trim()) {
      setError("Enter a chess.com or Lichess username.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/gap-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chesscomUsername: chesscomUsername.trim() || undefined,
          lichessUsername: lichessUsername.trim() || undefined,
          color,
          timeClasses: timeClasses.length > 0 ? timeClasses : undefined,
          minRating: minRating ? Number(minRating) : undefined,
          maxRating: maxRating ? Number(maxRating) : undefined,
          maxGames: Number(maxGames) || 200,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed");
      } else {
        setResult(data as GapResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col lg:flex-row overflow-hidden">
      <MobileNav
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onLogoClick={handleBack}
      />
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <main className="flex-1 min-w-0 h-below-nav lg:h-screen mt-nav lg:mt-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6 lg:py-10 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="hidden lg:block">
                <Logo size="lg" clickable={true} onLogoClick={handleBack} />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="rounded-xl">
                <ChevronLeft size={20} />
              </Button>
              <div>
                <h1 className="text-2xl lg:text-3xl font-semibold text-foreground">
                  Repertoire gaps
                </h1>
                <p className="text-xs lg:text-sm text-muted-foreground mt-1">
                  Find positions you face often that aren't in your repertoire.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium uppercase tracking-wide">
              <Radar size={12} />
              Gaps
            </div>
          </div>

          {/* Form */}
          <section className="glass-card rounded-2xl p-4 lg:p-6 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Field label="chess.com username">
                <input
                  value={chesscomUsername}
                  onChange={(e) => setChesscomUsername(e.target.value)}
                  placeholder="e.g. sousa16"
                  className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </Field>
              <Field label="Lichess username">
                <input
                  value={lichessUsername}
                  onChange={(e) => setLichessUsername(e.target.value)}
                  placeholder="e.g. yourLichessName"
                  className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Field label="Color you played">
                <div className="flex gap-1">
                  {(["white", "black", "both"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`flex-1 h-9 rounded-lg text-xs font-medium border capitalize transition-colors ${
                        color === c
                          ? "bg-primary/20 border-primary/40 text-foreground"
                          : "bg-surface-2/40 border-border/40 text-muted-foreground hover:bg-surface-2"
                      }`}>
                      {c}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Rating range">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={minRating}
                    onChange={(e) => setMinRating(e.target.value)}
                    placeholder="min"
                    className="flex-1 h-9 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <span className="text-muted-foreground">–</span>
                  <input
                    type="number"
                    value={maxRating}
                    onChange={(e) => setMaxRating(e.target.value)}
                    placeholder="max"
                    className="flex-1 h-9 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </Field>
              <Field label="Max games">
                <input
                  type="number"
                  value={maxGames}
                  onChange={(e) => setMaxGames(e.target.value)}
                  placeholder="200"
                  className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </Field>
            </div>

            <Field label="Time controls">
              <div className="flex flex-wrap gap-2">
                {TIME_CLASS_OPTIONS.map((tc) => {
                  const on = timeClasses.includes(tc.key);
                  return (
                    <button
                      key={tc.key}
                      onClick={() => toggleTimeClass(tc.key)}
                      className={`px-3 h-8 rounded-lg text-xs font-medium border transition-colors ${
                        on
                          ? "bg-primary/20 border-primary/40 text-foreground"
                          : "bg-surface-2/40 border-border/40 text-muted-foreground hover:bg-surface-2"
                      }`}>
                      {tc.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={handleAnalyze}
                disabled={loading}
                className="btn-primary-gradient">
                {loading ? "Analyzing…" : "Analyze games"}
              </Button>
              {loading && (
                <p className="text-xs text-muted-foreground">
                  This can take 10–30 seconds while we pull and replay
                  games.
                </p>
              )}
              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
            </div>
          </section>

          {/* Results */}
          {result && (
            <section className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <StatTile
                  label="Games fetched"
                  value={result.gamesFetched.toString()}
                />
                <StatTile
                  label="Games analyzed"
                  value={result.gamesAnalyzed.toString()}
                />
              </div>

              {result.errors.length > 0 && (
                <div className="glass-card rounded-xl p-3 lg:p-4 border border-amber-500/30 bg-amber-500/5">
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
                    Notes
                  </p>
                  <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <GapList
                title="Gaps when you played White"
                gaps={result.whiteGaps}
                color="white"
                router={router}
              />
              <GapList
                title="Gaps when you played Black"
                gaps={result.blackGaps}
                color="black"
                router={router}
              />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] lg:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      {children}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-3 lg:p-4">
      <p className="text-[10px] lg:text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="text-xl lg:text-2xl font-semibold text-foreground tabular-nums mt-1">
        {value}
      </p>
    </div>
  );
}

function GapList({
  title,
  gaps,
  color,
  router,
}: {
  title: string;
  gaps: AggregatedGap[];
  color: "white" | "black";
  // Loose-typed router so this nested component doesn't pull
  // useRouter into its own scope.
  router: ReturnType<typeof useRouter>;
}) {
  if (gaps.length === 0) return null;
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Each row is a position you reached but had no saved response
          for. Higher counts = more urgent to add.
        </p>
      </div>
      <ul className="divide-y divide-border/30">
        {gaps.slice(0, 50).map((g, i) => (
          <GapRow key={i} gap={g} color={color} router={router} />
        ))}
      </ul>
    </div>
  );
}

function GapRow({
  gap,
  color,
  router,
}: {
  gap: AggregatedGap;
  color: "white" | "black";
  router: ReturnType<typeof useRouter>;
}) {
  // Build a short label like "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 — Ba4" so the
  // user can see at a glance which line we're talking about.
  const label = describeLine(gap.precedingSans);
  const handleAdd = () => {
    sessionStorage.setItem(
      "buildSanMoves",
      JSON.stringify(gap.precedingSans),
    );
    router.push(`/build/${color}`);
  };
  return (
    <li className="px-4 py-3 flex items-start gap-3 hover:bg-surface-2/30 transition-colors">
      <div className="flex-shrink-0 w-12 text-right">
        <span className="inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 rounded-lg bg-amber-500/15 text-amber-400 text-sm font-semibold tabular-nums">
          ×{gap.occurrences}
        </span>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-xs font-mono text-foreground break-words">
          {label}
        </p>
        {gap.opponentMove && (
          <p className="text-[11px] text-muted-foreground">
            Opponent's last move:{" "}
            <span className="text-foreground font-mono">
              {gap.opponentMove}
            </span>
          </p>
        )}
        {gap.sampleGameUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {gap.sampleGameUrls.slice(0, 3).map((u, i) => (
              <a
                key={i}
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary hover:underline">
                game {i + 1} ↗
              </a>
            ))}
          </div>
        )}
      </div>
      <Button
        size="sm"
        onClick={handleAdd}
        className="btn-primary-gradient flex-shrink-0"
        title="Open in Build to add a response">
        <Plus size={14} className="mr-1" />
        Add
      </Button>
    </li>
  );
}

function describeLine(sans: string[]): string {
  if (sans.length === 0) return "(starting position)";
  // Replay just to be sure we present canonical SAN; PGN parsing already
  // gave us canonical strings but this guards against odd input.
  try {
    const c = new Chess();
    const out: string[] = [];
    for (let i = 0; i < sans.length; i++) {
      const m = c.move(sans[i]);
      if (!m) break;
      if (i % 2 === 0) out.push(`${Math.floor(i / 2) + 1}.${m.san}`);
      else out.push(m.san);
    }
    return out.join(" ");
  } catch {
    return sans.join(" ");
  }
}
