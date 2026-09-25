import { createFileRoute } from "@tanstack/react-router";

const ADMIN_IDS = new Set(["5471930058", "7147520184"]);

export const Route = createFileRoute("/api/public/vip/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const telegramId = String(body?.telegramId ?? "").trim();
          if (!telegramId) return Response.json({ error: "telegramId is required" }, { status: 400 });
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: upsertError } = await supabaseAdmin.from("app_users").upsert({
            telegram_id: telegramId,
            username: body?.username ?? null,
            first_name: body?.firstName ?? null,
            photo_url: body?.photoUrl ?? null,
            last_seen_at: new Date().toISOString(),
          }, { onConflict: "telegram_id" });
          if (upsertError) throw upsertError;
          const { data: row, error } = await supabaseAdmin.from("app_users").select("vip_expires_at").eq("telegram_id", telegramId).maybeSingle();
          if (error) throw error;
          const expiresAt = row?.vip_expires_at ?? null;
          return Response.json({ isAdmin: ADMIN_IDS.has(telegramId), isVip: ADMIN_IDS.has(telegramId) || Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now()), expiresAt });
        } catch (error) {
          console.error("[vip/sync] failed", error);
          return Response.json({ error: "Unable to sync user" }, { status: 500 });
        }
      },
    },
  },
});
