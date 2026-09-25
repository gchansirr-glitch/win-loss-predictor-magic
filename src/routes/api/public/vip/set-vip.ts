import { createFileRoute } from "@tanstack/react-router";

const ADMIN_IDS = new Set(["5471930058", "7147520184"]);
const PLANS = new Set(["1h", "1m", "days", "revoke"]);

export const Route = createFileRoute("/api/public/vip/set-vip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const adminId = String(body?.adminId ?? "").trim();
          const telegramId = String(body?.telegramId ?? "").trim();
          const plan = String(body?.plan ?? "");
          if (!ADMIN_IDS.has(adminId)) return Response.json({ error: "Forbidden" }, { status: 403 });
          if (!telegramId || !PLANS.has(plan)) return Response.json({ error: "Invalid request" }, { status: 400 });
          const dayMs = 24 * 60 * 60 * 1000;
          const days = Math.min(3650, Math.max(1, Math.floor(Number(body?.days ?? 0))));
          const duration = plan === "1h" ? 60 * 60 * 1000 : plan === "1m" ? 30 * dayMs : plan === "days" ? days * dayMs : 0;
          const expiresAt = duration ? new Date(Date.now() + duration).toISOString() : null;
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("app_users").upsert({ telegram_id: telegramId, vip_expires_at: expiresAt, last_seen_at: new Date().toISOString() }, { onConflict: "telegram_id" });
          if (error) throw error;
          return Response.json({ ok: true, expiresAt });
        } catch (error) {
          console.error("[vip/set-vip] failed", error);
          return Response.json({ error: "Unable to update VIP" }, { status: 500 });
        }
      },
    },
  },
});
