"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { Plus, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/layout/PageHeader";
import { useNavTransition } from "@/components/NavProgress";

interface GapContinuation {
  sans: string[];
  count: number;
  sampleGameUrls: string[];
}

interface AggregatedGap {
  positionFen: string;
  opponentMove: string | null;
  precedingSans: string[];
  occurrences: number;
  sampleGameUrls: string[];
  // Top sub-lines played against the user from this gap position. Sorted
  // desc by count. May be undefined when restoring a result persisted
  // before this field existed — UI should treat it as [].
  continuations?: GapContinuation[];
}

interface GapResult {
  gamesFetched: number;
  gamesAnalyzed: number;
  whiteGaps: AggregatedGap[];
  blackGaps: AggregatedGap[];
  errors: string[];
}

interface PersistedState {
  chesscomUsername: string;
  lichessUsername: string;
  color: "white" | "black" | "both";
  timeClasses: string[];
  minRating: string;
  maxRating: string;
  maxGames: string;
  result: GapResult | null;
}

const TIME_CLASS_OPTIONS: { key: string; label: string }[] = [
  { key: "bullet", label: "Bullet" },
  { key: "blitz", label: "Blitz" },
  { key: "rapid", label: "Rapid" },
  { key: "classical", label: "Classical" },
];

// Pulling games is a 10–30s round-trip we don't want to repeat every
// time the user pops back into /gaps from another tab in the app. We
// stash the last submitted inputs + result in sessionStorage so the
// page rehydrates on mount and the user picks up where they left off.
// sessionStorage (rather than localStorage) is deliberate: clears when
// the tab closes so stale data doesn't haunt them across days.
const SESSION_KEY = "gapAnalysisState";

function readPersisted(): Partial<PersistedState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return null;
  }
}

function writePersisted(state: PersistedState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    /* quota or serialization failure — just drop the persist */
  }
}

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
  // Phase + progress drive the visible bar. `null` = no analysis in
  // flight. `processed`/`total` are populated from the analysis-phase
  // events; the fetch phase shows an indeterminate state instead.
  const [progress, setProgress] = useState<
    | null
    | {
        phase: "fetching" | "analyzing";
        message: string;
        processed?: number;
        total?: number;
      }
  >(null);
  // Ref so the Cancel handler can reach the in-flight controller
  // without re-rendering on every progress tick.
  const abortRef = useRef<AbortController | null>(null);

  // Rehydrate inputs + last result on first mount. Guarded by a ref via
  // dependency-less useEffect — we don't want it running again after the
  // user has started editing.
  useEffect(() => {
    const persisted = readPersisted();
    if (!persisted) return;
    if (typeof persisted.chesscomUsername === "string")
      setChesscomUsername(persisted.chesscomUsername);
    if (typeof persisted.lichessUsername === "string")
      setLichessUsername(persisted.lichessUsername);
    if (
      persisted.color === "white" ||
      persisted.color === "black" ||
      persisted.color === "both"
    )
      setColor(persisted.color);
    if (Array.isArray(persisted.timeClasses))
      setTimeClasses(
        persisted.timeClasses.filter(
          (t): t is string => typeof t === "string",
        ),
      );
    if (typeof persisted.minRating === "string")
      setMinRating(persisted.minRating);
    if (typeof persisted.maxRating === "string")
      setMaxRating(persisted.maxRating);
    if (typeof persisted.maxGames === "string")
      setMaxGames(persisted.maxGames);
    if (persisted.result) setResult(persisted.result);
  }, []);

  // useNavTransition wraps router.push in a transition so the global
  // progress bar tracks the back-nav. No router.refresh — see
  // StatsClient.handleBack for the full rationale.
  const [, navigate] = useNavTransition();
  const handleBack = () => navigate("/home");

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
    setProgress({ phase: "fetching", message: "Starting…" });

    // Tear down any prior in-flight request — defensive: the UI guards
    // against double-submits via `disabled={loading}` but the user
    // could rapid-click before React commits the disable.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/gap-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
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

      if (!res.ok || !res.body) {
        // Fall back to JSON error envelope for non-streaming errors
        // (401/400 short-circuits in the route).
        let msg = "Analysis failed";
        try {
          const data = await res.json();
          if (typeof data?.error === "string") msg = data.error;
        } catch {
          /* leave default */
        }
        setError(msg);
        return;
      }

      // NDJSON stream: parse line-by-line. Last line may not have a
      // trailing newline if the writer closed mid-line — flush whatever
      // is left in the buffer when reader.done fires.
      let finalResult: GapResult | null = null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl = buffer.indexOf("\n");
        while (nl !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf("\n");
          if (!line) continue;
          try {
            const event = JSON.parse(line) as
              | { type: "fetching"; platform: "chesscom" | "lichess" }
              | { type: "fetched"; platform: "chesscom" | "lichess"; games: number }
              | { type: "analyzing"; total: number }
              | { type: "analysis-progress"; processed: number; total: number }
              | { type: "result" } & GapResult
              | { type: "aborted" }
              | { type: "error"; error: string };
            if (event.type === "fetching") {
              setProgress({
                phase: "fetching",
                message: `Fetching games from ${event.platform === "chesscom" ? "chess.com" : "Lichess"}…`,
              });
            } else if (event.type === "fetched") {
              setProgress({
                phase: "fetching",
                message: `Fetched ${event.games} games from ${event.platform === "chesscom" ? "chess.com" : "Lichess"}.`,
              });
            } else if (event.type === "analyzing") {
              setProgress({
                phase: "analyzing",
                message: `Analyzing ${event.total} games…`,
                processed: 0,
                total: event.total,
              });
            } else if (event.type === "analysis-progress") {
              setProgress({
                phase: "analyzing",
                message: `Analyzing games (${event.processed}/${event.total})…`,
                processed: event.processed,
                total: event.total,
              });
            } else if (event.type === "result") {
              const { type, ...payload } = event;
              void type;
              finalResult = payload as GapResult;
            } else if (event.type === "aborted") {
              setError("Analysis canceled.");
              return;
            } else if (event.type === "error") {
              setError(event.error);
              return;
            }
          } catch {
            /* malformed line — ignore so a single bad write doesn't
               nuke the whole run. */
          }
        }
      }

      if (finalResult) {
        setResult(finalResult);
        writePersisted({
          chesscomUsername,
          lichessUsername,
          color,
          timeClasses,
          minRating,
          maxRating,
          maxGames,
          result: finalResult,
        });
      }
    } catch (err) {
      // AbortError is the user clicking Cancel — surface a friendly
      // message instead of "The user aborted a request."
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Analysis canceled.");
      } else {
        setError(err instanceof Error ? err.message : "Network error");
      }
    } finally {
      setLoading(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  // Cancel an in-flight analysis if the user navigates away — leaves no
  // zombie upstream fetches running on the server.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Explicit reset — clears the persisted state too so the next visit
  // starts blank rather than re-showing stale data.
  const handleClear = () => {
    setResult(null);
    setError(null);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <AppPage onLogoClick={handleBack}>
      <PageHeader
        title="Repertoire gaps"
        subtitle="Find positions you face often that aren't in your repertoire."
        accent={{ icon: Radar, label: "Gaps" }}
        onBack={handleBack}
      />

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
                {/* min-w-0 on each input lets them shrink inside the flex
                    parent on narrow phones — without it browsers respect
                    a number-input default min-width and the second field
                    overflows the card edge. */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={minRating}
                    onChange={(e) => setMinRating(e.target.value)}
                    placeholder="min"
                    className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <span className="text-muted-foreground flex-shrink-0">
                    –
                  </span>
                  <input
                    type="number"
                    value={maxRating}
                    onChange={(e) => setMaxRating(e.target.value)}
                    placeholder="max"
                    className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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

            <div className="flex items-center gap-3 pt-1 flex-wrap">
              <Button
                onClick={handleAnalyze}
                disabled={loading}
                className="btn-primary-gradient">
                {loading ? "Analyzing…" : "Analyze games"}
              </Button>
              {loading && (
                <Button onClick={handleCancel} variant="outline">
                  Cancel
                </Button>
              )}
              {result && !loading && (
                <Button
                  onClick={handleClear}
                  variant="outline"
                  disabled={loading}>
                  Clear results
                </Button>
              )}
              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
            </div>

            {/* Progress strip — only visible while a run is in flight.
                We show a labeled bar; analysis events provide a real
                percentage, fetch events stay indeterminate (striped). */}
            {loading && progress && (
              <div className="space-y-1.5 pt-1" data-testid="gap-progress">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {progress.message}
                  </p>
                  {progress.phase === "analyzing" &&
                    progress.total != null &&
                    progress.total > 0 && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {Math.floor(
                          ((progress.processed ?? 0) / progress.total) * 100,
                        )}
                        %
                      </p>
                    )}
                </div>
                <div className="h-1.5 w-full rounded-full overflow-hidden bg-surface-2/60">
                  {progress.phase === "analyzing" &&
                  progress.total != null &&
                  progress.total > 0 ? (
                    <div
                      className="h-full bg-primary transition-[width] duration-200 ease-out"
                      style={{
                        width: `${Math.min(
                          100,
                          ((progress.processed ?? 0) / progress.total) * 100,
                        )}%`,
                      }}
                    />
                  ) : (
                    <div className="h-full w-1/3 bg-primary/70 animate-pulse" />
                  )}
                </div>
              </div>
            )}
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
    </AppPage>
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
  // Sub-line rows are collapsed by default — most users only care
  // about the broad "1...c5" count. Power users can expand to see
  // which 2nd / 3rd move continuations are pushing them out of book.
  const [expanded, setExpanded] = useState(false);

  // Build a short label like "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 — Ba4" so the
  // user can see at a glance which line we're talking about.
  const label = describeLine(gap.precedingSans);
  const continuations = gap.continuations ?? [];
  const handleAdd = () => {
    sessionStorage.setItem(
      "buildSanMoves",
      JSON.stringify(gap.precedingSans),
    );
    router.push(`/build/${color}`);
  };

  // Letting the user prep against the EXACT sub-line (gap moves +
  // continuation) means clicking "Add" on a continuation should seed
  // the Build screen with the longer path, not just the gap.
  const handleAddContinuation = (cont: GapContinuation) => {
    sessionStorage.setItem(
      "buildSanMoves",
      JSON.stringify([...gap.precedingSans, ...cont.sans]),
    );
    router.push(`/build/${color}`);
  };

  return (
    <li className="px-4 py-3 hover:bg-surface-2/30 transition-colors">
      <div className="flex items-start gap-3">
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
              Opponent&apos;s last move:{" "}
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
          {continuations.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              data-testid="gap-toggle-continuations"
              className="text-[10px] text-primary hover:underline mt-1">
              {expanded
                ? `Hide ${continuations.length} sub-line${continuations.length === 1 ? "" : "s"}`
                : `Show ${continuations.length} sub-line${continuations.length === 1 ? "" : "s"} ↓`}
            </button>
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
      </div>
      {expanded && continuations.length > 0 && (
        <ul
          className="mt-2 ml-15 pl-3 border-l border-border/40 space-y-1.5"
          data-testid="gap-continuations">
          {continuations.map((cont, i) => (
            <li
              key={i}
              className="flex items-center gap-3 text-[11px]"
              data-testid="gap-continuation-row">
              <span className="inline-flex items-center justify-center min-w-[2.25rem] h-6 px-1.5 rounded-md bg-surface-2/60 text-muted-foreground font-semibold tabular-nums">
                ×{cont.count}
              </span>
              <span className="flex-1 font-mono text-foreground break-words">
                {describeContinuation(gap.precedingSans, cont.sans)}
              </span>
              {cont.sampleGameUrls.length > 0 && (
                <a
                  href={cont.sampleGameUrls[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-primary hover:underline flex-shrink-0">
                  example ↗
                </a>
              )}
              <button
                type="button"
                onClick={() => handleAddContinuation(cont)}
                className="text-[10px] text-primary hover:underline flex-shrink-0"
                title="Open this exact sub-line in Build">
                Add line
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Render the continuation as the SAN tail that follows the gap line, so
// the user reads it as a contiguous variation. Numbers continue from
// wherever the gap ended (precedingSans length determines parity).
function describeContinuation(
  precedingSans: string[],
  contSans: string[],
): string {
  if (contSans.length === 0) return "(no further moves recorded)";
  const startPly = precedingSans.length;
  const parts: string[] = [];
  for (let i = 0; i < contSans.length; i++) {
    const ply = startPly + i;
    const moveNumber = Math.floor(ply / 2) + 1;
    if (ply % 2 === 0) {
      parts.push(`${moveNumber}.${contSans[i]}`);
    } else if (i === 0) {
      // First ply of continuation is black-to-move — emit "1...Nf6" so
      // the move number isn't lost when the line opens mid-pair.
      parts.push(`${moveNumber}...${contSans[i]}`);
    } else {
      parts.push(contSans[i]);
    }
  }
  return parts.join(" ");
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
