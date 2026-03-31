// ─────────────────────────────────────────────────────────────────────────────
//  Vercel Serverless — TimesFM Proxy
//  GET  /api/timesfm  → health check
//  POST /api/timesfm  → forecast
//
//  API contract (from onaaction/timesfm-api README):
//  Request : { "data": [float, ...], "horizon": int }
//  Response: { "success": true, "point_forecast": [...],
//              "volatility": 0.023, "stability_score": 97.6,
//              "trend": "upward", "risk_level": "LOW" }
// ─────────────────────────────────────────────────────────────────────────────

export const config = { maxDuration: 60 };

const HF_BASE = "https://onaaction-timesfm-api.hf.space";

function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

export default async function handler(req, res) {

  // ── GET → health check ──────────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const r = await fetchWithTimeout(`${HF_BASE}/health`, {}, 25000);
      if (!r.ok) throw new Error(`HF ${r.status}`);
      const d = await r.json();
      console.log(`[TIMESFM] Health: ${d.status}`);
      return res.status(200).json(d);
    } catch (err) {
      console.warn(`[TIMESFM] Health failed: ${err.message}`);
      return res.status(200).json({ status: "waking_up", error: err.message });
    }
  }

  // ── POST → forecast ─────────────────────────────────────────────────────
  if (req.method === "POST") {
    const { inputs, horizon } = req.body || {};

    if (!inputs?.length) {
      return res.status(400).json({ error: "Missing inputs" });
    }

    // Client sends [[...]] — API expects flat [...]
    const data = Array.isArray(inputs[0]) ? inputs[0] : inputs;

    console.log(`[TIMESFM] Forecast — ${data.length} pts → horizon ${horizon ?? 5}`);

    try {
      const r = await fetchWithTimeout(`${HF_BASE}/api/forecast`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data,
          horizon: horizon ?? 5,
          // No "freq" parameter — not in the API spec
        }),
      }, 25000);

      if (!r.ok) {
        const errText = await r.text();
        console.error(`[TIMESFM] Error ${r.status}: ${errText}`);
        return res.status(r.status).json({ error: errText });
      }

      const result = await r.json();
      console.log(`[TIMESFM] OK — trend:${result.trend} | risk:${result.risk_level} | stability:${result.stability_score}`);
      return res.status(200).json(result);

    } catch (err) {
      console.error(`[TIMESFM] Exception: ${err.message}`);
      return res.status(503).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
