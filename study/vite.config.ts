import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Same PORT variable the API server reads (server/index.ts), so one env var
// moves both ends — needed to run two courses (two clones) side by side.
const api = `127.0.0.1:${process.env.PORT || 7331}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": `http://${api}`,
      "/visual": `http://${api}`,
      "/term": { target: `ws://${api}`, ws: true },
    },
  },
});
