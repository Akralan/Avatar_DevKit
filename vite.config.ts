import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import glsl from "vite-plugin-glsl";

const API_ROUTES = ["/body", "/graft", "/healthz"];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const target = env.VITE_API_BASE?.replace(/\/$/, "") ?? "";

  return {
    plugins: [react(), glsl()],
    // Le proxy reproduit le mode PROXY_API de l'ancien app.py : le navigateur
    // ne voit qu'une seule origine, donc aucun CORS en développement.
    server: target
      ? {
          proxy: Object.fromEntries(
            API_ROUTES.map((route) => [
              route,
              { target, changeOrigin: true, secure: false },
            ]),
          ),
        }
      : undefined,
    test: {
      environment: "jsdom",
      setupFiles: ["./src/setup-tests.ts"],
      globals: true,
    },
  };
});
