import React from "react";
import { createRoot } from "react-dom/client";
// Fonts, bundled offline (no network at runtime). Three families, three roles:
// Serif for reading surfaces, Sans for instrument labels, Mono for data. Only the
// weights/subsets actually used are imported — see styles.css for the type roles.
import "@fontsource/ibm-plex-serif/latin-400.css";
import "@fontsource/ibm-plex-serif/latin-400-italic.css";
import "@fontsource/ibm-plex-serif/latin-600.css";
import "@fontsource/ibm-plex-serif/latin-ext-400.css";
import "@fontsource/ibm-plex-serif/latin-ext-400-italic.css";
import "@fontsource/ibm-plex-serif/latin-ext-600.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-400-italic.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-ext-400.css";
import "@fontsource/ibm-plex-sans/latin-ext-500.css";
import "@fontsource/ibm-plex-sans/latin-ext-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-ext-400.css";
import App from "./App";
import { migrateLegacyKeys } from "./storage";
import "./styles.css";

// Adopt any cockpit-era ck.* layout keys before App reads study.* (see storage.ts).
migrateLegacyKeys();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
