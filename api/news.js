// ─────────────────────────────────────────────────────────────────────────────
//  Vercel Serverless — Trump News Fetcher
//  Route : GET /api/news
//
//  Sources:
//  1. NewsAPI.org  — set NEWSAPI_KEY in Vercel env vars (100 req/day free)
//  2. GDELT        — free fallback, no key needed
//
//  Returns articles sorted: most recent first (hoursAgo ascending)
// ─────────────────────────────────────────────────────────────────────────────

function hoursAgo(dateStr) {
  try {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 36e5;
    return +diff.toFixed(1);
  } catch { return 99; }
}

// ── Source 1: NewsAPI.org ─────────────────────────────────────────────────────
async function fetchNewsAPI(apiKey) {
  // Use specific Trump-related queries for market-relevant news
  const query = encodeURIComponent(
    'Trump AND (tariff OR market OR stock OR economy OR trade OR Fed OR dollar OR oil OR crypto)'
  );
  const url = `https://newsapi.org/v2/everything?q=${query}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${apiKey}`;

  const res  = await fetch(url);
  if (!res.ok) throw new Error(`NewsAPI ${res.status}`);
  const data = await res.json();
  if (data.status !== "ok") throw new Error(data.message || "NewsAPI error");

  return (data.articles || [])
    .filter(a => a.title && !a.title.includes("[Removed]"))
    .map(a => ({
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
  const query = encodeURIComponent("trump tariff economy market trade stock");
  const url   = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=25&format=json&timespan=48h&sourcelang=english`;

  const res  = await fetch(url);
  if (!res.ok) throw new Error(`GDELT ${res.status}`);
  const data = await res.json();

  return (data.articles || [])
    .filter(a => a.title)
    .map(a => {
      const dateStr = a.seendate
        ? a.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6Z")
        : new Date().toISOString();
      return {
        title:       a.title,
        source:      a.domain || "GDELT",
        publishedAt: dateStr,
        url:         a.url,
        description: "",
        hoursAgo:    hoursAgo(dateStr),
      };
    });
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const newsApiKey = process.env.NEWSAPI_KEY;
  let articles = [];
  let source   = "";

  if (newsApiKey) {
    try {
      articles = await fetchNewsAPI(newsApiKey);
      source   = "newsapi";
      console.log(`[NEWS] NewsAPI: ${articles.length} articles`);
    } catch (e) {
      console.warn(`[NEWS] NewsAPI failed: ${e.message} → GDELT fallback`);
    }
  }

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

  // ── Strict chronological sort: most recent first ──────────────────────────
  const filtered = articles
    .filter(a => a.title && a.hoursAgo < 72 && a.hoursAgo >= 0)
    .sort((a, b) => a.hoursAgo - b.hoursAgo)  // ascending = most recent first
    .slice(0, 20);

  console.log(`[NEWS] ${filtered.length} articles from ${source}, most recent: ${filtered[0]?.hoursAgo}h ago`);
  return res.status(200).json({ articles: filtered, source });
}
