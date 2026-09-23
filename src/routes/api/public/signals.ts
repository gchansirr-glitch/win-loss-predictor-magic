import { createFileRoute } from "@tanstack/react-router";

const CHANNEL = "https://t.me/s/formula_1_si";

type Direction = "BIG" | "SMALL";
type Signal = {
  signalId: string;
  period: string;
  sourceDirection: Direction;
  direction: Direction;
  level: number;
  sourceText: string;
  postedAt: string | null;
};

function parse(html: string): Signal[] {
  const out = new Map<string, Signal>();
  const re = /js-message_text"[^>]*>([\s\S]*?)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = (m[1] ?? "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Formula 1 posts use formats such as:
    // "TRX 64 B 300" or "TRX 64 BIG 300".
    const match = text.match(/\bTRX\s*[-:#]?\s*(\d{1,30})\s+(B|S|BIG|SMALL)\b(?:\s+(\d+))?/i);
    if (!match) continue;

    const period = match[1] ?? "";
    const rawDirection = (match[2] ?? "").toUpperCase();
    const sourceDirection: Direction =
      rawDirection === "B" || rawDirection === "BIG" ? "BIG" : "SMALL";

    // The website intentionally mirrors the channel in the opposite direction.
    const direction: Direction = sourceDirection === "BIG" ? "SMALL" : "BIG";
    const level = Number(match[3] ?? 1);
    const messageEnd = html.indexOf("</div></div>", m.index);
    const messageHtml = html.slice(m.index, messageEnd === -1 ? undefined : messageEnd);
    const postedAt = messageHtml.match(/<time\s+datetime="([^"]+)"/i)?.[1] ?? null;

    // Keep the first version seen for a period in this fetch. The database
    // insert below is ignore-on-conflict, so an old signal can never be edited
    // by a later Telegram update.
    if (!out.has(period)) {
      out.set(period, {
        signalId: `${period}:${postedAt ?? text}`,
        period,
        sourceDirection,
        direction,
        level,
        sourceText: text,
        postedAt,
      });
    }
  }
  return [...out.values()].reverse();
}

export const Route = createFileRoute("/api/public/signals")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Fetch the Telegram channel, but never let an upstream outage take
          // down the whole endpoint: fall back to the signals already stored.
          let parsed: Signal[] = [];
          try {
            const res = await fetch(`${CHANNEL}?t=${Date.now()}`, {
              headers: {
                accept: "text/html",
                "user-agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
              },
            });
            if (res.ok) {
              const html = await res.text();
              parsed = parse(html);
            } else {
              console.error("[v0] signals upstream status:", res.status);
            }
          } catch (upstreamError) {
            console.error("[v0] signals upstream unavailable:", String(upstreamError));
          }

          // Insert only new periods. This makes the signal shown to every
          // visitor deterministic and prevents edited Telegram posts from
          // rewriting historical website signals.
          if (parsed.length) {
            const { error: insertError } = await supabaseAdmin
              .from("signal_snapshots")
              .upsert(
                parsed.map((signal) => ({
                  signal_id: signal.signalId,
                  period: signal.period,
                  source_direction: signal.sourceDirection,
                  website_direction: signal.direction,
                  level: signal.level,
                  source_text: signal.sourceText,
                  posted_at: signal.postedAt,
                })),
                { onConflict: "signal_id", ignoreDuplicates: true },
              );

            if (insertError) throw new Error(insertError.message);
          }

          const { data: stored, error: readError } = await supabaseAdmin
            .from("signal_snapshots")
            .select(
              "signal_id, period, source_direction, website_direction, level, source_text, posted_at, captured_at",
            )
            .order("posted_at", { ascending: false, nullsFirst: false })
            .limit(100);

          if (readError) throw new Error(readError.message);

          const list = (stored ?? []).map((row) => ({
            signalId: row.signal_id,
            period: row.period,
            sourceDirection: row.source_direction,
            direction: row.website_direction,
            level: row.level,
            sourceText: row.source_text,
            postedAt: row.posted_at,
            capturedAt: row.captured_at,
          }));

          // Newest post first. Periods reset (for example back to 1), so
          // sorting numerically by period made new signals sink to the bottom
          // and the site looked frozen on an old signal.
          list.sort((a, b) => {
            const ta = a.postedAt ? Date.parse(a.postedAt) : 0;
            const tb = b.postedAt ? Date.parse(b.postedAt) : 0;
            if (tb !== ta) return tb - ta;
            return b.capturedAt.localeCompare(a.capturedAt);
          });

          return new Response(JSON.stringify({ list }), {
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 502 });
        }
      },
    },
  },
});
