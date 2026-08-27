const DEFAULT_BASE_URL = "https://api.firecrawl.dev/v2";

export function firecrawlConfigured() {
  return Boolean(String(process.env.FIRECRAWL_API_KEY || "").trim());
}

export async function scrapeWithFirecrawl(url, options = {}) {
  const apiKey = String(process.env.FIRECRAWL_API_KEY || "").trim();
  if (!apiKey) throw new Error("未配置 FIRECRAWL_API_KEY");

  const baseUrl = String(process.env.FIRECRAWL_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: options.formats || ["html", "markdown"],
      onlyMainContent: options.onlyMainContent ?? false,
      ...(options.waitFor ? { waitFor: Number(options.waitFor) } : {}),
      ...(options.timeout ? { timeout: Number(options.timeout) } : {}),
    }),
    signal: AbortSignal.timeout(Number(options.requestTimeout || 45000)),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(`Firecrawl 请求失败${payload.error ? `：${payload.error}` : `（HTTP ${response.status}）`}`);
  }
  return payload.data || payload;
}

export async function scrapeHtmlWithFirecrawl(url, options = {}) {
  const data = await scrapeWithFirecrawl(url, { ...options, formats: ["html", "markdown"] });
  if (data.html) return data.html;
  if (data.markdown) return markdownToHtml(data.markdown);
  throw new Error("Firecrawl 没有返回可解析正文");
}

function markdownToHtml(markdown) {
  return String(markdown)
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block.replace(/^#+\s*/gm, "").replace(/[*_`]/g, "").trim())}</p>`)
    .filter((block) => block !== "<p></p>")
    .join("\n");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
