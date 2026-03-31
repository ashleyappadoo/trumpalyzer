// ─────────────────────────────────────────────────────────────────────────────
//  Vercel Serverless — TimesFM Proxy
//  GET  /api/timesfm         → health check + wake-up ping
//  POST /api/timesfm         → forecast
//
//  HF Spaces sleep after inactivity — cold start takes 15-25s.
//  Vercel Hobby plan has a 60s function timeout (not 10s — that's only for Edge).
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  maxDuration: 60, // Vercel Pro: up to 300s. Hobby: 60s max
};

const HF_BASE = "https://onaaction-timesfm-api.hf.space";

function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

// ── GET → health check (also serves as wake-up ping) ─────────────────────────
export default async function handler(req, res) {

  if (req.method === "GET") {
    try {
      console.log(`[TIMESFM] Health check / wake-up ping...`);
      const r = await fetchWithTimeout(`${HF_BASE}/health`, {}, 25000);

      if (!r.ok) throw new Error(`HF health ${r.status}`);
      const d = await r.json();
      console.log(`[TIMESFM] Health: ${d.status}`);
      return res.status(200).json(d);

    } catch (err) {
      console.warn(`[TIMESFM] Health check failed (may be waking up): ${err.message}`);
      // Return degraded instead of error — client shows OFFLINE but doesn't crash
      return res.status(200).json({ status: "waking_up", error: err.message });
    }
  }

  // ── POST → forecast ─────────────────────────────────────────────────────
  if (req.method === "POST") {
    const { inputs, freq, horizon } = req.body || {};

    if (!inputs?.length) {
      return res.status(400).json({ error: "Missing inputs" });
    }

    console.log(`[TIMESFM] Forecast request — series:${inputs[0]?.length} | horizon:${horizon}`);

    try {
      // First attempt with 25s timeout
      const r = await fetchWithTimeout(`${HF_BASE}/api/forecast`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          inputs,
          freq:    freq    ?? [0],
          horizon: horizon ?? 5,
        }),
      }, 25000);

      if (!r.ok) {
        const errText = await r.text();
        console.error(`[TIMESFM] API error ${r.status}: ${errText}`);
        return res.status(r.status).json({ error: errText });
      }

      const data = await r.json();
      console.log(`[TIMESFM] Forecast OK — keys: ${Object.keys(data).join(", ")}`);
      return res.status(200).json(data);

    } catch (err) {
      console.error(`[TIMESFM] Forecast failed: ${err.message}`);
      return res.status(503).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
