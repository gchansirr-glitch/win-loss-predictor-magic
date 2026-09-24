import { useEffect, useState } from "react";
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

function dirOf(num: string): Direction {
  return Number.parseInt(num, 10) >= 5 ? "BIG" : "SMALL";
}

export function SignalsPanel() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      const [signalsResponse, historyResponse] = await Promise.allSettled([
        withTimeout(supabase.from("signals").select("*").order("created_at", { ascending: false }).limit(20)),
        withTimeout(supabase.from("game_history").select("*").order("created_at", { ascending: false }).limit(50)),
      ]);
      if (!alive) return;

      const signalsSucceeded = signalsResponse.status === "fulfilled" && !signalsResponse.value.error;
      const signalRows = signalsSucceeded ? signalsResponse.value.data ?? [] : null;
      const list: Signal[] = signalRows
        ? signalRows.map((row: Record<string, unknown>, index: number) => {
            const direction = String(row.website_direction ?? row.direction ?? row.prediction ?? row.signal ?? "").toUpperCase();
            return {
              signalId: String(row.signal_id ?? row.id ?? `signal-${index}`),
              period: String(row.transaction_no ?? row.period ?? row.transaction_number ?? ""),
              sourceDirection: String(row.source_direction ?? direction).toUpperCase() as Direction,
              direction: (direction === "BIG" ? "BIG" : "SMALL") as Direction,
              level: Number(row.level ?? row.step ?? 1),
              sourceText: String(row.source_text ?? ""),
              postedAt: String(row.posted_at ?? row.created_at ?? ""),
              winChance: Number(row.win_rate ?? row.win_chance ?? NaN),
            };
          }).filter((row) => row.period)
        : signals;

      const historyRows = historyResponse.status === "fulfilled" && !historyResponse.value.error
        ? historyResponse.value.data ?? []
        : null;
      const historyResults: ResultRow[] = historyRows
        ? historyRows.map((row: Record<string, unknown>) => ({
            issueNumber: String(row.transaction_no ?? row.period ?? ""),
            number: String(row.result ?? row.number ?? ""),
            blockTimestamp: Number(row.block_timestamp ?? 0),
          })).filter((row: ResultRow) => row.issueNumber && /^[0-9]$/.test(row.number))
        : results;
      const byIssue = new Map<string, ResultRow>();
      historyResults.forEach((row) => byIssue.set(row.issueNumber, row));
      const loadedResults = [...byIssue.values()].sort((a, b) =>
        (Number(b.issueNumber) || 0) - (Number(a.issueNumber) || 0),
      );
      setSignals(list);
      setResults(loadedResults);
      setError(list.length ? null : "No signals yet");
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // The API already returns the immutable channel snapshot with the
  // website's inverted direction. Do not recalculate it from client results:
  // that was the source of different signals for different visitors.
  const rows = signals.map((signal) => {
    // Signals may carry the short round suffix while Game History carries the
    // full transaction number. Resolve the suffix only when it identifies one
    // fetched history row; otherwise keep the signal PENDING.
    const exact = results.find((result) => result.issueNumber === signal.period);
    const suffixMatches = exact
      ? []
      : results.filter((result) => result.issueNumber.endsWith(signal.period));
    const matched = exact ?? (suffixMatches.length === 1 ? suffixMatches[0] : undefined);
    const num = matched?.number;
    const actual = num == null ? null : dirOf(num);
    const outcome = actual == null ? null : actual === signal.direction ? "WIN" : "LOSS";
    // The channel posts only the short tail (for example TRX 91). Rebuild the
    // full transaction number from the result feed: the matched issue when the
    // round has settled, otherwise the current day's prefix plus the tail.
    const latestIssue = results[0]?.issueNumber;
    const fullPeriod =
      matched?.issueNumber ??
      (latestIssue && latestIssue.length > signal.period.length
        ? latestIssue.slice(0, latestIssue.length - signal.period.length) + signal.period
        : signal.period);
    return { ...signal, num, outcome, fullPeriod };
  });

  // Never invent a probability on the client. Use the database value when it
  // exists; otherwise leave the field unavailable instead of showing 65%.
  const withChance = rows.map((row) => ({
    ...row,
    winChance: Number.isFinite(row.winChance) ? row.winChance : null,
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
                 Win chance: {latest.winChance == null ? "—" : `${latest.winChance}%`}
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
                   {r.winChance == null ? "—" : `${r.winChance}%`}
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
                     {r.outcome ?? "PENDING"} {r.num ? `(${r.num})` : ""}
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
