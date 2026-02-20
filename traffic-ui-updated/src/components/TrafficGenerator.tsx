import React, { useRef, useState } from "react";

/**
 * Simple Traffic Generator UI
 *
 * Features:
 * - Base URL, Concurrency, Delay controls
 * - Start/Stop
 * - Live stats + log
 * - Sends headers: traceparent + X-Internal-Span
 *
 * Notes:
 * - If you run this in a browser, your .NET app must allow CORS.
 * - This UI generates *light* load. For heavy load, prefer a Node CLI runner.
 */

type Stats = { total: number; ok: number; errors: number };

type LogRow = {
  ts: string;
  worker: number;
  url: string;
  status: string;
};

function safeRandomHex(bytes: number): string {
  // Works in modern browsers. If crypto is unavailable, falls back to Math.random.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = (globalThis as any).crypto;
    if (c?.getRandomValues) {
      const arr = new Uint8Array(bytes);
      c.getRandomValues(arr);
      return Array.from(arr)
        .map((b: number) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch (e) {
    // ignore
  }

  // Fallback (less random, but good enough for traffic correlation headers)
  let out = "";
  for (let i = 0; i < bytes; i += 1) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return out;
}

function makeTraceparent(): string {
  // W3C traceparent: version-traceid-spanid-flags
  const traceId = safeRandomHex(16);
  const spanId = safeRandomHex(8);
  return `00-${traceId}-${spanId}-01`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default function TrafficGenerator() {
  // Prefer an explicit backend origin (no Vite proxy). Override via a local .env:
  //   VITE_API_BASE_URL=http://localhost:8080
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any)?.env || {};
  const [baseUrl, setBaseUrl] = useState<string>(env.VITE_API_BASE_URL || "http://localhost:8080");
  const [concurrency, setConcurrency] = useState<number>(5);
  const [delayMs, setDelayMs] = useState<number>(200);
  const [running, setRunning] = useState<boolean>(false);

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, ok: 0, errors: 0 });

  const stopRef = useRef<boolean>(false);

  function endpoints(base: string): string[] {
    const b = base.replace(/\/$/, "");
    return [`${b}/`, `${b}/mysql`, `${b}/redis`, `${b}/kafka/produce`, `${b}/api`];
  }

  function pushLog(row: LogRow) {
    setLogs((prev) => [row, ...prev].slice(0, 250));
  }

  async function hit(workerId: number) {
    const eps = endpoints(baseUrl);
    const url = eps[Math.floor(Math.random() * eps.length)];

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          traceparent: makeTraceparent(),
          "X-Internal-Span": "ui_test",
          "X-Scenario": "ui_test",
        },
      });

      const status = String(res.status);
      pushLog({ ts: new Date().toLocaleTimeString(), worker: workerId, url, status });

      setStats((s) => ({
        total: s.total + 1,
        ok: res.status === 200 ? s.ok + 1 : s.ok,
        errors: res.status === 200 ? s.errors : s.errors + 1,
      }));
    } catch (e) {
      pushLog({
        ts: new Date().toLocaleTimeString(),
        worker: workerId,
        url,
        status: "ERROR",
      });

      setStats((s) => ({ total: s.total + 1, ok: s.ok, errors: s.errors + 1 }));
    }
  }

  async function workerLoop(id: number) {
    while (!stopRef.current) {
      await hit(id);
      await sleep(delayMs);
    }
  }

  function start() {
    stopRef.current = false;
    setRunning(true);
    setLogs([]);
    setStats({ total: 0, ok: 0, errors: 0 });

    const c = clamp(concurrency, 1, 200);
    for (let i = 1; i <= c; i += 1) {
      // fire-and-forget
      void workerLoop(i);
    }
  }

  function stop() {
    stopRef.current = true;
    setRunning(false);
  }

  // Minimal “test cases” (runtime sanity checks) — safe to keep in production.
  // These do NOT throw; they only guard against accidental regressions.
  const __tp = makeTraceparent();
  if (!/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(__tp)) {
    // eslint-disable-next-line no-console
    console.warn("traceparent format unexpected:", __tp);
  }

  async function quickCall(path: string, label: string) {
    const b = baseUrl.replace(/\/$/, "");
    const url = `${b}${path.startsWith("/") ? "" : "/"}${path}`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          traceparent: makeTraceparent(),
          "X-Internal-Span": `ui_button_${label}`,
          "X-Scenario": `ui_button_${label}`,
        },
      });

      const status = String(res.status);
      pushLog({ ts: new Date().toLocaleTimeString(), worker: 0, url, status });

      setStats((s) => ({
        total: s.total + 1,
        ok: res.status === 200 ? s.ok + 1 : s.ok,
        errors: res.status === 200 ? s.errors : s.errors + 1,
      }));
    } catch (e) {
      pushLog({ ts: new Date().toLocaleTimeString(), worker: 0, url, status: "ERROR" });
      setStats((s) => ({ total: s.total + 1, ok: s.ok, errors: s.errors + 1 }));
    }
  }

  return (
    <div style={{ fontFamily: "Arial", padding: 20, maxWidth: 900 }}>
      <h2 style={{ margin: 0 }}>Simple Traffic Generator</h2>
      <div style={{ color: "#555", marginTop: 6, marginBottom: 16, fontSize: 13 }}>
        Generates light traffic against a few endpoints and prints results.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#555" }}>Base URL</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:8080"
            style={{ width: 280, padding: "8px 10px" }}
            disabled={running}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#555" }}>Concurrency</span>
          <input
            type="number"
            value={concurrency}
            onChange={(e) => setConcurrency(clamp(Number(e.target.value || 1), 1, 200))}
            style={{ width: 140, padding: "8px 10px" }}
            disabled={running}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#555" }}>Delay (ms)</span>
          <input
            type="number"
            value={delayMs}
            onChange={(e) => setDelayMs(clamp(Number(e.target.value || 0), 0, 60_000))}
            style={{ width: 140, padding: "8px 10px" }}
            disabled={running}
          />
        </label>

        {!running ? (
          <button
            onClick={start}
            style={{ padding: "10px 14px", cursor: "pointer", background: "#22c55e", color: "#0b1220", border: 0 }}
          >
            Start
          </button>
        ) : (
          <button
            onClick={stop}
            style={{ padding: "10px 14px", cursor: "pointer", background: "#ef4444", color: "#0b1220", border: 0 }}
          >
            Stop
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <button
          onClick={() => void quickCall("/api", "api")}
          style={{ padding: "10px 14px", cursor: "pointer", background: "#e2e8f0", color: "#0b1220", border: 0 }}
        >
          Call /api
        </button>
        <button
          onClick={() => void quickCall("/redis", "redis")}
          style={{ padding: "10px 14px", cursor: "pointer", background: "#e2e8f0", color: "#0b1220", border: 0 }}
        >
          Call /redis
        </button>
        <button
          onClick={() => void quickCall("/kafka", "kafka")}
          style={{ padding: "10px 14px", cursor: "pointer", background: "#e2e8f0", color: "#0b1220", border: 0 }}
        >
          Call /kafka
        </button>
        <button
          onClick={() => void quickCall("/sql", "sql")}
          style={{ padding: "10px 14px", cursor: "pointer", background: "#e2e8f0", color: "#0b1220", border: 0 }}
        >
          Call /sql
        </button>
      </div>

      <div style={{ marginBottom: 12, fontSize: 14 }}>
        <strong>Total:</strong> {stats.total} &nbsp;|&nbsp; <strong>OK:</strong> {stats.ok} &nbsp;|&nbsp;{" "}
        <strong>Errors:</strong> {stats.errors}
      </div>

      <div
        style={{
          height: 320,
          overflow: "auto",
          background: "#0b1220",
          color: "#e2e8f0",
          padding: 12,
          fontSize: 12,
          borderRadius: 8,
          border: "1px solid #1f2a44",
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>No requests yet.</div>
        ) : (
          logs.map((r, i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 10, padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <div style={{ width: 90, color: "#94a3b8" }}>{r.ts}</div>
              <div style={{ width: 60, color: "#94a3b8" }}>W{r.worker}</div>
              <div
                style={{
                  width: 70,
                  color: r.status === "200" ? "#86efac" : r.status === "ERROR" ? "#fca5a5" : "#fde68a",
                }}
              >
                {r.status}
              </div>
              <div style={{ wordBreak: "break-all", flex: 1, color: "#cbd5e1" }}>{r.url}</div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>Endpoints: /, /api, /mysql, /redis, /kafka/produce</div>
    </div>
  );
}
