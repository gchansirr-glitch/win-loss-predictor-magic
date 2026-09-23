import { createFileRoute } from "@tanstack/react-router";

const SOURCE = "https://draw.ar-lottery01.com/TrxWinGo/TrxWinGo_1M/GetHistoryIssuePage.json";

type ResultRow = {
  issueNumber: string;
  number: string;
  color: string;
  blockTimestamp: number;
};

async function fetchResults() {
  let lastStatus = 502;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${SOURCE}?t=${Date.now()}`, {
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0 DrThetPyinnResults/2.0",
        },
      });
      lastStatus = res.status;
      if (res.ok) return res;
    } catch {
      lastStatus = 502;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw new Error(`upstream ${lastStatus}`);
}

export const Route = createFileRoute("/api/public/results")({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Public anon client + RLS. Ingestion writes and history reads both
          // go through the publishable key — no service_role secret is used.
          const { supabase } = await import("@/integrations/supabase/client");

          // Fetch the live upstream, but never let an upstream outage take down
          // the whole endpoint. The source WAF blocks some server IPs (403), so
          // when it is unreachable we still serve the results already stored.
          let liveRows: ResultRow[] = [];
          try {
            const res = await fetchResults();
            const json = await res.json();
            liveRows = (json?.data?.list ?? []) as ResultRow[];
          } catch (upstreamError) {
            console.error("[v0] results upstream unavailable:", String(upstreamError));
          }

          // Keep the first result received for an issue. The upstream feed can
          // change its newest rows while a round is settling, but historical
          // results on the website must remain immutable.
          if (liveRows.length) {
            const { error: insertError } = await supabase
              .from("result_snapshots")
              .upsert(
                liveRows.map((row) => ({
                  issue_number: String(row.issueNumber),
                  number: String(row.number),
                  color: String(row.color ?? ""),
                  block_timestamp: Number(row.blockTimestamp ?? 0),
                })),
                { onConflict: "issue_number", ignoreDuplicates: true },
              );

            if (insertError) throw new Error(insertError.message);
          }

          const { data: stored, error: readError } = await supabase
            .from("result_snapshots")
            .select("issue_number, number, color, block_timestamp")
            .order("issue_number", { ascending: false })
            .limit(100);

          if (readError) throw new Error(readError.message);

          const list = (stored ?? []).map((row) => ({
            issueNumber: row.issue_number,
            number: row.number,
            color: row.color,
            blockTimestamp: Number(row.block_timestamp),
          }));

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
