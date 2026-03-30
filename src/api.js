import {
  TIMESFM_FORECAST, TIMESFM_HEALTH,
  YAHOO_BASE,
  MAX_EVENTS, FORECAST_HORIZON, FORECAST_HISTORY,
} from "./config.js";

// ── Robust JSON extractor — handles truncated responses ───────────────────────
export function extractJSON(text, arr = false) {
  const clean = text.replace(/```json|```/g, "").trim();

  if (arr) {
    const m = clean.match(/\[[\s\S]*\]/);
    if (m) {
      // Try full parse
      try { return JSON.parse(m[0]); } catch {}
      // Truncated — recover all complete objects
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
async function claude(system, userMsg, delayMs = 0, useWebSearch = false, max_tokens = 2500) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, userMsg, max_tokens, delayMs, useWebSearch }),
  });
  if (!res.ok) throw new Error(`Claude proxy ${res.status}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d.text || "";
}

// ── STEP 1 — News scan ───────────────────────────────────────────────────────
export async function fetchTrumpEvents() {
  const today = new Date().toISOString().slice(0, 10);

  const text = await claude(
    `Political-risk analyst. Today: ${today}. Return ONLY valid JSON array, no markdown.`,
    `Search web for Trump's ${MAX_EVENTS} most recent market-moving news (last 48h).
Return JSON array of ${MAX_EVENTS} objects:
[{"headline":"<80ch","summary":"1 sentence","source":"outlet","hours_ago":2,"sentiment":"bullish|bearish|neutral","overall_signal":"BUY|SELL|WATCH","key_themes":["tariffs"],"tickers":[{"ticker":"XOM","name":"Exxon","signal":"BUY","direction":"up","amplitude_pct":2.5,"confidence":70,"reason":"<40ch"}]}]
Rules: 2-3 tickers per event with individual signals, NO prices, sort recent first.`,
    0,
    true,
    2500
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
    return { closes, current: cur, change: ((cur - prev) / prev) * 100 };
  } catch { return null; }
}

// ── STEP 3 — Price levels (no web_search, pure calculation) ──────────────────
export async function enrichAllTickersWithPrices(tickerList) {
  if (!tickerList.length) return {};

  const rows = tickerList.map(t =>
    `${t.ticker}:$${t.currentPrice}|${t.signal}|${t.direction}|${t.amplitude_pct}%`
  ).join("\n");

  const text = await claude(
    `Quantitative trader. Calculate trade levels. Return ONLY valid JSON object, no markdown.`,
    `Live Yahoo Finance prices. Calculate stop/target:
${rows}

Return: {"XOM":{"entry_price":118.43,"stop_loss":115.20,"target_24h":122.10,"risk_reward":1.1,"trade_rationale":"<50ch"}}
Rules: entry=exact live price, BUY stop below/target above, SELL stop above/target below, stop=0.8-1.2x amplitude, rr=1 decimal.`,
    15000,
    false,
    2000
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
        trade_rationale: t.reason || "",
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

// ── Backtest ──────────────────────────────────────────────────────────────────
export async function fetchBacktest() {
  const text = await claude(
    `Financial backtester. Return ONLY valid JSON array, no markdown.`,
    `Search web for Trump's 8 most impactful market events last 30 days with 24h stock outcomes.
Return: [{"date":"2025-03-10","event":"<45ch","signal":"BUY","ticker":"XOM","predicted":"up","entry_price":115.50,"exit_price":118.15,"actual_24h_pct":2.3,"outcome":"win"}]`,
    0,
    true,
    2000
  );
  return extractJSON(text, true);
}
