import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit tests for the study's load-bearing pure logic (server/helpers.ts,
// src/lab/registry.ts, src/state/parse.ts). Node environment — none of these
// touch the DOM; the React plugin is here only so importing registry.ts (which
// pulls in the .tsx lab components) transpiles their JSX. The components are
// never rendered, just referenced. This config is separate from vite.config.ts
// so the dev-server proxy settings don't leak into the test run.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
