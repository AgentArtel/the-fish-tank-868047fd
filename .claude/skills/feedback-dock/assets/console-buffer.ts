// console-buffer.ts — STACK-AGNOSTIC. Copy verbatim into the host app's lib/util dir.
//
// What to adapt: nothing. This is plain browser code with no framework or storage deps.
//
// Lightweight console ring buffer for the feedback dock. Browsers don't expose past
// console history, so we record forward from app load: the last N error/warn entries
// plus uncaught errors and unhandled promise rejections. Capturing is best-effort and
// must never throw into the app. Call initConsoleBuffer() once when the dock mounts.

export type LogEntry = { level: string; msg: string; at: string };

const MAX = 50;
const BUFFER: LogEntry[] = [];
let installed = false;

function stringifyArg(a: unknown): string {
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function push(level: string, args: unknown[]) {
  try {
    const msg = args.map(stringifyArg).join(" ").slice(0, 1000);
    BUFFER.push({ level, msg, at: new Date().toISOString() });
    while (BUFFER.length > MAX) BUFFER.shift();
  } catch {
    /* never let logging break the app */
  }
}

export function initConsoleBuffer() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    push("error", args);
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    push("warn", args);
    origWarn(...args);
  };
  window.addEventListener("error", (e) => push("error", [e.message, `${e.filename}:${e.lineno}`]));
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) =>
    push("unhandledrejection", [e.reason?.message ?? String(e.reason)]),
  );
}

export function getRecentLogs(): LogEntry[] {
  return BUFFER.slice(-MAX);
}
