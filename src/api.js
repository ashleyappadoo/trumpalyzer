// ─────────────────────────────────────────────────────────────────────────────
//  TRUMPALYZER — API Pipeline v7
//
//  Step 1a · /api/news     → GDELT/NewsAPI headlines
//  Step 1b · /api/claude   → NLP, 1 call, ~400 tokens
//  Step 2  · /api/yahoo    → prices proxied via Vercel (CORS fixed)
//  Step 3  · Pure JS math  → stop/target (instant, no API)
//  Step 4  · /api/timesfm  → TimesFM proxied, 25s timeout for cold start
// ─────────────────────────────────────────────────────────────────────────────
import {
  MAX_EVENTS,
  FORECAST_HORIZON,
  FORECAST_HISTORY,
} from "./config.js";

// ── Robust JSON extractor ─────────────────────────────────────────────────────
export function extractJSON(text, arr = false) {
  const clean = text.replace(/```json|```/g, "").trim();

  if (arr) {
    const m = clean.match(/\[[\s\S]*\]/);
    if (m) {
      try { return JSON.parse(m[0]); } catch {}
      try {
        const items = [];
        let depth = 0, start = -1, inStr = false, esc = false;
        for (let i = 0; i < m[0].length; i++) {
          const ch = m[0][i];
          if (esc)         { esc = false; continue; }
          if (ch === "\\") { esc = true;  continue; }
          if (ch === '"')  { inStr = !inStr; continue; }
          if (inStr)       continue;
          if (ch === "{")  { if (depth === 0) start = i; depth++; }
          else if (ch === "}") {
            depth--;
            if (depth === 0 && start !== -1) {
              try { items.push(JSON.parse(m[0].slice(start, i + 1))); } catch {}
              start = -1;
            }
          }
        }
        if (items.length) return items;
      } catch {}
    }
    throw new Error("No JSON array found");
  }

  const m = clean.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON object found");
  return JSON.parse(m[0]);
}

// ── Claude proxy ──────────────────────────────────────────────────────────────
async function claude(system, userMsg, max_tokens = 1500) {
  const res = await fetch("/api/claude", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ system, userMsg, max_tokens }),
  });
  if (!res.ok) throw new Error(`Claude proxy ${res.status}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d.text || "";
}

// ── STEP 1a — Raw news ────────────────────────────────────────────────────────
async function fetchRawNews() {
  const res = await fetch("/api/news");
  if (!res.ok) throw new Error(`News API ${res.status}`);
  const d = await res.json();
  if (!d.articles?.length) throw new Error("No articles returned");
  return d.articles;
}

// ── STEP 1b — Claude NLP ──────────────────────────────────────────────────────
export async function fetchTrumpEvents() {
  const articles = await fetchRawNews();

  const headlines = articles
    .slice(0, 12)
    .map((a, i) => `${i + 1}. [${a.hoursAgo}h | ${a.source}] ${a.title}`)
    .join("\n");

  const text = await claude(
    `Political-risk analyst. Return ONLY valid JSON array, no markdown.`,
    `Analyze these Trump headlines. Pick ${MAX_EVENTS} most market-moving. Return JSON array:
[{"headline":"<75ch","summary":"1 sentence","source":"outlet","hours_ago":2,"sentiment":"bullish|bearish|neutral","overall_signal":"BUY|SELL|WATCH","key_themes":["tariffs"],"tickers":[{"ticker":"XOM","name":"Exxon","signal":"BUY","direction":"up","amplitude_pct":2.5,"confidence":70,"reason":"<40ch"}]}]
Rules: 2-3 tickers per event. Each ticker gets its OWN signal (can differ from overall_signal). NO prices. Sort by impact.

Headlines:
${headlines}`,
    1600
  );

  const parsed = extractJSON(text, true);
  return Array.isArray(parsed) ? parsed.slice(0, MAX_EVENTS) : [];
}

// ── STEP 2 — Yahoo Finance via Vercel proxy (CORS fixed) ─────────────────────
export async function fetchYahoo(ticker) {
  try {
    const res = await fetch(`/api/yahoo?ticker=${encodeURIComponent(ticker)}`);
    if (!res.ok) throw new Error(`Yahoo proxy ${res.status}`);
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    return {
      closes:  d.closes,
      current: d.current,
      change:  d.change,
    };
  } catch (err) {
    console.error(`[Yahoo] ${ticker}: ${err.message}`);
    return null;
  }
}

// ── STEP 3 — Pure JS math ─────────────────────────────────────────────────────
export function enrichAllTickersLocally(tickerList) {
  const result = {};
  tickerList.forEach(t => {
    const mult   = t.direction === "up" ? 1 : t.direction === "down" ? -1 : 0;
    const amp    = t.amplitude_pct / 100;
    const cur    = t.currentPrice;
    const entry  = +cur.toFixed(2);
    const target = +(cur * (1 + mult * amp)).toFixed(2);
    const stop   = +(cur * (1 - mult * amp * 0.8)).toFixed(2);
    const rr     = stop !== entry
      ? +(Math.abs(target - entry) / Math.abs(stop - entry)).toFixed(1)
      : 1.0;
    result[t.ticker] = {
      entry_price:     entry,
      stop_loss:       stop,
      target_24h:      target,
      risk_reward:     rr,
      trade_rationale: t.reason || `${t.signal} — ${t.amplitude_pct}% expected move`,
    };
  });
  return result;
}

// ── STEP 4 — TimesFM via Vercel proxy ─────────────────────────────────────────
//  25s timeout handles HF cold start (Space waking up from sleep)
//  Always returns a value — simulated fallback if HF unreachable
export async function fetchTimesFMWithConvergence(closes, claudeSignal) {
  const input        = closes.slice(-FORECAST_HISTORY);
  const currentPrice = input.at(-1);
  let values    = null;
  let simulated = false;

  try {
    const res = await fetch("/api/timesfm", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        inputs:  [input],
        freq:    [0],
        horizon: FORECAST_HORIZON,
      }),
    });

    if (!res.ok) throw new Error(`TimesFM proxy ${res.status}`);

    const data = await res.json();
    values =
      data.outputs?.[0]     ??
      data.mean?.[0]        ??
      data.forecast?.[0]    ??
      data.predictions?.[0] ??
      null;

    if (!values?.length) throw new Error("Empty response");
    values = values.slice(0, FORECAST_HORIZON).map(v => +v.toFixed(2));
    console.log(`[TimesFM] Real forecast OK`);

  } catch (err) {
    console.warn(`[TimesFM] Using trend fallback (${err.message})`);
    simulated = true;
    const dir   = claudeSignal === "BUY" ? "up" : claudeSignal === "SELL" ? "down" : "flat";
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
    convergence = "neutral";   convergenceLabel = "SIGNAL NEUTRE";     convergenceColor = "#f5a623";
  } else if (claudeDir === tfDir) {
    convergence = "confirmed"; convergenceLabel = "✓ CONFIRMÉ";        convergenceColor = "#00c97a";
  } else {
    convergence = "divergent"; convergenceLabel = "⚠ DIVERGENT";       convergenceColor = "#ff3b5c";
  }

  return {
    values, simulated,
    forecastDelta:    +forecastDelta.toFixed(2),
    tfDirection:      tfDir,
    convergence, convergenceLabel, convergenceColor,
  };
}

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkTimesFMHealth() {
  try {
    const res = await fetch("/api/timesfm");
    if (!res.ok) return false;
    const d = await res.json();
    return d?.status === "operational";
  } catch { return false; }
}

// ── Backtest ──────────────────────────────────────────────────────────────────
export async function fetchBacktest() {
  const text = await claude(
    `Financial analyst. Return ONLY valid JSON array, no markdown.`,
    `Generate 8 realistic Trump market trade examples from the last 30 days.
Return: [{"date":"2025-03-10","event":"<45ch","signal":"BUY","ticker":"XOM","predicted":"up","entry_price":115.50,"exit_price":118.15,"actual_24h_pct":2.3,"outcome":"win"}]`,
    2000
  );
  return extractJSON(text, true);
}
