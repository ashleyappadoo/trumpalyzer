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
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { system, userMsg, max_tokens = 2000, delayMs = 0, useWebSearch = false } = req.body || {};
  if (!userMsg) {
    return res.status(400).json({ error: "Missing userMsg" });
  }

  if (delayMs > 0) await sleep(delayMs);

  // Only include web_search tool when explicitly requested
  const tools = useWebSearch
    ? [{ type: "web_search_20250305", name: "web_search" }]
    : undefined;

  try {
    const body = {
      model:    "claude-sonnet-4-20250514",
      max_tokens,
      system:   system || "",
      messages: [{ role: "user", content: userMsg }],
    };
    if (tools) body.tools = tools;

    const response = await callAnthropic(apiKey, body);

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
