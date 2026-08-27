import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDataShape } from "../data-shape.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputFile = path.join(root, "data", "steam", "pc-news-sample.json");
const currentDataFile = path.join(root, "data", "current.json");
const shouldWriteCrawlCache = process.env.NEWWIKI_WRITE_CRAWL_CACHE === "1";
const FETCH_TIMEOUT_MS = Number(process.env.NEWWIKI_CRAWL_FETCH_TIMEOUT_MS || 15000);

const sources = [
  { key: "gcores", name: "机核", url: "https://www.gcores.com/news", parser: parseGcores },
  { key: "gamersky", name: "游民星空", url: "https://www.gamersky.com/news/", parser: parseGamersky },
  { key: "ali213", name: "游侠网", url: "https://www.ali213.net/news/game/", parser: parseAli213 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanText(value = "") {
  return decodeHtml(String(value || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

function absoluteImageUrl(src, base) {
  const value = String(src || "").trim();
  if (!value) return "";
  const url = absoluteUrl(decodeHtml(value), base);
  return /\.(?:avif|webp|png|jpe?g|gif)(?:$|[?#])/i.test(url) ? url : "";
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 NewgameWikiPcNews/0.2",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    } catch (error) {
      lastError = error?.name === "AbortError" ? new Error(`${url} 请求超时`) : error;
      if (attempt === 0) await sleep(350);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function inferCategory(text = "") {
  if (/裁员|收购|财报|发行商|开发商|工作室|投资|诉讼|停运|终止合作|关闭|终止运营/.test(text)) return "行业";
  if (/发售|上线|登陆|登录|上架|公布|公开|新作|新游|新品节|Demo|试玩/.test(text)) return "资讯";
  if (/更新|补丁|DLC|版本|赛季|联动|活动/.test(text)) return "更新";
  if (/销量|在线|峰值|爆火|大热|热度|玩家数|破[万亿]/.test(text)) return "热门";
  return "资讯";
}

const newsTypeTags = new Set(["资讯", "更新", "行业", "活动", "评测", "攻略", "赛事", "传闻", "热门"]);
const genericRelatedGameWords = new Set([
  "其他",
  "索尼",
  "微软",
  "任天堂",
  "腾讯",
  "网易",
  "暴雪",
  "育碧",
  "EA",
  "Valve",
  "Steam",
  "Xbox",
  "PS",
  "PS5",
  "PS4",
  "PlayStation",
  "Switch",
  "PC",
  "电玩店",
  "影视飓风",
]);

function extractGameName(text = "") {
  const quoted = String(text).match(/《([^》]{2,40})》/);
  if (quoted) return quoted[1].trim();
  const english = String(text).match(/([A-Z][A-Za-z0-9:'’\-\s]{2,40})(?=》|：|:|将|现|新|因|发布|公布|发售)/);
  return english ? english[1].trim() : "";
}

function normalizeNewsTypeTag(value = "") {
  const text = cleanText(value)
    .replace(/^(游戏新闻|综合资讯|端游资讯|新闻)$/i, "资讯")
    .replace(/^新游$/, "资讯");
  if (/^(资讯|新闻|游戏新闻|综合资讯|端游资讯)$/.test(text)) return "资讯";
  if (/更新|补丁|DLC|版本|赛季|联动|活动/.test(text)) return text === "活动" ? "活动" : "更新";
  if (/评测|测评/.test(text)) return "评测";
  if (/攻略|指南|教程/.test(text)) return "攻略";
  if (/赛事|电竞|比赛/.test(text)) return "赛事";
  if (/传闻|爆料|泄露/.test(text)) return "传闻";
  if (/行业|厂商|财报|收购|裁员|工作室|发行商|开发商/.test(text)) return "行业";
  if (/热门|热度|销量|在线|峰值|爆火/.test(text)) return "热门";
  return newsTypeTags.has(text) ? text : "";
}

function cleanNewsTags(tags = [], category = "资讯") {
  const result = [normalizeNewsTypeTag(category)];
  for (const tag of tags || []) result.push(normalizeNewsTypeTag(tag));
  return [...new Set(result.filter(Boolean))].slice(0, 4);
}

function normalizeRelatedGame(value = "", title = "", summary = "") {
  const quoted = extractGameName(`${title} ${summary}`);
  const text = cleanText(quoted || value);
  if (!text) return "其他";
  if (genericRelatedGameWords.has(text) || /^PS\d?$/i.test(text)) return "其他";
  if (/^(Steam|PC|主机|游戏|新闻|资讯|端游|行业|活动|更新|攻略|评测|赛事)$/i.test(text)) return "其他";
  if (/官方|二手|教学|视频|平台|商店|主机|实体版|数字版|硬件|显卡|掌机|股东|大会|加薪|退休|发布会/.test(text) && !/[：:]/.test(text)) return "其他";
  if (text.length > 28 && !/[A-Za-z]/.test(text)) return "其他";
  if (text.length > 42) return "其他";
  return text;
}

function buildRecord({ title, summary = "", detailUrl, imageUrl = "", source, sourceKey, timeText = "", heat = 0, detail = {} }) {
  const safeDetail = detail || {};
  const safeTitle = cleanText(title);
  if (!safeTitle || safeTitle.length < 6 || /登录|注册|广告|APP|首页|论坛|攻略|补丁|下载/.test(safeTitle)) return null;
  if (/手游|手机游戏|移动端|安卓|iOS|直播|动漫|电影|剧集|硬件|显卡|CPU|掌机配件/.test(safeTitle) && !/Steam|PC|主机|Xbox|PlayStation|Switch|任天堂|索尼|微软/.test(safeTitle)) return null;
  if (!/(Steam|PC|端游|主机|单机|Xbox|PlayStation|Switch|任天堂|索尼|微软|Valve|发售|上线|登陆|上架|公布|公开|预告|Demo|试玩|DLC|补丁|更新|玩家|销量|工作室|发行商|开发商|类魂|RPG|FPS|独立游戏|游戏)/i.test(`${safeTitle} ${summary}`)) return null;
  const detailSummary = cleanText(safeDetail.summary || "");
  const detailTags = Array.isArray(safeDetail.tags) ? safeDetail.tags.map(cleanText).filter(Boolean) : [];
  const mergedSummary = detailSummary || cleanText(summary) || safeTitle;
  const category = inferCategory(`${safeTitle} ${mergedSummary} ${detailTags.join(" ")}`);
  const relatedGame = normalizeRelatedGame(extractGameName(safeTitle) || extractGameName(mergedSummary) || detailTags.find((tag) => !/资讯|游戏|科技|PC|端游|新闻/.test(tag)) || "", safeTitle, mergedSummary);
  const eventAt = safeDetail.publishedAt || parseTime(timeText);
  const publishText = safeDetail.timeText || timeText;
  const tags = cleanNewsTags(detailTags, category);
  return {
    id: `pc-news-${sourceKey}-${Math.abs(hashCode(detailUrl || safeTitle))}`,
    gameName: relatedGame || safeTitle,
    newsTitle: safeTitle,
    relatedGame,
    status: category,
    eventType: category,
    eventAt,
    publishText,
    vendor: safeDetail.author || "",
    gameplayTags: relatedGame === "其他" ? ["行业"] : [],
    tags,
    rawTags: detailTags,
    summary: mergedSummary,
    updateContent: mergedSummary,
    sources: [source],
    platform: source,
    detailUrl,
    originalUrl: detailUrl,
    iconUrl: safeDetail.imageUrl || imageUrl,
    heat,
    author: safeDetail.author || "",
    category: safeDetail.category || category,
    sourceRecords: [{
      source,
      sourceKey,
      status: category,
      eventType: category,
      eventAt,
      publishText,
      summary: mergedSummary,
      updateContent: mergedSummary,
      detailUrl,
      originalUrl: detailUrl,
      author: safeDetail.author || "",
      category: safeDetail.category || category,
      tags,
      rawTags: detailTags,
    }],
  };
}

export function sanitizePcNewsRecord(record = {}) {
  const rawTags = Array.isArray(record.rawTags)
    ? record.rawTags
    : Array.isArray(record.tags)
      ? record.tags
      : [];
  const title = record.newsTitle || record.title || record.gameName || "";
  const summary = record.summary || record.updateContent || "";
  const category = normalizeNewsTypeTag(record.category || record.status || record.eventType) || inferCategory(`${title} ${summary} ${rawTags.join(" ")}`);
  const relatedGame = normalizeRelatedGame(record.relatedGame || extractGameName(title) || extractGameName(summary) || "", title, summary);
  const tags = cleanNewsTags(rawTags, category);
  const next = {
    ...record,
    gameName: relatedGame === "其他" ? (record.newsTitle || title || record.gameName) : relatedGame,
    relatedGame,
    status: category,
    eventType: category,
    category,
    tags,
    rawTags,
    gameplayTags: relatedGame === "其他" ? ["行业"] : [],
  };
  next.sourceRecords = (record.sourceRecords || []).map((sourceRecord) => {
    const sourceRawTags = Array.isArray(sourceRecord.rawTags)
      ? sourceRecord.rawTags
      : Array.isArray(sourceRecord.tags)
        ? sourceRecord.tags
        : rawTags;
    const sourceCategory = normalizeNewsTypeTag(sourceRecord.category || sourceRecord.status || category) || category;
    return {
      ...sourceRecord,
      status: sourceCategory,
      eventType: sourceCategory,
      category: sourceCategory,
      tags: cleanNewsTags(sourceRawTags, sourceCategory),
      rawTags: sourceRawTags,
    };
  });
  return next;
}

function shouldFetchNewsDetail({ title = "", imageUrl = "", timeText = "" } = {}) {
  return !cleanText(title) || !cleanText(imageUrl) || !cleanText(timeText);
}

function recordUrlKey(url = "") {
  return String(url || "").split("#")[0].replace(/[?&]utm_[^=&]+=[^&]+/gi, "").replace(/[?&]$/, "").trim().toLowerCase();
}

function buildExistingNewsMap(records = []) {
  const map = new Map();
  for (const record of records || []) {
    for (const url of [record.detailUrl, record.originalUrl, ...(record.sourceRecords || []).flatMap((item) => [item.detailUrl, item.originalUrl])]) {
      const key = recordUrlKey(url);
      if (key && !map.has(key)) map.set(key, record);
    }
  }
  return map;
}

function detailFromExistingNews(record = null) {
  if (!record) return null;
  return {
    title: record.newsTitle || record.gameName || "",
    summary: record.summary || record.updateContent || "",
    imageUrl: record.iconUrl || "",
    author: record.author || record.vendor || "",
    publishedAt: record.publishedAt || record.eventAt || "",
    timeText: record.publishText || "",
    category: record.category || record.status || "资讯",
    tags: record.rawTags || record.tags || [],
    detailUrl: record.detailUrl || record.originalUrl || "",
  };
}

function hashCode(value = "") {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash) + value.charCodeAt(index) | 0;
  return hash;
}

function parseTime(value = "") {
  const text = cleanText(value);
  const now = new Date();
  if (/分钟前/.test(text)) return now.toISOString();
  if (/小时前/.test(text)) {
    const hour = Number(text.match(/(\d+)/)?.[1] || 0);
    return new Date(now.getTime() - hour * 3600000).toISOString();
  }
  const full = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (full) return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}T${full[4].padStart(2, "0")}:${full[5].padStart(2, "0")}:${(full[6] || "0").padStart(2, "0")}+08:00`;
  const zh = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (zh) return `${zh[1]}-${zh[2].padStart(2, "0")}-${zh[3].padStart(2, "0")}T10:00:00+08:00`;
  const md = text.match(/(\d{1,2})[-/.月](\d{1,2})/);
  if (md) return `${now.getFullYear()}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}T10:00:00+08:00`;
  return now.toISOString();
}

async function parseGcores(html, source, { existingByUrl = new Map() } = {}) {
  const records = [];
  const pattern = /<a class="news" href="([^"]+)"[\s\S]*?background-image:url\(([^)]+)\)[\s\S]*?<h3>([\s\S]*?)<\/h3>[\s\S]*?<div class="news_meta">([\s\S]*?)<\/div>/g;
  for (const match of html.matchAll(pattern)) {
    const meta = cleanText(match[4]);
    const likes = Number(meta.match(/(\d+)\s*喜欢/)?.[1] || 0);
    const comments = Number(meta.match(/(\d+)\s*评论/)?.[1] || 0);
    const detailUrl = absoluteUrl(match[1], source.url);
    const listTitle = cleanText(match[3]);
    const listImage = cleanImageUrl(match[2].split("?")[0]);
    let detail = detailFromExistingNews(existingByUrl.get(recordUrlKey(detailUrl)));
    if (!detail && shouldFetchNewsDetail({ title: listTitle, imageUrl: listImage, timeText: meta })) {
      try {
        detail = parseGcoresDetail(await fetchText(detailUrl), detailUrl);
        await sleep(120);
      } catch {
        detail = {};
      }
    }
    const safeDetail = detail || {};
    const record = buildRecord({
      title: safeDetail.title || listTitle,
      summary: safeDetail.summary || "",
      detailUrl,
      imageUrl: listImage,
      source: source.name,
      sourceKey: source.key,
      timeText: meta,
      heat: likes * 2 + comments,
      detail: safeDetail,
    });
    if (record) records.push(record);
  }
  return records;
}

function parseGcoresDetail(html, detailUrl) {
  const title = cleanText(html.match(/<h1 class="originalPage_title">([\s\S]*?)<\/h1>/)?.[1] || "");
  const summary = cleanText(
    html.match(/<p class="originalPage_desc">([\s\S]*?)<\/p>/)?.[1] ||
    html.match(/<meta name="description" content="([^"]*)"/)?.[1] ||
    ""
  );
  const imageUrl = cleanImageUrl(html.match(/<img class="newsPage_cover" src="([^"]+)"/)?.[1] || "");
  const userInfo = html.match(/<div class="originalPage_userInfo">([\s\S]*?)<\/div><div class="newsPage_story">/)?.[1] || "";
  const author = cleanText(userInfo.match(/<span class="me-2">([\s\S]*?)<\/span>/)?.[1] || "");
  const timeNode = userInfo.match(/<span class="me-2 u_color-gray-info" title="([^"]+)">([\s\S]*?)<\/span>/);
  const publishedAt = timeNode?.[1] ? new Date(`${timeNode[1].replace(" ", "T")}+08:00`).toISOString() : "";
  const timeText = cleanText(timeNode?.[2] || "");
  const category = cleanText(userInfo.match(/<a class="u_color-category"[^>]*>([\s\S]*?)<\/a>/)?.[1] || "");
  const labelBlock = html.match(/<div class="originalPage_labels">([\s\S]*?)<\/div>/)?.[1] || "";
  const tags = [...labelBlock.matchAll(/<a class="label is_tags"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => cleanText(match[1])).filter(Boolean);
  return { title, summary, imageUrl, author, publishedAt, timeText, category, tags, detailUrl };
}

function cleanImageUrl(value = "") {
  const url = decodeHtml(value).trim();
  return url ? url.split("?")[0] : "";
}

async function parseGamersky(html, source, { existingByUrl = new Map() } = {}) {
  const records = [];
  const listPattern = /<li>\s*<div class="tit"><a class="tt" href="([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/div>[\s\S]*?<div class="img">[\s\S]*?<img src="([^"]+)"[\s\S]*?<div class="txt">([\s\S]*?)<\/div>[\s\S]*?<div class="time">([^<]+)<\/div>[\s\S]*?data-sid="([^"]+)"/g;
  for (const match of html.matchAll(listPattern)) {
    const detailUrl = absoluteUrl(match[1], source.url);
    const title = cleanText(match[2] || match[3]);
    const summary = cleanText(match[5]);
    if (!isGamerskyPcNewsCandidate(`${title} ${summary}`)) continue;
    const imageUrl = cleanImageUrl(absoluteImageUrl(match[4], source.url));
    const timeText = cleanText(match[6]);
    const heat = Number(match[7] || 0) % 1000;
    let detail = detailFromExistingNews(existingByUrl.get(recordUrlKey(detailUrl)));
    if (!detail && shouldFetchNewsDetail({ title, imageUrl, timeText })) {
      try {
        detail = parseGamerskyDetail(await fetchText(detailUrl), detailUrl);
        await sleep(120);
      } catch {
        detail = {};
      }
    }
    const safeDetail = detail || {};
    const record = buildRecord({
      title: safeDetail.title || title,
      summary: safeDetail.summary || summary,
      detailUrl,
      imageUrl,
      source: source.name,
      sourceKey: source.key,
      timeText,
      heat,
      detail: safeDetail,
    });
    if (record) records.push(record);
  }
  return records;
}

function isGamerskyPcNewsCandidate(text = "") {
  const value = cleanText(text);
  if (/电动车|手机|短剧|电影|电视剧|艺人|网红|汽车|显卡|CPU|笔电|内存|硬盘|AI|机器人/.test(value) && !/Steam|PC|主机|PS5|Xbox|Switch|任天堂|索尼|微软|游戏|发售|上线|Demo|试玩/.test(value)) return false;
  if (/账号|玩家|网友|COS|cos|评论区|模特/.test(value) && !/Steam|PC|PS5|Xbox|Switch|主机|单机|发售|公布|更新|DLC|Demo|试玩|工作室|开发商|发行商|销量/.test(value)) return false;
  return /(Steam|PC|端游|主机|单机|PS5|Xbox|PlayStation|Switch|任天堂|索尼|微软|发售|上线|登陆|上架|公布|公开|Demo|试玩|DLC|补丁|更新|玩家|销量|工作室|发行商|开发商|类魂|RPG|FPS|独立游戏|游戏)/i.test(value);
}

function parseGamerskyDetail(html, detailUrl) {
  const title = cleanText(
    html.match(/<div class="Mid2L_tit">[\s\S]*?<h1>([\s\S]*?)<\/h1>/)?.[1] ||
    html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/_\s*游民星空[\s\S]*$/i, "") ||
    ""
  );
  const metaDescription = cleanText(html.match(/<meta name="description" content="([^"]*)"/)?.[1] || "");
  const imageUrl = cleanImageUrl(html.match(/<meta itemprop="image" content="([^"]+)"/)?.[1] || "");
  const detailText = cleanText(html.match(/<div class="detail">([\s\S]*?)<\/div>/)?.[1] || "");
  const timeMatch = detailText.match(/(\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)/);
  const author = cleanText(detailText.match(/作者：([^　\s]+)/)?.[1] || detailText.match(/编辑：([^　\s]+)/)?.[1] || "");
  const publishedAt = timeMatch ? new Date(`${timeMatch[1].replace(" ", "T")}+08:00`).toISOString() : "";
  const contentBlock = html.match(/<div class="Mid2L_con">([\s\S]*?)<!--\{pe\.begin\.pagination\}-->/)?.[1] || "";
  const paragraphs = [...contentBlock.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((match) => cleanText(match[1]))
    .filter((text) => text && !/本文由游民星空|未经允许|责任编辑|友情提示|点击进入/.test(text));
  const summary = paragraphs.find((text) => text.length >= 8 && !/^完整更新日志/.test(text)) || metaDescription;
  const keywordTags = cleanText(html.match(/<meta name="keywords" content="([^"]*)"/)?.[1] || "")
    .split(/[,，、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  const category = cleanText(html.match(/<div class="Mid2L_crumb">[\s\S]*?<a[^>]*>([^<]*资讯[^<]*)<\/a>/)?.[1] || "");
  return { title, summary, imageUrl, author, publishedAt, timeText: timeMatch?.[1] || "", category, tags: keywordTags, detailUrl };
}

async function parseAli213(html, source, { existingByUrl = new Map() } = {}) {
  const records = [];
  const listPattern = /<div class="n_lone">[\s\S]*?<h2 class="lone_t"><a href="([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?<div class="lone_f_l">[\s\S]*?<img src="([^"]+)"[\s\S]*?<div class="lone_f_r_t">([\s\S]*?)<\/div>[\s\S]*?<div class="lone_f_r_f">[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<span>小编：([^<]+)<\/span>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>/g;
  for (const match of html.matchAll(listPattern)) {
    const detailUrl = absoluteUrl(match[1], source.url);
    const title = cleanText(match[2] || match[3]);
    const summary = cleanText(match[5]);
    if (!isAli213PcNewsCandidate(`${title} ${summary}`)) continue;
    const imageUrl = cleanImageUrl(absoluteImageUrl(match[4], source.url));
    const timeText = cleanText(match[6]);
    const author = cleanText(match[7]);
    let detail = detailFromExistingNews(existingByUrl.get(recordUrlKey(detailUrl))) || { author, summary, imageUrl, timeText };
    if (!existingByUrl.has(recordUrlKey(detailUrl)) && shouldFetchNewsDetail({ title, imageUrl, timeText })) {
      try {
        const pageDetail = parseAli213Detail(await fetchText(detailUrl), detailUrl);
        detail = { ...detail, ...pageDetail, imageUrl: pageDetail.imageUrl || imageUrl, author: pageDetail.author || author };
        await sleep(120);
      } catch {
        detail = { author, summary, imageUrl, timeText };
      }
    }
    const safeDetail = detail || {};
    const record = buildRecord({
      title: safeDetail.title || title,
      summary: safeDetail.summary || summary,
      detailUrl,
      imageUrl,
      source: source.name,
      sourceKey: source.key,
      timeText,
      heat: Math.abs(hashCode(`${title}-${timeText}`)) % 1000,
      detail: safeDetail,
    });
    if (record) records.push(record);
  }
  return records;
}

function isAli213PcNewsCandidate(text = "") {
  const value = cleanText(text);
  if (/手游|手机游戏|移动端|安卓|iOS|页游|电影|剧集|动漫|娱乐|网红|美女|写真/.test(value) && !/Steam|PC|主机|PS5|Xbox|Switch|任天堂|索尼|微软|游戏|发售|上线|Demo|试玩/.test(value)) return false;
  if (/COS|cos|小姐姐|女星|男星|福利图|美图/.test(value) && !/Steam|PC|PS5|Xbox|Switch|主机|单机|发售|公布|更新|DLC|Demo|试玩|工作室|开发商|发行商|销量/.test(value)) return false;
  return /(Steam|PC|端游|主机|单机|PS5|Xbox|PlayStation|Switch|任天堂|索尼|微软|发售|上线|登陆|上架|公布|公开|Demo|试玩|DLC|补丁|更新|玩家|销量|工作室|发行商|开发商|类魂|RPG|FPS|独立游戏|游戏)/i.test(value);
}

function parseAli213Detail(html, detailUrl) {
  const title = cleanText(
    html.match(/<h1 class="newstit">([\s\S]*?)<\/h1>/)?.[1] ||
    html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/_游侠网[\s\S]*$/i, "") ||
    ""
  );
  const metaDescription = cleanText(html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || "");
  const metaTags = cleanText(html.match(/<meta\s+name="keywords"\s+content="([^"]*)"/i)?.[1] || "")
    .split(/[,，、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  const tagBlock = html.match(/<div class="news_gt"[^>]*>[\s\S]*?<\/div>/)?.[0] || "";
  const pageTags = [...tagBlock.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((match) => cleanText(match[1])).filter(Boolean);
  const gameCard = html.match(/<div class="gamecard_pc">([\s\S]*?)<\/div><div class="pf">/)?.[1] || "";
  const cardTitle = cleanText(gameCard.match(/<div class="tit">[\s\S]*?<a[^>]*title="([^"]+)"/)?.[1] || "");
  const cardType = cleanText(gameCard.match(/<div class="type">游戏类型：([\s\S]*?)<\/div>/)?.[1] || "");
  const cardImage = cleanImageUrl(extractAli213Image(gameCard, detailUrl));
  const tagLine = cleanText(html.match(/<div class="newstag_l">([\s\S]*?)<\/div>/)?.[1] || "");
  const timeMatch = tagLine.match(/(\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)/);
  const author = cleanText(tagLine.match(/编辑：([^\s　]+)/)?.[1] || "");
  const publishedAt = timeMatch ? new Date(`${timeMatch[1].replace(" ", "T")}+08:00`).toISOString() : "";
  const contentBlock = html.match(/<div class="n_show box-shadow" id="Content">([\s\S]*?)<script>/)?.[1] || "";
  const paragraphs = [...contentBlock.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((match) => cleanText(match[1]))
    .filter((text) => text && !/游侠网|责任编辑|更多内容|点击进入|友情提示/.test(text));
  const firstImage = cleanImageUrl(extractAli213Image(contentBlock, detailUrl));
  const metaImage = cleanImageUrl(absoluteImageUrl(
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ||
    "",
    detailUrl,
  ));
  const summary = paragraphs.find((text) => text.length >= 8) || metaDescription;
  const tags = [...new Set([...metaTags, ...pageTags, cardTitle, cardType].filter(Boolean))];
  return {
    title,
    summary,
    imageUrl: cardImage || firstImage || metaImage,
    author,
    publishedAt,
    timeText: timeMatch?.[1] || "",
    category: "资讯",
    tags,
    detailUrl,
  };
}

function extractAli213Image(block = "", base = "") {
  const imagePatterns = [
    /<img[^>]+data-original=["']([^"']+)["']/i,
    /<img[^>]+data-src=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["']/i,
    /background(?:-image)?\s*:\s*url\((['"]?)([^'")]+)\1\)/i,
  ];
  for (const pattern of imagePatterns) {
    const match = block.match(pattern);
    const raw = match?.[2] || match?.[1] || "";
    const url = cleanImageUrl(absoluteImageUrl(raw, base));
    if (url) return url;
  }
  return "";
}

function parseGenericLinks(html, source) {
  const records = [];
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g)];
  for (const match of links) {
    const href = absoluteUrl(match[1], source.url);
    const title = cleanText(match[2]);
    if (!/^https?:\/\//.test(href)) continue;
    if (!/\d{4}|news|html|shtml|\/articles\//i.test(href)) continue;
    if (!/(游戏|Steam|PC|主机|发售|上线|新作|公布|更新|DLC|玩家|销量|工作室|Xbox|PlayStation|Switch|任天堂|索尼|微软|类魂|RPG|FPS)/i.test(title)) continue;
    const image = match[0].match(/<img[^>]+src=["']([^"']+)["']/)?.[1] || "";
    const record = buildRecord({
      title,
      detailUrl: href,
      imageUrl: image ? absoluteUrl(image, source.url) : "",
      source: source.name,
      sourceKey: source.key,
    });
    if (record) records.push(record);
  }
  return records;
}

function dedupe(records) {
  const seen = new Set();
  const result = [];
  for (const record of records) {
    const key = `${record.newsTitle.replace(/\s/g, "")}-${record.sources[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

export async function samplePcNews({ limitPerSource = 20, apply = false, sourceKeys = [], existingRecords = [] } = {}) {
  const selectedKeys = new Set((sourceKeys || []).filter(Boolean));
  const activeSources = selectedKeys.size ? sources.filter((source) => selectedKeys.has(source.key) || selectedKeys.has(source.name)) : sources;
  const all = [];
  const issues = [];
  const crawlDiagnostics = {};
  const existingByUrl = buildExistingNewsMap(existingRecords);
  for (const source of activeSources) {
    const startedAt = Date.now();
    try {
      const html = await fetchText(source.url);
      const records = (await source.parser(html, source, { existingByUrl })).slice(0, limitPerSource);
      all.push(...records);
      crawlDiagnostics[source.key] = buildNewsDiagnostic(source.key, records, [], startedAt, "html+detail");
      await sleep(500);
    } catch (error) {
      const issue = { source: source.name, url: source.url, type: "列表失败", message: error?.message || "抓取失败" };
      issues.push(issue);
      crawlDiagnostics[source.key] = buildNewsDiagnostic(source.key, [], [issue], startedAt, "failed", error);
    }
  }
  const records = dedupe(all).slice(0, 60);
  const result = { generatedAt: new Date().toISOString(), source: "PC/端游资讯聚合", sourceKeys: activeSources.map((source) => source.key), records, issues, crawlDiagnostics };
  if (shouldWriteCrawlCache) {
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, JSON.stringify(result, null, 2), "utf8");
  }
  if (apply) await writePcNewsToCurrentData(result);
  return result;
}

function buildNewsDiagnostic(sourceKey, records = [], issues = [], startedAt = Date.now(), strategy = "html+detail", error = null) {
  const fieldStats = buildNewsFieldStats(records);
  const total = Math.max(records.length, 1);
  const score = Math.round(Object.values(fieldStats).reduce((sum, value) => sum + value, 0) / Object.keys(fieldStats).length / total * 100);
  return {
    sourceKey,
    strategy,
    discovered: records.length,
    fetched: records.length,
    succeeded: records.length,
    failed: issues.length + (error ? 1 : 0),
    durationMs: Math.max(0, Date.now() - startedAt),
    completeness: Number.isFinite(score) ? score : 0,
    fieldStats,
    issues: issues.map((issue) => ({
      type: issue.type || "抓取问题",
      detail: issue.message || issue.detail || "",
    })).slice(0, 8),
  };
}

function buildNewsFieldStats(records = []) {
  const has = (checker) => records.filter(checker).length;
  return {
    title: has((item) => item.newsTitle || item.gameName),
    time: has((item) => item.eventAt || item.publishedAt),
    type: has((item) => item.status || item.category),
    image: has((item) => item.iconUrl),
    detail: has((item) => item.detailUrl || item.originalUrl),
    author: has((item) => item.author || item.vendor),
    tags: has((item) => (item.tags || item.rawTags || []).length),
    summary: has((item) => item.summary || item.updateContent),
  };
}

export async function sampleSinglePcNewsRecord({ sourceKey, platformId, detailUrl, target = {} } = {}) {
  const source = sources.find((item) => item.key === sourceKey || item.name === sourceKey || (target.sources || []).includes(item.name) || target.platform === item.name);
  if (!source) throw new Error("当前资讯来源暂不支持单条重抓");
  const url = detailUrl || resolveNewsDetailUrl(source.key, platformId) || target.detailUrl || target.originalUrl;
  if (!url) throw new Error("缺少资讯详情页ID或详情页链接");
  const html = await fetchText(url);
  const detail = source.key === "gcores"
    ? parseGcoresDetail(html, url)
    : source.key === "gamersky"
      ? parseGamerskyDetail(html, url)
      : parseAli213Detail(html, url);
  const record = buildRecord({
    title: detail.title || target.newsTitle || target.gameName,
    summary: detail.summary || target.summary || "",
    detailUrl: url,
    imageUrl: detail.imageUrl || target.iconUrl || "",
    source: source.name,
    sourceKey: source.key,
    timeText: detail.timeText || target.publishText || "",
    heat: Number(target.heat) || 0,
    detail,
  });
  if (!record) throw new Error("详情页解析完成，但未生成有效资讯记录");
  return {
    generatedAt: new Date().toISOString(),
    source: `${source.name} single article`,
    records: [record],
    issues: [],
  };
}

function resolveNewsDetailUrl(sourceKey, platformId = "") {
  const id = cleanText(platformId);
  if (!id || /^pc-news-/.test(id)) return "";
  if (sourceKey === "gcores") return `https://www.gcores.com/articles/${encodeURIComponent(id)}`;
  return "";
}

export async function writePcNewsToCurrentData(result) {
  let data;
  try {
    data = JSON.parse(await fs.readFile(currentDataFile, "utf8"));
  } catch {
    data = {};
  }
  const newsSources = new Set(sources.map((source) => source.name));
  const existingNonNews = (data.pcGames || []).filter((item) => !isNewsRecord(item, newsSources));
  const mergedNews = upsertRecords(data.pcNews || [], result.records || []).sort(sortNewsRecords);
  data.pcGames = [...existingNonNews, ...mergedNews];
  data.pcNews = mergedNews;
  data.rawPcRecords = upsertRecords(data.rawPcRecords || [], result.records || []);
  data.crawlDiagnostics = {
    ...(data.crawlDiagnostics || {}),
    ...(result.crawlDiagnostics || {}),
  };
  data.metrics = {
    ...(data.metrics || {}),
    totalGames: (data.mobileGames || []).length + (data.welfareGames || []).length + data.pcGames.length,
    pcPool: data.pcGames.length,
  };
  data.sourceGroups = mergeNewsSourceGroups(data.sourceGroups || [], mergedNews, result);
  data.updateLogs = [
    { id: `log-pc-news-${Date.now()}`, time: result.generatedAt, type: "抓取", title: "端游资讯聚合完成", detail: `本次聚合 ${result.records.length} 条，合并后资讯 ${mergedNews.length} 条，保留现有 Steam 数据 ${existingNonNews.length} 条。` },
    ...(data.updateLogs || []),
  ].slice(0, 80);
  data.generatedAt = new Date().toISOString();
  await fs.writeFile(currentDataFile, JSON.stringify(normalizeDataShape(data), null, 2), "utf8");
  return data;
}

function mergeNewsSourceGroups(groups = [], records = [], result = {}) {
  const map = new Map(groups.map((group) => [group.key, group]));
  const selectedKeys = new Set(result.sourceKeys?.length ? result.sourceKeys : sources.map((source) => source.key));
  for (const source of sources.filter((item) => selectedKeys.has(item.key))) {
    const count = records.filter((item) => (item.sources || []).includes(source.name) || item.platform === source.name).length;
    const rawCount = (result.records || []).filter((item) => (item.sources || []).includes(source.name) || item.platform === source.name).length;
    map.set(source.key, {
      ...(map.get(source.key) || {}),
      key: source.key,
      name: source.name,
      sources: [source.name],
      enabled: true,
      lastRun: result.generatedAt,
      status: rawCount ? "已抓取" : "需检查",
      count,
      rawCount,
      diagnostics: result.crawlDiagnostics?.[source.key] || null,
    });
  }
  return [...map.values()];
}

function isNewsRecord(item = {}, newsSources = new Set()) {
  return Boolean(item.newsTitle || (item.sources || []).some((source) => newsSources.has(source)));
}

function recordKey(item = {}) {
  return String(item.id || item.detailUrl || item.originalUrl || item.newsTitle || item.gameName || "").trim();
}

function upsertRecords(existing = [], incoming = []) {
  const map = new Map();
  for (const item of existing) {
    const key = recordKey(item);
    if (key) map.set(key, item);
  }
  for (const item of incoming) {
    const key = recordKey(item);
    if (!key) continue;
    const old = map.get(key) || {};
    map.set(key, mergeNewsRecord(old, {
      ...old,
      ...item,
      visible: old.visible === false ? false : item.visible,
      manualChoices: { ...(old.manualChoices || {}), ...(item.manualChoices || {}) },
    }));
  }
  return [...map.values()];
}

function mergeNewsRecord(old = {}, incoming = {}) {
  const merged = { ...incoming };
  for (const field of ["newsTitle", "gameName", "relatedGame", "summary", "updateContent", "iconUrl", "author", "vendor", "publishedAt", "publishText", "eventAt", "detailUrl", "originalUrl"]) {
    if (isBlankValue(merged[field]) && !isBlankValue(old[field])) merged[field] = old[field];
  }
  for (const field of ["tags", "rawTags", "gameplayTags", "sourceRecords"]) {
    if ((!Array.isArray(merged[field]) || !merged[field].length) && Array.isArray(old[field]) && old[field].length) merged[field] = old[field];
  }
  return merged;
}

function isBlankValue(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function sortNewsRecords(left, right) {
  const leftTime = new Date(left.publishedAt || left.eventAt || 0).getTime() || 0;
  const rightTime = new Date(right.publishedAt || right.eventAt || 0).getTime() || 0;
  if (rightTime !== leftTime) return rightTime - leftTime;
  return (Number(right.heat) || 0) - (Number(left.heat) || 0);
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (currentFile === invokedFile) {
  samplePcNews({ apply: process.argv.includes("--apply") })
    .then((result) => {
      console.log(`PC news sample: ${result.records.length} records, ${result.issues.length} issues`);
      console.log(`Output: ${outputFile}`);
      for (const item of result.records.slice(0, 12)) console.log(`${item.sources[0]} | ${item.status} | ${item.newsTitle}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
