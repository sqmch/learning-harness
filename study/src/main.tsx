import React from "react";
import { createRoot } from "react-dom/client";
// Fonts are bundled offline. Source Sans 3 is the reading/UI face (including
// real italics); JetBrains Mono is reserved for terminal/code/data. Weight-level
// CSS includes properly ranged language subsets, preventing fallback mixing.
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/400-italic.css";
import "@fontsource/source-sans-3/500.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/600-italic.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import App from "./App";
import { TooltipProvider } from "./ui/Tooltip";
import { migrateLegacyKeys } from "./storage";
import "./styles.css";
import "./ui/ui.css";

// Adopt any cockpit-era ck.* layout keys before App reads study.* (see storage.ts).
migrateLegacyKeys();

async function mount() {
  // A webfont swap after xterm has measured its cells creates visible gaps and
  // collisions. Load every face xterm/prose will request before either mounts.
  await Promise.all([
    document.fonts.load('400 16px "Source Sans 3"'),
    document.fonts.load('italic 400 16px "Source Sans 3"'),
    document.fonts.load('600 16px "Source Sans 3"'),
    document.fonts.load('400 14px "JetBrains Mono"'),
    document.fonts.load('600 14px "JetBrains Mono"'),
  ]).catch(() => undefined);

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </React.StrictMode>,
  );
}

void mount();
