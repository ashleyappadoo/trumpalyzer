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
    const wait = attempt * 15000;
    console.log(`429 rate limit — retry ${attempt}/3 in ${wait}ms`);
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
    console.error("[TRUMPALYZER] FATAL: ANTHROPIC_API_KEY is not set in Vercel env vars");
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { system, userMsg, max_tokens = 2000, delayMs = 0, useWebSearch = false } = req.body || {};

  if (!userMsg) {
    console.error("[TRUMPALYZER] Bad request: missing userMsg");
    return res.status(400).json({ error: "Missing userMsg" });
  }

  console.log(`[TRUMPALYZER] Request — useWebSearch:${useWebSearch} | delayMs:${delayMs} | max_tokens:${max_tokens} | userMsg length:${userMsg.length}`);

  if (delayMs > 0) {
    console.log(`[TRUMPALYZER] Waiting ${delayMs}ms before calling Anthropic...`);
    await sleep(delayMs);
  }

  const anthropicBody = {
    model:    "claude-sonnet-4-20250514",
    max_tokens,
    system:   system || "",
    messages: [{ role: "user", content: userMsg }],
  };

  if (useWebSearch) {
    anthropicBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  console.log(`[TRUMPALYZER] Calling Anthropic — model:${anthropicBody.model} | tools:${useWebSearch ? "web_search" : "none"}`);

  try {
    const response = await callAnthropic(apiKey, anthropicBody);

    console.log(`[TRUMPALYZER] Anthropic response status: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TRUMPALYZER] Anthropic error ${response.status}: ${errText}`);
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    console.log(`[TRUMPALYZER] Response blocks: ${data.content?.length} | stop_reason: ${data.stop_reason}`);

    const text = data.content?.find(b => b.type === "text")?.text || "";

    if (!text) {
      console.warn(`[TRUMPALYZER] No text block. Content types: ${data.content?.map(b => b.type).join(", ")}`);
    } else {
      console.log(`[TRUMPALYZER] Text response: ${text.length} chars`);
    }

    return res.status(200).json({ text });

  } catch (err) {
    console.error(`[TRUMPALYZER] Fetch exception: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
