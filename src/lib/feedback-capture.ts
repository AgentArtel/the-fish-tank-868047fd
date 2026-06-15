// Snapshot the browser/page context to attach to a feedback report. Client-only
// (reads navigator/window); call from an event handler, not during SSR.

import { getRecentLogs, type LogEntry } from "@/lib/console-buffer";

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
    appCommit: (import.meta as any).env?.VITE_GIT_SHA ?? "unknown",
    capturedAt: new Date().toISOString(),
    logs: getRecentLogs(),
  };
}
