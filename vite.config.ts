import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Plain TanStack Start config (replaces the Lovable-specific
// "@lovable.dev/vite-tanstack-config" package).
//
// - tsConfigPaths(): resolves the "@" -> "./src" alias from tsconfig.json.
// - tailwindcss(): Tailwind CSS v4 (src/styles.css).
// - tanstackStart(): TanStack Start plugin. server.entry points at src/server.ts,
//   our SSR error wrapper.
// - nitro(): builds the server output. Nitro auto-detects the deploy target from
//   the environment: on Vercel it emits the "vercel" preset (.vercel/output);
//   locally it falls back to the node-server preset.
// - viteReact(): React 19 support.
export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
    }),
    nitro(),
    viteReact(),
  ],
});
