// ─────────────────────────────────────────────────────────────────────────────
//  Vercel Serverless Function — Trump News Fetcher
//  Route : GET /api/news
//
//  Sources (no rate-limit on Claude):
//  1. NewsAPI.org  (free, 100 req/day) — set NEWSAPI_KEY in Vercel env vars
//  2. GDELT        (completely free, no key needed) — automatic fallback
//
//  Returns: JSON array of { title, source, publishedAt, url, hoursAgo }
// ─────────────────────────────────────────────────────────────────────────────

function hoursAgo(dateStr) {
  try {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 36e5;
    return +diff.toFixed(1);
  } catch { return 24; }
}

// ── Source 1: NewsAPI.org ─────────────────────────────────────────────────────
async function fetchNewsAPI(apiKey) {
  const url = `https://newsapi.org/v2/everything?q=trump&language=en&sortBy=publishedAt&pageSize=15&apiKey=${apiKey}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`NewsAPI ${res.status}`);
  const data = await res.json();
  if (data.status !== "ok") throw new Error(data.message || "NewsAPI error");
  return (data.articles || []).map(a => ({
    title:       a.title,
    source:      a.source?.name || "NewsAPI",
    publishedAt: a.publishedAt,
    url:         a.url,
    description: a.description || "",
    hoursAgo:    hoursAgo(a.publishedAt),
  }));
}

// ── Source 2: GDELT (free, no key) ───────────────────────────────────────────
async function fetchGDELT() {
  const query = encodeURIComponent("trump market economy tariff");
  const url   = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=20&format=json&timespan=48h&sourcelang=english`;
  const res   = await fetch(url);
  if (!res.ok) throw new Error(`GDELT ${res.status}`);
  const data  = await res.json();
  return (data.articles || []).map(a => ({
    title:       a.title,
    source:      a.domain || "GDELT",
    publishedAt: a.seendate ? a.seendate.replace(
      /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
      "$1-$2-$3T$4:$5:$6Z"
    ) : new Date().toISOString(),
    url:         a.url,
    description: "",
    hoursAgo:    hoursAgo(a.seendate),
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const newsApiKey = process.env.NEWSAPI_KEY;
  let articles = [];
  let source   = "";

  // Try NewsAPI first if key configured
  if (newsApiKey) {
    try {
      articles = await fetchNewsAPI(newsApiKey);
      source   = "newsapi";
      console.log(`[NEWS] NewsAPI: ${articles.length} articles`);
    } catch (e) {
      console.warn(`[NEWS] NewsAPI failed: ${e.message} — falling back to GDELT`);
    }
  }

  // Fallback to GDELT
  if (!articles.length) {
    try {
      articles = await fetchGDELT();
      source   = "gdelt";
      console.log(`[NEWS] GDELT: ${articles.length} articles`);
    } catch (e) {
      console.error(`[NEWS] GDELT failed: ${e.message}`);
      return res.status(500).json({ error: `All news sources failed: ${e.message}` });
    }
  }

  // Filter: only recent (< 72h) + has title
  const filtered = articles
    .filter(a => a.title && a.hoursAgo < 72)
    .sort((a, b) => a.hoursAgo - b.hoursAgo)
    .slice(0, 20);

  console.log(`[NEWS] Returning ${filtered.length} articles from ${source}`);
  return res.status(200).json({ articles: filtered, source });
}
