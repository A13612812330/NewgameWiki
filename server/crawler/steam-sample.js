import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDataShape } from "../data-shape.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputFile = path.join(root, "data", "steam", "official-sample.json");
const snapshotFile = path.join(root, "data", "steam", "official-snapshot.json");
const currentDataFile = path.join(root, "data", "current.json");
const shouldWriteCrawlCache = process.env.NEWWIKI_WRITE_CRAWL_CACHE === "1";

const defaultAppIds = [
  4704690,
  1091500,
  381210,
  230410,
  2483190,
  2767030,
  1086940,
  1085660,
  1361210,
  578080,
  730,
  1172470,
  271590,
  322330,
  359550,
];

const discoveryUrls = [
  "https://store.steampowered.com/api/featuredcategories?cc=cn&l=schinese",
  "https://store.steampowered.com/api/featured/?cc=cn&l=schinese",
];

const mostPlayedUrl = "https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/";

const searchDiscoveryUrls = [
  "https://store.steampowered.com/search/?sort_by=Released_DESC&category1=998&os=win&supportedlang=schinese&ndl=1",
  "https://store.steampowered.com/search/?sort_by=Released_DESC&category1=998&os=win&ndl=1",
  "https://store.steampowered.com/search/?filter=popularnew&category1=998&os=win&ndl=1",
  "https://store.steampowered.com/search/?filter=topsellers&category1=998&os=win&ndl=1",
  "https://store.steampowered.com/search/?filter=comingsoon&category1=998&os=win&ndl=1",
];

const newGameDiscoveryUrls = [
  "https://store.steampowered.com/search/?sort_by=Released_DESC&category1=998&os=win&supportedlang=schinese&ndl=1",
  "https://store.steampowered.com/search/?sort_by=Released_DESC&category1=998&os=win&ndl=1",
  "https://store.steampowered.com/search/?filter=popularnew&category1=998&os=win&ndl=1",
  "https://store.steampowered.com/search/?filter=comingsoon&category1=998&os=win&ndl=1",
];

const featureTags = new Set([
  "Steam 成就",
  "Steam 云",
  "Steam 集换式卡牌",
  "完全支持控制器",
  "部分支持控制器",
  "家庭共享",
  "远程同乐",
  "Steam 创意工坊",
  "应用内购买",
  "可调整文字大小",
  "视角舒适度",
  "可选颜色",
  "自定义音量控制",
  "可调整难度",
  "无需应对快速反应事件",
  "立体声",
  "字幕选项",
  "支持字幕",
  "环绕声",
  "可用 HDR",
  "DUALSHOCK 控制器支持",
  "DUALSENSE 控制器支持",
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withTimeout(promise, ms, message) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    if (typeof promise === "function") return await promise(controller.signal);
    return await promise;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(message);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSteamDate(value = "") {
  const text = String(value || "").trim();
  const zh = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (zh) return `${zh[1]}-${zh[2].padStart(2, "0")}-${zh[3].padStart(2, "0")}T10:00:00+08:00`;
  const en = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (en) {
    const monthMap = {
      Jan: "01", January: "01", Feb: "02", February: "02", Mar: "03", March: "03",
      Apr: "04", April: "04", May: "05", Jun: "06", June: "06", Jul: "07", July: "07",
      Aug: "08", August: "08", Sep: "09", Sept: "09", September: "09", Oct: "10", October: "10",
      Nov: "11", November: "11", Dec: "12", December: "12",
    };
    const month = monthMap[en[1]] || "";
    if (month) return `${en[3]}-${month}-${en[2].padStart(2, "0")}T10:00:00+08:00`;
  }
  return "";
}

async function fetchJson(url, { timeoutMs = 12000, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const response = await withTimeout((signal) => fetch(url, {
        signal,
        headers: {
          "user-agent": "Mozilla/5.0 NewgameWikiSteamSampler/0.1",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
      }), timeoutMs, `请求超时 ${timeoutMs}ms`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      await sleep(500 * attempt);
    }
  }
  throw lastError;
}

async function fetchText(url, { timeoutMs = 12000, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const response = await withTimeout((signal) => fetch(url, {
        signal,
        headers: {
          "user-agent": "Mozilla/5.0 NewgameWikiSteamSampler/0.2",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          cookie: "birthtime=568022401; lastagecheckage=1-January-1988; mature_content=1",
        },
      }), timeoutMs, `请求超时 ${timeoutMs}ms`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    } catch (error) {
      lastError = error;
      await sleep(500 * attempt);
    }
  }
  throw lastError;
}

async function discoverStoreAppIds({ limit = 120, chartItems = [] } = {}) {
  const ids = [];
  const baseChartItems = chartItems.length ? chartItems : await discoverMostPlayedGames({ limit }).catch(() => []);
  ids.push(...baseChartItems.map((item) => item.appid));
  for (const url of discoveryUrls) {
    try {
      const json = await fetchJson(url, { timeoutMs: 15000, retries: 1 });
      ids.push(...extractAppIds(json));
    } catch {
      // Discovery is opportunistic. Static and historical app ids remain the stable baseline.
    }
  }
  for (const url of searchDiscoveryUrls) {
    try {
      const html = await fetchText(url, { timeoutMs: 15000, retries: 1 });
      ids.push(...extractAppIdsFromHtml(html));
    } catch {
      // Search pages are supplemental. API and cache candidates still keep sampling usable.
    }
  }
  return [...new Set(ids.map(Number).filter(Boolean))].slice(0, limit);
}

async function discoverNewGameAppIds({ limit = 80 } = {}) {
  const ids = [];
  for (const url of newGameDiscoveryUrls) {
    try {
      const html = await fetchText(url, { timeoutMs: 15000, retries: 1 });
      ids.push(...extractAppIdsFromHtml(html));
    } catch {
      // New-game search pages are supplemental.
    }
  }
  return [...new Set(ids.map(Number).filter(Boolean))].slice(0, limit);
}

async function discoverMostPlayedGames({ limit = 100 } = {}) {
  const input = {
    context: { language: "schinese", country_code: "CN" },
    data_request: {
      include_basic_info: true,
      include_assets: true,
      include_release: true,
      include_tag_count: 5,
    },
  };
  const url = `${mostPlayedUrl}?input_json=${encodeURIComponent(JSON.stringify(input))}`;
  const json = await fetchJson(url, { timeoutMs: 15000, retries: 1 });
  return (json?.response?.ranks || [])
    .map((rank) => ({
      appid: Number(rank.appid || rank.item?.appid || rank.item?.id),
      steamRank: Number(rank.rank),
      lastWeekRank: Number(rank.last_week_rank),
      peakInGame: Number(rank.peak_in_game),
      chartName: rank.item?.name || "",
    }))
    .filter((item) => Number.isFinite(item.appid))
    .slice(0, limit);
}

function extractAppIds(value) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const id = node.id ?? node.appid ?? node.steam_appid;
    if (Number.isFinite(Number(id))) found.push(Number(id));
    for (const child of Object.values(node)) visit(child);
  };
  visit(value);
  return found;
}

function extractAppIdsFromHtml(html = "") {
  const found = [];
  for (const match of String(html).matchAll(/data-ds-appid="(\d+)"/g)) found.push(Number(match[1]));
  for (const match of String(html).matchAll(/\/app\/(\d+)\//g)) found.push(Number(match[1]));
  return [...new Set(found.filter(Boolean))];
}

function fetchJsonNative(url, { timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, {
      timeout: timeoutMs,
      headers: {
        "user-agent": "Mozilla/5.0 NewgameWikiSteamSampler/0.1",
        "accept": "application/json",
      },
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`请求超时 ${timeoutMs}ms`));
    });
    request.on("error", reject);
  });
}

async function fetchDetails(appid, { timeoutMs = 8000, retries = 1 } = {}) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=cn&l=schinese`;
  const json = await fetchJson(url, { timeoutMs, retries });
  const item = json[String(appid)];
  if (!item?.success || !item.data || item.data.type !== "game") return null;
  const data = item.data;
  const rawTags = [
    ...(data.genres || []).map((tag) => tag.description),
    ...(data.categories || []).map((tag) => tag.description),
  ].filter(Boolean);
  const gameplayTags = [...new Set(rawTags.filter((tag) => !featureTags.has(tag)))].slice(0, 5);
  const releaseText = data.release_date?.date || "";
  const eventAt = parseSteamDate(releaseText);
  const developers = [...new Set(data.developers || [])].filter(Boolean);
  const publishers = [...new Set(data.publishers || [])].filter(Boolean);
  const vendor = [...new Set([...developers, ...publishers].filter(Boolean))].join(" / ");

  return {
    appid,
    steamAppId: appid,
    gameName: data.name || "",
    status: data.release_date?.coming_soon ? "即将推出" : "已发售",
    eventAt,
    releaseText,
    comingSoon: Boolean(data.release_date?.coming_soon),
    developers,
    publishers,
    vendor,
    gameplayTags,
    rawTags: [...new Set(rawTags)].slice(0, 12),
    summary: cleanText(data.short_description || "").slice(0, 180),
    iconUrl: data.header_image || data.capsule_image || data.capsule_imagev5 || "",
    headerUrl: data.header_image || "",
    capsuleUrl: data.capsule_image || data.capsule_imagev5 || "",
    website: data.website || "",
    supportUrl: data.support_info?.url || "",
    metacriticScore: data.metacritic?.score || null,
    recommendationCount: data.recommendations?.total || null,
    screenshotUrls: (data.screenshots || []).map((item) => item.path_thumbnail || item.path_full).filter(Boolean).slice(0, 4),
    price: data.price_overview?.final_formatted || (data.is_free ? "免费" : ""),
    isFree: Boolean(data.is_free),
    source: "Steam",
    originalUrl: `https://store.steampowered.com/app/${appid}/`,
  };
}

async function fetchCurrentPlayers(appid) {
  const urls = [
    `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`,
    `http://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`,
  ];
  try {
    let lastError;
    for (const url of urls) {
      for (let attempt = 1; attempt <= 1; attempt += 1) {
        try {
          const json = await fetchJsonNative(url, { timeoutMs: 3500 });
          const value = json?.response?.player_count;
          if (Number.isFinite(Number(value))) return Number(value);
        } catch (error) {
          lastError = error;
          await sleep(120 * attempt);
        }
      }
    }
    throw lastError || new Error("在线人数无有效返回");
  } catch (error) {
    return { error: error?.message || "在线人数抓取失败" };
  }
}

async function readPreviousSnapshot() {
  try {
    const data = JSON.parse(await fs.readFile(snapshotFile, "utf8"));
    return new Map((data.items || []).map((item) => [String(item.appid), item]));
  } catch {
    return new Map();
  }
}

async function readJsonMap(file, pickItems) {
  try {
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    const items = pickItems(data);
    return new Map((items || []).filter((item) => item?.appid).map((item) => [String(item.appid), item]));
  } catch {
    return new Map();
  }
}

async function readReferencePool() {
  const current = await readJsonMap(currentDataFile, (data) => [...(data.pcGames || []), ...(data.rawPcRecords || [])]);
  const previousSample = await readJsonMap(outputFile, (data) => data.items || []);
  const previousSnapshot = await readPreviousSnapshot();
  return new Map([...current, ...previousSample, ...previousSnapshot]);
}

function buildAppIdPool(appids, reference) {
  return [...new Set([...appids, ...reference.keys()].map((item) => Number(item)).filter(Boolean))];
}

function classify(item) {
  const now = Date.now();
  const releaseTime = item.eventAt ? new Date(item.eventAt).getTime() : 0;
  const daysFromRelease = releaseTime ? (releaseTime - now) / 86400000 : Number.NEGATIVE_INFINITY;
  const daysSinceRelease = releaseTime ? (now - releaseTime) / 86400000 : Number.POSITIVE_INFINITY;
  const hasCurrentPlayers = Number.isFinite(item.currentPlayers);
  const hasPreviousPlayers = Number.isFinite(item.previousPlayers) && item.previousPlayers > 0;
  const growth = hasCurrentPlayers && hasPreviousPlayers ? item.currentPlayers - item.previousPlayers : 0;
  const growthRatio = hasPreviousPlayers ? growth / item.previousPlayers : 0;
  const labels = [];
  if ((releaseTime && daysSinceRelease >= 0 && daysSinceRelease <= 30) || (releaseTime && daysFromRelease > 0 && daysFromRelease <= 180)) labels.push("新游");
  if (hasCurrentPlayers && item.currentPlayers >= 10000) labels.push("热门候选");
  if (hasPreviousPlayers && (growth >= 5000 || growthRatio >= 0.5)) labels.push("爆火");
  if (!labels.length) labels.push("常规观察");
  return labels;
}

function toPcGame(item) {
  const status = item.labels.includes("爆火")
    ? "爆火"
    : item.labels.includes("热门候选")
      ? "热门"
      : item.labels.includes("新游")
        ? "新游"
        : item.status;
  const detailText = Number.isFinite(item.currentPlayers)
    ? `当前在线 ${item.currentPlayers.toLocaleString("zh-CN")}${Number.isFinite(item.playerGrowth) && item.playerGrowth ? `，较上次 ${item.playerGrowth > 0 ? "+" : ""}${item.playerGrowth.toLocaleString("zh-CN")}` : ""}`
    : Number.isFinite(item.previousPlayers)
      ? `本次在线暂未获取，上次在线 ${item.previousPlayers.toLocaleString("zh-CN")}`
      : "当前在线暂未获取";
  return {
    id: `pc-steam-${item.appid}`,
    appid: item.appid,
    gameName: item.gameName,
    iconUrl: item.iconUrl,
    status,
    eventType: status,
    eventAt: item.eventAt || new Date().toISOString(),
    vendor: item.vendor,
    gameplayTags: item.gameplayTags || [],
    tags: [...new Set([status, ...(item.gameplayTags || [])].filter(Boolean))],
    summary: item.summary || "",
    updateContent: detailText,
    sources: ["Steam"],
    platform: "Steam",
    detailUrl: item.originalUrl,
    originalUrl: item.originalUrl,
    currentPlayers: item.currentPlayers,
    previousPlayers: item.previousPlayers,
    playerGrowth: item.playerGrowth,
    lastKnownPlayers: item.lastKnownPlayers,
    playerFetchOk: item.playerFetchOk,
    price: item.price || "",
    releaseText: item.releaseText || "",
    comingSoon: item.comingSoon,
    developers: item.developers || [],
    publishers: item.publishers || [],
    headerUrl: item.headerUrl || item.iconUrl || "",
    capsuleUrl: item.capsuleUrl || "",
    website: item.website || "",
    supportUrl: item.supportUrl || "",
    metacriticScore: item.metacriticScore,
    recommendationCount: item.recommendationCount,
    steamRank: item.steamRank,
    lastWeekRank: item.lastWeekRank,
    peakInGame: item.peakInGame,
    screenshotUrls: item.screenshotUrls || [],
    steamLabels: item.labels,
    sourceRecords: [{
      source: "Steam",
      sourceKey: "steam",
      status,
      eventType: status,
      eventAt: item.eventAt || "",
      vendor: item.vendor,
      tags: item.gameplayTags || [],
      gameplayTags: item.gameplayTags || [],
      summary: item.summary || "",
      updateContent: detailText,
      detailUrl: item.originalUrl,
      originalUrl: item.originalUrl,
      iconUrl: item.iconUrl || "",
      imageUrl: item.iconUrl || "",
      headerUrl: item.headerUrl || item.iconUrl || "",
      capsuleUrl: item.capsuleUrl || "",
      screenshotUrls: item.screenshotUrls || [],
      currentPlayers: item.currentPlayers,
      previousPlayers: item.previousPlayers,
      playerGrowth: item.playerGrowth,
      steamRank: item.steamRank,
      lastWeekRank: item.lastWeekRank,
      peakInGame: item.peakInGame,
      price: item.price || "",
      releaseText: item.releaseText || "",
    }],
  };
}

export async function sampleSteamOfficial({ appids = defaultAppIds, delayMs = 300, discover = true, discoverLimit = 120, maxApps = 120, targetItems = 50, targetNewItems = 24, concurrency = 4 } = {}) {
  const previous = await readPreviousSnapshot();
  const reference = await readReferencePool();
  const wantsHotItems = Number(targetItems) > 0;
  const wantsNewItems = Number(targetNewItems) > 0;
  const chartItems = discover && wantsHotItems ? await discoverMostPlayedGames({ limit: Math.min(discoverLimit, 100) }).catch(() => []) : [];
  const chartByAppid = new Map(chartItems.map((item) => [String(item.appid), item]));
  const discoveredAppIds = discover && wantsHotItems ? await discoverStoreAppIds({ limit: discoverLimit, chartItems }) : [];
  const newGameAppIds = discover && wantsNewItems ? await discoverNewGameAppIds({ limit: Math.min(discoverLimit, 100) }).catch(() => []) : [];
  const hotAppidPool = wantsHotItems ? buildAppIdPool([...appids, ...chartItems.map((item) => item.appid), ...discoveredAppIds], reference).slice(0, maxApps) : [];
  const newAppidPool = wantsNewItems ? [...new Set([...newGameAppIds].map(Number).filter(Boolean))].slice(0, maxApps) : [];
  const appidPool = [...new Set([...hotAppidPool, ...newAppidPool])];
  const items = [];
  const issues = [];
  const seen = new Set();
  const parallel = Math.max(1, Math.min(Number(concurrency) || 1, 8));

  const readApp = async (appid) => {
    try {
      seen.add(String(appid));
      const fallback = reference.get(String(appid));
      const detail = hasReusableSteamDetail(fallback)
        ? steamDetailFromFallback(appid, fallback)
        : await fetchDetails(appid).catch((error) => {
            if (!fallback) throw error;
            issues.push({ appid, message: `详情抓取失败，沿用历史详情：${error?.message || "unknown"}` });
            return steamDetailFromFallback(appid, fallback);
          });
      await sleep(delayMs);
      if (!detail) return null;
      const currentPlayers = await fetchCurrentPlayers(appid);
      await sleep(delayMs);
      const last = previous.get(String(appid));
      const currentPlayerValue = typeof currentPlayers === "object" ? null : currentPlayers;
      if (typeof currentPlayers === "object") {
        issues.push({ appid, message: currentPlayers.error });
      }
      const referenceItem = reference.get(String(appid));
      const previousFromLast = Number.isFinite(Number(last?.currentPlayers)) ? Number(last.currentPlayers) : null;
      const previousFromKnown = Number.isFinite(Number(last?.lastKnownPlayers)) ? Number(last.lastKnownPlayers) : null;
      const previousFromReferenceCurrent = Number.isFinite(Number(referenceItem?.currentPlayers)) ? Number(referenceItem.currentPlayers) : null;
      const previousFromReference = Number.isFinite(Number(referenceItem?.previousPlayers)) ? Number(referenceItem.previousPlayers) : null;
      const previousPlayerValue = previousFromLast ?? previousFromKnown ?? previousFromReferenceCurrent ?? previousFromReference;
      const item = {
        ...detail,
        ...(chartByAppid.get(String(appid)) || {}),
        currentPlayers: currentPlayerValue,
        previousPlayers: previousPlayerValue,
        playerGrowth: Number.isFinite(currentPlayerValue) && Number.isFinite(previousPlayerValue) ? currentPlayerValue - previousPlayerValue : null,
        lastKnownPlayers: Number.isFinite(currentPlayerValue) ? currentPlayerValue : previousPlayerValue,
        playerFetchOk: Number.isFinite(currentPlayerValue),
        sampledAt: new Date().toISOString(),
      };
      item.labels = classify(item);
      return item;
    } catch (error) {
      issues.push({ appid, message: error?.message || "Steam 采样失败" });
      return null;
    }
  };

  const pendingAppIds = appidPool.filter((appid) => {
    const key = String(appid);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  seen.clear();

  for (let index = 0; index < pendingAppIds.length; index += parallel) {
    const batch = pendingAppIds.slice(index, index + parallel);
    const batchItems = await Promise.all(batch.map((appid) => readApp(appid)));
    items.push(...batchItems.filter(Boolean));
    const hotCount = items.filter((entry) => !entry.labels.includes("新游")).length;
    const newCount = items.filter((entry) => entry.labels.includes("新游")).length;
    if (hotCount >= targetItems && newCount >= targetNewItems) break;
  }

  const result = {
    generatedAt: new Date().toISOString(),
    source: "Steam official APIs / steamapi.xpaw.me reference",
    discoveredAppIds,
    newGameAppIds,
    chartAppIds: chartItems.map((item) => item.appid),
    rules: {
      newGame: "过去 30 天内发售，或未来 180 天内将上线",
      hot: "当前在线 >= 10000",
      growth: "必须有有效上次在线，且较上次增长 >= 5000，或增长比例 >= 50%",
      discovery: "热门池和新游池分开采样：ISteamChartsService/GetMostPlayedGames + Steam 商店搜索页新品/热门新品/即将推出",
    },
    items,
    issues,
  };

  if (shouldWriteCrawlCache) {
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, JSON.stringify(result, null, 2), "utf8");
    await fs.writeFile(snapshotFile, JSON.stringify({ generatedAt: result.generatedAt, items }, null, 2), "utf8");
  }
  return result;
}

function hasReusableSteamDetail(item = {}) {
  return Boolean(
    item &&
    (item.gameName || item.name) &&
    (item.iconUrl || item.headerUrl || item.capsuleUrl) &&
    (item.detailUrl || item.originalUrl || item.summary || item.updateContent)
  );
}

function steamDetailFromFallback(appid, fallback = {}) {
  return {
    appid,
    gameName: fallback.gameName || fallback.name || "",
    status: fallback.status || "待确认",
    eventAt: fallback.eventAt || "",
    releaseText: fallback.releaseText || "",
    vendor: fallback.vendor || "",
    gameplayTags: fallback.gameplayTags || fallback.tags || [],
    rawTags: fallback.rawTags || [],
    summary: fallback.summary || fallback.updateContent || "",
    iconUrl: fallback.iconUrl || fallback.headerUrl || fallback.capsuleUrl || "",
    headerUrl: fallback.headerUrl || fallback.iconUrl || "",
    capsuleUrl: fallback.capsuleUrl || "",
    screenshotUrls: Array.isArray(fallback.screenshotUrls) ? fallback.screenshotUrls : [],
    price: fallback.price || "",
    developers: Array.isArray(fallback.developers) ? fallback.developers : [],
    publishers: Array.isArray(fallback.publishers) ? fallback.publishers : [],
    source: "Steam",
    originalUrl: fallback.originalUrl || fallback.detailUrl || `https://store.steampowered.com/app/${appid}/`,
    reusedDetail: true,
  };
}

export async function sampleSingleSteamApp({ appid, target = {} } = {}) {
  const numericAppid = Number(appid || target.appid || target.steamAppId);
  if (!Number.isFinite(numericAppid)) throw new Error("缺少 Steam AppID");
  const detail = await fetchDetails(numericAppid, { timeoutMs: 10000, retries: 1 });
  if (!detail) throw new Error("Steam 详情页未返回有效游戏数据");
  const currentPlayers = await fetchCurrentPlayers(numericAppid);
  const currentPlayerValue = Number.isFinite(Number(currentPlayers)) ? Number(currentPlayers) : null;
  const previousPlayerValue = Number.isFinite(Number(target.currentPlayers))
    ? Number(target.currentPlayers)
    : Number.isFinite(Number(target.lastKnownPlayers))
      ? Number(target.lastKnownPlayers)
      : Number.isFinite(Number(target.previousPlayers))
        ? Number(target.previousPlayers)
        : null;
  const item = {
    ...target,
    ...detail,
    currentPlayers: currentPlayerValue,
    previousPlayers: previousPlayerValue,
    playerGrowth: Number.isFinite(currentPlayerValue) && Number.isFinite(previousPlayerValue) ? currentPlayerValue - previousPlayerValue : null,
    lastKnownPlayers: Number.isFinite(currentPlayerValue) ? currentPlayerValue : previousPlayerValue,
    playerFetchOk: Number.isFinite(currentPlayerValue),
    sampledAt: new Date().toISOString(),
  };
  item.labels = classify(item);
  return {
    generatedAt: new Date().toISOString(),
    source: "Steam official single app",
    items: [item],
    records: [toPcGame(item)],
    issues: Number.isFinite(currentPlayerValue) ? [] : [{ appid: numericAppid, message: currentPlayers?.error || "在线人数抓取失败" }],
  };
}

export async function writeSteamSampleToCurrentData(sample = null) {
  const result = sample || JSON.parse(await fs.readFile(outputFile, "utf8"));
  let data;
  try {
    data = JSON.parse(await fs.readFile(currentDataFile, "utf8"));
  } catch {
    data = {};
  }
  const incomingSteamGames = (result.items || []).map(toPcGame);
  const existingSteamGames = [
    ...(data.steamGames || []),
    ...(data.steamNewGames || []),
    ...(data.pcGames || []).filter(isSteamRecord),
  ];
  const steamGames = upsertRecords(existingSteamGames, incomingSteamGames);
  const existingPcNews = (data.pcNews || []).length
    ? (data.pcNews || [])
    : (data.pcGames || []).filter((item) => !isSteamRecord(item));
  const pcGames = [...steamGames, ...existingPcNews];
  data.pcGames = pcGames;
  data.steamGames = steamGames.filter(isSteamListedPoolItem);
  data.steamNewGames = steamGames.filter(isSteamNewPoolItem);
  data.pcNews = existingPcNews;
  data.rawPcRecords = upsertRecords(data.rawPcRecords || [], result.items || []);
  const steamDiagnostics = buildSteamDiagnostics(result.items || [], result.issues || []);
  data.crawlDiagnostics = {
    ...(data.crawlDiagnostics || {}),
    steam: { ...steamDiagnostics, sourceKey: "steam", fetched: data.steamGames.length, succeeded: data.steamGames.length },
    steamNew: { ...steamDiagnostics, sourceKey: "steamNew", fetched: data.steamNewGames.length, succeeded: data.steamNewGames.length },
  };
  data.metrics = {
    ...(data.metrics || {}),
    totalGames: (data.mobileGames || []).length + (data.welfareGames || []).length + pcGames.length,
    pcPool: pcGames.length,
  };
  data.sourceGroups = (data.sourceGroups || []).map((group) => ["pc", "steam", "steamNew"].includes(group.key)
    ? { ...group, enabled: true, lastRun: result.generatedAt, status: "已抓取", count: group.key === "pc" ? pcGames.length : (group.key === "steamNew" ? data.steamNewGames.length : data.steamGames.length), rawCount: (result.items || []).length, diagnostics: data.crawlDiagnostics[group.key] || steamDiagnostics }
    : group);
  if (!(data.sourceGroups || []).some((group) => group.key === "steam")) {
    data.sourceGroups = [...(data.sourceGroups || []), { key: "steam", name: "Steam游戏", sources: ["Steam"], enabled: true, lastRun: result.generatedAt, status: "已抓取", count: data.steamGames.length, rawCount: (result.items || []).length, diagnostics: data.crawlDiagnostics.steam }];
  }
  if (!(data.sourceGroups || []).some((group) => group.key === "steamNew")) {
    data.sourceGroups = [...(data.sourceGroups || []), { key: "steamNew", name: "Steam新游", sources: ["Steam"], enabled: true, lastRun: result.generatedAt, status: "已抓取", count: data.steamNewGames.length, rawCount: (result.items || []).length, diagnostics: data.crawlDiagnostics.steamNew }];
  }
  data.updateLogs = [
    { id: `log-steam-${Date.now()}`, time: result.generatedAt, type: "抓取", title: "Steam 官方接口采样完成", detail: `本次采样 ${incomingSteamGames.length} 条，合并后 Steam ${steamGames.length} 条，保留端游资讯 ${existingPcNews.length} 条。` },
    ...(data.updateLogs || []),
  ].slice(0, 80);
  data.generatedAt = new Date().toISOString();
  await fs.writeFile(currentDataFile, JSON.stringify(normalizeDataShape(data), null, 2), "utf8");
  return data;
}

function buildSteamDiagnostics(items = [], issues = []) {
  const fieldStats = buildSteamFieldStats(items);
  const total = Math.max(items.length, 1);
  const score = Math.round(Object.values(fieldStats).reduce((sum, value) => sum + value, 0) / Object.keys(fieldStats).length / total * 100);
  return {
    strategy: "official-api+store-html",
    discovered: items.length,
    fetched: items.length,
    succeeded: items.length,
    failed: issues.length,
    completeness: Number.isFinite(score) ? score : 0,
    fieldStats,
    issues: issues.map((issue) => ({
      type: "Steam采样问题",
      detail: issue.message || String(issue.appid || ""),
    })).slice(0, 8),
  };
}

function buildSteamFieldStats(items = []) {
  const has = (checker) => items.filter(checker).length;
  return {
    name: has((item) => item.gameName),
    time: has((item) => item.eventAt || item.releaseText),
    status: has((item) => (item.labels || []).length),
    image: has((item) => item.headerImage || item.imageUrl),
    detail: has((item) => item.originalUrl || item.storeUrl),
    vendor: has((item) => item.vendor),
    tags: has((item) => (item.gameplayTags || item.rawTags || []).length),
    players: has((item) => Number.isFinite(Number(item.lastKnownPlayers ?? item.currentPlayers))),
  };
}

function isSteamRecord(item = {}) {
  return Boolean(item.appid || (item.sources || []).includes("Steam"));
}

function isSteamListedPoolItem(item = {}) {
  return isSteamRecord(item) && Number(item.lastKnownPlayers ?? item.currentPlayers) >= 1000;
}

function isSteamNewPoolItem(item = {}) {
  if (!isSteamRecord(item) || isSteamListedPoolItem(item)) return false;
  return /新游|预约|即将推出/.test([item.status, item.eventType, ...(item.steamLabels || [])].join(" ")) || item.comingSoon;
}

function recordKey(item = {}) {
  return String(item.id || item.appid || item.detailUrl || item.originalUrl || item.storeUrl || item.gameName || "").trim();
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
    map.set(key, {
      ...old,
      ...item,
      visible: old.visible === false ? false : item.visible,
      manualChoices: { ...(old.manualChoices || {}), ...(item.manualChoices || {}) },
    });
  }
  return [...map.values()];
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (currentFile === invokedFile) {
  const shouldApply = process.argv.includes("--apply");
  const discover = !process.argv.includes("--no-discover");
  const maxAppsArg = Number(process.argv.find((arg) => arg.startsWith("--max-apps="))?.split("=")[1]);
  const targetItemsArg = Number(process.argv.find((arg) => arg.startsWith("--target-items="))?.split("=")[1]);
  const targetNewItemsArg = Number(process.argv.find((arg) => arg.startsWith("--target-new-items="))?.split("=")[1]);
  const discoverLimitArg = Number(process.argv.find((arg) => arg.startsWith("--discover-limit="))?.split("=")[1]);
  const delayArg = Number(process.argv.find((arg) => arg.startsWith("--delay="))?.split("=")[1]);
  const concurrencyArg = Number(process.argv.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1]);
  sampleSteamOfficial({
    discover,
    maxApps: Number.isFinite(maxAppsArg) && maxAppsArg > 0 ? maxAppsArg : 120,
    targetItems: Number.isFinite(targetItemsArg) && targetItemsArg > 0 ? targetItemsArg : 50,
    targetNewItems: Number.isFinite(targetNewItemsArg) && targetNewItemsArg > 0 ? targetNewItemsArg : 24,
    discoverLimit: Number.isFinite(discoverLimitArg) && discoverLimitArg > 0 ? discoverLimitArg : 120,
    delayMs: Number.isFinite(delayArg) && delayArg >= 0 ? delayArg : 200,
    concurrency: Number.isFinite(concurrencyArg) && concurrencyArg > 0 ? concurrencyArg : 4,
  })
    .then(async (result) => {
      if (shouldApply) await writeSteamSampleToCurrentData(result);
      return result;
    })
    .then((result) => {
      console.log(`Steam official sample: ${result.items.length} items, ${result.issues.length} issues`);
      console.log(`Output: ${outputFile}`);
      if (shouldApply) console.log(`Applied to: ${currentDataFile}`);
      for (const item of result.items.slice(0, 10)) {
        console.log(`${item.gameName} | ${item.labels.join(" / ")} | 在线 ${item.currentPlayers} | ${item.releaseText}`);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
