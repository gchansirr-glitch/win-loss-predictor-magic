import { createFileRoute } from "@tanstack/react-router";

import { isAuthorizedAdmin } from "@/lib/admin-auth";

export const Route = createFileRoute("/api/public/vip/users")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          if (!isAuthorizedAdmin(body?.adminId, body?.adminUsername)) return Response.json({ error: "Forbidden" }, { status: 403 });
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: users, error } = await supabaseAdmin.from("app_users").select("*").order("last_seen_at", { ascending: false }).limit(200);
          if (error) throw error;
          return Response.json({ users: users ?? [] });
        } catch (error) {
          console.error("[vip/users] failed", error);
          return Response.json({ error: "Unable to load users" }, { status: 500 });
        }
      },
    },
  },
});
