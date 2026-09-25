import { createFileRoute } from "@tanstack/react-router";

import { isAuthorizedAdmin } from "@/lib/admin-auth";

const json = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { headers: { "cache-control": "no-store" }, ...init });

export const Route = createFileRoute("/api/public/vip")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("app_users")
            .select("*")
            .order("last_seen_at", { ascending: false })
            .limit(200);
          if (error) throw error;
          return json({ users: data ?? [] });
        } catch (error) {
          console.error("[vip] users failed", error);
          return json({ users: [] });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const telegramId = String(body?.telegramId ?? "").trim();
          if (!telegramId) return json({ error: "telegramId is required" }, { status: 400 });

          if (body?.action === "sync") {
            const isAdmin = isAuthorizedAdmin(telegramId, body?.username);
            const { error: upsertError } = await supabaseAdmin.from("app_users").upsert({
              telegram_id: telegramId,
              username: body?.username ?? null,
              first_name: body?.firstName ?? null,
              photo_url: body?.photoUrl ?? null,
              last_seen_at: new Date().toISOString(),
            }, { onConflict: "telegram_id" });
            if (upsertError) throw upsertError;
            const { data: row, error } = await supabaseAdmin
              .from("app_users")
              .select("vip_expires_at")
              .eq("telegram_id", telegramId)
              .maybeSingle();
            if (error) throw error;
            const expiresAt = row?.vip_expires_at ?? null;
            const isVip = isAdmin || Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());
            return json({ ok: true, isVip, isAdmin, expiresAt });
          }

          if (body?.action === "set_vip") {
            const plan = String(body?.plan ?? "");
            const expires = plan === "revoke"
              ? null
              : plan === "1h"
                ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
                : plan === "1m"
                  ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                  : plan === "days" && Number(body?.days) > 0
                    ? new Date(Date.now() + Number(body.days) * 24 * 60 * 60 * 1000).toISOString()
                    : null;
            const { error } = await supabaseAdmin.from("app_users").upsert({
              telegram_id: telegramId,
              vip_expires_at: expires,
              last_seen_at: new Date().toISOString(),
            }, { onConflict: "telegram_id" });
            if (error) throw error;
            return json({ ok: true, expiresAt: expires });
          }

          return json({ error: "Unsupported action" }, { status: 400 });
        } catch (error) {
          console.error("[vip] mutation failed", error);
          return json({ error: "Unable to update VIP" }, { status: 500 });
        }
      },
    },
  },
});
