// ─────────────────────────────────────────────────────────────────────────────
//  Vercel Serverless — TimesFM Proxy
//  GET  /api/timesfm  → health check
//  POST /api/timesfm  → forecast
//
//  Proxies to HF Space server-side (bypasses browser CORS).
//  8s timeout prevents hitting Vercel's 10s hard limit on Hobby plan.
// ─────────────────────────────────────────────────────────────────────────────

const HF_BASE = "https://onaaction-timesfm-api.hf.space";
const TIMEOUT = 8000; // 8s — safely under Vercel Hobby 10s limit

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

export default async function handler(req, res) {

  // ── GET → health check ──────────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const r = await fetchWithTimeout(`${HF_BASE}/health`);
      if (!r.ok) throw new Error(`HF health ${r.status}`);
      const d = await r.json();
      console.log(`[TIMESFM] Health: ${d.status}`);
      return res.status(200).json(d);
    } catch (err) {
      console.error(`[TIMESFM] Health failed: ${err.message}`);
      return res.status(503).json({ status: "unavailable", error: err.message });
    }
  }

  // ── POST → forecast ─────────────────────────────────────────────────────
  if (req.method === "POST") {
    const { inputs, freq, horizon } = req.body || {};

    if (!inputs?.length) {
      return res.status(400).json({ error: "Missing inputs" });
    }

    console.log(`[TIMESFM] Forecast — series:${inputs[0]?.length} pts | horizon:${horizon}`);

    try {
      const r = await fetchWithTimeout(`${HF_BASE}/api/forecast`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          inputs,
          freq:    freq    ?? [0],
          horizon: horizon ?? 5,
        }),
      });

      if (!r.ok) {
        const errText = await r.text();
        console.error(`[TIMESFM] API error ${r.status}: ${errText}`);
        return res.status(r.status).json({ error: errText });
      }

      const data = await r.json();
      console.log(`[TIMESFM] OK — response keys: ${Object.keys(data).join(", ")}`);
      return res.status(200).json(data);

    } catch (err) {
      console.error(`[TIMESFM] Exception: ${err.message}`);
      // Return 503 so client fallback triggers cleanly
      return res.status(503).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
