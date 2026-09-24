import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BIG_IMG = "https://i.ibb.co/TM6j75MY/file-00000000cadc81fa82560b83392af859.png";
const SMALL_IMG = "https://i.ibb.co/KzKMFjGZ/file-000000002a8881faa2dbc928498411ad.png";

type Direction = "BIG" | "SMALL";
type Signal = {
  signalId: string;
  period: string;
  sourceDirection: Direction;
  direction: Direction;
  level: number;
  sourceText: string;
  postedAt: string | null;
  winChance?: number | null;
};
type ResultRow = { issueNumber: string; number: string; blockTimestamp: number };
type HistoryRow = { issueNumber: string; number: string; blockTimestamp: number };

function dirOf(num: string): Direction {
  return Number.parseInt(num, 10) >= 5 ? "BIG" : "SMALL";
}

function dynamicWinChance(signal: Signal, index: number, rows: Array<{ outcome: string }>, results: ResultRow[]): number {
  let calculatedChance = 68;
  let consecutiveLosses = 0;
  for (let i = index + 1; i < rows.length && rows[i].outcome !== "PENDING"; i += 1) {
    if (rows[i].outcome !== "LOSS") break;
    consecutiveLosses += 1;
  }
  calculatedChance += consecutiveLosses >= 3 ? 20 : consecutiveLosses * 7;
  calculatedChance += Math.max(0, signal.level - 1) * 2;

  const recent = results.slice(0, 10);
  const alignedCount = recent.filter((result) => dirOf(result.number) === signal.direction).length;
  if (alignedCount >= 8) calculatedChance += 15;
  else if (alignedCount === 7) calculatedChance += 10;
  else if (alignedCount === 6) calculatedChance += 6;
  else if (alignedCount < 4) calculatedChance -= 5;

  return Math.min(99, Math.max(50, Math.round(calculatedChance)));
}

function timestampMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function SignalsPanel({ historyRows = [], liveResults = [] }: { historyRows?: HistoryRow[]; liveResults?: HistoryRow[] }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const hasCompletedInitialLoad = useRef(false);

  useEffect(() => {
    let alive = true;
    const withTimeout = async <T,>(promise: Promise<T>, ms = 3000): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error("request timeout")), ms);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    const load = async () => {
      const [signalsApiResponse, liveResultsResponse, historyResponse, resultsApiResponse, snapshotsResponse] = await Promise.allSettled([
        withTimeout(fetch(`/api/public/signals?t=${Date.now()}`, { cache: "no-store" }).then(async (response) => {
          if (!response.ok) throw new Error(`signals ${response.status}`);
          return response.json();
        })),
        withTimeout(fetch(`https://draw.ar-lottery01.com/TrxWinGo/TrxWinGo_1M/GetHistoryIssuePage.json?t=${Date.now()}`, { cache: "no-store" }).then(async (response) => {
          if (!response.ok) throw new Error(`live results ${response.status}`);
          return response.json();
        })),
        withTimeout(supabase.from("game_history").select("*").order("created_at", { ascending: false }).limit(100)),
        withTimeout(fetch(`/api/public/results?t=${Date.now()}`, { cache: "no-store" }).then(async (response) => {
          if (!response.ok) throw new Error(`results ${response.status}`);
          return response.json();
        })),
        withTimeout(supabase.from("result_snapshots").select("*").order("issue_number", { ascending: false }).limit(50)),
      ]);
      const directSignalsResponse = await withTimeout(
        supabase.from("signal_snapshots").select("*").order("captured_at", { ascending: false }).limit(20),
      ).catch(() => ({ data: [], error: null }));
      if (!alive) return;

      const apiPayload = signalsApiResponse.status === "fulfilled" ? signalsApiResponse.value : null;
      const livePayload = liveResultsResponse.status === "fulfilled" ? liveResultsResponse.value : null;
      const historyPayload = historyResponse.status === "fulfilled" ? historyResponse.value : null;
      const resultsPayload = resultsApiResponse.status === "fulfilled" ? resultsApiResponse.value : null;
      const liveRows = Array.isArray(livePayload?.data?.list)
        ? livePayload.data.list
        : Array.isArray(livePayload?.list) ? livePayload.list : [];
      const snapshotsPayload = snapshotsResponse.status === "fulfilled" ? snapshotsResponse.value : null;
      const directHistory = historyPayload && "data" in historyPayload && Array.isArray(historyPayload.data)
        ? historyPayload.data
        : [];
      const publicHistory = Array.isArray(resultsPayload?.data?.list) ? resultsPayload.data.list : [];
      const snapshotHistory = snapshotsPayload && "data" in snapshotsPayload && Array.isArray(snapshotsPayload.data)
        ? snapshotsPayload.data
        : [];
      const gameHistory = liveRows.length > 0
        ? liveRows
        : [...directHistory, ...publicHistory, ...snapshotHistory];
      const apiRows = Array.isArray(apiPayload?.list) ? apiPayload.list : null;
      const directRows = directSignalsResponse.data ?? [];
      const signalRows = apiRows ?? directRows;
      const list: Signal[] = signalRows
        ? signalRows.map((row: Record<string, unknown>, index: number) => {
            const direction = String(row.website_direction ?? row.direction ?? row.prediction ?? row.signal ?? "").toUpperCase();
            const normalizedDirection = direction === "B" || direction === "BIG" ? "BIG" : "SMALL";
            return {
              signalId: String(row.signal_id ?? row.id ?? `signal-${index}`),
              period: String(row.period ?? row.transaction_no ?? row.transaction_number ?? ""),
              sourceDirection: String(row.source_direction ?? normalizedDirection).toUpperCase() as Direction,
              direction: (apiRows ? normalizedDirection : normalizedDirection === "BIG" ? "SMALL" : "BIG") as Direction,
              level: Number(row.level ?? row.step ?? 1),
              sourceText: String(row.source_text ?? ""),
              postedAt: String(row.posted_at ?? row.created_at ?? ""),
              winChance: Number(row.win_chance ?? row.win_rate ?? row.accuracy),
            };
          }).filter((row) => row.period)
        : signals;

      const historyResults: ResultRow[] = gameHistory
        .map((row: Record<string, unknown>) => ({
          issueNumber: String(row.issue_number ?? row.issueNumber ?? row.transaction_no ?? row.period ?? "").trim(),
          number: String(row.result_number ?? row.number ?? row.result ?? "").trim(),
          blockTimestamp: timestampMs(row.block_timestamp ?? row.block_time ?? row.created_at),
        }))
        .filter((row: ResultRow) => /^\d+$/.test(row.issueNumber) && /^\d$/.test(row.number));
      const byIssue = new Map<string, ResultRow>();
      historyResults.forEach((row) => byIssue.set(row.issueNumber, row));
      const loadedResults = [...byIssue.values()]
        .reduce<ResultRow[]>((rows, row) => {
          if (!rows.some((existing) => existing.issueNumber === row.issueNumber)) rows.push(row);
          return rows;
        }, [])
        .sort((a, b) => (Number(b.issueNumber) || 0) - (Number(a.issueNumber) || 0));
      if (list.length > 0) {
        setSignals(list);
        setError(null);
      }
      if (loadedResults.length > 0) setResults(loadedResults);
      if (!hasCompletedInitialLoad.current) {
        hasCompletedInitialLoad.current = true;
        if (list.length === 0) setError("No signals yet");
      }
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const rows = signals.map((signal) => {
    const signalNo = String(signal.period ?? "").trim().replace(/\D/g, "");
    const latestIssue = results[0]?.issueNumber?.replace(/\D/g, "") ?? "";
    const activePrefix = latestIssue.slice(0, Math.max(0, latestIssue.length - 2));
    const round = signalNo.slice(-2).padStart(2, "0");
    const matched = results.find((result) => {
      const historyNo = String(result.issueNumber ?? "").trim().replace(/\D/g, "");
      const sameActiveDate = activePrefix ? historyNo.startsWith(activePrefix) : true;
      const roundMatch = historyNo.endsWith(round);
      return Boolean(historyNo && round && sameActiveDate && roundMatch);
    });
    const num = matched?.number;
    const actual = num == null ? null : dirOf(num);
    const prediction = String(signal.direction ?? "").toUpperCase();
    const outcome = matched && num != null && num !== ""
      ? actual === prediction ? "WIN" : "LOSS"
      : "PENDING";
    // The channel posts only the short tail (for example TRX 91). Rebuild the
    // full transaction number from the result feed: the matched issue when the
    // round has settled, otherwise the current day's prefix plus the tail.
    const displaySuffix = round;
    const fullPeriod = matched?.issueNumber ?? (activePrefix ? `${activePrefix}${displaySuffix}` : signal.period);
    return { ...signal, num, outcome, fullPeriod };
  });

  const withChance = rows.map((row, index) => ({
    ...row,
    winChance: dynamicWinChance(row, index, rows, results),
  }));

  const displayRows = withChance.slice(0, 10);
  const latest = withChance[0];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-gold">
          VIP Signals
        </h2>
      </div>

      {latest ? (
        <div className="overflow-hidden rounded-2xl border border-gold/40 bg-surface shadow-[0_0_40px_-16px_var(--gold)]">
          <img
             src={latest.direction === "BIG" ? BIG_IMG : SMALL_IMG}
             alt={`${latest.direction} signal`}
            className="w-full object-cover"
          />
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-display text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Transaction no
              </p>
               <p className="truncate font-display text-base font-bold tabular-nums">{latest.fullPeriod}</p>
               <p className="mt-1 text-[11px] font-bold text-emerald-400">
                 Win chance: {latest.winChance}%
               </p>
            </div>
             <span className="rounded-md bg-gold px-2 py-1 font-display text-[11px] font-bold uppercase tracking-widest text-background">
               {latest.direction}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
          {error ?? "Loading signals..."}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="px-2 py-3 text-left font-display font-bold">Transaction no</th>
               <th className="px-2 py-3 text-center font-display font-bold">Win chance</th>
              <th className="px-2 py-3 text-center font-display font-bold">Signal</th>
              <th className="px-2 py-3 text-right font-display font-bold">Result</th>
            </tr>
          </thead>
          <tbody>
             {displayRows.length === 0 && (
              <tr>
                <td colSpan={4} className="bg-surface px-3 py-6 text-center text-muted-foreground">
                  {error ?? "Loading signals..."}
                </td>
              </tr>
            )}
              {displayRows.map((r) => (
               <tr key={r.signalId} className="border-t border-border bg-surface">
                <td className="px-2 py-3 font-display text-[11px] tabular-nums">{r.fullPeriod}</td>
                 <td className="px-2 py-3 text-center font-display text-xs font-bold text-emerald-400 tabular-nums">
                   {r.winChance}%
                </td>
                <td className="px-2 py-3 text-center">
                  <span className="inline-flex flex-col items-center gap-1">
                    <img
                       src={r.direction === "BIG" ? BIG_IMG : SMALL_IMG}
                       alt={r.direction}
                      className="h-7 w-11 rounded object-cover"
                      loading="lazy"
                    />
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-right">
                  <span
                    className={`inline-block rounded-md px-2 py-1 font-display text-[11px] font-bold ${
                      r.outcome === "WIN"
                        ? "bg-emerald-500 text-background"
                        : r.outcome === "LOSS"
                          ? "bg-primary text-primary-foreground"
                          : "bg-pending text-pending-foreground"
                    }`}
                  >
                     {r.outcome ?? "PENDING"} {r.num != null && r.num !== "" ? `(${r.num})` : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
