const pcNewsSources = new Set(["机核", "游民星空", "游侠网"]);

export function normalizeDataShape(data = {}) {
  const normalizedMobileGames = normalizeRecordList(data.mobileGames);
  const normalizedWelfareGames = normalizeRecordList(data.welfareGames);
  const pcGames = normalizeRecordList(Array.isArray(data.pcGames) ? data.pcGames : []);
  const steamRecords = dedupeRecords(normalizeRecordList([
    ...(data.steamGames || []),
    ...(data.steamNewGames || []),
    ...pcGames.filter(isSteamGame),
  ]));
  const steamGames = steamRecords.filter(isSteamListedGame).sort(sortByPlayers);
  const steamNewGames = steamRecords.filter(isSteamNewGame).sort(sortBySteamRelease);
  const pcNews = Array.isArray(data.pcNews) && data.pcNews.length
    ? normalizeRecordList(data.pcNews)
    : pcGames.filter(isPcNews).sort(sortByNewsDate);
  const allPcGames = normalizeRecordList([...steamGames, ...steamNewGames, ...pcNews]);
  const metrics = buildMetrics({ ...data, mobileGames: normalizedMobileGames, welfareGames: normalizedWelfareGames, pcGames: allPcGames, steamGames, steamNewGames, pcNews });
  return {
    ...data,
    mobileGames: normalizedMobileGames,
    welfareGames: normalizedWelfareGames,
    pcGames: allPcGames,
    steamGames,
    steamNewGames,
    pcNews,
    metrics: { ...(data.metrics || {}), ...metrics },
  };
}

export function buildMetrics(data = {}) {
  const mobileCount = data.mobileGames?.length || 0;
  const welfareCount = data.welfareGames?.length || 0;
  const pcCount = data.pcGames?.length || 0;
  return {
    totalGames: mobileCount + welfareCount + pcCount,
    mobilePool: mobileCount,
    welfarePool: welfareCount,
    pcPool: pcCount,
    steamPool: data.steamGames?.length || 0,
    steamNewPool: data.steamNewGames?.length || 0,
    pcNewsPool: data.pcNews?.length || 0,
    cleanupIssues: data.cleanupIssues?.length || 0,
    rawMobileRecords: data.rawMobileRecords?.length || 0,
    rawWelfareRecords: data.rawWelfareRecords?.length || 0,
    rawPcRecords: data.rawPcRecords?.length || 0,
  };
}

export function isSteamGame(item = {}) {
  return Boolean(item.appid || asList(item.sources).includes("Steam"));
}

export function isSteamListedGame(item = {}) {
  return isSteamGame(item) && Number(item.lastKnownPlayers ?? item.currentPlayers) >= 1000;
}

export function isSteamNewGame(item = {}) {
  if (!isSteamGame(item)) return false;
  if (isSteamListedGame(item)) return false;
  const tagged = [item.status, item.eventType, ...asList(item.steamLabels)].some((value) => /新游|预约|即将推出/.test(String(value || ""))) || item.comingSoon;
  return tagged;
}

export function isPcNews(item = {}) {
  const sources = asList(item.sources);
  return Boolean(item.newsTitle || sources.some((source) => pcNewsSources.has(source)));
}

function sortByPlayers(left, right) {
  return (Number(right.lastKnownPlayers ?? right.currentPlayers) || 0) - (Number(left.lastKnownPlayers ?? left.currentPlayers) || 0);
}

function sortBySteamRelease(left, right) {
  return new Date(left.eventAt || 0).getTime() - new Date(right.eventAt || 0).getTime();
}

function sortByNewsDate(left, right) {
  const dayDiff = newsDayTime(right) - newsDayTime(left);
  if (dayDiff) return dayDiff;
  const heatDiff = (Number(right.heat) || 0) - (Number(left.heat) || 0);
  if (heatDiff) return heatDiff;
  return newsExactTime(right) - newsExactTime(left);
}

function newsDayTime(item) {
  const date = new Date(item?.eventAt || item?.publishedAt || 0);
  if (Number.isNaN(date.getTime())) return 0;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function newsExactTime(item) {
  const date = new Date(item?.eventAt || item?.publishedAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/[|/、,，\s]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeRecordList(records) {
  return Array.isArray(records) ? records.map((item) => normalizeRecordPlatformIds(item)) : [];
}

function dedupeRecords(records = []) {
  const map = new Map();
  for (const item of records) {
    const key = String(item.id || item.appid || item.steamAppId || item.detailUrl || item.originalUrl || item.gameName || "").trim();
    if (!key) continue;
    map.set(key, { ...(map.get(key) || {}), ...item });
  }
  return [...map.values()];
}

function normalizeRecordPlatformIds(item = {}) {
  const platformIds = buildPlatformIds(item);
  const sourceRecords = Array.isArray(item.sourceRecords)
    ? item.sourceRecords.map((record) => {
      const recordPlatformIds = buildPlatformIds(record);
      const normalizedRecord = normalizeRecordImage(record);
      return Object.keys(recordPlatformIds).length ? { ...normalizedRecord, platformIds: recordPlatformIds } : normalizedRecord;
    })
    : item.sourceRecords;
  const normalizedItem = normalizeRecordImage(item);
  return Object.keys(platformIds).length ? { ...normalizedItem, platformIds, sourceRecords } : { ...normalizedItem, sourceRecords };
}

function normalizeRecordImage(item = {}) {
  const iconUrl = cleanBadImageUrl(item.iconUrl, item);
  const imageUrl = cleanBadImageUrl(item.imageUrl, item);
  const headerUrl = cleanBadImageUrl(item.headerUrl, item);
  const capsuleUrl = cleanBadImageUrl(item.capsuleUrl, item);
  return { ...item, iconUrl, imageUrl, headerUrl, capsuleUrl };
}

function cleanBadImageUrl(value = "", item = {}) {
  const url = String(value || "").trim();
  if (!url) return "";
  const detailUrl = String(item.detailUrl || "").trim();
  const originalUrl = String(item.originalUrl || "").trim();
  if (url === detailUrl || url === originalUrl) return "";
  if (/\/news\/html\/[^?#]+\.html(?:$|[?#])/i.test(url)) return "";
  return url;
}

function buildPlatformIds(item = {}) {
  const ids = { ...(item.platformIds || {}) };
  const sourceKey = normalizeSourceKey(item.sourceKey || item.primarySource || item.platform || asList(item.sources)[0] || item.source || "");
  const urls = [item.detailUrl, item.originalUrl, item.url].filter(Boolean).map(String);
  const add = (key, value) => {
    const clean = String(value || "").trim();
    if (!key || !clean) return;
    if (!ids[key] || /^mobile-|^welfare-|^pc-news-/.test(String(ids[key]))) ids[key] = clean;
  };

  add(normalizeSourceKey(item.sourceKey), item.sourceId || item.platformId);
  add("steam", item.appid || item.steamAppId);
  add("xiaoqi", item.gid);

  for (const url of urls) {
    add("steam", matchFirst(url, [/store\.steampowered\.com\/app\/(\d+)/i]));
    add("xiaoqi", matchFirst(url, [/x7sy\.com\/game\/app\/([^/?#]+)/i]));
    add("taptap", matchFirst(url, [/taptap\.cn\/app\/(\d+)/i]));
    add("hykb", matchFirst(url, [/3839\.com\/a\/(\d+)\.htm/i, /hykb\.com\/game\/(\d+)/i, /hykb\.com\/down\/(\d+)/i]));
    add("ninegame", matchFirst(url, [/9game\.cn\/([^/?#]+)\/?/i, /a\.9game\.cn\/([^/?#]+)\/?/i]));
    add("gcores", matchFirst(url, [/gcores\.com\/articles\/(\d+)/i]));
    add("gamersky", matchFirst(url, [/gamersky\.com\/news\/\d+\/(\d+)\.shtml/i, /gamersky\.com\/news\/[^/]+\/([^/.]+)\.shtml/i]));
    add("ali213", matchFirst(url, [/ali213\.net\/news\/html\/\d+\/(\d+)\.html/i, /ali213\.net\/news\/html\/[^/]+\/([^/.]+)\.html/i]));
  }

  if (sourceKey && item.id && /^pc-news-|^mobile-|^welfare-/.test(String(item.id))) add(sourceKey, item.id);
  return Object.fromEntries(Object.entries(ids).filter(([, value]) => String(value || "").trim()));
}

function normalizeSourceKey(source = "") {
  const value = String(source || "").trim();
  const map = {
    TapTap: "taptap",
    好游快爆: "hykb",
    九游: "ninegame",
    小七手游: "xiaoqi",
    Steam: "steam",
    机核: "gcores",
    游民星空: "gamersky",
    游侠网: "ali213",
  };
  return map[value] || value;
}

function matchFirst(value, patterns) {
  for (const pattern of patterns) {
    const match = String(value || "").match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}
