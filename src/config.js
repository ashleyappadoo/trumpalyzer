// ─────────────────────────────────────────────────────────────────────────────
//  TRUMPALYZER — Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const CLAUDE_API   = "https://api.anthropic.com/v1/messages";
export const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// Your HuggingFace TimesFM Space
export const TIMESFM_FORECAST = "https://onaaction-timesfm-api.hf.space/api/forecast";
export const TIMESFM_HEALTH   = "https://onaaction-timesfm-api.hf.space/health";

// Yahoo Finance
export const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

// App
export const MAX_EVENTS       = 5;
export const FORECAST_HORIZON = 5;   // days
export const FORECAST_HISTORY = 30;  // days of closes sent to TimesFM

// AdSense publisher ID — replace with yours
// export const ADSENSE_CLIENT = "ca-pub-XXXXXXXXXXXXXXXX";
