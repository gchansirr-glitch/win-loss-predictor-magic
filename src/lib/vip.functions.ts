import { createServerFn } from "@tanstack/react-start";

export const ADMIN_IDS = ["5471930058", "7147520184"];

type Row = {
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  photo_url: string | null;
  vip_expires_at: string | null;
  last_seen_at: string;
  created_at: string;
};

function isAdmin(id: string) {
  return ADMIN_IDS.includes(String(id));
}

export const syncUser = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      telegramId: string;
      username?: string | null;
      firstName?: string | null;
      photoUrl?: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = String(data.telegramId);
    await supabaseAdmin.from("app_users").upsert(
      {
        telegram_id: id,
        username: data.username ?? null,
        first_name: data.firstName ?? null,
        photo_url: data.photoUrl ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "telegram_id" },
    );
    const { data: row } = await supabaseAdmin
      .from("app_users")
      .select("vip_expires_at")
      .eq("telegram_id", id)
      .maybeSingle();
    const exp = row?.vip_expires_at ? new Date(row.vip_expires_at).getTime() : 0;
    const admin = isAdmin(id);
    return {
      isAdmin: admin,
      isVip: admin || exp > Date.now(),
      expiresAt: row?.vip_expires_at ?? null,
    };
  });

export const listUsers = createServerFn({ method: "POST" })
  .inputValidator((data: { adminId: string }) => data)
  .handler(async ({ data }) => {
    if (!isAdmin(data.adminId)) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("app_users")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(200);
    return { users: (rows ?? []) as Row[] };
  });

export const setVip = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      adminId: string;
      telegramId: string;
      plan: "1h" | "1m" | "days" | "revoke";
      days?: number | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (!isAdmin(data.adminId)) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const dayMs = 24 * 60 * 60 * 1000;
    const customDays = Math.min(3650, Math.max(1, Math.floor(Number(data.days ?? 0))));
    const ms =
      data.plan === "1h"
        ? 60 * 60 * 1000
        : data.plan === "1m"
          ? 30 * dayMs
          : data.plan === "days"
            ? customDays * dayMs
            : 0;
    const expires = ms ? new Date(Date.now() + ms).toISOString() : null;
    const { error } = await supabaseAdmin.from("app_users").upsert(
      {
        telegram_id: String(data.telegramId),
        vip_expires_at: expires,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "telegram_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, expiresAt: expires };
  });
