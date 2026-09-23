import { createFileRoute } from "@tanstack/react-router";

const SOURCES = [
  "https://draw.ar-lottery01.com/TrxWinGo/TrxWinGo_1M/GetHistoryIssuePage.json",
];
const TELEGRAM_RESULTS = "https://t.me/s/saytalone_alpha_reverse_trx";

const REQUEST_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  referer: "https://vip-six-inky.vercel.app/",
};

type ResultRow = {
  issueNumber: string;
  number: string;
  color: string;
  size?: "BIG" | "SMALL";
  blockTimestamp: number;
};

async function fetchResults() {
  let lastStatus = 502;
  for (const source of SOURCES) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const separator = source.includes("?") ? "&" : "?";
        const res = await fetch(`${source}${separator}pageSize=100&pageNo=1&ts=${Date.now()}`, {
          headers: {
            accept: "application/json, text/plain, */*",
            "user-agent": REQUEST_HEADERS["user-agent"],
          },

        });
        lastStatus = res.status;
        if (res.ok) return res;
      } catch {
        lastStatus = 502;
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  throw new Error(`upstream ${lastStatus}`);
}

async function fetchTelegramResults(): Promise<ResultRow[]> {
  const res = await fetch(`${TELEGRAM_RESULTS}?t=${Date.now()}`, {
    headers: { ...REQUEST_HEADERS, accept: "text/html" },
  });
  if (!res.ok) throw new Error(`telegram upstream ${res.status}`);
  const html = await res.text();
  const rows: ResultRow[] = [];
  const pattern = /message_text[^>]*>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const text = (match[1] ?? "")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const result = text.match(/\b(\d{8,30})\s+(BIG|SMALL|B|S)\s*\((\d)\)/i);
    if (!result) continue;
    const time = html.slice(match.index, match.index + 1800).match(/<time\s+datetime="([^"]+)"/i)?.[1];
    rows.push({
      issueNumber: result[1],
      number: result[3],
      size: /^(?:BIG|B)$/i.test(result[2]) ? "BIG" : "SMALL",
      color: "",
      blockTimestamp: time ? Math.floor(Date.parse(time.replace(/:\s?(\d{2})\+/, ":$1+")) / 1000) : 0,
    });
  }
  return rows;
}

function normalizeRows(json: unknown): ResultRow[] {
  const payload = json as {
    data?: { list?: unknown[]; rows?: unknown[]; records?: unknown[] } | unknown[];
    list?: unknown[];
    rows?: unknown[];
  };
  const candidates = [
    Array.isArray(payload?.data) ? payload.data : null,
    payload?.data && !Array.isArray(payload.data) ? payload.data.list : null,
    payload?.data && !Array.isArray(payload.data) ? payload.data.rows : null,
    payload?.data && !Array.isArray(payload.data) ? payload.data.records : null,
    payload?.list,
    payload?.rows,
  ];
  const rows = candidates.find((value): value is unknown[] => Array.isArray(value)) ?? [];
  return rows.flatMap((value) => {
    const row = value as Record<string, unknown>;
    const issueNumber = row.issue ?? row.issueNumber ?? row.period ?? row.numberIssue;
    const number = row.result ?? row.number ?? row.winNumber ?? row.drawNumber;
    if (issueNumber == null || number == null) return [];
    return [
      {
        issueNumber: String(issueNumber),
        number: String(number),
        color: String(row.color ?? row.colour ?? ""),
        blockTimestamp: Number(row.blockTimestamp ?? row.blockTime ?? row.timestamp ?? 0),
      },
    ];
  });
}

export const Route = createFileRoute("/api/public/results")({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Server-only ingestion + reads use the service-role client, which
          // bypasses RLS. The anon key only has SELECT (and no INSERT) on
          // result_snapshots, so writing with it fails the RLS policy. This
          // route never ships to the client bundle, so the secret stays server-side.
          const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");

          // Fetch the live upstream, but never let an upstream outage take down
          // the whole endpoint. The source WAF blocks some server IPs (403), so
          // when it is unreachable we still serve the results already stored.
          let liveRows: ResultRow[] = [];
          try {
            const res = await fetchResults();
            const json = await res.json();
            liveRows = normalizeRows(json);
                    } catch (upstreamError) {
            console.error("[v0] results upstream unavailable:", String(upstreamError));
            try {
              liveRows = await fetchTelegramResults();
            } catch (telegramError) {
              console.error("[v0] Telegram results fallback unavailable:", String(telegramError));
            }
          }

          // The upstream JSON exposes the digit but not always the game's
          // published BIG/SMALL label. Telegram's result feed is the authority
          // for that label, so merge it over matching issues whenever available.
          try {
            const officialRows = await fetchTelegramResults();
            const officialByIssue = new Map(officialRows.map((row) => [row.issueNumber, row]));
            liveRows = liveRows.map((row) => {
              const official = officialByIssue.get(row.issueNumber);
              return official
                ? { ...row, number: official.number, size: official.size, blockTimestamp: official.blockTimestamp || row.blockTimestamp }
                : row;
            });
            for (const official of officialRows) {
              if (!liveRows.some((row) => row.issueNumber === official.issueNumber)) liveRows.push(official);
            }
          } catch (officialError) {
            console.error("[v0] official result labels unavailable:", String(officialError));
          }

          // Keep the first result received for an issue. The upstream feed can
          // change its newest rows while a round is settling, but historical
          // results on the website must remain immutable.
          if (liveRows.length) {
            const { error: insertError } = await supabase.from("result_snapshots").upsert(
              liveRows.map((row) => ({
                issue_number: String(row.issueNumber),
                number: String(row.number),
                color: String(row.color ?? ""),
                block_timestamp: Number(row.blockTimestamp ?? 0),
              })),
              { onConflict: "issue_number", ignoreDuplicates: false },
            );

            if (insertError) throw new Error(insertError.message);
          }

          const { data: stored, error: readError } = await supabase
            .from("result_snapshots")
            .select("issue_number, number, color, block_timestamp")
            .order("issue_number", { ascending: false })
            .limit(100);

          if (readError) throw new Error(readError.message);

          const liveByIssue = new Map(liveRows.map((row) => [row.issueNumber, row]));
          const list = (stored ?? []).map((row) => {
            const live = liveByIssue.get(row.issue_number);
            return {
              issueNumber: row.issue_number,
              number: live?.number ?? row.number,
              size: live?.size,
              color: row.color,
              blockTimestamp: Number(row.block_timestamp),
            };
          });

          list.sort((a, b) => {
            try {
              return Number(BigInt(b.issueNumber) - BigInt(a.issueNumber));
            } catch {
              return b.issueNumber.localeCompare(a.issueNumber);
            }
          });

          return new Response(JSON.stringify({ data: { list } }), {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: String(e) }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
