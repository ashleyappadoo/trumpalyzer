import {
  TIMESFM_FORECAST, TIMESFM_HEALTH,
  YAHOO_BASE,
  MAX_EVENTS, FORECAST_HORIZON, FORECAST_HISTORY,
} from "./config.js";

export function extractJSON(text, arr = false) {
  const clean = text.replace(/```json|```/g, "").trim();
  const m = clean.match(arr ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in Claude response");
  return JSON.parse(m[0]);
}

// useWebSearch=true  → Step 1 (news scan) needs real-time web data
// useWebSearch=false → Step 3 (price levels) is pure calculation, no search needed
async function claude(system, userMsg, delayMs = 0, useWebSearch = false) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, userMsg, max_tokens: 2000, delayMs, useWebSearch }),
  });
  if (!res.ok) throw new Error(`Claude proxy ${res.status}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d.text || "";
}

// ── STEP 1 — needs web_search ─────────────────────────────────────────────────
export async function fetchTrumpEvents() {
  const today = new Date().toISOString().slice(0, 10);
  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const text = await claude(
    `You are a senior political-risk analyst at a hedge fund. Today is ${today}.
Search the web for Trump's ${MAX_EVENTS} most recent market-moving news events from the last 48 hours.

Return ONLY a valid JSON array of exactly ${MAX_EVENTS} objects. No markdown, no extra text:
[
  {
    "headline": "under 85 chars",
    "summary": "2 concise market-relevant sentences",
    "source": "outlet name",
    "published_at": "2025-03-29T14:30:00Z",
    "hours_ago": 2.5,
    "sentiment": "bullish|bearish|neutral",
    "overall_signal": "BUY|SELL|WATCH|IGNORE",
    "key_themes": ["tariffs", "energy"],
    "tickers": [
      {
        "ticker": "XOM",
        "name": "Exxon Mobil",
        "signal": "BUY",
        "direction": "up",
        "amplitude_pct": 2.8,
        "confidence": 72,
        "reason": "under 55 chars why this ticker specifically"
      }
    ]
  }
]

Critical rules:
- Each event: 2-4 tickers with INDIVIDUAL signals (not all the same direction)
- amplitude_pct: realistic expected % move in 24h (0.5 to 8%)
- confidence: 40-90% only
- DO NOT include any price levels (no entry_price, stop_loss, target)
- Sort events most recent first (hours_ago ascending)`,
    `Find Trump's ${MAX_EVENTS} most impactful market-moving events from the last 48h (${dateLabel}). JSON array only.`,
    0,
    true  // ← web_search ON
  );

  const parsed = extractJSON(text, true);
  return Array.isArray(parsed) ? parsed.slice(0, MAX_EVENTS) : [];
}

// ── STEP 2 — Yahoo Finance ────────────────────────────────────────────────────
export async function fetchYahoo(ticker) {
  try {
    const res = await fetch(`${YAHOO_BASE}/${ticker}?interval=1d&range=40d`);
    const d   = await res.json();
    const r   = d.chart?.result?.[0];
    if (!r) return null;
    const raw    = r.indicators.quote[0].close;
    const closes = raw.map((v, i) => v ?? raw[i - 1] ?? 0).filter(Boolean);
    const cur    = closes.at(-1);
    const prev   = closes.at(-2);
    return {
      closes,
      current: cur,
      change:  ((cur - prev) / prev) * 100,
    };
  } catch { return null; }
}

// ── STEP 3 — NO web_search (pure calculation) ─────────────────────────────────
export async function enrichAllTickersWithPrices(tickerList) {
  if (!tickerList.length) return {};

  const rows = tickerList.map(t =>
    `${t.ticker} | price=$${t.currentPrice} | signal=${t.signal} | dir=${t.direction} | amp=${t.amplitude_pct}% | reason: ${t.reason}`
  ).join("\n");

  const text = await claude(
    `You are a quantitative trader. Calculate precise trade levels for multiple tickers.
All prices are REAL live prices from Yahoo Finance — use them exactly as entry anchors.

Return ONLY a valid JSON object keyed by ticker symbol, no markdown:
{
  "XOM": {
    "entry_price": 118.43,
    "stop_loss": 115.20,
    "target_24h": 122.10,
    "risk_reward": 1.1,
    "trade_rationale": "under 80 chars"
  }
}

Rules:
- entry_price = exactly the given live price
- BUY: stop_loss BELOW entry, target_24h ABOVE entry
- SELL: stop_loss ABOVE entry, target_24h BELOW entry
- Stop distance = 0.8–1.2× amplitude_pct of entry
- Target distance = amplitude_pct × entry
- risk_reward = abs(target−entry) / abs(stop−entry), 1 decimal`,
    `Calculate trade levels for these tickers:\n${rows}\n\nReturn JSON object only.`,
    15000,
    false  // ← web_search OFF — pure math, no internet needed
  );

  try {
    return extractJSON(text, false);
  } catch {
    const result = {};
    tickerList.forEach(t => {
      const mult = t.direction === "up" ? 1 : -1;
      const cur  = t.currentPrice;
      const amp  = t.amplitude_pct;
      const tgt  = +(cur * (1 + mult * amp / 100)).toFixed(2);
      const stop = +(cur * (1 - mult * amp / 100 * 0.8)).toFixed(2);
      result[t.ticker] = {
        entry_price:     +cur.toFixed(2),
        stop_loss:       stop,
        target_24h:      tgt,
        risk_reward:     +(Math.abs(tgt - cur) / Math.abs(stop - cur)).toFixed(1),
        trade_rationale: t.reason,
      };
    });
    return result;
  }
}

// ── STEP 4 — TimesFM ─────────────────────────────────────────────────────────
export async function fetchTimesFMWithConvergence(closes, claudeSignal) {
  const input = closes.slice(-FORECAST_HISTORY);
  const currentPrice = input.at(-1);
  let values = null, simulated = false;

  try {
    const res = await fetch(TIMESFM_FORECAST, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: [input], freq: [0], horizon: FORECAST_HORIZON }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    values = data.outputs?.[0] ?? data.mean?.[0] ?? data.forecast?.[0] ?? data.predictions?.[0] ?? null;
    if (!values?.length) throw new Error();
    values = values.slice(0, FORECAST_HORIZON).map(v => +v.toFixed(2));
  } catch {
    simulated = true;
    const dir = claudeSignal === "BUY" ? "up" : claudeSignal === "SELL" ? "down" : "flat";
    const trend = dir === "up" ? 0.007 : dir === "down" ? -0.007 : 0.001;
    values = Array.from({ length: FORECAST_HORIZON }, (_, i) =>
      +(currentPrice * (1 + trend * (i + 1) + (Math.random() - 0.45) * 0.008)).toFixed(2)
    );
  }

  const forecastEnd   = values.at(-1);
  const forecastDelta = ((forecastEnd - currentPrice) / currentPrice) * 100;
  const tfDir         = forecastDelta > 0.5 ? "up" : forecastDelta < -0.5 ? "down" : "flat";
  const claudeDir     = claudeSignal === "BUY" ? "up" : claudeSignal === "SELL" ? "down" : "flat";

  let convergence, convergenceLabel, convergenceColor;
  if (claudeDir === "flat" || tfDir === "flat") {
    convergence = "neutral"; convergenceLabel = "SIGNAL NEUTRE"; convergenceColor = "#f5a623";
  } else if (claudeDir === tfDir) {
    convergence = "confirmed"; convergenceLabel = "✓ SIGNAL CONFIRMÉ"; convergenceColor = "#00c97a";
  } else {
    convergence = "divergent"; convergenceLabel = "⚠ SIGNAL DIVERGENT"; convergenceColor = "#ff3b5c";
  }

  return { values, simulated, forecastDelta: +forecastDelta.toFixed(2),
    tfDirection: tfDir, convergence, convergenceLabel, convergenceColor };
}

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkTimesFMHealth() {
  try {
    const res = await fetch(TIMESFM_HEALTH);
    if (!res.ok) return false;
    const d = await res.json();
    return d?.status === "operational";
  } catch { return false; }
}

// ── Backtest — needs web_search ───────────────────────────────────────────────
export async function fetchBacktest() {
  const text = await claude(
    `You are a financial backtester. Search the web for Trump's 8 most impactful market events from the last 30 days.
Return ONLY a valid JSON array (no markdown):
[{
  "date": "2025-03-10",
  "event": "under 55 chars",
  "signal": "BUY|SELL|WATCH",
  "ticker": "XOM",
  "predicted": "up|down",
  "entry_price": 115.50,
  "exit_price": 118.15,
  "actual_24h_pct": 2.3,
  "outcome": "win|loss"
}]`,
    "Find 8 Trump market events last 30 days with 24h stock outcomes. JSON array only.",
    0,
    true  // ← web_search ON
  );
  return extractJSON(text, true);
}
