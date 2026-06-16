// feedback-capture.ts — Client-only context snapshot for a feedback report.
// Reads navigator/window, so call it from an event handler, never during SSR.
//
// What to adapt per stack:
//  - appCommit env var: this reads Vite's `import.meta.env.VITE_GIT_SHA`. For Next.js use
//    `process.env.NEXT_PUBLIC_GIT_SHA`; for CRA `process.env.REACT_APP_GIT_SHA`; or just
//    leave "unknown" if the host doesn't expose a build SHA. Inject the SHA at build time
//    (e.g. `VITE_GIT_SHA=$(git rev-parse --short HEAD)` in CI) if you want commit linkage.
//  - import path of ./console-buffer to match where you placed it.

import { getRecentLogs, type LogEntry } from "./console-buffer";

export type FeedbackContext = {
  url: string;
  path: string;
  userAgent: string;
  platform: string;
  language: string;
  viewport: string;
  screen: string;
  dpr: number;
  appCommit: string;
  capturedAt: string;
  logs: LogEntry[];
};

function readCommit(): string {
  // Vite. Swap for your framework's public env (see header comment).
  try {
    return (import.meta as any).env?.VITE_GIT_SHA ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function captureContext(): FeedbackContext {
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator;
  const w = (typeof window !== "undefined" ? window : {}) as Window;
  return {
    url: w.location?.href ?? "",
    path: w.location?.pathname ?? "",
    userAgent: nav.userAgent ?? "",
    platform: (nav as any).platform ?? "",
    language: nav.language ?? "",
    viewport: w.innerWidth ? `${w.innerWidth}×${w.innerHeight}` : "",
    screen: w.screen ? `${w.screen.width}×${w.screen.height}` : "",
    dpr: w.devicePixelRatio ?? 1,
    appCommit: readCommit(),
    capturedAt: new Date().toISOString(),
    logs: getRecentLogs(),
  };
}
