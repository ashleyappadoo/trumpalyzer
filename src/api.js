// ─────────────────────────────────────────────────────────────────────────────
//  TRUMPALYZER — API Pipeline
//
//  Step 1 · Claude + web_search  → events + tickers + direction (NO prices)
//  Step 2 · Yahoo Finance        → live price + 30-day closes per ticker
//  Step 3 · Claude (2nd call)    → stop/target calculated FROM real Yahoo prices
//  Step 4 · TimesFM HF Space     → 5-day forecast → convergence vs Claude signal
//
// ─────────────────────────────────────────────────────────────────────────────
import {
  TIMESFM_FORECAST, TIMESFM_HEALTH,
  YAHOO_BASE,
  MAX_EVENTS, FORECAST_HORIZON, FORECAST_HISTORY,
} from "./config.js";

// ── Util ──────────────────────────────────────────────────────────────────────

export function extractJSON(text, arr = false) {
  const clean = text.replace(/```json|```/g, "").trim();
  const m = clean.match(arr ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in Claude response");
  return JSON.parse(m[0]);
}

// ── Claude — calls our Vercel serverless proxy (/api/claude) ─────────────────
// The actual ANTHROPIC_API_KEY lives only in Vercel env vars, never client-side.

async function claude(system, userMsg) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, userMsg, max_tokens: 1600 }),
  });
  if (!res.ok) throw new Error(`Claude proxy ${res.status}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d.text || "";
}

// ── STEP 1 — Claude fetches news + identifies tickers (no prices) ─────────────

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
- DO NOT include any price levels (no entry_price, stop_loss, target) — prices will be fetched live
- CRITICAL: Output events in CHRONOLOGICAL ORDER — most recent first (lowest hours_ago first). Do NOT reorder by importance.`,
    `Pick the ${MAX_EVENTS} most recent market-moving Trump headlines from the list above. Preserve chronological order (most recent first). JSON array only.`
  );

  const parsed = extractJSON(text, true);
  return Array.isArray(parsed) ? parsed.slice(0, MAX_EVENTS) : [];
}

// ── STEP 2 — Yahoo Finance: live price + history ──────────────────────────────

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
      current:  cur,
      change:   ((cur - prev) / prev) * 100,
      high52w:  Math.max(...closes),
      low52w:   Math.min(...closes),
    };
  } catch { return null; }
}

// ── STEP 3 — ONE batch Claude call for ALL tickers at once ────────────────────
//
//  Instead of 1 call per ticker (causes 429), we send all tickers + their live
//  Yahoo prices in a single prompt. Claude returns all levels in one response.
//
//  tickerList: [{ ticker, signal, direction, amplitude_pct, confidence, reason, currentPrice, headline }]
//  Returns: { TICKER: { entry_price, stop_loss, target_24h, risk_reward, trade_rationale } }

export async function enrichAllTickersWithPrices(tickerList) {
  if (!tickerList.length) return {};

  // Build a compact payload — one line per ticker
  const rows = tickerList.map(t =>
    `${t.ticker} | price=$${t.currentPrice} | signal=${t.signal} | dir=${t.direction} | amp=${t.amplitude_pct}% | reason: ${t.reason}`
  ).join("\n");

  const text = await claude(
    `You are a quantitative trader. Calculate precise trade levels for multiple tickers at once.
All prices are REAL live prices from Yahoo Finance — use them exactly as entry anchors.

Return ONLY a valid JSON object keyed by ticker symbol, no markdown:
{
  "XOM": {
    "entry_price": 118.43,
    "stop_loss": 115.20,
    "target_24h": 122.10,
    "risk_reward": 1.1,
    "trade_rationale": "under 80 chars"
  },
  "CVX": { ... }
}

Rules per ticker:
- entry_price = exactly the given live price
- BUY: stop_loss BELOW entry, target_24h ABOVE entry
- SELL: stop_loss ABOVE entry, target_24h BELOW entry
- Stop distance = 0.8–1.2× amplitude_pct of entry
- Target distance = amplitude_pct × entry
- risk_reward = abs(target−entry) / abs(stop−entry), 1 decimal`,

    `Calculate trade levels for these tickers (all prices from Yahoo Finance live):\n${rows}\n\nReturn JSON object only.`
  );

  try {
    const parsed = extractJSON(text, false);
    return parsed;
  } catch {
    // Full local fallback if Claude call fails
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

// ── STEP 4 — TimesFM: 5-day forecast → convergence score ─────────────────────
//
//  TimesFM receives raw price history (no news context).
//  Its forecast direction is compared against Claude's signal.
//  If both agree → CONFIRMED. If opposite → DIVERGENT.

export async function fetchTimesFMWithConvergence(closes, claudeSignal) {
  const input = closes.slice(-FORECAST_HISTORY);
  const currentPrice = input.at(-1);

  let values    = null;
  let simulated = false;

  // Try real API
  try {
    const res = await fetch(TIMESFM_FORECAST, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: [input], freq: [0], horizon: FORECAST_HORIZON }),
    });
    if (!res.ok) throw new Error(`TimesFM ${res.status}`);
    const data = await res.json();
    values =
      data.outputs?.[0] ??
      data.mean?.[0]    ??
      data.forecast?.[0]??
      data.predictions?.[0] ?? null;
    if (!values?.length) throw new Error("empty");
    values = values.slice(0, FORECAST_HORIZON).map(v => +v.toFixed(2));
  } catch {
    simulated = true;
    // Trend-biased fallback
    const direction = claudeSignal === "BUY" ? "up" : claudeSignal === "SELL" ? "down" : "flat";
    const trend = direction === "up" ? 0.007 : direction === "down" ? -0.007 : 0.001;
    values = Array.from({ length: FORECAST_HORIZON }, (_, i) =>
      +(currentPrice * (1 + trend * (i + 1) + (Math.random() - 0.45) * 0.008)).toFixed(2)
    );
  }

  // Convergence analysis
  const forecastEnd   = values.at(-1);
  const forecastDelta = ((forecastEnd - currentPrice) / currentPrice) * 100;
  const tfDirection   = forecastDelta > 0.5 ? "up" : forecastDelta < -0.5 ? "down" : "flat";
  const claudeDir     = claudeSignal === "BUY" ? "up" : claudeSignal === "SELL" ? "down" : "flat";

  let convergence, convergenceLabel, convergenceColor;
  if (claudeDir === "flat" || tfDirection === "flat") {
    convergence      = "neutral";
    convergenceLabel = "SIGNAL NEUTRE";
    convergenceColor = "#f5a623";
  } else if (claudeDir === tfDirection) {
    convergence      = "confirmed";
    convergenceLabel = "✓ SIGNAL CONFIRMÉ";
    convergenceColor = "#00c97a";
  } else {
    convergence      = "divergent";
    convergenceLabel = "⚠ SIGNAL DIVERGENT";
    convergenceColor = "#ff3b5c";
  }

  return {
    values,
    simulated,
    forecastDelta: +forecastDelta.toFixed(2),
    tfDirection,
    convergence,
    convergenceLabel,
    convergenceColor,
  };
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function checkTimesFMHealth() {
  try {
    const res = await fetch(TIMESFM_HEALTH);
    if (!res.ok) return false;
    const d = await res.json();
    return d?.status === "operational" || d?.status === "healthy";
  } catch { return false; }
}

// ── Backtest ──────────────────────────────────────────────────────────────────

export async function fetchBacktest() {
  const text = await claude(
    `You are a financial backtester. Search the web for Trump's 8 most impactful market events from the last 30 days.
For each event, provide the real 24h outcome on the primary affected stock.

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
    "Find 8 Trump market events from last 30 days with their 24h stock price outcomes. JSON array only."
  );
  return extractJSON(text, true);
}
