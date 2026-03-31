// ─────────────────────────────────────────────────────────────────────────────
//  Vercel Serverless Function — TimesFM Proxy
//  Route : POST /api/timesfm        → forecast
//          GET  /api/timesfm/health → health check
//
//  Proxies requests to HuggingFace Space server-side to bypass CORS.
//  HF Space: https://onaaction-timesfm-api.hf.space
// ─────────────────────────────────────────────────────────────────────────────

const HF_BASE = "https://onaaction-timesfm-api.hf.space";

export default async function handler(req, res) {
  // Health check
  if (req.method === "GET") {
    try {
      const r = await fetch(`${HF_BASE}/health`, {
        headers: { "Content-Type": "application/json" },
      });
      const d = await r.json();
      console.log(`[TIMESFM] Health: ${d.status}`);
      return res.status(200).json(d);
    } catch (err) {
      console.error(`[TIMESFM] Health check failed: ${err.message}`);
      return res.status(503).json({ status: "unavailable", error: err.message });
    }
  }

  // Forecast
  if (req.method === "POST") {
    const { inputs, freq, horizon } = req.body || {};

    if (!inputs?.length) {
      return res.status(400).json({ error: "Missing inputs" });
    }

    console.log(`[TIMESFM] Forecast — series length: ${inputs[0]?.length} | horizon: ${horizon}`);

    try {
      const r = await fetch(`${HF_BASE}/api/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, freq: freq || [0], horizon: horizon || 5 }),
      });

      if (!r.ok) {
        const err = await r.text();
        console.error(`[TIMESFM] API error ${r.status}: ${err}`);
        return res.status(r.status).json({ error: err });
      }

      const data = await r.json();
      console.log(`[TIMESFM] OK — keys: ${Object.keys(data).join(", ")}`);
      return res.status(200).json(data);

    } catch (err) {
      console.error(`[TIMESFM] Exception: ${err.message}`);
      return res.status(503).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
