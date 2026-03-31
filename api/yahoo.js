// ─────────────────────────────────────────────────────────────────────────────
//  Vercel Serverless — Yahoo Finance Proxy
//  Route : GET /api/yahoo?ticker=XOM
//
//  Proxies Yahoo Finance server-side to bypass browser CORS restrictions.
//  Returns: { closes, current, change, ticker }
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { ticker } = req.query;
  if (!ticker) {
    return res.status(400).json({ error: "Missing ticker param" });
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=40d`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Trumpalyzer/1.0)",
        "Accept":     "application/json",
      },
    });

    if (!r.ok) {
      // Try fallback Yahoo endpoint
      const r2 = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=40d`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (!r2.ok) throw new Error(`Yahoo ${r.status}`);
      const d2 = await r2.json();
      return res.status(200).json(processYahoo(ticker, d2));
    }

    const d = await r.json();
    console.log(`[YAHOO] ${ticker} OK`);
    return res.status(200).json(processYahoo(ticker, d));

  } catch (err) {
    console.error(`[YAHOO] ${ticker} failed: ${err.message}`);
    return res.status(503).json({ error: err.message });
  }
}

function processYahoo(ticker, d) {
  const r = d.chart?.result?.[0];
  if (!r) throw new Error("No chart data");

  const raw    = r.indicators.quote[0].close;
  const closes = raw.map((v, i) => v ?? raw[i - 1] ?? 0).filter(Boolean);
  const cur    = closes.at(-1);
  const prev   = closes.at(-2);

  return {
    ticker,
    closes,
    current: cur,
    change:  prev ? ((cur - prev) / prev) * 100 : 0,
  };
}
