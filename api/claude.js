// ─────────────────────────────────────────────────────────────────────────────
//  Vercel Serverless Function — Claude API Proxy
//  Route : POST /api/claude
//
//  - ANTHROPIC_API_KEY in Vercel env vars only
//  - web_search removed: news now fetched via /api/news (GDELT/NewsAPI)
//  - Claude only does NLP + calculation — token usage ~300-500/request
// ─────────────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callAnthropic(apiKey, body, attempt = 1) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 && attempt < 4) {
    const wait = attempt * 10000; // 10s, 20s, 30s
    console.log(`[CLAUDE] 429 retry ${attempt}/3 in ${wait}ms`);
    await sleep(wait);
    return callAnthropic(apiKey, body, attempt + 1);
  }

  return res;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[CLAUDE] ANTHROPIC_API_KEY not set");
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { system, userMsg, max_tokens = 1500, delayMs = 0 } = req.body || {};

  if (!userMsg) {
    return res.status(400).json({ error: "Missing userMsg" });
  }

  console.log(`[CLAUDE] Request — max_tokens:${max_tokens} | delayMs:${delayMs} | userMsg:${userMsg.length} chars`);

  if (delayMs > 0) {
    console.log(`[CLAUDE] Waiting ${delayMs}ms...`);
    await sleep(delayMs);
  }

  try {
    const response = await callAnthropic(apiKey, {
      model:    "claude-sonnet-4-20250514",
      max_tokens,
      system:   system || "",
      messages: [{ role: "user", content: userMsg }],
      // NO tools — web_search removed, news fetched via /api/news
    });

    console.log(`[CLAUDE] Status: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[CLAUDE] Error ${response.status}: ${errText}`);
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";

    console.log(`[CLAUDE] OK — ${text.length} chars | stop:${data.stop_reason} | tokens in:${data.usage?.input_tokens} out:${data.usage?.output_tokens}`);

    return res.status(200).json({ text });

  } catch (err) {
    console.error(`[CLAUDE] Exception: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
