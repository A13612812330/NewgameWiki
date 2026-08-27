import iconv from "iconv-lite";
import "../env.js";
import fs from "node:fs";
import { crawlTapTapRenderedSource } from "./taptap-rendered.js";
import { firecrawlConfigured, scrapeHtmlWithFirecrawl } from "../firecrawl-client.js";

const mobileSources = {
  taptap: { key: "taptap", name: "TapTap", url: "https://www.taptap.cn/app-calendar" },
  ninegame: { key: "ninegame", name: "九游", url: "https://www.9game.cn/kc/" },
  hykb: { key: "hykb", name: "好游快爆", url: "https://www.3839.com/timeline.html" },
  xiaoqi: { key: "xiaoqi", name: "小七手游", url: "https://www.x7sy.com/new", reserveUrl: "https://www.x7sy.com/reserve" },
};

const XIAOQI_PAST_DAYS = 30;
const XIAOQI_RENDERED_DETAIL_LIMIT = 120;
const XIAOQI_STATIC_TARGET_ROWS = Number(process.env.NEWWIKI_XIAOQI_STATIC_TARGET_ROWS || 40);
const FETCH_TIMEOUT_MS = Number(process.env.NEWWIKI_CRAWL_FETCH_TIMEOUT_MS || 15000);
const STATIC_MIN_RECORDS = Number(process.env.NEWWIKI_STATIC_MIN_RECORDS || 6);
const TAPTAP_DETAIL_ENRICH_LIMIT = Number(process.env.NEWWIKI_TAPTAP_DETAIL_LIMIT || 24);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MOBILE_SOURCE_PRIORITY = ["好游快爆", "TapTap", "九游", "小七手游"];


const GAMEPLAY_TAG_ALLOWLIST = new Set([
  "3D",
  "ARPG",
  "AVG",
  "DBG",
  "JRPG",
  "MMO",
  "MOBA",
  "RPG",
  "战略",
  "RogueLike",
  "RogueLite",
  "Roguelike",
  "Roguelite",
  "SLG",
  "Steam移植",
  "TCG",
  "TPS",
  "中国风",
  "乙女",
  "二次元",
  "仙侠",
  "传奇",
  "休闲",
  "体育",
  "修仙",
  "修真",
  "偶像",
  "像素",
  "克苏鲁",
  "养成",
  "冒险",
  "冒险解谜",
  "农场",
  "农场模拟",
  "放置",
  "放置挂机",
  "刷宝",
  "剧情",
  "剪草",
  "割草",
  "动作",
  "动漫",
  "动漫改编",
  "卡牌",
  "卡通",
  "即时战斗",
  "即时策略",
  "吃鸡",
  "唯美",
  "回合",
  "地牢",
  "城市建造",
  "塔防",
  "多人联机",
  "女性向",
  "学园",
  "密室逃脱",
  "寻物",
  "射击",
  "小清新",
  "小说改编",
  "平台跳跃",
  "建造",
  "开放世界",
  "弹幕",
  "恋爱",
  "恐怖惊悚",
  "悬疑",
  "战棋",
  "手绘",
  "抓宠",
  "换装",
  "推理",
  "搜打拆",
  "搜打撤",
  "收集",
  "文字",
  "挂机",
  "暗黑",
  "末日",
  "末日生存",
  "枪战",
  "格斗",
  "模拟",
  "模拟经营",
  "武侠",
  "沙盒",
  "派对游戏",
  "海战",
  "涂色",
  "消除",
  "温馨治愈",
  "漂移",
  "狩猎",
  "狼人杀",
  "生存",
  "益智",
  "社交",
  "种田",
  "科幻",
  "竞技",
  "竞速",
  "端游改编",
  "策略",
  "肉鸽",
  "篮球",
  "类逃离塔科夫",
  "类银河恶魔城",
  "经营",
  "美少女",
  "美食",
  "自走棋",
  "国漫",
  "街机",
  "装饰&装修",
  "视觉小说",
  "角色扮演",
  "解谜",
  "赛车",
  "足球",
  "跑团",
  "跑酷",
  "迷宫",
  "都市",
  "钓鱼",
  "非对称竞技",
  "音游",
  "页游改编",
  "魂like",
  "魔幻",
  "奇幻",
  "三国",
  "咸鱼like"
]);

const GAMEPLAY_TAG_BLOCKLIST = new Set([
  "BOSS讨伐",
  "CV控",
  "PC",
  "TapTap",
  "[详情]",
  "iOS",
  "up主推荐",
  "0.1",
  "1.0",
  "上千地图等你探索",
  "上线",
  "上线/测试",
  "下载",
  "不删档内测",
  "专区",
  "主打复古",
  "九游APP",
  "买断制",
  "云游戏",
  "互动影像",
  "亮点",
  "今日上线",
  "介绍之公会战",
  "付费下载",
  "任务",
  "优选",
  "你画我猜",
  "你的传奇由你定义",
  "关注",
  "划分",
  "副本",
  "力荐佳作",
  "加速器下载",
  "动态",
  "即将上线",
  "发布",
  "发行商",
  "折扣",
  "折扣福利",
  "多平台",
  "多结局",
  "守护城堡",
  "安卓",
  "官方",
  "官服",
  "官网",
  "岁末庆典开启",
  "布阵迎敌",
  "开测",
  "开测提醒",
  "必玩神作",
  "抵御一",
  "排行榜",
  "攻略",
  "新地",
  "新地图",
  "新手",
  "新游",
  "新玩法",
  "新闻",
  "无双马超登场！",
  "更新",
  "查看更多>>",
  "榜单",
  "横版",
  "沉浸式体验",
  "活动",
  "活动/联动",
  "消逝的游戏",
  "游戏",
  "热门",
  "热门游戏",
  "游戏福利",
  "福利",
  "福利介绍",
  "热门标签：",
  "版本更新",
  "社区",
  "私藏佳作",
  "简介",
  "精品",
  "编辑推荐",
  "免费版",
  "免费版福利介绍",
  "职业",
  "联动",
  "脍炙人口",
  "自动",
  "自动拾取",
  "计费删档内测",
  "论坛",
  "试玩",
  "详情",
  "超爽打击",
  "预约",
  "预约提醒",
  "首发",
  "首页",
  "高画质"
]);

const GAMEPLAY_TAG_ALIAS = new Map(Object.entries({
  "搜打拆": "搜打撤",
  "下落式音游": "音游",
  "节奏": "音游",
  "飞行射击": "射击",
  "城市建造": "建造",
  "农场": "农场模拟",
  "RogueLite": "Roguelite",
  "RogueLike": "Roguelike"
}));
const GAMEPLAY_TAG_BAD_WORDS = [
  "版本",
  "更新",
  "活动",
  "赛季",
  "联动",
  "返场",
  "上线",
  "预约",
  "测试",
  "首测",
  "终测",
  "首发",
  "删档",
  "内测",
  "公测",
  "下载",
  "发行",
  "厂商",
  "简介",
  "BOSS",
  "怎么出",
  "好玩吗",
  "什么时候"
];

function normalizeGameplayAlias(tag = "") {
  const value = cleanText(tag).replace(/RogueLite/i, "Roguelite").replace(/RogueLike/i, "Roguelike");
  return GAMEPLAY_TAG_ALIAS.get(value) || value;
}

function isAllowedGameplayTag(tag = "") {
  const value = normalizeGameplayAlias(tag);
  if (!value || value.length < 2 || value.length > 12) return false;
  if (GAMEPLAY_TAG_BLOCKLIST.has(value)) return false;
  if (/^\d/.test(value) || /\d{1,2}[:\-]\d{2}|20\d{2}|^\(\d+\)$|^\+\d+/.test(value)) return false;
  if (/[\u3002\uff01\uff1f!?\uff0c,\u300a\u300b\u201c\u201d"']/.test(value)) return false;
  if (GAMEPLAY_TAG_BAD_WORDS.some((word) => value.includes(word))) return false;
  return GAMEPLAY_TAG_ALLOWLIST.has(value);
}

export async function crawlToday({ sources = ["taptap", "ninegame", "hykb"], date = todayInChina(), existingData = {} } = {}) {
  const selected = normalizeSources(sources);
  const result = emptyDataset(date);
  const rawIssues = [];
  const rawMobileRecords = [];
  const rawWelfareRecords = [];
  const crawlDiagnostics = {};

  for (const sourceKey of selected) {
    const startedAt = Date.now();
    try {
      const payload = await crawlBySource(sourceKey, date, existingData);
      if (sourceKey === "xiaoqi") rawWelfareRecords.push(...payload.records);
      else rawMobileRecords.push(...payload.records);
      rawIssues.push(...payload.issues);
      crawlDiagnostics[sourceKey] = buildSourceDiagnostic(sourceKey, payload, startedAt);
    } catch (error) {
      const issue = sourceError(mobileSources[sourceKey]?.name || sourceKey, error);
      rawIssues.push(issue);
      crawlDiagnostics[sourceKey] = buildSourceDiagnostic(sourceKey, { records: [], issues: [issue], strategy: "failed" }, startedAt, error);
    }
  }

  result.rawMobileRecords = rawMobileRecords;
  result.rawWelfareRecords = rawWelfareRecords;
  result.mobileGames = buildMobilePool(rawMobileRecords);
  result.welfareGames = buildWelfarePool(rawWelfareRecords);
  result.cleanupIssues = buildIssues([...rawIssues, ...findPoolIssues(result.mobileGames), ...findPoolIssues(result.welfareGames)]);
  result.updateLogs = buildUpdateLogs(result, selected);
  result.crawlDiagnostics = crawlDiagnostics;
  result.sourceGroups = buildSourceGroups(selected, result, rawIssues, crawlDiagnostics);
  result.metrics = buildMetrics(result);
  result.generatedAt = new Date().toISOString();
  return result;
}

export async function crawlSingleMobileRecord({ sourceKey, platformId, detailUrl, target = {}, date = todayInChina() } = {}) {
  const normalizedSource = normalizeSources([sourceKey])[0];
  if (!normalizedSource) throw new Error("当前来源暂不支持单条详情页重抓");
  const source = mobileSources[normalizedSource];
  const targetTitle = cleanText(target.gameName || target.newsTitle || "");
  const resolvedDetailUrl = await resolveSingleDetailUrl(normalizedSource, platformId, detailUrl || target.detailUrl || target.originalUrl, target);
  const record = normalizeRecord({
    id: stableId(normalizedSource, resolvedDetailUrl || platformId || target.id || targetTitle),
    gid: normalizedSource === "xiaoqi" ? cleanText(idFromMobileDetailUrl(resolvedDetailUrl, "xiaoqi") || platformId || target.gid || "") : target.gid || "",
    sourceKey: normalizedSource,
    source: source.name,
    gameName: targetTitle,
    subtitle: cleanText(target.subtitle || ""),
    icon: targetTitle.slice(0, 1),
    iconUrl: target.iconUrl || "",
    platform: "手游",
    pool: normalizedSource === "xiaoqi" ? "小七福利新游池" : "公共手游池",
    status: target.status || "上线/测试",
    eventType: target.eventType || "新游",
    eventAt: target.eventAt || `${date}T10:00:00+08:00`,
    tags: mergeUnique([target.status, target.eventType, ...(target.tags || []), ...(target.gameplayTags || [])]),
    summary: target.summary || "",
    updateContent: target.updateContent || target.summary || "",
    vendor: target.vendor || "",
    operator: target.operator || "",
    originalUrl: source.url,
    detailUrl: resolvedDetailUrl,
  });
  if (!record.detailUrl) throw new Error("详情页ID缺失，且平台搜索未匹配到同名游戏");

  if (normalizedSource === "xiaoqi") await enrichXiaoqiRecords([record]);
  else if (normalizedSource === "taptap") await enrichTapTapJsonRecords([record]);
  else if (normalizedSource === "hykb") await enrichHykbRecords([record]);
  else if (normalizedSource === "ninegame") await enrichNineGameRecords([record]);

  const mobileGames = normalizedSource === "xiaoqi" ? [] : buildMobilePool([record]);
  const welfareGames = normalizedSource === "xiaoqi" ? buildWelfarePool([record]) : [];
  return {
    generatedAt: new Date().toISOString(),
    date,
    rawMobileRecords: normalizedSource === "xiaoqi" ? [] : [record],
    rawWelfareRecords: normalizedSource === "xiaoqi" ? [record] : [],
    mobileGames,
    welfareGames,
    cleanupIssues: buildIssues(findPoolIssues([...mobileGames, ...welfareGames])),
    sourceGroups: [],
    updateLogs: [],
    partialSingle: true,
    partialTitle: record.gameName,
    partialSourceKey: normalizedSource,
  };
}

async function resolveSingleDetailUrl(sourceKey, platformId = "", fallbackUrl = "", target = {}) {
  const id = cleanText(platformId);
  const fallback = cleanText(fallbackUrl);
  if (isMobileDetailUrl(sourceKey, fallback)) return fallback;
  if (sourceKey === "taptap" && id) return `https://www.taptap.cn/app/${encodeURIComponent(id)}`;
  if (sourceKey === "xiaoqi" && id) return `https://www.x7sy.com/game/app/${encodeURIComponent(id)}`;
  if (sourceKey === "hykb" && id && /^mobile-/.test(id)) return "";
  if (sourceKey === "hykb" && id) return `https://www.3839.com/a/${encodeURIComponent(id)}.htm`;
  if (sourceKey === "ninegame" && id) return `https://www.9game.cn/${encodeURIComponent(id)}/`;
  return searchSingleDetailUrl(sourceKey, target);
}

async function searchSingleDetailUrl(sourceKey, target = {}) {
  const title = cleanText(target.gameName || target.newsTitle || "");
  if (!title) return "";
  const cached = findCachedDetailUrl(sourceKey, title, target);
  if (cached) return cached;
  if (sourceKey === "hykb") return searchHykbDetailUrl(title);
  if (sourceKey === "ninegame") return searchNineGameDetailUrl(title);
  if (sourceKey === "xiaoqi") return searchXiaoqiDetailUrl(title);
  if (sourceKey === "taptap") return searchTapTapDetailUrl(title);
  return "";
}

function findCachedDetailUrl(sourceKey, title, target = {}) {
  const titleKey = gameIdentity(title);
  for (const record of target.sourceRecords || []) {
    if (sourceKeyForMobileRecord(record) !== sourceKey) continue;
    if (isMobileDetailUrl(sourceKey, record.detailUrl) && (!titleKey || gameIdentity(record.gameName || title) === titleKey)) return record.detailUrl;
  }
  if (isMobileDetailUrl(sourceKey, target.detailUrl)) return target.detailUrl;
  return "";
}

async function searchHykbDetailUrl(title) {
  const html = await fetchHtml(`https://www.3839.com/search.php?keyword=${encodeURIComponent(title)}`);
  const candidates = [...html.matchAll(/<a[^>]+href=["']([^"']*\/a\/\d+\.htm)["'][^>]*>[\s\S]*?(?:<span[^>]+class=["']sp-name["'][^>]*>([\s\S]*?)<\/span>|<img[^>]+alt=["']([^"']+)["'])/gi)]
    .map((match) => ({ url: normalizeUrl(match[1], "https://www.3839.com"), name: cleanText(match[2] || match[3] || "") }))
    .filter((item) => isMobileDetailUrl("hykb", item.url));
  return chooseSearchCandidate(candidates, title);
}

async function searchNineGameDetailUrl(title) {
  const urls = [
    `https://so.9game.cn/?keyword=${encodeURIComponent(title)}`,
    `https://www.9game.cn/search/?keyword=${encodeURIComponent(title)}`,
  ];
  for (const url of urls) {
    try {
      const html = await fetchHtml(url, "utf8");
      const candidates = [...html.matchAll(/<a[^>]+href=["']([^"']*9game\.cn\/[^"']+\/)["'][^>]*(?:title=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/a>/gi)]
        .map((match) => ({ url: normalizeUrl(match[1], "https://www.9game.cn"), name: cleanNineGameTitle(match[2] || match[3] || "") }))
        .filter((item) => isMobileDetailUrl("ninegame", item.url));
      const picked = chooseSearchCandidate(candidates, title);
      if (picked) return picked;
    } catch {
      // Try next search endpoint.
    }
  }
  return "";
}

async function searchXiaoqiDetailUrl(title) {
  const html = await fetchHtml(`https://www.x7sy.com/search?keyword=${encodeURIComponent(title)}`);
  const candidates = [...html.matchAll(/(?:href|url)["']?\s*[:=]\s*["']([^"']*\/game\/(?:app|h5)\/[^"']+)["'][\s\S]{0,240}?((?:gameName|showName|name)["']?\s*[:=]\s*["']([^"']+)["'])?/gi)]
    .map((match) => ({ url: normalizeUrl(match[1], "https://www.x7sy.com"), name: cleanText(match[3] || "") }))
    .filter((item) => isMobileDetailUrl("xiaoqi", item.url));
  return chooseSearchCandidate(candidates, title);
}

async function searchTapTapDetailUrl(title) {
  const html = await fetchHtml(`https://www.taptap.cn/search/${encodeURIComponent(title)}`);
  const candidates = [...html.matchAll(/(?:href|url)["']?\s*[:=]\s*["']([^"']*\/app\/\d+[^"']*)["'][\s\S]{0,240}?((?:title|name)["']?\s*[:=]\s*["']([^"']+)["'])?/gi)]
    .map((match) => ({ url: normalizeUrl(match[1], "https://www.taptap.cn"), name: cleanText(match[3] || "") }))
    .filter((item) => isMobileDetailUrl("taptap", item.url));
  return chooseSearchCandidate(candidates, title);
}

function chooseSearchCandidate(candidates = [], title = "") {
  const titleKey = gameIdentity(title);
  const exact = candidates.find((item) => gameIdentity(item.name) === titleKey);
  if (exact) return exact.url;
  const cleanTitle = cleanText(title);
  const fuzzy = candidates.find((item) => item.name && (item.name.includes(cleanTitle) || cleanTitle.includes(item.name)));
  return fuzzy?.url || "";
}

function isMobileDetailUrl(sourceKey, url = "") {
  const value = cleanText(url);
  if (!/^https?:\/\//.test(value)) return false;
  if (sourceKey === "taptap") return /taptap\.cn\/app\/\d+(?:[/?#]|$)/i.test(value);
  if (sourceKey === "xiaoqi") return /x7sy\.com\/game\/(?:app|h5)\/[^/?#]+/i.test(value);
  if (sourceKey === "hykb") return /3839\.com\/a\/\d+\.htm/i.test(value) || /hykb\.com\/game\/\d+/i.test(value);
  if (sourceKey === "ninegame") return /9game\.cn\/[^/?#]+\/?$/i.test(value) && !/\/kc\/?$|\/search\/?$|so\.9game\.cn/i.test(value);
  return false;
}

function idFromMobileDetailUrl(url = "", sourceKey = "") {
  const value = cleanText(url);
  if (sourceKey === "xiaoqi") return value.match(/x7sy\.com\/game\/(?:app|h5)\/([^/?#]+)/i)?.[1] || "";
  if (sourceKey === "taptap") return value.match(/taptap\.cn\/app\/(\d+)/i)?.[1] || "";
  if (sourceKey === "hykb") return value.match(/3839\.com\/a\/(\d+)\.htm/i)?.[1] || "";
  if (sourceKey === "ninegame") return value.match(/9game\.cn\/([^/?#]+)\/?$/i)?.[1] || "";
  return "";
}

function sourceKeyForMobileRecord(record = {}) {
  return normalizeSources([record.sourceKey])[0] || normalizeSources([record.source])[0] || "";
}

export function cleanExistingMobileDataset(data = {}) {
  const next = { ...data };
  const rawMobileRecords = (data.rawMobileRecords || []).map((record) => normalizeRecord(record));
  const rawWelfareRecords = (data.rawWelfareRecords || []).map((record) => normalizeRecord(record));
  next.rawMobileRecords = rawMobileRecords;
  next.rawWelfareRecords = rawWelfareRecords;
  const canRebuildMobile = rawMobileRecords.length > 0 && rawMobileRecords.length >= (data.mobileGames || []).length;
  const canRebuildWelfare = rawWelfareRecords.length > 0 && rawWelfareRecords.length >= (data.welfareGames || []).length;
  next.mobileGames = canRebuildMobile ? buildMobilePool(rawMobileRecords) : (data.mobileGames || []).map((item) => cleanPoolItem(item));
  next.welfareGames = canRebuildWelfare ? buildWelfarePool(rawWelfareRecords) : (data.welfareGames || []).map((item) => cleanPoolItem(item));
  next.mobileGames = mergeAliasedPoolItems(next.mobileGames);
  next.welfareGames = mergeAliasedPoolItems(next.welfareGames);
  next.mobileGames = preserveManualImportanceLevels(data.mobileGames || [], next.mobileGames);
  next.welfareGames = preserveManualImportanceLevels(data.welfareGames || [], next.welfareGames);
  next.cleanupIssues = buildIssues([
    ...(data.cleanupIssues || []).filter((issue) => !["\u7f3a\u8be6\u60c5\u9875", "\u7f3a\u56fe\u6807", "\u7f3a\u73a9\u6cd5\u6807\u7b7e", "活动日期不一致"].includes(issue.type)),
    ...findPoolIssues(next.mobileGames),
    ...findPoolIssues(next.welfareGames),
  ]);
  next.metrics = buildMetrics(next);
  next.generatedAt = new Date().toISOString();
  return next;
}

export function buildCleanupIssuesForItems(items = []) {
  return buildIssues(findPoolIssues(Array.isArray(items) ? items : []));
}

function preserveManualImportanceLevels(previousItems = [], nextItems = []) {
  const previousByKey = new Map();
  for (const item of previousItems) {
    const key = `${gameIdentity(item.gameName)}|${gameIdentity(item.subtitle || "")}`;
    if (key !== "|") previousByKey.set(key, item);
  }
  return nextItems.map((item) => {
    const key = `${gameIdentity(item.gameName)}|${gameIdentity(item.subtitle || "")}`;
    const previous = previousByKey.get(key);
    if (!previous) return item;
    const previousLevel = String(previous.importanceLevel || "").trim().toUpperCase();
    const hasManualImportance = previousLevel && previousLevel !== "C"
      || Boolean(previous.manualChoices?.importanceLevel);
    if (!hasManualImportance || item.importanceLevel === previous.importanceLevel) return item;
    return {
      ...item,
      importanceLevel: previousLevel || "C",
      manualChoices: {
        ...(item.manualChoices || {}),
        ...(previous.manualChoices || {}),
      },
    };
  });
}

function mergeAliasedPoolItems(items = []) {
  const parents = items.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  const keyOwners = new Map();
  items.forEach((item, index) => {
    for (const key of mobileAssociationKeys(item)) {
      const owner = keyOwners.get(key);
      if (owner !== undefined) union(owner, index);
      else keyOwners.set(key, index);
    }
  });
  const groups = new Map();
  items.forEach((item, index) => {
    const root = find(index);
    const group = groups.get(root) || [];
    group.push(item);
    groups.set(root, group);
  });
  return [...groups.values()].flatMap((group) => {
    if (group.length < 2) return group;
    const sourceRecords = group.flatMap((item) => item.sourceRecords?.length ? item.sourceRecords : [item]);
    const merged = buildMobilePool(sourceRecords)[0];
    if (!merged) return group;
    const importance = group
      .map((item) => String(item.importanceLevel || "C").toUpperCase())
      .sort((left, right) => ({ S: 4, A: 3, B: 2, C: 1 }[right] || 1) - ({ S: 4, A: 3, B: 2, C: 1 }[left] || 1))[0] || "C";
    return [{
      ...merged,
      id: group[0].id || merged.id,
      importanceLevel: importance,
      visible: group.some((item) => item.visible === false) ? false : group[0].visible,
      manualChoices: Object.assign({}, ...group.map((item) => item.manualChoices || {})),
    }];
  });
}

export function mobileAssociationKeys(item = {}) {
  const records = item.sourceRecords?.length ? item.sourceRecords : [item];
  const keys = new Set();
  const nameKey = gameIdentity(item.gameName || item.newsTitle || "");
  if (nameKey) keys.add(`name:${nameKey}`);
  for (const record of records) {
    const sourceKey = sourceKeyForMobileRecord(record);
    if (!sourceKey) continue;
    const platformId = record.platformIds?.[sourceKey] || record.platformId || record.sourceId || record.gid || record.detailUrl || "";
    if (platformId) keys.add(`source:${sourceKey}:${String(platformId).trim().toLowerCase()}`);
  }
  return [...keys];
}

export function emptyDataset(date = todayInChina()) {
  return {
    generatedAt: new Date().toISOString(),
    date,
    mobileGames: [],
    rawMobileRecords: [],
    welfareGames: [],
    rawWelfareRecords: [],
    pcGames: [],
    rawPcRecords: [],
    cleanupIssues: [],
    reviewQueue: [],
    schedulerJobs: [
      { id: "job-1", name: "手机游戏", scope: "TapTap / 好游快爆 / 九游", cron: "09:00, 12:00, 18:00", status: "待配置", nextRun: "待配置" },
      { id: "job-2", name: "福利游戏", scope: "小七手游", cron: "待配置", status: "待接入", nextRun: "待配置" },
      { id: "job-3", name: "PC/Steam", scope: "Steam / PC资讯", cron: "待配置", status: "未启用", nextRun: "待配置" },
    ],
    sourceGroups: buildSourceGroups([], { mobileGames: [], rawMobileRecords: [], welfareGames: [], pcGames: [] }, []),
    metrics: { totalGames: 0, mobilePool: 0, welfarePool: 0, pcPool: 0, todayUpdates: 0, cleanupIssues: 0, rawMobileRecords: 0 },
    updateLogs: [],
  };
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
async function crawlBySource(sourceKey, date, existingData = {}) {
  if (sourceKey === "taptap") return crawlTapTap(date, existingData);
  if (sourceKey === "ninegame") return crawlNineGame(date, existingData);
  if (sourceKey === "hykb") return crawlHykb(date, existingData);
  if (sourceKey === "xiaoqi") return crawlXiaoqiWelfare(date, existingData);
  return { records: [], issues: [] };
}

async function crawlTapTap(date, existingData = {}) {
  const issues = [];
  let staticResult = null;
  try {
    staticResult = await crawlTapTapStatic(date, existingData);
    if (staticResult.records.length && !needsRenderedFallback(staticResult.records)) return { ...staticResult, strategy: "static-json" };
  } catch (error) {
    issues.push({ source: "TapTap", type: "静态解析失败", detail: cleanText(error?.message || "TapTap 静态页面解析失败，准备使用浏览器兜底。") });
  }

  try {
    const rendered = await withTimeout(crawlTapTapRendered(date), 180000, "TapTap 渲染抓取超时");
    return { ...rendered, issues: [...issues, ...(staticResult?.issues || []), ...(rendered.issues || [])], strategy: "rendered-fallback" };
  } catch (error) {
    issues.push({ source: "TapTap", type: "浏览器兜底失败", detail: cleanText(error?.message || "TapTap 浏览器兜底失败。") });
  }

  if (staticResult?.records?.length) return { ...staticResult, issues: [...issues, ...(staticResult.issues || [])], strategy: "static-json-partial" };
  return { records: [], issues, strategy: "failed" };
}

async function crawlTapTapStatic(date, existingData = {}) {
  const html = await fetchHtml(mobileSources.taptap.url);
  const records = [];
  const issues = [];
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1]);

  for (const block of blocks) {
    let entry;
    try {
      entry = JSON.parse(block);
    } catch {
      continue;
    }
    if (entry?.["@type"] !== "Event") continue;

    const eventAt = toChinaIso(entry.startDate);
    if (compareDate(eventAt.slice(0, 10), date) < 0) continue;

    const detailUrl = normalizeUrl(entry.url, "https://www.taptap.cn");
    const status = eventAt.startsWith(date) ? "今日上线" : "即将上线";

    records.push(normalizeRecord({
      id: stableId("taptap", detailUrl || entry.name),
      sourceKey: "taptap",
      source: "TapTap",
      gameName: cleanText(entry.name),
      icon: cleanText(entry.name).slice(0, 1),
      iconUrl: normalizeImage(entry.image, "https://www.taptap.cn"),
      platform: "手游",
      pool: "公共手游池",
      status,
      eventType: "新游",
      eventAt,
      tags: ["新游", status],
      summary: cleanText(entry.description),
      updateContent: cleanText(entry.description),
      originalUrl: mobileSources.taptap.url,
      detailUrl,
    }));
  }

  if (records.length) await enrichTapTapJsonRecords(records, existingData);

  if (!records.length) {
    issues.push({ source: "TapTap", type: "无排期记录", detail: `${date} 之后未从 TapTap 日历解析到游戏。` });
  }

  return { records, issues };
}

async function crawlNineGame(date, existingData = {}) {
  const html = await fetchHtml(mobileSources.ninegame.url, "utf8");
  const records = [];

  const todayBlock = between(html, 'class="box today-new-server"', 'class="box open-test-con"') || "";
  for (const block of [...todayBlock.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => match[1])) {
    const record = parseNineGameTodayBlock(block, date);
    if (record) records.push(record);
  }

  const soonBlock = between(html, 'class="box open-test-con"', 'class="footerWrap"') || "";
  const sections = [...soonBlock.matchAll(/<div class="des-table1">([\s\S]*?)(?=<div class="des-table1">|<\/div>\s*<\/div>\s*<\/div>)/g)].map((match) => match[1]);
  for (const section of sections) {
    const dayText = cleanText(text(section, /<div class="day">([\s\S]*?)<\/div>/));
    const eventDate = resolveNineGameDay(dayText, date);
    for (const row of [...section.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((match) => match[1])) {
      const record = parseNineGameScheduleRow(row, eventDate);
      if (record) records.push(record);
    }
  }

  await enrichNineGameRecords(records, existingData);

  const filteredRecords = records.filter((record) => !isNineGameCloudAd(record));
  const cloudAdCount = records.length - filteredRecords.length;
  const issues = [];
  if (!filteredRecords.length) {
    issues.push({ source: "\u4e5d\u6e38", type: "\u65e0\u6392\u671f\u8bb0\u5f55", detail: date + " \u4e4b\u540e\u672a\u89e3\u6790\u5230\u4e5d\u6e38\u5f00\u6d4b\u5217\u8868\u3002" });
  }
  if (cloudAdCount) {
    issues.push({ source: "\u4e5d\u6e38", type: "\u5e7f\u544a\u8fc7\u6ee4", detail: "\u5df2\u8fc7\u6ee4 " + cloudAdCount + " \u6761\u4e91\u6e38\u620f/\u7f51\u9875\u7248\u79d2\u73a9\u5165\u53e3\u5e7f\u544a\u8bb0\u5f55\u3002" });
  }

  return { records: filteredRecords, issues };
}

async function crawlHykb(date, existingData = {}) {
  const html = await fetchHtml(mobileSources.hykb.url);
  const records = [];
  const issues = [];
  const cardPattern = /<div class="foreCard" rel="([^"]+)">([\s\S]*?)(?=<div class="foreCard" rel=|<script|$)/g;

  for (const match of html.matchAll(cardPattern)) {
    const block = match[2];
    const dayText = cleanText(text(block, /<div class="foreCard-hd">([\s\S]*?)<\/div>/));
    const eventDate = resolveHykbDay(dayText, date);
    if (!eventDate || compareDate(eventDate, date) < 0) continue;

    for (const row of [...block.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((item) => item[1])) {
      const record = parseHykbBlock(row, eventDate);
      if (record) records.push(record);
    }
  }

  await enrichHykbRecords(records, existingData);

  if (!records.length) {
    issues.push({ source: "好游快爆", type: "无排期记录", detail: `${date} 之后未从好游快爆时间线解析到手游记录。` });
  }

  return { records, issues };
}

async function crawlXiaoqiWelfare(date, existingData = {}) {
  const pages = [
    { kind: "新游", url: mobileSources.xiaoqi.url },
    { kind: "预约", url: mobileSources.xiaoqi.reserveUrl },
  ];
  const records = [];
  const issues = [];
  let staticRows = 0;

  for (const page of pages) {
    const html = await fetchHtml(page.url);
    const rows = parseXiaoqiNuxtRows(html);
    staticRows += rows.length;
    for (const row of rows) {
      const record = parseXiaoqiRow(row, page, date);
      if (record) records.push(record);
    }
  }

  const missingDetailCount = records.filter((record) => !record.detailUrl).length;
  const missingPopularityCount = records.filter((record) => !hasXiaoqiPopularity(record)).length;
  const shouldUseRenderedFallback = records.length < STATIC_MIN_RECORDS
    || staticRows < XIAOQI_STATIC_TARGET_ROWS
    || missingDetailCount > Math.max(3, records.length * 0.35)
    || missingPopularityCount > Math.max(3, records.length * 0.25);
  if (shouldUseRenderedFallback) try {
    const renderedRecords = await crawlXiaoqiRenderedWelfare(date, pages);
    records.push(...renderedRecords);
  } catch (error) {
    issues.push({
      source: "小七手游",
      type: "渲染列表失败",
      detail: cleanText(error?.message || "小七滚动列表采集失败，已保留首屏数据。"),
    });
  } else if (missingDetailCount || missingPopularityCount) {
    issues.push({
      source: "小七手游",
      type: "部分字段缺失",
      detail: `静态列表已解析 ${records.length} 条，其中 ${missingDetailCount} 条缺少详情链接，${missingPopularityCount} 条缺少预约/在玩人数，本轮未启动浏览器兜底。`,
    });
  }

  await enrichXiaoqiRecords(records, existingData);

  if (!records.length) {
    issues.push({ source: "小七手游", type: "无福利记录", detail: `${date} 之后未从小七新游/预约列表解析到福利游戏。` });
  }

  return { records, issues, strategy: shouldUseRenderedFallback ? "static+rendered-fallback" : "static", staticRows };
}

async function crawlXiaoqiRenderedWelfare(date, pages) {
  const { chromium } = await import("playwright-core");
  const executablePath = findChromeExecutable();
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const records = [];

  try {
    for (const pageInfo of pages) {
      const items = await collectXiaoqiRenderedItems(page, pageInfo);
      for (const item of items) {
        const record = parseXiaoqiRenderedItem(item, pageInfo, date);
        if (record) records.push(record);
      }
    }
  } finally {
    await browser.close();
  }

  return records;
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Users\\komo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((item) => fs.existsSync(item));
}

async function collectXiaoqiRenderedItems(page, pageInfo) {
  await page.goto(pageInfo.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await scrollXiaoqiList(page);

  const count = await page.locator(".commonGameIntro.info_item").count();
  const items = [];
  for (let index = 0; index < count; index += 1) {
    const item = await readXiaoqiRenderedItem(page, index);
    if (!item.gameName) continue;
    item.renderedIndex = index;
    items.push(item);
  }

  for (const item of items.slice(0, XIAOQI_RENDERED_DETAIL_LIMIT)) {
    if (item.detailUrl) continue;
    try {
      await ensureXiaoqiRenderedIndex(page, item.renderedIndex);
      item.detailUrl = await resolveXiaoqiRenderedDetailUrl(page, item.renderedIndex);
    } catch {
      item.detailUrl = await resolveXiaoqiRenderedDetailUrlByName(page, item.gameName).catch(() => "");
      if (!item.detailUrl) item.detailUrl = await searchXiaoqiDetailUrl(item.gameName).catch(() => "");
    }
  }

  return items;
}

async function ensureXiaoqiRenderedIndex(page, index) {
  for (let round = 0; round < 24; round += 1) {
    const count = await page.locator(".commonGameIntro.info_item").count();
    if (count > index) return true;
    await page.mouse.wheel(0, 2200);
    await page.waitForTimeout(650);
  }
  return false;
}

async function scrollXiaoqiList(page) {
  let previousCount = 0;
  let stableRounds = 0;
  for (let round = 0; round < 28 && stableRounds < 4; round += 1) {
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(350);
    const count = await page.locator(".commonGameIntro.info_item").count();
    if (count === previousCount) stableRounds += 1;
    else stableRounds = 0;
    previousCount = count;
  }
}

async function readXiaoqiRenderedItem(page, index) {
  return page.locator(".commonGameIntro.info_item").nth(index).evaluate((el) => {
    const clean = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const textOf = (selector) => clean(el.querySelector(selector)?.textContent || "");
    const labelTexts = [...el.querySelectorAll(".info.info2 .label")]
      .map((node) => clean(node.textContent).replace(/^[|·\s]+/, "").replace(/[|·\s]+$/, ""))
      .filter(Boolean);
    const badgeTexts = [...el.querySelectorAll(".x7tag, .x7Subscribe")]
      .map((node) => clean(node.textContent))
      .filter(Boolean);
    const collection = el.closest(".collection_item");
    const playText = textOf(".play");
    return {
      gameName: textOf(".game_name .name"),
      iconUrl: el.querySelector("img.logo")?.src || "",
      labels: labelTexts,
      onlineText: textOf(".online_time"),
      playerText: textOf(".playText") || (/在玩/.test(playText) ? playText : ""),
      reserveText: textOf(".showText") || (/预约/.test(playText) ? playText : "") || textOf(".x7Subscribe"),
      playText,
      discount: clean(el.querySelector(".x7Discount .num")?.textContent || ""),
      action: clean(el.querySelector(".x7Subscribe")?.textContent || ""),
      badges: badgeTexts,
      collectionText: clean(collection?.querySelector(".collection_title")?.textContent || ""),
    };
  });
}

async function resolveXiaoqiRenderedDetailUrl(page, index) {
  const card = page.locator(".commonGameIntro.info_item").nth(index);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  await card.click({ timeout: 8000 });
  await page.waitForURL(/\/game\/(?:app|h5)\//, { timeout: 10000, waitUntil: "domcontentloaded" });
  const detailUrl = page.url().split("?")[0];
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".commonGameIntro.info_item", { timeout: 15000 });
  await page.waitForTimeout(500);
  return detailUrl;
}

async function resolveXiaoqiRenderedDetailUrlByName(page, gameName = "") {
  const title = cleanText(gameName);
  if (!title) return "";
  await scrollXiaoqiList(page);
  const card = page.locator(".commonGameIntro.info_item").filter({ hasText: title }).first();
  if (!(await card.count())) return "";
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  await card.click({ timeout: 8000 });
  await page.waitForURL(/\/game\/(?:app|h5)\//, { timeout: 10000, waitUntil: "domcontentloaded" });
  const detailUrl = page.url().split("?")[0];
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".commonGameIntro.info_item", { timeout: 15000 });
  await page.waitForTimeout(500);
  return detailUrl;
}

function parseXiaoqiRenderedItem(item = {}, page = {}, today) {
  const titleParts = splitGameTitle(item.gameName || "");
  const gameName = titleParts.gameName;
  const eventAt = resolveXiaoqiRenderedDate(item.collectionText, item.onlineText, today);
  if (!gameName || !eventAt || compareDate(eventAt.slice(0, 10), addDays(today, -XIAOQI_PAST_DAYS)) < 0) return null;

  const detailUrl = cleanText(item.detailUrl || "");
  const gid = cleanText((detailUrl.match(/\/game\/(?:app|h5)\/([^/?#]+)/) || [])[1] || "");
  const discount = normalizeXiaoqiDiscount(item.discount);
  const subtitle = mergeUnique([titleParts.subtitle, discount].filter(Boolean)).join(" / ") || "常规";
  const status = "上线/测试";
  const eventType = page.kind === "预约" ? "预约" : "新游";
  const popularity = buildXiaoqiPopularity({
    kind: page.kind,
    playerCount: parsePeopleCount(item.playerText || (/在玩/.test(item.playText || "") ? item.playText : "") || item.onlineText),
    reservationCount: parsePeopleCount(item.reserveText || (/预约/.test(item.playText || "") ? item.playText : "") || item.subscribeText || item.action),
  });
  const scheduleText = formatXiaoqiScheduleText(eventAt, page.kind, item.onlineText || item.collectionText);
  const summary = mergeUnique([scheduleText, subtitle ? `${gameName}${subtitle}` : ""].filter(Boolean)).join("\n");

  return normalizeRecord({
    id: stableId("xiaoqi", gid || detailUrl || `${page.url}:${gameName}`),
    gid,
    sourceKey: "xiaoqi",
    source: "小七手游",
    gameName,
    subtitle,
    icon: gameName.slice(0, 1),
    iconUrl: normalizeImage(item.iconUrl, "https://www.x7sy.com"),
    platform: "手游",
    pool: "小七福利新游池",
    status,
    eventType,
    eventAt,
    playerCount: popularity.playerCount,
    reservationCount: popularity.reservationCount,
    popularityText: popularity.text,
    welfareKind: eventType,
    tags: mergeUnique([status, eventType, ...(item.labels || []), ...(item.badges || [])]),
    summary,
    updateContent: summary,
    vendor: "",
    originalUrl: page.url,
    detailUrl,
  });
}

function parseXiaoqiNuxtRows(html = "") {
  const payload = text(html, /<script type="application\/json"[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!payload) return [];
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return [];
  }
  return collectXiaoqiRows(reviveNuxtPayload(data));
}

function reviveNuxtPayload(data = []) {
  const cache = new Map();
  const revive = (value) => {
    if (typeof value === "number") return reviveIndex(value);
    if (Array.isArray(value)) return value.map(revive);
    if (value && typeof value === "object") {
      const object = {};
      for (const [key, child] of Object.entries(value)) object[key] = revive(child);
      return object;
    }
    return value;
  };
  const reviveIndex = (index) => {
    if (index === -1) return undefined;
    if (cache.has(index)) return cache.get(index);
    const raw = data[index];
    if (Array.isArray(raw) && typeof raw[0] === "string") {
      if (["Reactive", "ShallowReactive", "Ref", "ShallowRef"].includes(raw[0])) return revive(raw[1]);
      if (raw[0] === "Set") return raw.slice(1).map(revive);
    }
    if (Array.isArray(raw)) {
      const array = [];
      cache.set(index, array);
      raw.forEach((item, itemIndex) => {
        array[itemIndex] = revive(item);
      });
      return array;
    }
    if (raw && typeof raw === "object") {
      const object = {};
      cache.set(index, object);
      for (const [key, value] of Object.entries(raw)) object[key] = revive(value);
      return object;
    }
    return raw;
  };
  return reviveIndex(0);
}

function collectXiaoqiRows(node, rows = [], seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return rows;
  seen.add(node);
  if (node.gameData && node.collectionTitle) rows.push(node);
  if (Array.isArray(node)) {
    node.forEach((item) => collectXiaoqiRows(item, rows, seen));
  } else {
    Object.values(node).forEach((item) => collectXiaoqiRows(item, rows, seen));
  }
  return rows;
}

function parseXiaoqiRow(row = {}, page = {}, today) {
  const game = row.gameData || {};
  const titleParts = splitGameTitle(game.gameName || game.showName || "");
  const gameName = titleParts.gameName;
  const gid = cleanText(game.gid || game.ngid || "");
  if (!gameName || !gid) return null;

  const eventTimestamp = page.kind === "预约"
    ? (row.subscribeData?.subscribeCalendarStartTime || row.serviceTime)
    : (row.serviceTime || row.subscribeData?.subscribeCalendarStartTime);
  const eventAt = toChinaIsoFromUnix(eventTimestamp) || resolveXiaoqiDate(row.collectionTitle, today);
  if (!eventAt || compareDate(eventAt.slice(0, 10), addDays(today, -XIAOQI_PAST_DAYS)) < 0) return null;

  const labels = (game.labels || []).map((item) => item?.labelName).filter(Boolean);
  const discount = normalizeXiaoqiDiscount(game.discount);
  const subtitle = mergeUnique([titleParts.subtitle, discount].filter(Boolean)).join(" / ") || "常规";
  const status = "上线/测试";
  const eventType = page.kind === "预约" ? "预约" : "新游";
  const peopleTexts = collectXiaoqiPeopleTexts(row);
  const playerText = peopleTexts.find((value) => /在玩/.test(value)) || "";
  const reservationText = peopleTexts.find((value) => /预约/.test(value)) || "";
  const popularity = buildXiaoqiPopularity({
    kind: page.kind,
    playerCount: playerText,
    reservationCount: reservationText,
  });
  const scheduleText = formatXiaoqiScheduleText(eventAt, page.kind, game.showText || game.onlineTimeText);
  const benefitText = cleanText(game.instruction?.noticeMsg || "");
  const summary = mergeUnique([scheduleText, subtitle ? `${gameName}${subtitle}` : "", benefitText].filter(Boolean)).join("\n");

  return normalizeRecord({
    id: stableId("xiaoqi", gid),
    gid,
    sourceKey: "xiaoqi",
    source: "小七手游",
    gameName,
    subtitle,
    icon: gameName.slice(0, 1),
    iconUrl: normalizeImage(game.gameLogo, "https://www.x7sy.com"),
    platform: "手游",
    pool: "小七福利新游池",
    status,
    eventType,
    eventAt,
    playerCount: popularity.playerCount,
    reservationCount: popularity.reservationCount,
    popularityText: popularity.text,
    welfareKind: eventType,
    tags: mergeUnique([status, eventType, ...labels]),
    summary,
    updateContent: summary,
    vendor: "",
    originalUrl: page.url,
    detailUrl: `https://www.x7sy.com/game/app/${encodeURIComponent(gid)}`,
  });
}

async function enrichXiaoqiRecords(records, existingData = {}) {
  const missingTagRecords = [];
  for (const record of records.slice(0, 100)) {
    applyExistingMobileDetail(record, "xiaoqi", existingData);
    if (!needsMobileDetailFetch(record)) continue;
    if (!record.detailUrl) continue;
    try {
      const html = await fetchHtml(record.detailUrl);
      const detail = extractXiaoqiDetailFields(html);
      if (detail.gameName && shouldUseDetailTitle(record.gameName, detail.gameName)) applyRecordTitle(record, detail.gameName);
      if (detail.iconUrl) record.iconUrl = detail.iconUrl;
      if (detail.tags.length) record.tags = mergeUnique([record.status, record.eventType, ...record.tags, ...detail.tags]);
      if (detail.vendor) record.vendor = detail.vendor;
      if (detail.operator) record.operator = detail.operator;
      applyXiaoqiPopularity(record, detail.popularity);
      if (detail.summary) {
        record.detailSummary = detail.summary;
        record.summary = detail.summary;
        record.updateContent = record.summary;
      } else {
        const mergedContent = mergeSummaryAndUpdate(record.summary, record.updateContent, record.gameName, record.status, record.eventType, record.eventAt);
        record.summary = mergedContent.summary || record.summary;
        record.updateContent = mergedContent.updateContent || record.updateContent;
      }
      if (!hasUsefulGameplayTags(record.tags || [])) missingTagRecords.push(record);
    } catch {
      // Keep list-page data when detail-page enrichment fails.
    }
  }
  await enrichXiaoqiRenderedTags(missingTagRecords);
}

function hasUsefulGameplayTags(tags = []) {
  return mergeGameplayTags(tags).length > 0;
}

async function enrichXiaoqiRenderedTags(records) {
  const targets = records.filter((record) => record.detailUrl).slice(0, 30);
  if (!targets.length) return;
  let browser;
  try {
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    for (const record of targets) {
      try {
        await page.goto(record.detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(1800);
        const detail = await page.evaluate(() => {
          const clean = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
          const tags = [...document.querySelectorAll(".game_introduction_tag, .game_introduction_tag_list")]
            .map((el) => clean(el.textContent))
            .filter(Boolean);
          const button = document.querySelector(".game_btn .text_box") || document.querySelector(".game_btn");
          const buttonText = clean(button?.querySelector(".btn_text")?.textContent || button?.textContent || "");
          const countText = clean(button?.querySelector(".count_num")?.textContent || "");
          return { tags, buttonText, countText };
        });
        if (detail.tags.length) {
          const tags = detail.tags;
          record.renderedTags = tags;
          record.tags = mergeUnique([record.status, record.eventType, ...(record.tags || []), ...tags]);
        }
        applyXiaoqiPopularity(record, parseXiaoqiDetailPopularity(detail.buttonText, detail.countText));
      } catch {
        // Keep existing tags when rendered detail-page tag extraction fails.
      }
    }
  } catch {
    // Static detail fields are still usable without rendered tags.
  } finally {
    if (browser) await browser.close();
  }
}

function extractXiaoqiDetailFields(html = "") {
  const nuxt = extractXiaoqiDetailNuxt(html);
  const detailRoot = nuxt?.detail || nuxt || {};
  const extendRoot = nuxt?.extend || {};
  const details = detailRoot?.gameDetails || {};
  const dev = detailRoot?.gameDev || {};
  const announcement = extendRoot?.announcement || {};
  const introduction = extendRoot?.introduction || {};
  const bodyText = cleanText(html);
  const gameName = cleanText(details.gameName || details.showName || text(html, /<div class="tit">([\s\S]*?)<\/div>/i));
  const iconUrl = normalizeImage(details.gameLogo || attr(html, /<div class="k_x_l">\s*<img[^>]+src="([^"]+)"/i), "https://www.x7sy.com");
  const tags = [
    ...(details.labels || []).map((item) => item?.tagName),
    ...Array.from(html.matchAll(/<[^>]+class="[^"]*game_introduction_tag[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi)).map((match) => cleanText(match[1])),
    ...Array.from(html.matchAll(/<[^>]+class="[^"]*game_introduction_tag_list[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi)).map((match) => cleanText(match[1])),
    ...Array.from(html.matchAll(/<span class="d4">([\s\S]*?)<\/span>/gi)).map((match) => cleanText(match[1])),
  ].filter(Boolean);
  const rawDeveloper = cleanVendor(dev.developer || text(html, /开发者：([\s\S]*?)<\/span>/i) || text(html, /开发者：([\s\S]*?)(?:版本号|应用名称|<\/)/i));
  const rawOperator = cleanVendor(dev.operateCorporation || text(html, /运营单位：([\s\S]*?)<\/span>/i) || text(html, /运营单位：([\s\S]*?)(?:版本号|应用名称|<\/)/i));
  const developer = /尚米网络|小7手游|小七手游/.test(rawDeveloper) ? "" : rawDeveloper;
  const operator = /尚米网络|小7手游|小七手游/.test(rawOperator) ? "" : rawOperator;
  const vendor = formatXiaoqiVendor(developer, operator);
  const introductionText = cleanXiaoqiAnnouncement(
    introduction.description || text(html, /<div[^>]+class="[^"]*introduction_content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i),
  );
  const intro = cleanText(details.oneGameInfo || text(html, /<div class="yxjj">[\s\S]*?<div class="detail"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i))
    .replace(/下载小7查看更多>>?/g, "")
    .trim();
  const giftState = /暂时没有礼包数据/.test(bodyText) ? "" : cleanText(text(html, /<div class="kuang" id="lb_con">([\s\S]*?)<\/div>\s*<div class="kuang" id="dp_con"/i));
  const popularity = extractXiaoqiDetailPopularity(html, details);
  return {
    gameName,
    iconUrl,
    vendor,
    operator,
    tags,
    summary: introductionText || cleanContentText(intro || giftState),
    popularity,
  };
}

function extractXiaoqiDetailNuxt(html = "") {
  const payload = text(html, /<script type="application\/json"[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!payload) return null;
  try {
    const root = reviveNuxtPayload(JSON.parse(payload));
    return findXiaoqiDetailPayload(root);
  } catch {
    return null;
  }
}

function findXiaoqiDetailPayload(node, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return null;
  seen.add(node);
  if (node.detail?.gameDetails || node.extend?.introduction) return node;
  if (node.gameDetails || node.gameDev || node.announcement) return node;
  const values = Array.isArray(node) ? node : Object.values(node);
  for (const value of values) {
    const found = findXiaoqiDetailPayload(value, seen);
    if (found) return found;
  }
  return null;
}

function cleanXiaoqiAnnouncement(value = "") {
  const textValue = decodeEntities(String(value))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\n/g, "\n")
    .replace(/\s*(?=\d+[、．])/g, "\n");
  const ordered = formatNumberedWelfareText(textValue);
  if (ordered) return ordered;
  return textValue.split(/\n+/)
    .map((line) => cleanContentText(line))
    .filter(Boolean)
    .slice(0, 6)
    .join("\n");
}

function formatNumberedWelfareText(value = "") {
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => cleanXiaoqiBenefitLine(line))
    .filter(Boolean);
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/^(\d+)[、．]\s*(.+)$/);
    if (match) {
      current = { index: Number(match[1]), lines: [match[2].trim()] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (!blocks.length) return "";
  const first = blocks.sort((left, right) => left.index - right.index)[0];
  return cleanWelfarePrimaryBenefit(first?.lines?.[0] || "");
}

function cleanWelfarePrimaryBenefit(value = "") {
  return cleanXiaoqiBenefitLine(value)
    .replace(/[（(][^（）()]*[）)]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanXiaoqiBenefitLine(value = "") {
  return cleanText(stripHtmlNoise(value))
    .replace(/\u7f16\u8f91\u63a8\u8350/g, "")
    .replace(/\u529b\u8350\u4f73\u4f5c/g, "")
    .replace(/\u5fc5\u73a9\u795e\u4f5c/g, "")
    .replace(/[|?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatXiaoqiVendor(developer = "", operator = "") {
  const parts = [];
  if (developer) parts.push(`开发者：${developer}`);
  if (operator && operator !== developer) parts.push(`运营单位：${operator}`);
  return parts.join(" / ");
}

function resolveHykbDay(value, today) {
  const md = cleanText(value).match(/(\d{1,2})月(\d{1,2})日/);
  return md ? `${today.slice(0, 4)}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}` : "";
}

function parseHykbBlock(block, date) {
  const detailUrl = normalizeUrl(attr(block, /<a[^>]+href="([^"]+)"[^>]*>/i), "https://www.3839.com");
  const name = cleanHykbTitle(text(block, /<div class="name">[\s\S]*?<em>([\s\S]*?)<\/em>/i) || attr(block, /<img[^>]+alt="([^"]+)"/i));
  if (!detailUrl || !name) return null;
  if (/好游快爆/.test(name)) return null;

  const rawText = cleanText(block);
  if (/PC\/主机|PC游戏|Steam自购|云玩/.test(rawText)) return null;

  const iconUrl = normalizeImage(
    attr(block, /<img[^>]+(?:src|data-src|data-original|lz_src)="([^"]+)"/i),
    "https://www.3839.com",
  );
  const listStatus = cleanText(text(block, /<span class="g-type[^"]*">([\s\S]*?)<\/span>/i));
  const buttonStatus = cleanText(text(block, /<a class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/i));
  const infoText = cleanHykbListInfo(text(block, /<div class="info">([\s\S]*?)<\/div>/i));
  const tagTexts = [...block.matchAll(/<p class="tags">([\s\S]*?)<\/p>/gi)]
    .flatMap((match) => [...match[1].matchAll(/<span class="it">([\s\S]*?)<\/span>/gi)].map((tag) => cleanText(tag[1])));
  const statusSeed = [listStatus, infoText].filter(Boolean).join(" ") || [buttonStatus, rawText].filter(Boolean).join(" ");
  const status = normalizeHykbStatus(statusSeed);
  const eventType = normalizeHykbEventType(infoText || rawText, status);
  const time = (infoText || rawText).match(/(\d{1,2}:\d{2})/)?.[1] || "10:00";
  const resolvedEventDate = resolveHykbRecordDate(date, infoText || rawText);
  const summary = cleanHykbListSummary(infoText || status, status);
  const updateContent = cleanHykbListUpdate(infoText, status, summary);

  return normalizeRecord({
    id: stableId("hykb", detailUrl),
    sourceKey: "hykb",
    source: "好游快爆",
    gameName: name,
    icon: name.slice(0, 1),
    iconUrl,
    platform: "手游",
    pool: "公共手游池",
    status,
    eventType,
    eventAt: `${resolvedEventDate}T${time}:00+08:00`,
    tags: mergeUnique([status, eventType, ...tagTexts]),
    summary,
    updateContent,
    originalUrl: mobileSources.hykb.url,
    detailUrl,
  });
}

function resolveHykbRecordDate(cardDate = "", textValue = "") {
  const sourceText = cleanText(textValue);
  const match = sourceText.match(/(\d{1,2})月(\d{1,2})日(?:更新|活动|联动|开启)/);
  if (!match) return cardDate;
  const year = String(cardDate || "").slice(0, 4) || String(new Date().getFullYear());
  return `${year}-${String(Number(match[1])).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

async function enrichHykbRecords(records, existingData = {}) {
  for (const record of records.slice(0, 80)) {
    applyExistingMobileDetail(record, "hykb", existingData);
    const shouldRefreshDetail = shouldRefreshHykbDetail(record);
    if (!shouldRefreshDetail && !needsMobileDetailFetch(record)) continue;
    if (!record?.detailUrl) continue;
    try {
      const html = await fetchHtml(record.detailUrl);
      const detail = extractHykbDetailFields(html, record.eventAt);
      if (detail.gameName && shouldUseDetailTitle(record.gameName, detail.gameName)) applyRecordTitle(record, detail.gameName);
      if (!record.iconUrl && detail.iconUrl) record.iconUrl = detail.iconUrl;
      if (detail.vendor) record.vendor = detail.vendor;
      const gameplayTags = mergeGameplayTags([...(record.tags || []), ...(detail.tags || [])].filter((tag) => tag !== record.gameName && tag !== detail.gameName));
      record.tags = mergeUnique([record.status, record.eventType, ...gameplayTags]);
      if (detail.updateContent && (shouldRefreshDetail || contentScore(detail.updateContent) >= contentScore(record.updateContent))) {
        record.summary = detail.updateContent;
        record.updateContent = detail.updateContent;
      } else if (detail.summary && (shouldRefreshDetail || contentScore(detail.summary) >= contentScore(record.summary))) {
        record.summary = detail.summary;
      }
      const mergedContent = mergeSummaryAndUpdate(record.summary, record.updateContent, record.gameName, record.status, record.eventType, record.eventAt);
      record.summary = mergedContent.summary;
      record.updateContent = mergedContent.updateContent;
    } catch {
      // Keep list-page data when detail-page enrichment fails.
    }
  }
}

function isNineGameCloudAd(record = {}) {
  const title = cleanText(record.gameName);
  const url = cleanText(record.detailUrl || record.originalUrl || "");
  if (/(\u4e91\u6e38\u620f|\u5728\u7ebf\u73a9|\u7f51\u9875\u7248|\u79d2\u73a9)/.test(title)) return true;
  return /cloud|webgame|h5|miao|yun/i.test(url) && /(\u4e91\u6e38\u620f|\u5728\u7ebf\u73a9|\u7f51\u9875\u7248|\u79d2\u73a9)/.test(title);
}

function parseNineGameBlock(block, date, fallbackStatus) {
  const name = cleanNineGameTitle(attr(block, /class="name"[^>]*title="([^"]+)"/) || text(block, /class="name"[^>]*>([\s\S]*?)<\/a>/));
  const detailUrl = normalizeUrl(attr(block, /<a[^>]+href="([^"]+)"[^>]+class="name"/) || attr(block, /class="name"[^>]+href="([^"]+)"/), "https://www.9game.cn");
  if (!name || !detailUrl || detailUrl.includes("javascript:")) return null;

  const iconUrl = normalizeImage(attr(block, /xLazyImg="([^"]+)"/) || attr(block, /<img[^>]+src="([^"]+)"/), "https://www.9game.cn");
  const status = cleanText(text(block, /状态：\s*<span class="na">([\s\S]*?)<\/span>/)) || cleanText(text(block, /<span class="time">([\s\S]*?)<\/span>/)) || fallbackStatus;
  const category = cleanText(text(block, /类型：\s*(?:<td class="na">)?([\s\S]*?)(?:<\/td>|<\/span>)/));
  const normalizedStatus = normalizeNineGameStatus(status);
  const updateContent = cleanNineGameListUpdate(status, category, normalizedStatus);
  const time = extractNineGameTime(updateContent || status) || "10:00";

  return normalizeRecord({
    id: stableId("ninegame", detailUrl),
    sourceKey: "ninegame",
    source: "九游",
    gameName: name,
    icon: name.slice(0, 1),
    iconUrl,
    platform: "手游",
    pool: "公共手游池",
    status: normalizedStatus,
    eventType: normalizeNineGameEventType(status, normalizedStatus),
    eventAt: `${date}T${time}:00+08:00`,
    tags: [category, normalizedStatus].filter(Boolean),
    summary: updateContent || normalizedStatus,
    updateContent,
    originalUrl: mobileSources.ninegame.url,
    detailUrl,
  });
}

async function enrichNineGameRecords(records, existingData = {}) {
  for (const record of records) {
    applyExistingMobileDetail(record, "ninegame", existingData);
    if (!needsMobileDetailFetch(record)) continue;
    if (!record?.detailUrl) continue;
    try {
      const html = await fetchHtml(record.detailUrl, "utf8");
      const detail = extractNineGameDetailFields(html);
      if (detail.gameName && shouldUseDetailTitle(record.gameName, detail.gameName)) applyRecordTitle(record, detail.gameName);
      if (!record.iconUrl && detail.iconUrl) record.iconUrl = detail.iconUrl;
      if (detail.vendor) record.vendor = detail.vendor;
      const gameplayTags = mergeGameplayTags([...(record.tags || []), ...(detail.tags || [])].filter((tag) => tag !== record.gameName && tag !== detail.gameName));
      record.tags = mergeUnique([record.status, record.eventType, ...gameplayTags]);
      const preferredUpdate = chooseNineGamePreferredUpdate(detail.updateContent, record.updateContent);
      const preferredSummary = preferredUpdate || chooseNineGamePreferredUpdate(detail.summary, record.summary);
      const mergedContent = mergeSummaryAndUpdate(preferredSummary, preferredUpdate, record.gameName, record.status, record.eventType, record.eventAt);
      const fallbackContent = preferredUpdate || record.updateContent || record.summary;
      record.summary = mergedContent.summary || fallbackContent;
      record.updateContent = mergedContent.updateContent || fallbackContent;
    } catch {
      // Keep list-page data when detail-page enrichment fails.
    }
  }
}

function shouldUseDetailTitle(currentName = "", detailName = "") {
  const current = cleanText(currentName);
  const detail = cleanText(detailName);
  if (!detail) return false;
  if (!current) return true;
  if (detail === current) return true;
  if (current.length <= 4 && detail.length > current.length) return true;
  if (detail.includes(current) && detail.length <= current.length + 12) return true;
  if (/(阿比斯|代号|测试服|体验服)$/.test(current) && detail.length > current.length) return true;
  return false;
}

function parseNineGameTodayBlock(block, date) {
  const visibleName = text(block, /<a[^>]+class="name"[^>]*>([\s\S]*?)<\/a>/);
  const titleName = attr(block, /class="name"[^>]*title="([^"]+)"/);
  const name = cleanNineGameTitle(visibleName || titleName);
  const detailUrl = normalizeUrl(
    attr(block, /<a[^>]+href="([^"]+)"[^>]+class="name"/) ||
    attr(block, /<div[^>]+class="pic"[^>]+href="([^"]+)"/),
    "https://www.9game.cn",
  );
  if (!name || !detailUrl || detailUrl.includes("javascript:")) return null;

  const iconUrl = normalizeImage(
    attr(block, /<img[^>]+(?:src|data-src|xLazyImg)="([^"]+)"/),
    "https://www.9game.cn",
  );
  const status = cleanText(text(block, /状态：\s*<span class="na">([\s\S]*?)<\/span>/)) || "今日开测";
  const category = cleanText(text(block, /类型：\s*([\s\S]*?)<\/span>/));
  const normalizedStatus = normalizeNineGameStatus(status);
  const updateContent = cleanNineGameListUpdate(status, category, normalizedStatus, date);
  const time = extractNineGameTime([status, category, updateContent].filter(Boolean).join(" ")) || "10:00";

  return normalizeRecord({
    id: stableId("ninegame", detailUrl),
    sourceKey: "ninegame",
    source: "九游",
    gameName: name,
    icon: name.slice(0, 1),
    iconUrl,
    platform: "手游",
    pool: "公共手游池",
    status: normalizedStatus,
    eventType: normalizeNineGameEventType(status, normalizedStatus),
    eventAt: `${date}T${time}:00+08:00`,
    tags: [category, normalizedStatus].filter(Boolean),
    summary: updateContent || normalizedStatus,
    updateContent,
    originalUrl: mobileSources.ninegame.url,
    detailUrl,
  });
}

function parseNineGameScheduleRow(row, date) {
  const visibleName = text(row, /<a[^>]+class="name"[^>]*>([\s\S]*?)<\/a>/);
  const titleName = attr(row, /class="name"[^>]*title="([^"]+)"/);
  const name = cleanNineGameTitle(visibleName || titleName);
  const detailUrl = normalizeUrl(
    attr(row, /<a[^>]+class="name"[^>]+href="([^"]+)"/) ||
    attr(row, /<a[^>]+href="([^"]+)"[^>]+class="name"/) ||
    attr(row, /<a[^>]+class="img"[^>]+href="([^"]+)"/) ||
    attr(row, /<a[^>]+href="([^"]+)"[^>]+class="img"/),
    "https://www.9game.cn",
  );
  if (!name || !detailUrl || detailUrl.includes("javascript:")) return null;

  const iconUrl = normalizeImage(
    attr(row, /<img[^>]+(?:src|data-src|xLazyImg)="([^"]+)"/),
    "https://www.9game.cn",
  );
  const status = cleanText(text(row, /<td class="stattr">([\s\S]*?)<\/td>/)) ||
    cleanText(text(row, /<span class="time">([\s\S]*?)<\/span>/)) ||
    "即将开测";
  const category = cleanText(text(row, /<td class="typetr">([\s\S]*?)<\/td>/));
  const normalizedStatus = normalizeNineGameStatus(status);
  const updateContent = cleanNineGameListUpdate(status, category, normalizedStatus, date);
  const time = extractNineGameTime(updateContent || status) || "10:00";

  return normalizeRecord({
    id: stableId("ninegame", detailUrl),
    sourceKey: "ninegame",
    source: "九游",
    gameName: name,
    icon: name.slice(0, 1),
    iconUrl,
    platform: "手游",
    pool: "公共手游池",
    status: normalizedStatus,
    eventType: normalizeNineGameEventType(status, normalizedStatus),
    eventAt: `${date}T${time}:00+08:00`,
    tags: [category, normalizedStatus].filter(Boolean),
    summary: updateContent || normalizedStatus,
    updateContent,
    originalUrl: mobileSources.ninegame.url,
    detailUrl,
  });
}

function shouldUseNineGameDetailUpdate(record = {}, updateContent = "") {
  const textValue = cleanText(updateContent);
  if (!textValue) return false;
  const eventDate = record.eventAt?.slice(0, 10) || "";
  const md = eventDate.match(/^20\d{2}-(\d{2})-(\d{2})$/);
  if (!md) return true;
  const monthDay = `${Number(md[1])}月${Number(md[2])}日`;
  const slashDay = `${md[1]}-${md[2]}`;
  const compactSlashDay = `${Number(md[1])}-${Number(md[2])}`;
  const hasExplicitDate = /(\d{1,2}月\d{1,2}日|\d{1,2}-\d{1,2})/.test(textValue);
  if (!hasExplicitDate) return true;
  return textValue.includes(monthDay) || textValue.includes(slashDay) || textValue.includes(compactSlashDay);
}

function extractNineGameDetailTitle(html = "") {
  return cleanNineGameTitle(
    extractNineGameCloudTitle(html) ||
    text(html, /<h1 class="ngame-title"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h1>/) ||
    text(html, /<input type="hidden" id="_gamename" value="([^"]+)"/) ||
    text(html, /<title>([\s\S]*?)_(?:预约下载|攻略|礼包|九游)/),
  );
}

function extractNineGameDetailFields(html = "") {
  const bodyText = cleanText(html);
  const metaDescription = extractMeta(html, ["description", "og:description"]);
  const title = extractNineGameDetailTitle(html);
  const scheduleText = extractNineGameScheduleText(html);
  const iconUrl = normalizeImage(
    extractNineGameCloudIcon(html) ||
    attr(html, /<input[^>]+id=["']_gameIcon["'][^>]+value=["']([^"']+)["']/i) ||
    extractMeta(html, ["og:image"]) ||
    attr(html, /<img[^>]+(?:class=["'][^"']*(?:icon|game-icon)[^"']*["'][^>]+)?(?:src|data-src|xLazyImg)=["']([^"']+)["']/i),
    "https://www.9game.cn",
  );
  const tags = extractNineGameDetailTags(html, bodyText);
  const htmlVendor = extractNineGameHtmlVendor(html);
  const priorityUpdate = extractNineGamePriorityUpdate(html, bodyText, title, scheduleText);
  return {
    gameName: title,
    iconUrl,
    vendor: cleanNineGameVendor(choosePreferredVendor(htmlVendor, extractNineGameVendor(bodyText))),
    tags,
    summary: cleanContentText(extractIntroText(bodyText) || metaDescription),
    updateContent: cleanContentText(priorityUpdate || extractUpdateText(bodyText) || scheduleText || metaDescription || extractIntroText(bodyText)),
  };
}

function extractHykbDetailFields(html = "", eventAt = "") {
  const bodyText = cleanText(html);
  const metaDescription = extractMeta(html, ["description", "og:description"]);
  const title = cleanText(
    text(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    extractMeta(html, ["og:title"]) ||
    text(html, /<title>([\s\S]*?)(?:\u4e0b\u8f7d|\u9884\u7ea6|\u653b\u7565|\u597d\u6e38\u5feb\u7206)/i),
  );
  const iconUrl = normalizeImage(
    extractMeta(html, ["og:image"]) ||
    attr(html, /<img[^>]+(?:class=["'][^"']*(?:icon|game-icon|app-icon)[^"']*["'][^>]+)?(?:src|data-src|data-original|lz_src)=["']([^"']+)["']/i),
    "https://www.3839.com",
  );
  const cleanTitle = cleanHykbTitle(title);
  const tags = extractHykbDetailTags(html, bodyText).filter((tag) => tag !== cleanTitle);
  const htmlVendor = extractHykbHtmlVendor(html);
  return {
    gameName: cleanTitle,
    iconUrl,
    vendor: choosePreferredVendor(htmlVendor, extractHykbVendor(bodyText)),
    tags,
    summary: cleanContentText(metaDescription || extractIntroText(bodyText)),
    updateContent: cleanContentText(extractHykbPriorityUpdate(html, bodyText, cleanTitle, eventAt) || extractUpdateText(bodyText) || metaDescription || extractIntroText(bodyText)),
  };
}

function parseHykbText(value, today, explicitName = "", explicitTags = []) {
  const textValue = cleanText(value);
  const title = cleanHykbTitle(explicitName || textValue);
  const date = extractDate(textValue, today) || today;
  const time = textValue.match(/(\d{1,2}:\d{2})/)?.[1] || "10:00";
  const gameTags = extractGameplayTags(textValue, explicitTags);
  const status = normalizeHykbStatus(textValue);
  const eventType = normalizeHykbEventType(textValue, status);
  const summary = cleanHykbSummary(textValue, title);
  const updateContent = prioritizeUpdateContent(textValue, title, summary);

  return {
    name: title,
    date,
    time,
    status,
    eventType,
    tags: mergeUnique([status, eventType, ...gameTags]),
    summary,
    updateContent,
  };
}

function cleanTapTapField(value = "", gameName = "", eventAt = "") {
  let textValue = cleanContentText(stripHtmlNoise(value));
  if (!textValue) return "";

  const title = cleanText(gameName);
  if (title.length >= 2) textValue = textValue.split(title).join(" ");

  textValue = textValue
    .replace(/官方入驻/g, " ")
    .replace(/共\s*\d+\s*条评价/g, " ")
    .replace(/(?:上线日期|更新时间|评分)\s*[:：]?/g, " ")
    .replace(/\b0\b/g, " ")
    .replace(/(^|\s)(?:活动|联动|版本更新|最新动态|动态)(?=\s|$)/g, "$1")
    .replace(/(^|\s)(?:策略|Roguelike|RogueLike|卡牌|动作|冒险|休闲|二次元|角色扮演)(?=\s|$)/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return splitContentPieces(textValue)
    .map((part) => cleanMergedContentText(part, "", eventAt))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMobilePool(records) {
  const byKey = new Map();

  for (const record of dedupeRecords(records)) {
    const key = gameIdentity(record.gameName) || `${record.sourceKey}:${record.detailUrl || record.gameName}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, seedPoolItem(record));
      continue;
    }
    byKey.set(key, mergePoolItem(current, record));
  }

  return [...byKey.values()]
    .map((item) => cleanPoolItem(item))
    .sort((left, right) => new Date(left.eventAt) - new Date(right.eventAt));
}

function buildWelfarePool(records) {
  return buildMobilePool(records).map((item) => ({
    ...item,
    id: stableId("welfare", gameIdentity(item.gameName) || item.detailUrl || item.gameName),
    platform: "手游",
    pool: "小七福利新游池",
    status: "上线/测试",
    eventType: "上线/测试",
    playerCount: Number(item.playerCount) || 0,
    reservationCount: Number(item.reservationCount) || 0,
    downloadCount: Number(item.downloadCount) || 0,
    popularityText: item.popularityText || formatWelfarePopularity(item),
    welfareKind: item.welfareKind || inferWelfareKind(item),
    tags: mergeUnique(["上线/测试", ...(item.gameplayTags || []), ...(item.tags || [])]).filter((tag) => !["更新", "活动/联动"].includes(tag)).slice(0, 12),
    sourceRecords: (item.sourceRecords || []).map((record) => ({
      ...record,
      status: "上线/测试",
      eventType: "上线/测试",
      playerCount: Number(record.playerCount) || 0,
      reservationCount: Number(record.reservationCount) || 0,
      downloadCount: Number(record.downloadCount) || 0,
      popularityText: record.popularityText || formatWelfarePopularity(record),
      welfareKind: record.welfareKind || inferWelfareKind(record),
      tags: mergeUnique(["上线/测试", ...(record.tags || [])]).filter((tag) => !["更新", "活动/联动"].includes(tag)),
    })),
  }));
}

function seedPoolItem(record) {
  return {
    id: stableId("mobile", gameIdentity(record.gameName) || record.detailUrl || record.gameName),
    gid: record.gid || "",
    gameName: record.gameName,
    subtitle: record.subtitle || "",
    icon: record.icon,
    iconUrl: record.iconUrl,
    platform: "手游",
    pool: "公共手游池",
    status: record.status,
    eventType: record.eventType,
    eventAt: record.eventAt,
    sources: [record.source],
    tags: mergeUnique(record.tags),
    summary: record.summary,
    updateContent: record.updateContent,
    vendor: record.sourceKey === "ninegame" ? cleanNineGameVendor(record.vendor || "") : cleanVendor(record.vendor || ""),
    operator: record.operator || "",
    originalUrl: record.originalUrl,
    detailUrl: record.detailUrl,
    playerCount: Number(record.playerCount) || 0,
    reservationCount: Number(record.reservationCount) || 0,
    downloadCount: Number(record.downloadCount) || 0,
    popularityText: record.popularityText || "",
    welfareKind: record.welfareKind || "",
    sourceRecords: [toSourceRecord(record)],
    mergedCount: 1,
    primarySource: record.source,
  };
}

function mergePoolItem(current, record) {
  const primary = chooseBetterRecord(current, record);
  const allSourceRecords = dedupeSourceRecords([...current.sourceRecords, toSourceRecord(record)]);
  const combinedTags = mergeUnique([...(current.tags || []), ...(record.tags || [])]).filter(Boolean);
  const gameplayTags = mergeGameplayTags(combinedTags);
  const status = chooseStatus(current.status, record.status, current.updateContent, record.updateContent, current.primarySource, record.source);
  const eventType = chooseEventType(current.eventType, record.eventType);
  const summary = pickBestSourceText([
    { value: current.summary, source: current.primarySource },
    { value: record.summary, source: record.source },
    { value: current.updateContent, source: current.primarySource },
    { value: record.updateContent, source: record.source },
    ...allSourceRecords.flatMap((item) => [
      { value: item.summary, source: item.source },
      { value: item.updateContent, source: item.source },
    ]),
  ]);
  const updateContent = pickBestSourceUpdateContent([
    { value: current.updateContent, source: current.primarySource },
    { value: record.updateContent, source: record.source },
    { value: current.summary, source: current.primarySource },
    { value: record.summary, source: record.source },
    ...allSourceRecords.flatMap((item) => [
      { value: item.updateContent, source: item.source },
      { value: item.summary, source: item.source },
    ]),
  ]);
  const primaryFromContent = chooseContentPrimaryRecord(allSourceRecords, primary.source);

  return {
    ...current,
    gid: current.gid || record.gid || "",
    gameName: primaryFromContent.gameName || primary.gameName || current.gameName,
    subtitle: primaryFromContent.subtitle || primary.subtitle || current.subtitle || "",
    icon: primaryFromContent.icon || primary.icon || current.icon,
    iconUrl: primaryFromContent.iconUrl || primary.iconUrl || current.iconUrl,
    status,
    eventType,
    eventAt: earliestEventAt(current.eventAt, record.eventAt),
    playerCount: pickLargestNumber(current.playerCount, record.playerCount),
    reservationCount: pickLargestNumber(current.reservationCount, record.reservationCount),
    downloadCount: pickLargestNumber(current.downloadCount, record.downloadCount),
    popularityText: record.popularityText || current.popularityText || "",
    welfareKind: record.welfareKind || current.welfareKind || "",
    sources: mergeUnique([...(current.sources || []), record.source]),
    tags: mergeUnique([status, eventType, ...gameplayTags]).slice(0, 12),
    summary,
    updateContent,
    vendor: choosePreferredVendor(primaryFromContent.vendor, primary.vendor, current.vendor, record.vendor),
    operator: primaryFromContent.operator || primary.operator || current.operator || record.operator || "",
    originalUrl: primaryFromContent.originalUrl || primary.originalUrl || current.originalUrl,
    detailUrl: primaryFromContent.detailUrl || primary.detailUrl || current.detailUrl,
    sourceRecords: allSourceRecords,
    mergedCount: allSourceRecords.length,
    primarySource: primaryFromContent.source || primary.source,
  };
}

function chooseContentPrimaryRecord(records = [], fallbackSource = "") {
  const contentRich = records
    .filter((record) => cleanContentText(record.summary || record.updateContent || ""))
    .sort((left, right) => sourceContentScore(right) - sourceContentScore(left));
  return contentRich[0] || records.find((record) => record.source === fallbackSource) || {};
}

function chooseBetterRecord(current, record) {
  const currentRecord = {
    source: current.primarySource || current.sources?.[0] || "",
    iconUrl: current.iconUrl,
    detailUrl: current.detailUrl,
    summary: current.summary,
    updateContent: current.updateContent,
    eventAt: current.eventAt,
    gameName: current.gameName,
    subtitle: current.subtitle || "",
    originalUrl: current.originalUrl,
    icon: current.icon,
    vendor: cleanVendor(current.vendor || ""),
    operator: current.operator || "",
  };
  return recordScore(record) > recordScore(currentRecord) ? record : currentRecord;
}

function recordScore(record) {
  const sourceWeights = { TapTap: 34, 好游快爆: 28, 九游: 22, 小七手游: 20 };
  return (
    (sourceWeights[record.source] || 10) +
    (record.detailUrl ? 16 : 0) +
    (record.iconUrl ? 10 : 0) +
    Math.min(cleanText(record.summary).length, 120) / 8 +
    Math.min(cleanText(record.updateContent).length, 160) / 10 +
    mergeGameplayTags(record.tags || []).length * 3
  );
}

function dedupeRecords(records) {
  const seen = new Map();
  for (const record of records) {
    const key = `${record.source}:${record.detailUrl || record.gameName}:${record.eventAt}`;
    if (!seen.has(key)) seen.set(key, record);
  }
  return [...seen.values()];
}

function findPoolIssues(items) {
  return items.flatMap((item) => {
    const issues = [];
    if (!item.detailUrl) {
      const context = issueSourceContext(item, (record) => !record.detailUrl);
      issues.push({ ...context, type: "缺详情页", title: item.gameName, detail: "聚合后缺少来源站详情页，原文按钮不可用。" });
    }
    if (!item.iconUrl) {
      const context = issueSourceContext(item, (record) => !record.iconUrl);
      issues.push({ ...context, type: "缺图标", title: item.gameName, detail: "当前游戏缺少可展示的图标链接。" });
    }
    if (!((item.gameplayTags || []).length || mergeGameplayTags(item.tags || []).length)) {
      const context = issueSourceContext(item, (record) => !(record.tags || record.gameplayTags || []).length);
      issues.push({ ...context, type: "缺玩法标签", title: item.gameName, detail: "多来源合并后仍未提取到稳定玩法标签。" });
    }
    for (const record of item.sourceRecords || []) {
      const dateIssue = findActivityDateMismatch(item, record);
      if (dateIssue) issues.push(dateIssue);
    }
    return issues;
  });
}

function issueSourceContext(item = {}, predicate = () => false) {
  const records = Array.isArray(item.sourceRecords) ? item.sourceRecords : [];
  const record = records.find(predicate) || records[0] || item;
  const sourceKey = sourceKeyForMobileRecord(record);
  const source = record.source || item.primarySource || item.sources?.[0] || "未知";
  const targetId = record.platformIds?.[sourceKey] || record.platformId || record.sourceId || record.gid || record.detailUrl || item.platformIds?.[sourceKey] || item.id || "";
  return {
    source,
    sourceKey,
    targetId: String(targetId || ""),
    detailUrl: record.detailUrl || item.detailUrl || "",
  };
}

function findActivityDateMismatch(item = {}, record = {}) {
  const content = cleanContentText([
    record.updateContent,
    record.summary,
    record.detailSummary,
  ].filter(Boolean).join("\n"));
  if (!content || !isActivityDateCheckCandidate(record, content)) return null;

  const recordDate = String(record.eventAt || item.eventAt || "").match(/^(20\d{2}-\d{2}-\d{2})/)?.[1] || "";
  if (!recordDate) return null;
  const contentDates = extractExplicitContentDates(content, recordDate);
  if (!contentDates.length || contentDates.includes(recordDate)) return null;

  const source = record.source || item.primarySource || item.sources?.[0] || "未知";
  const targetId = record.gid || record.sourceId || record.detailUrl || item.id || "";
  return {
    source,
    sourceKey: sourceKeyForMobileRecord(record),
    type: "活动日期不一致",
    title: item.gameName || record.gameName,
    targetId,
    detailUrl: record.detailUrl || item.detailUrl || "",
    recordEventAt: recordDate,
    contentDate: contentDates[0],
    contentDates,
    detail: `记录时间为 ${recordDate}，但内容标注为 ${contentDates.join("、")}。请重新抓取详情页确认。`,
  };
}

function isActivityDateCheckCandidate(record = {}, content = "") {
  const typeText = [record.status, record.eventType, ...(record.tags || [])].filter(Boolean).join(" ");
  if (/预约|新游/.test(typeText) && !/活动|联动|更新|版本|赛季/.test(content)) return false;
  return /活动|联动|更新|版本|赛季|开启|上线|返场|福利|签到|兑换|开服|公测/.test(`${typeText} ${content}`);
}

function extractExplicitContentDates(value = "", fallbackDate = "") {
  const year = String(fallbackDate).slice(0, 4) || String(new Date().getFullYear());
  const dates = [];
  const pattern = /(20\d{2})[年.\/-](\d{1,2})[月.\/-](\d{1,2})日?|(?<!\d)(\d{1,2})月(\d{1,2})日|(?<!\d)(\d{1,2})[\/-](\d{1,2})(?!\d)/g;
  for (const match of String(value).matchAll(pattern)) {
    const month = Number(match[2] || match[4] || match[6]);
    const day = Number(match[3] || match[5] || match[7]);
    const dateYear = match[1] || year;
    if (!month || !day || month > 12 || day > 31) continue;
    const normalized = `${dateYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!dates.includes(normalized)) dates.push(normalized);
  }
  return dates;
}

function buildIssues(issues) {
  return issues.map((issue, index) => ({
    ...issue,
    id: `issue-${index + 1}`,
    source: issue.source || "未知",
    severity: /缺详情页|缺图标|活动日期不一致/.test(issue.type) ? "高" : "中",
    type: issue.type || "抓取问题",
    title: issue.title || issue.source || "来源问题",
    detail: issue.detail || "待检查。",
  }));
}

function buildSourceGroups(selected, data, rawIssues, diagnostics = {}) {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const selectedSet = new Set(selected);

  const sourceRecordCount = (source) => (data.rawMobileRecords || []).filter((item) => item.source === source).length;
  const welfareSourceRecordCount = (source) => (data.rawWelfareRecords || []).filter((item) => item.source === source).length;
  const poolCount = (source) => (data.mobileGames || []).filter((item) => item.sources?.includes(source)).length;

  return [
    {
      key: "taptap",
      name: "TapTap 今日游戏",
      sources: ["TapTap"],
      enabled: selectedSet.has("taptap"),
      lastRun: selectedSet.has("taptap") ? now : "未运行",
      status: sourceRecordCount("TapTap") ? "已抓取" : "待抓取",
      count: poolCount("TapTap"),
      rawCount: sourceRecordCount("TapTap"),
      diagnostics: diagnostics.taptap || null,
    },
    {
      key: "ninegame",
      name: "九游开测",
      sources: ["九游"],
      enabled: selectedSet.has("ninegame"),
      lastRun: selectedSet.has("ninegame") ? now : "未运行",
      status: sourceRecordCount("九游") ? "已抓取" : "待抓取",
      count: poolCount("九游"),
      rawCount: sourceRecordCount("九游"),
      diagnostics: diagnostics.ninegame || null,
    },
    {
      key: "hykb",
      name: "好游快爆",
      sources: ["好游快爆"],
      enabled: selectedSet.has("hykb"),
      lastRun: selectedSet.has("hykb") ? now : "未运行",
      status: sourceRecordCount("好游快爆") ? "已抓取" : rawIssues.some((issue) => issue.source === "好游快爆") ? "需检查" : "待抓取",
      count: poolCount("好游快爆"),
      rawCount: sourceRecordCount("好游快爆"),
      diagnostics: diagnostics.hykb || null,
    },
    {
      key: "xiaoqi",
      name: "福利游戏",
      sources: ["小七手游"],
      enabled: selectedSet.has("xiaoqi"),
      lastRun: selectedSet.has("xiaoqi") ? now : "待接入",
      status: welfareSourceRecordCount("小七手游") ? "已抓取" : "新游/预约/首发/福利",
      count: data.welfareGames.length,
      rawCount: welfareSourceRecordCount("小七手游"),
      diagnostics: diagnostics.xiaoqi || null,
    },
    {
      key: "pc",
      name: "PC/Steam",
      sources: ["Steam", "综合资讯"],
      enabled: false,
      lastRun: "待接入",
      status: "规划中",
      count: data.pcGames.length,
      rawCount: data.rawPcRecords?.length || 0,
    },
  ];
}

function buildUpdateLogs(data, selected) {
  const merged = data.mobileGames.filter((item) => item.mergedCount > 1).length;
  const future = data.mobileGames.filter((item) => compareDate(item.eventAt.slice(0, 10), data.date) > 0).length;
  return [
    { id: "log-crawl", time: data.generatedAt, type: "抓取", title: "手游来源抓取完成", detail: `已运行 ${selected.join(" / ")}，原始记录 ${data.rawMobileRecords.length} 条，入池 ${data.mobileGames.length} 条。` },
    { id: "log-merge", time: data.generatedAt, type: "整理", title: "公共池重复游戏合并", detail: `按清洗后的游戏名合并，${merged} 个游戏拥有多来源记录。` },
    { id: "log-future", time: data.generatedAt, type: "排期", title: "未来排期补充", detail: `当前包含 ${future} 条未来手游排期。` },
    { id: "log-issue", time: data.generatedAt, type: "审核", title: "问题记录检查", detail: `当前待处理问题 ${data.cleanupIssues.length} 条。` },
  ];
}

function buildMetrics(data) {
  return {
    totalGames: data.mobileGames.length + data.welfareGames.length + data.pcGames.length,
    mobilePool: data.mobileGames.length,
    welfarePool: data.welfareGames.length,
    pcPool: data.pcGames.length,
    todayUpdates: [...data.mobileGames, ...data.welfareGames].filter((item) => item.eventAt.startsWith(data.date)).length,
    cleanupIssues: data.cleanupIssues.length,
    rawMobileRecords: data.rawMobileRecords.length,
    rawWelfareRecords: data.rawWelfareRecords?.length || 0,
  };
}

function normalizeSources(sources) {
  const map = {
    mobile: ["taptap", "ninegame", "hykb"],
    welfare: ["xiaoqi"],
    xiaoqi: ["xiaoqi"],
    taptap: ["taptap"],
    ninegame: ["ninegame"],
    hykb: ["hykb"],
    TapTap: ["taptap"],
    九游: ["ninegame"],
    好游快爆: ["hykb"],
    小七手游: ["xiaoqi"],
  };
  return [...new Set((sources || []).flatMap((source) => map[source] || [source]).filter((source) => mobileSources[source]))];
}

function normalizeRecord(record) {
  const titleParts = splitGameTitle(record.gameName);
  const subtitle = mergeUnique([titleParts.subtitle, record.subtitle].filter(Boolean).flatMap((value) => cleanText(value).split(/\s*\/\s*/).filter(Boolean))).join(" / ");
  const sourceEventAt = record.sourceEventAt || record.eventAt || "";
  const eventAt = resolveContentEventAt(sourceEventAt, record);
  const tapSummary = record.sourceKey === "taptap" ? cleanTapTapField(record.summary, titleParts.gameName, eventAt) : record.summary;
  const tapUpdate = record.sourceKey === "taptap" ? cleanTapTapField(record.updateContent, titleParts.gameName, eventAt) : record.updateContent;
  const mergedContent = mergeSummaryAndUpdate(tapSummary, tapUpdate, titleParts.gameName, record.status, record.eventType, eventAt);
  return {
    ...record,
    gameName: titleParts.gameName,
    subtitle,
    eventAt,
    sourceEventAt,
    summary: mergedContent.summary,
    updateContent: mergedContent.updateContent,
    tags: mergeUnique((record.tags || []).map(cleanText).filter(Boolean)),
    vendor: record.sourceKey === "ninegame" ? cleanNineGameVendor(record.vendor || "") : cleanVendor(record.vendor || ""),
    originalUrl: record.originalUrl || "",
    detailUrl: record.detailUrl || "",
    playerCount: Number(record.playerCount) || 0,
    reservationCount: Number(record.reservationCount) || 0,
    downloadCount: Number(record.downloadCount) || 0,
    popularityText: record.popularityText || "",
    welfareKind: record.welfareKind || "",
    crawlerRule: "detailUrl required; missing detailUrl enters cleanup issues.",
  };
}

function resolveContentEventAt(eventAt = "", record = {}) {
  const original = String(eventAt || "");
  const content = `${record.updateContent || ""}\n${record.summary || ""}`;
  if (!original || !isActivityDateCheckCandidate(record, content)) return original;
  const originalDate = original.match(/^(20\d{2}-\d{2}-\d{2})/)?.[1] || "";
  const dates = extractExplicitContentDates(content, originalDate);
  if (!dates.length) return original;
  const displayDate = dates.includes(originalDate) ? originalDate : dates[0];
  const time = original.match(/T(\d{2}:\d{2})/)?.[1] || "10:00";
  return `${displayDate}T${time}:00+08:00`;
}

function applyRecordTitle(record, title) {
  const titleParts = splitGameTitle(title);
  if (!titleParts.gameName) return;
  record.gameName = titleParts.gameName;
  record.subtitle = mergeUnique([record.subtitle, titleParts.subtitle].filter(Boolean).flatMap((value) => cleanText(value).split(/\s*\/\s*/).filter(Boolean))).join(" / ");
}
function toSourceRecord(record) {
  return {
    source: record.source,
    sourceKey: record.sourceKey,
    gid: record.gid || "",
    gameName: record.gameName,
    subtitle: record.subtitle || "",
    detailUrl: record.detailUrl,
    originalUrl: record.originalUrl,
    status: record.status,
    eventType: record.eventType,
    eventAt: record.eventAt,
    sourceEventAt: record.sourceEventAt || record.eventAt,
    summary: record.summary,
    updateContent: record.updateContent,
    tags: record.tags,
    vendor: record.vendor || "",
    operator: record.operator || "",
    detailSummary: record.detailSummary || "",
    renderedTags: record.renderedTags || [],
    iconUrl: record.iconUrl || "",
    playerCount: Number(record.playerCount) || 0,
    reservationCount: Number(record.reservationCount) || 0,
    downloadCount: Number(record.downloadCount) || 0,
    popularityText: record.popularityText || "",
    welfareKind: record.welfareKind || "",
    platformIds: { ...(record.platformIds || {}) },
  };
}

function dedupeSourceRecords(records) {
  const seen = new Map();
  for (const record of records) {
    const sourceKey = sourceKeyForMobileRecord(record);
    const platformId = record.platformIds?.[sourceKey] || record.platformId || record.sourceId || record.gid || idFromMobileDetailUrl(record.detailUrl, sourceKey);
    const identity = platformId || record.detailUrl || record.originalUrl || record.gameName || record.eventAt;
    const key = `${record.source || sourceKey}:${identity}`;
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, record);
      continue;
    }
    const previousContent = cleanContentText(previous.summary || previous.updateContent || "");
    const nextContent = cleanContentText(record.summary || record.updateContent || "");
    const preferred = contentScore(nextContent) > contentScore(previousContent) ? record : previous;
    const eventAt = earliestEventAt(previous.eventAt || "", record.eventAt || "");
    seen.set(key, {
      ...previous,
      ...preferred,
      eventAt: eventAt || preferred.eventAt || previous.eventAt || record.eventAt,
      sourceEventAt: earliestEventAt(previous.sourceEventAt || previous.eventAt || "", record.sourceEventAt || record.eventAt || "") || preferred.sourceEventAt,
      summary: preferred.summary || previous.summary || record.summary || "",
      updateContent: preferred.updateContent || previous.updateContent || record.updateContent || "",
      tags: mergeUnique([...(previous.tags || []), ...(record.tags || [])]),
      platformIds: { ...(previous.platformIds || {}), ...(record.platformIds || {}) },
    });
  }
  return [...seen.values()].sort((left, right) => new Date(left.eventAt) - new Date(right.eventAt));
}

function mergeGameplayTags(tags) {
  const blocked = new Set([
    "\u65b0\u6e38", "\u5f00\u6d4b", "\u9884\u7ea6", "\u4e0a\u7ebf", "\u4eca\u65e5\u4e0a\u7ebf", "\u5373\u5c06\u4e0a\u7ebf", "\u7248\u672c\u66f4\u65b0", "\u6d3b\u52a8", "\u66f4\u65b0", "\u52a8\u6001",
    "\u4e0b\u8f7d", "\u8bd5\u73a9", "\u653b\u7565", "\u4eae\u70b9", "[\u8be6\u60c5]", "\u8be6\u60c5", "\u65b0\u624b", "\u65b0\u95fb", "\u6e38\u620f", "\u65b0\u73a9\u6cd5", "\u65b0\u5730\u56fe", "\u65b0\u5730", "\u5f00\u6d4b\u63d0\u9192", "\u6d88\u901d\u7684\u6e38\u620f", "\u7f16\u8f91\u63a8\u8350", "\u591a\u5e73\u53f0", "\u5b98\u670d", "\u516c\u6d4b", "\u5185\u6d4b", "\u6d4b\u8bd5", "\u5220\u6863", "\u4e0d\u5220\u6863", "\u9996\u53d1", "\u65b0\u6d3b\u52a8", "\u8054\u52a8",
    "\u4e3b\u673a", "\u9996\u9875", "\u6392\u884c\u699c", "\u699c\u5355", "\u4e13\u533a", "\u8bba\u575b", "\u793e\u533a", "\u5b98\u65b9", "\u5b98\u7f51", "\u7f6e\u9876", "\u4f18\u8d28", "\u4f18\u9009", "\u7cbe\u54c1", "\u7cbe\u534e", "\u53cb\u60c5\u94fe\u63a5", "\u7cfb\u7edf", "\u4ea4\u6d41", "\u70ed\u95e8", "\u63a8\u8350",
    "\u4e91\u6e38\u620f", "\u81ea\u52a8\u62fe\u53d6", "\u81ea\u52a8", "\u5212\u5206", "\u4e0a\u5343\u5730\u56fe\u7b49\u4f60\u63a2\u7d22",
    "\u7b80\u4ecb", "\u8ba1\u8d39\u5220\u6863\u5185\u6d4b", "\u4ed8\u8d39\u4e0b\u8f7d", "\u591a\u7ed3\u5c40", "\u53d1\u884c\u5546", "\u5c81\u672b\u5e86\u5178\u5f00\u542f", "\u70ed\u95e8\u6807\u7b7e\uff1a", "\u810d\u7099\u4eba\u53e3", "CV\u63a7", "up\u4e3b\u63a8\u8350", "\u4efb\u52a1", "\u526f\u672c", "\u52a0\u901f\u5668\u4e0b\u8f7d", "\u53d1\u5e03", "\u65e0\u53cc\u9a6c\u8d85\u767b\u573a\uff01", "\u79c1\u85cf\u4f73\u4f5c", "\u67e5\u770b\u66f4\u591a>>", "BOSS\u8ba8\u4f10", "\u4e0d\u5220\u6863\u5185\u6d4b", "\u4e3b\u6253\u590d\u53e4", "\u4e5d\u6e38APP", "\u4ecb\u7ecd\u4e4b\u516c\u4f1a\u6218", "\u4e92\u52a8\u5f71\u50cf", "\u4f60\u753b\u6211\u731c", "\u4f60\u7684\u4f20\u5947\u7531\u4f60\u5b9a\u4e49",
    "\u7c7b\u578b", "\u6807\u7b7e", "\u5206\u7c7b", "\u73a9\u6cd5", "\u5f00\u53d1", "\u6d4b\u8bd5\u5e73\u53f0", "\u5b89\u5353", "iOS", "PC", "PC\\u7aef", "PC\\u6e38\\u620f",
  ]);

  const blockedPatterns = [
    /(\u7248\u672c|\u66f4\u65b0|\u6d3b\u52a8|\u8d5b\u5b63|\u8054\u52a8|\u8fd4\u573a|\u4e0a\u7ebf|\u9884\u7ea6|\u6d4b\u8bd5|\u9996\u6d4b|\u7ec8\u6d4b|\u9996\u53d1|\u5220\u6863|\u5185\u6d4b|\u516c\u6d4b|\u4e0b\u8f7d|\u53d1\u884c|\u5382\u5546|\u7b80\u4ecb)/,
    /^(BSide\uFF1A|BSide:|Olivia|Lin|\u5929\u4e0b|\u5173\u6ce8|\u5f00\u653e\u4e0b\u8f7d|\u5f00\u542f\u56fd\u670d\u9996\u6d4b|\u534a\u5468\u5e74\u5e86\u5f00\u542f|\u597d\u8bc4\u539f\u58f0\u97f3\u8f68|\u6781\u81f4\u89c6\u542c\u4eab\u53d7|\u7edd\u8d5e\u7acb\u7ed8|\u5fc5\u73a9\u795e\u4f5c|\u529b\u8350\u4f73\u4f5c|\u72ec\u7acb\u4f73\u4f5c|\u72ec\u7acb\u795e\u4f5c)$/,
    /^(FC\u8db3\u7403\u4e16\u754c|\u8303\u5f0f\uFF1A\u8d77\u6e90|\u4ee3\u53f7\uFF1AZ|\u8be1\u79d8\u4e4b\u4e3b|\u706b\u5f71\u5fcd\u8005\u624b\u6e38|\u5361\u5384\u601d\u68a6\u5883|\u732b\u795e\u7267\u573a|\u68a6\u7684\u7b2c\u4e03\u7ae0|\u79d8\u5883\u593a\u91d1|\u5c11\u5973\u4e0e\u5b66\u9662\u57ce|\u4f7f\u547d\u53ec\u5524\u624b\u6e38|\u4e16\u4e0a\u82f1\u96c4|\u91ca\u653e\u963f\u51e1\u8fbe|\u5143\u6c14\u9a91\u58eb\u524d\u4f20|\u771f\u30fb\u4e09\u56fd\u65e0\u53cc|\u4e09\u89d2\u6d32\u884c\u52a8|\u4e09\u56fd\uFF1A\u767e\u5c06\u724c|\u6697\u533a\u7a81\u56f4|\u5b9d\u53ef\u68a6\u51a0\u519b|\u6d0b\u6d41\u670b\u514b|\u53f2\u83b1\u59c6\u57ce\u5821|\u4e2d\u56fd\u5f0f\u5730\u96f7\u5973|\u70bc\u91d1\u4e0e\u9b54\u6cd5|\u5e7b\u60f3\u4e4b\u5203)$/,
    /^(\u7c7b\u578b|\u6807\u7b7e|\u5206\u7c7b|\u73a9\u6cd5|\u5f00\u53d1|\u5b89\u5353|iOS|PC|\u7f51\u9875\u7248|\u53cb\u60c5\u94fe\u63a5|\u8ba2\u9605|\u8be6\u60c5|\u66f4\u591a|[\u4e00-\u9fa5]{1,2}:|[\u4e00-\u9fa5]{1,2}\uff1a)$/,
  ];

  return mergeUnique(tags.map(normalizeGameplayAlias))
    .filter((tag) => tag && !blocked.has(tag) && !blockedPatterns.some((pattern) => pattern.test(tag)) && isAllowedGameplayTag(tag))
    .slice(0, 12);
}

function cleanPoolItem(item) {
  const sourceStatus = chooseStatusFromSourceRecords(item.sourceRecords || []);
  const rawStatus = sourceStatus || normalizePoolStatus(item.status, item);
  const rawEventType = normalizePoolEventType(item.eventType, rawStatus, item);
  const status = normalizeStatusGroup(rawStatus, rawEventType, item);
  const gameplayTags = normalizePoolGameplayTags(item, rawStatus, rawEventType);
  const sourceRecords = dedupeSourceRecords(item.sourceRecords || []).map((record) => {
    const recordSourceKey = sourceKeyForMobileRecord(record);
    const rawTapText = recordSourceKey === "taptap"
      ? cleanTapTapField([record.summary, record.updateContent].filter(Boolean).join(" "), record.gameName || item.gameName, record.eventAt)
      : "";
    const recordStatus = recordSourceKey === "taptap" && /首发|上线|开测|预约/.test(rawTapText)
      ? (/预约/.test(rawTapText) ? "预约" : /开测/.test(rawTapText) ? "开测" : /首发/.test(rawTapText) ? "首发" : "上线")
      : normalizePoolStatus(record.status, record);
    const recordEventType = normalizePoolEventType(record.eventType, recordStatus, record);
    const sourceEventAt = record.sourceEventAt || record.eventAt || item.eventAt || "";
    const effectiveEventAt = resolveContentEventAt(sourceEventAt, record);
    const xiaoqiContent = recordSourceKey === "xiaoqi" ? cleanXiaoqiAnnouncement(record.detailSummary || record.summary || record.updateContent) : "";
    const sourceSummary = recordSourceKey === "taptap" ? cleanTapTapField(record.summary, record.gameName || item.gameName, effectiveEventAt) : record.summary;
    const sourceUpdate = recordSourceKey === "taptap" ? cleanTapTapField(record.updateContent, record.gameName || item.gameName, effectiveEventAt) : record.updateContent;
    const grouped = normalizeStatusGroup(recordStatus, recordEventType, { ...record, summary: sourceSummary, updateContent: sourceUpdate, tags: [recordStatus, recordEventType] });
    const mergedRecordContent = xiaoqiContent
      ? { summary: xiaoqiContent, updateContent: xiaoqiContent }
      : mergeSummaryAndUpdate(sourceSummary, sourceUpdate, record.gameName || item.gameName, recordStatus, recordEventType, effectiveEventAt);
    return {
      ...record,
      eventAt: effectiveEventAt,
      sourceEventAt,
      rawStatus: recordStatus,
      rawEventType: recordEventType,
      status: grouped,
      eventType: grouped,
      tags: normalizeSourceRecordTags({ ...record, sourceKey: recordSourceKey, status: grouped, eventType: grouped, summary: sourceSummary, updateContent: sourceUpdate, tags: [recordStatus, recordEventType, ...(record.tags || [])] }),
      ...mergedRecordContent,
      vendor: recordSourceKey === "ninegame" ? cleanNineGameVendor(record.vendor || "") : cleanVendor(record.vendor || ""),
      iconUrl: record.iconUrl || "",
    };
  });
  const tapRelease = sourceRecords.some((record) => sourceKeyForMobileRecord(record) === "taptap" && /首发|上线|开测|预约/.test(cleanTapTapField(record.summary || record.updateContent, record.gameName || item.gameName, record.eventAt)));
  const finalRawStatus = tapRelease ? "首发" : (chooseStatusFromSourceRecords(sourceRecords) || rawStatus);
  const finalEventType = tapRelease ? "新游" : normalizePoolEventType(item.eventType, finalRawStatus, { ...item, sourceRecords });
  const finalStatus = normalizeStatusGroup(finalRawStatus, finalEventType, { ...item, tags: [finalRawStatus, finalEventType, ...gameplayTags] });
  const xiaoqiContent = sourceRecords.find((record) => record.sourceKey === "xiaoqi" && record.summary)?.summary || "";
  const itemSummary = item.primarySource === "TapTap" ? cleanTapTapField(item.summary, item.gameName, item.eventAt) : item.summary;
  const itemUpdate = item.primarySource === "TapTap" ? cleanTapTapField(item.updateContent, item.gameName, item.eventAt) : item.updateContent;
  const mergedContent = xiaoqiContent
    ? { summary: xiaoqiContent, updateContent: xiaoqiContent }
    : mergeSummaryAndUpdate(itemSummary, itemUpdate, item.gameName, rawStatus, rawEventType, item.eventAt);

  return {
    ...item,
    rawStatus: finalRawStatus,
    rawEventType: finalEventType,
    status: finalStatus,
    eventType: finalStatus,
    gameplayTags,
    tags: mergeUnique([finalStatus, ...gameplayTags]).slice(0, 12),
    summary: mergedContent.summary,
    updateContent: mergedContent.updateContent,
    vendor: choosePreferredVendor(item.vendor, ...sourceRecords.map((record) => record.vendor)),
    operator: item.operator || sourceRecords.find((record) => record.operator)?.operator || "",
    sources: sortMobileSources(item.sources || sourceRecords.map((record) => record.source)),
    eventAt: sourceRecords.reduce((current, record) => earliestEventAt(current, record.eventAt), item.eventAt || ""),
    sourceRecords: [...sourceRecords].sort((left, right) => mobileSourceRank(left.source) - mobileSourceRank(right.source)),
  };
}

function mobileSourceRank(source = "") {
  const aliases = { hykb: "好游快爆", "好游快爆": "好游快爆", taptap: "TapTap", TapTap: "TapTap", ninegame: "九游", "九游": "九游", xiaoqi: "小七手游", "小七手游": "小七手游" };
  const rank = MOBILE_SOURCE_PRIORITY.indexOf(aliases[String(source || "").trim()] || String(source || "").trim());
  return rank >= 0 ? rank : MOBILE_SOURCE_PRIORITY.length;
}

function sortMobileSources(sources = []) {
  return mergeUnique(sources).sort((left, right) => mobileSourceRank(left) - mobileSourceRank(right));
}

function normalizeStatusGroup(status, eventType, item = {}) {
  if (["上线/测试", "更新", "活动/联动"].includes(cleanText(status))) return cleanText(status);
  const textValue = [
    cleanText(status),
    cleanText(eventType),
    ...(item.tags || []).map(cleanText),
  ].filter(Boolean).join(" ");

  if (/\u8054\u52a8|\u6d3b\u52a8|\u4e3b\u9898\u670d|\u8282|MK2|\u8fd4\u573a/.test(textValue)) return "\u6d3b\u52a8/\u8054\u52a8";
  if (/\u7248\u672c\u66f4\u65b0|\u7248\u672c|\u66f4\u65b0|\u8d5b\u5b63|\u65b0\u589e|\u524d\u77bb/.test(textValue)) return "\u66f4\u65b0";
  return "\u4e0a\u7ebf/\u6d4b\u8bd5";
}

function normalizePoolStatus(status, item = {}) {
  const candidates = [
    cleanText(status),
    cleanText(item.eventType),
    cleanText(item.summary),
    cleanText(item.updateContent),
    ...(item.tags || []).map(cleanText),
  ].filter(Boolean).join(" ");

  if (/\u4eca\u65e5\u4e0a\u7ebf/.test(candidates)) return "\u4eca\u65e5\u4e0a\u7ebf";
  if (/\u5373\u5c06\u4e0a\u7ebf/.test(candidates)) return "\u5373\u5c06\u4e0a\u7ebf";
  if (/\u8054\u52a8/.test(candidates)) return "\u8054\u52a8";
  if (/\u6d3b\u52a8|\u4e3b\u9898\u670d|\u8282|MK2|\u52a0\u62c9\u5fb7\u9686|\u540d\u5c06\u9f50\u805a/.test(candidates)) return "\u6d3b\u52a8";
  if (/\u7248\u672c|\u66f4\u65b0|\u8d5b\u5b63|\u8fd4\u573a|\u65b0\u589e|\u524d\u77bb|\u4e0a\u7ebf\u4e86\u4ec0\u4e48/.test(candidates)) return "\u66f4\u65b0";
  if (/\u5f00\u6d4b|\u6d4b\u8bd5|\u9996\u6d4b|\u7ec8\u6d4b|\u62db\u52df|\u516c\u6d4b|\u5185\u6d4b|\u5220\u6863|\u4e0d\u5220\u6863/.test(candidates)) return "\u5f00\u6d4b";
  if (/\u9996\u53d1/.test(candidates)) return "\u9996\u53d1";
  if (/\u4e0a\u7ebf|\u5f00\u670d|\u5f00\u653e\u4e0b\u8f7d|\u4e0b\u8f7d/.test(candidates)) return "\u4e0a\u7ebf";
  if (/\u9884\u7ea6|\u9884\u4e0b\u8f7d/.test(candidates)) return "\u9884\u7ea6";
  return cleanText(status) || "\u65b0\u6e38";
}

function normalizePoolEventType(eventType, status, item = {}) {
  const candidates = [
    cleanText(eventType),
    cleanText(status),
    cleanText(item.summary),
    cleanText(item.updateContent),
    ...(item.tags || []).map(cleanText),
  ].filter(Boolean).join(" ");

  if (status === "\u4eca\u65e5\u4e0a\u7ebf" || status === "\u5373\u5c06\u4e0a\u7ebf" || status === "\u4e0a\u7ebf" || status === "\u9996\u53d1" || status === "\u9884\u7ea6") return "\u65b0\u6e38";
  if (status === "\u66f4\u65b0" || status === "\u6d3b\u52a8" || status === "\u8054\u52a8") return "\u7248\u672c\u66f4\u65b0";
  if (status === "\u5f00\u6d4b") return "\u5f00\u6d4b";
  if (/\u7248\u672c|\u66f4\u65b0|\u8d5b\u5b63|\u6d3b\u52a8|\u8054\u52a8|\u8fd4\u573a/.test(candidates)) return "\u7248\u672c\u66f4\u65b0";
  if (/\u5f00\u6d4b|\u6d4b\u8bd5|\u62db\u52df/.test(candidates)) return "\u5f00\u6d4b";
  return "\u65b0\u6e38";
}

function normalizePoolGameplayTags(item, status, eventType) {
  const titleParts = splitGameTitle(item.gameName || "");
  const subtitleParts = cleanText(item.subtitle || "")
    .split(/\s*\/\s*/)
    .map(cleanText)
    .filter(Boolean);

  const allowedKeywords = [
    "\u89d2\u8272\u626e\u6f14", "\u52a8\u4f5c", "\u7b56\u7565", "\u6218\u68cb", "\u5361\u724c", "\u5c04\u51fb", "\u7ade\u6280",
    "\u591a\u4eba\u8054\u673a", "\u5f00\u653e\u4e16\u754c", "\u4e8c\u6b21\u5143", "\u517b\u6210", "\u751f\u5b58", "\u50cf\u7d20",
    "\u6a21\u62df", "\u6a21\u62df\u7ecf\u8425", "\u4f11\u95f2", "\u683c\u6597", "\u6c99\u76d2", "\u89e3\u8c1c", "\u97f3\u6e38",
    "\u793e\u4ea4", "AVG", "MMO", "MOBA", "\u7ade\u901f", "\u8d5b\u8f66", "\u7bee\u7403", "\u5854\u9632", "\u5192\u9669",
    "\u5237\u5b9d", "\u6293\u5ba0",
    "\u975e\u5bf9\u79f0\u7ade\u6280", "\u6d3e\u5bf9\u6e38\u620f", "\u641c\u6253\u64a4", "\u67aa\u6218", "\u5355\u673a",
    "Roguelite", "RogueLite", "Roguelike", "Steam\u79fb\u690d", "\u5f39\u5e55", "\u6d82\u8272", "\u5efa\u9020", "\u526a\u8349",
  ];

  const blockedExact = new Set([
    status, eventType, "\u65b0\u6e38", "\u5f00\u6d4b", "\u9884\u7ea6", "\u4e0a\u7ebf", "\u9996\u53d1", "\u66f4\u65b0",
    "\u6d3b\u52a8", "\u8054\u52a8", "\u4eca\u65e5\u4e0a\u7ebf", "\u5373\u5c06\u4e0a\u7ebf", "\u7248\u672c\u66f4\u65b0",
    "\u52a8\u6001", "\u7f16\u8f91\u63a8\u8350", "\u529b\u8350\u4f73\u4f5c", "\u5fc5\u73a9\u795e\u4f5c", "\u72ec\u7acb\u4f73\u4f5c",
    "\u72ec\u7acb\u795e\u4f5c", "\u5b98\u670d", "\u591a\u5e73\u53f0", "\u4e0b\u8f7d", "\u8bd5\u73a9", "\u5173\u6ce8",
    "\u5f00\u653e\u4e0b\u8f7d", "TapTap", "\u4e5d\u6e38", "\u597d\u6e38\u5feb\u7206", "PC\u6e38\u620f",
    "\u8d85\u723d\u6253\u51fb", "\u4e70\u65ad\u5236", "\u6c89\u6d78\u5f0f\u4f53\u9a8c", "\u9ad8\u753b\u8d28", "\u6a2a\u7248",
    "\u4e91\u6e38\u620f", "\u81ea\u52a8\u62fe\u53d6", "\u81ea\u52a8", "\u5212\u5206", "\u4e0a\u5343\u5730\u56fe\u7b49\u4f60\u63a2\u7d22",
    "\u7b80\u4ecb", "\u8ba1\u8d39\u5220\u6863\u5185\u6d4b", "\u4ed8\u8d39\u4e0b\u8f7d", "\u591a\u7ed3\u5c40", "\u53d1\u884c\u5546", "\u5c81\u672b\u5e86\u5178\u5f00\u542f", "\u70ed\u95e8\u6807\u7b7e\uff1a", "\u810d\u7099\u4eba\u53e3", "CV\u63a7", "up\u4e3b\u63a8\u8350", "\u4efb\u52a1", "\u526f\u672c", "\u52a0\u901f\u5668\u4e0b\u8f7d", "\u53d1\u5e03", "\u65e0\u53cc\u9a6c\u8d85\u767b\u573a\uff01", "\u79c1\u85cf\u4f73\u4f5c", "\u67e5\u770b\u66f4\u591a>>", "BOSS\u8ba8\u4f10", "\u4e0d\u5220\u6863\u5185\u6d4b", "\u4e3b\u6253\u590d\u53e4", "\u4e5d\u6e38APP", "\u4ecb\u7ecd\u4e4b\u516c\u4f1a\u6218", "\u4e92\u52a8\u5f71\u50cf", "\u4f60\u753b\u6211\u731c", "\u4f60\u7684\u4f20\u5947\u7531\u4f60\u5b9a\u4e49",
    "\u7b14\u8bb0", "\u9996\u9875", "\u6392\u884c\u699c", "\u699c\u5355", "\u53d1\u73b0", "\u4e13\u533a", "\u8bba\u575b", "\u793e\u533a", "\u5b98\u7f51", "\u8be6\u60c5", "[\u8be6\u60c5]", "\u653b\u7565", "\u4eae\u70b9", "\u65b0\u624b", "\u65b0\u95fb", "\u6e38\u620f", "\u5f00\u6d4b\u63d0\u9192", "\u4f18\u9009", "\u7cbe\u54c1", "\u4f73\u4f5c", "\u5b98\u65b9", "\u5df2\u89e3\u51b3",
    "\u5e1d\u56fd\u6587\u660e\u91cd\u73b0", "\u73a9\u5bb6\u5c06\u7a7f\u8d8a\u65f6\u7a7a",
    "\u4e09\u56fd", "\u4e2a\u4eba\u5f00\u53d1", "\u4eba\u5de5\u667a\u80fd", "\u53cb\u60c5\u7c89\u788e\u673a",
    "\u5355\u673a", "\u7b2c\u4e09\u4eba\u79f0", "\u7b2c\u4e00\u4eba\u79f0", "\u72ec\u7acb\u6e38\u620f", "\u591a\u7aef\u4e92\u901a",
    "\u9ad8\u81ea\u7531\u5ea6", "DIY\u521b\u9020",
  ].filter(Boolean));

  const blockedPatterns = [
    /\u7248\u672c|\u66f4\u65b0|\u8d5b\u5b63|\u8fd4\u573a|\u6d3b\u52a8|\u8054\u52a8|\u9996\u53d1|\u9884\u7ea6|\u4e0a\u7ebf|\u5f00\u6d4b|\u6d4b\u8bd5|\u5220\u6863|\u5185\u6d4b|\u516c\u6d4b|\u4e0b\u8f7d|\u53d1\u884c|\u5382\u5546|\u7b80\u4ecb|BOSS/,
    /^\d+(\.\d+)?$/,
    /^(?!RPG$|MMO$|MOBA$|SLG$|ARPG$|JRPG$|AVG$|DBG$|TCG$|TPS$)[A-Z][A-Za-z0-9:_-]{1,}$/,
  ];

  const rawTags = mergeUnique([
    ...(item.tags || []),
    ...((item.sourceRecords || []).flatMap((record) => record.tags || [])),
    ...(KNOWN_GAMEPLAY_TAGS[gameIdentity(titleParts.gameName)] || []),
  ]).map(cleanText).filter(Boolean);

  const normalized = [];
  for (const tag of rawTags) {
    const compact = normalizeGameplayAlias(tag);
    if (!compact) continue;
    if (blockedExact.has(compact)) continue;
    if (compact === titleParts.gameName) continue;
    if (subtitleParts.includes(compact)) continue;
    if (titleParts.gameName && titleParts.gameName.includes(compact) && compact.length >= 3) continue;
    if (subtitleParts.some((part) => part.includes(compact) || compact.includes(part))) continue;
    if (blockedPatterns.some((pattern) => pattern.test(compact))) continue;
    if (isAllowedGameplayTag(compact)) normalized.push(compact);
  }

  return mergeUnique(normalized).slice(0, 6);
}

function normalizeSourceRecordTags(record) {
  const status = normalizePoolStatus(record.status, record);
  const eventType = normalizePoolEventType(record.eventType, status, record);
  return mergeUnique([normalizeStatusGroup(status, eventType, record), ...normalizePoolGameplayTags(record, status, eventType)]).slice(0, 12);
}

function cleanPoolSummary(summary, updateContent, status, eventType) {
  return mergeSummaryAndUpdate(summary, updateContent, "", status, eventType).summary;
}

function cleanPoolUpdateContent(updateContent, summary, status) {
  return mergeSummaryAndUpdate(summary, updateContent, "", status, "").updateContent;
}

function mergeSummaryAndUpdate(summary, updateContent, gameName = "", status = "", eventType = "", eventAt = "") {
  const blocked = new Set([
    cleanText(status), cleanText(eventType),
    "\u65b0\u6e38", "\u9884\u7ea6", "\u9996\u53d1", "\u4e0a\u7ebf", "\u5f00\u6d4b", "\u52a8\u6001", "\u6d3b\u52a8", "\u66f4\u65b0",
  ].filter(Boolean));
  const candidates = [summary, updateContent]
    .flatMap((value) => splitContentPieces(value))
    .map((value) => cleanMergedContentText(value, gameName, eventAt))
    .filter(Boolean)
    .filter((value) => !blocked.has(value));

  const eventCandidates = candidates.filter((candidate) => isEventSentence(candidate));
  const primaryCandidates = eventCandidates.length ? eventCandidates : candidates;

  const kept = [];
  for (const candidate of primaryCandidates.sort((left, right) => contentScore(right) - contentScore(left))) {
    if (isWeakContent(candidate)) continue;
    if (kept.some((existing) => isSimilarContent(existing, candidate) || isSameEventContent(existing, candidate))) continue;
    kept.push(candidate);
  }

  const firstKept = kept[0] || "";
  const eventLimit = firstKept.length > 40 || /^\u4e8e\d{1,2}\u6708\d{1,2}\u65e5/.test(firstKept) ? 1 : 2;
  const summaryText = kept.slice(0, eventCandidates.length ? eventLimit : 2).join("\n");
  return { summary: summaryText, updateContent: summaryText };
}

function chooseStatusFromSourceRecords(records = []) {
  if (!records.length) return "";
  const weights = { taptap: 4, hykb: 3, ninegame: 1 };
  const scores = new Map();
  for (const record of records) {
    const normalized = normalizePoolStatus(record.status, record);
    const grouped = normalizeStatusGroup(normalized, normalizePoolEventType(record.eventType, normalized, record), record);
    const weight = weights[record.sourceKey] || 1;
    scores.set(grouped, (scores.get(grouped) || 0) + weight);
  }
  return [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

function splitContentPieces(value = "") {
  return decodeEntities(value).replace(/\\n/g, "\n")
    .split(/\n+|(?<=[\u3002\uff01\uff1f])|(?<=! )|(?<=\? )/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function escapeRegExp(value = "") {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function trimUpdateHistoryText(value = "") {
  const textValue = cleanText(value);
  const matches = [...textValue.matchAll(/20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2}/g)];
  if (matches.length >= 2) return cleanText(textValue.slice(0, matches[1].index));
  if (matches.length === 1 && matches[0].index > 12) return cleanText(textValue.slice(0, matches[0].index));
  return textValue;
}

function cleanMergedContentText(value = "", gameName = "", eventAt = "") {
  let textValue = cleanContentText(stripHtmlNoise(value));
  if (!textValue) return "";
  if (/tmodule_|yxgl_|\b[a-z]+_[a-z]+_\d+/i.test(textValue)) return "";
  if (/(\u5feb\u901f\u9884\u7ea6|\u5feb\u901f\u4e0b\u8f7d|\u4ec0\u4e48\u65f6\u5019\u51fa|\u516c\u6d4b\u4e0a\u7ebf\u65f6\u95f4\u9884\u544a|\u7b80\u8981\u8bc4\u6790)/.test(textValue)) return "";
  if (/@type|acceptedAnswer|privacy_policy|application\/ld\+json|no_text_link|apk_size|version_name/.test(textValue)) return "";
  if (/(\u6309\u6807\u7b7e\u6d4f\u89c8\u66f4\u591a\u540c\u7c7b\u6e38\u620f|\u4e0a\u6709\u5927\u91cf\u540c\u7c7b\u6e38\u620f\u63a8\u8350|\u60a8\u53ef\u4ee5\u5728\s*TapTap|\u6765\u81ea\u4e8e\s*\u4e5d\u6e38APP|\u8c4c\u8c46|\u9690\u79c1\u653f\u7b56|\u7528\u6237\u534f\u8bae|\u6e38\u620f\u6807\u7b7e|\u73a9\u6cd5\u6807\u7b7e|\u6709\u54ea\u4e9b\u6e38\u620f\u6807\u7b7e)/.test(textValue)) return "";
  if (["\u7248\u672c\u8981\u6c42", "\u65e0\u7cfb\u7edf\u8981\u6c42", "\u5f53\u524d\u7248\u672c", "\u66f4\u65b0\u65f6\u95f4"].some((word) => textValue.includes(word))) return "";
  textValue = textValue.replace(/[\uff0c,]?TapTap\s*\u63d0\u4f9b[^\uff0c\u3002]{0,100}[\uff0c\u3002]?/g, " ");
  textValue = textValue.replace(/\u6700\u65b0\u7248\u5b98\u65b9\u6b63\u7248/g, " ");
  if (/\u4e5d\u6e38.*\u4e3a\u60a8\u63d0\u4f9b.*(\u4e0b\u8f7d|\u9884\u7ea6|\u793c\u5305|\u653b\u7565|\u600e\u4e48\u73a9)/.test(textValue)) return "";
  if (/^(\u67e5\u770b\u8be6\u60c5|\u8fdb\u5165\u4e13\u533a|\u7acb\u5373\u9884\u7ea6|\u9884\u7ea6|\u4e0b\u8f7d|\u5173\u6ce8|\u6682\u65e0\u7b80\u4ecb|\u63d0\u9192|\u641c\u7d22)$/.test(textValue)) return "";

  const title = cleanText(gameName);
  if (title) {
    const escapedTitle = escapeRegExp(title);
    textValue = textValue
      .replace(new RegExp("^" + escapedTitle + "[-\\uff0d\\u2014:\\uff1a\\s]+"), "")
      .replace(new RegExp("[-\\uff0d\\u2014:\\uff1a\\s]+" + escapedTitle + "$"), "")
      .replace(/\u300a\s*\u300b/g, "\u300a" + title + "\u300b")
      .replace(/^[\u300b\u300d]/g, "\u300a" + title + "\u300b");
    if (textValue === title) return "";
  }

  textValue = normalizeEventDateText(textValue, eventAt)
    .replace(/^(\u9884\u7ea6|\u9996\u53d1|\u4e0a\u7ebf|\u5f00\u6d4b|\u4eca\u65e5\u4e0a\u7ebf|\u5373\u5c06\u4e0a\u7ebf|\u65b0\u6e38)\s*/g, "")
    .replace(/\s*(\u9884\u7ea6|\u65b0\u6e38)$/g, "")
    .replace(/([^\s\uff0c\u3002\uff01\uff1f]{2,60})(\s+\1)+/g, "$1")
    .replace(/(\d{1,2}:\d{2}\s+[^\u3002\uff01\uff1f]{4,80})(\s+\1)+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (/\u5f00\u6d4b\u63d0\u9192/.test(textValue)) return "";
  if (/^\u5f00\.\.\.$/.test(textValue)) return "";
  textValue = trimUpdateHistoryText(textValue);
  if (textValue.length > 180) textValue = textValue.slice(0, 177).trim() + "...";
  return textValue;
}

function isWeakContent(value = "") {
  const textValue = cleanContentText(value);
  if (!textValue) return true;
  if (/^(\u9884\u7ea6|\u9996\u53d1|\u4e0a\u7ebf|\u5f00\u6d4b|\u4eca\u65e5\u4e0a\u7ebf|\u5373\u5c06\u4e0a\u7ebf|\u65b0\u6e38|\u6d3b\u52a8|\u52a8\u6001|\u66f4\u65b0|\u7248\u672c\u66f4\u65b0|\u63d0\u9192|\u8be6\u60c5)$/.test(textValue)) return true;
  if (/^([\u4e00-\u9fa5A-Za-z0-9]+\s+){1,8}(\u6b63\u5f0f\u4e0a\u7ebf|\u4e0a\u7ebf|\u5f00\u6d4b|\u9884\u7ea6)$/.test(textValue) && textValue.length < 24 && !/(\d{1,2}\u6708\d{1,2}\u65e5|\u4e0a\u5348|\u4e0b\u5348)/.test(textValue)) return true;
  return false;
}

function isSimilarContent(left = "", right = "") {
  const normalize = (value) => cleanContentText(value).replace(/[\s\uff0c\u3002\uff01\uff1f\u3001,.!?:\uff1a\u300a\u300b\u201c\u201d"'\uff08\uff09()]/g, "").toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 12 && b.includes(a)) return true;
  if (b.length >= 12 && a.includes(b)) return true;
  const grams = (value) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
  const ag = grams(a);
  const bg = grams(b);
  if (!ag.size || !bg.size) return false;
  let hit = 0;
  for (const gram of ag) if (bg.has(gram)) hit += 1;
  return hit / Math.min(ag.size, bg.size) >= 0.78;
}

function extractGameplayTags(textValue, explicitTags = []) {
  const candidates = [
    ...explicitTags,
    ...cleanText(textValue).split(/\s+/),
  ];
  return mergeGameplayTags(
    candidates.filter((word) => word.length >= 2 && word.length <= 6 && !/\d/.test(word) && !/[《》【】]/.test(word)),
  );
}

function cleanHykbTitle(value) {
  return cleanText(value)
    .replace(/好游快爆APP提供[^?]{0,80}(预约|下载)?/g, "")
    .replace(/九游[^?]{0,80}提供[^?]{0,80}(预约|下载|攻略)/g, "")
    .replace(/t\d+_\d+-t\d+_\d+[:?]\d+(?:\.\d+)?/g, "")
    .replace(/-->/g, " ")
    .replace(/\[详情\]/g, "")
    .replace(/[-－—]\s*\d{1,2}月\d{1,2}日.*$/, "")
    .replace(/[-－—]\s*[^-－—]*(上线|开测|测试|首测|终测|招募中|预约中|预下载|版本).*$/, "")
    .replace(/\s+(编辑推荐|力荐佳作|必玩神作|Steam高分神作|Steam移植|手游独占|多平台).*$/, "")
    .replace(/\s+(角色扮演|动作|策略|战棋|模拟经营|模拟|休闲|卡牌|射击|竞技|开放世界|二次元|养成|生存|买断制|像素|横版|格斗|沙盒|解谜|音游|社交|MMO).*$/, "")
    .trim();
}

function isSameEventContent(left = "", right = "") {
  const leftEvent = eventSignature(left);
  const rightEvent = eventSignature(right);
  if (!leftEvent.kind || !rightEvent.kind) return false;
  if (leftEvent.date && rightEvent.date && leftEvent.date !== rightEvent.date) return false;
  if (leftEvent.kind === rightEvent.kind) return true;
  const sameOnline = new Set(["上线", "首发"]);
  if (sameOnline.has(leftEvent.kind) && sameOnline.has(rightEvent.kind)) return true;
  return false;
}

function eventSignature(value = "") {
  const textValue = cleanContentText(value);
  const date = extractEventDateKey(textValue);
  const kind = /招募/.test(textValue) ? "招募"
    : /开测|测试|删档|内测|公测/.test(textValue) ? "测试"
    : /预约/.test(textValue) ? "预约"
    : /折扣|返利|礼包|代金券/.test(textValue) ? "福利"
    : /上线|首发/.test(textValue) ? "上线"
    : /更新|版本/.test(textValue) ? "更新"
    : /活动|联动/.test(textValue) ? "活动"
    : "";
  return { date, kind };
}

function extractEventDateKey(value = "") {
  const textValue = cleanText(value);
  const full = textValue.match(/20\d{2}[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (full) return `${String(Number(full[1])).padStart(2, "0")}-${String(Number(full[2])).padStart(2, "0")}`;
  const md = textValue.match(/(\d{1,2})月(\d{1,2})日|(\d{1,2})[/-](\d{1,2})/);
  if (!md) return "";
  const month = Number(md[1] || md[3]);
  const day = Number(md[2] || md[4]);
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cleanNineGameTitle(value = "") {
  return cleanText(value)
    .replace(/_.*$/, "")
    .replace(/\s*云游戏.*$/, "")
    .replace(/\s*网页版秒玩入口.*$/, "")
    .replace(/\s*[-－—]\s*(预约下载|最新版|九游|攻略|礼包).*$/, "")
    .replace(/\s+(预约下载|最新版|九游版|安卓版|手机版).*$/, "")
    .trim();
}

function chooseNineGamePreferredUpdate(primary = "", fallback = "") {
  const first = cleanContentText(primary);
  const second = cleanContentText(fallback);
  if (first && isUsefulNineGameUpdate(first)) return first;
  if (second) return second;
  return first;
}

function isUsefulNineGameUpdate(value = "") {
  const textValue = cleanText(value);
  if (/什么时候出|上线时间预告|公测时间预告|下载预约|预约下载|好玩吗|怎么玩|在哪下载/.test(textValue)) return false;
  if (/(怎么|什么|哪天|分享|介绍|反馈|规则|方法|推荐|一览|大全|攻略|领取|获得|获取|揭秘|FAQ|问答|常见问题)/i.test(textValue)) return false;
  return /(上线|首发|开测|测试|招募|预约|折扣|下载|活动|联动|版本|更新|公测|内测|删档|不删档|首曝)/.test(textValue);
}

function extractNineGameTime(value = "") {
  const match = cleanText(value).match(/(?:^|\D)(\d{1,2})\s*:\s*(\d{2})(?!\d)/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function cleanNineGameListUpdate(status = "", category = "", normalizedStatus = "", date = "") {
  const statusText = cleanText(status)
    .replace(/^今天\s*/, "6月30日")
    .replace(/^明天\s*/, "7月1日")
    .replace(/^后天\s*/, "7月2日")
    .replace(/\s+/g, " ")
    .trim();
  const categoryText = cleanText(category);
  const normalized = cleanText(normalizedStatus);
  let textValue = cleanContentText(statusText || categoryText);
  if (categoryText) {
    textValue = textValue
      .replace(new RegExp(`\\s*${escapeRegExp(categoryText)}\\s*`, "g"), " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (normalized) {
    textValue = textValue
      .replace(new RegExp(`(\\s|^)${escapeRegExp(normalized)}(\\s+${escapeRegExp(normalized)})+(\\s|$)`, "g"), ` ${normalized} `)
      .replace(new RegExp(`\\s+${escapeRegExp(normalized)}$`, "g"), "")
      .replace(/\s+/g, " ")
      .trim();
  }
  const eventMatch = textValue.match(/(?:(\d{1,2})月(\d{1,2})日|(\d{1,2})-(\d{1,2}))?\s*(\d{1,2}:\d{2})?\s*(首发|不删档内测|计费删档内测|删档内测|内测|公测|新活动|新版本|版本更新|即将测试|测试|上线|更新)/);
  if (eventMatch) {
    const month = eventMatch[1] || eventMatch[3] || "";
    const day = eventMatch[2] || eventMatch[4] || "";
    const dateText = month && day ? `${Number(month)}月${Number(day)}日` : "";
    const timeText = eventMatch[5] || "";
    const eventText = eventMatch[6] || normalized || "";
    textValue = [dateText, timeText, eventText].filter(Boolean).join(" ");
  }
  textValue = textValue.replace(/(.{3,40})(?:\s+\1)+/g, "$1").trim();
  if (date && !/(\d{1,2}月\d{1,2}日|\d{1,2}-\d{1,2}|\d{1,2}:\d{2})/.test(textValue)) {
    textValue = `${chinaMonthDay(date)} ${textValue}`;
  }
  return textValue || statusText || categoryText;
}

function cleanHykbListInfo(value = "") {
  return cleanText(value)
    .replace(/^\d+(?:\.\d+)?(?=\s)/, "")
    .replace(/^\s*\d+(?:\.\d+)?$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHykbListSummary(value = "", status = "") {
  const statusText = cleanText(status);
  let textValue = cleanContentText(value)
    .replace(new RegExp(`(^|\\\\s)${escapeRegExp(statusText)}(\\\\s|$)`, "g"), " ")
    .replace(/^[\uff0c,;；\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  textValue = textValue.replace(/(.{4,60})(?:\s+\1)+/g, "$1").trim();
  if (/^\d{1,2}:\d{2}\s*\u9884$/.test(textValue)) return "";
  return textValue || statusText;
}

function cleanHykbListUpdate(value = "", status = "", summary = "") {
  const cleaned = cleanHykbListSummary(value, status);
  return cleanContentText(prioritizeUpdateContent([status, cleaned].filter(Boolean).join(" "), "", summary) || cleaned || summary);
}

function normalizeNineGameStatus(value) {
  const textValue = cleanText(value);
  if (/\u9996\u53d1/.test(textValue)) return "\u9996\u53d1";
  if (/\u4e0a\u7ebf/.test(textValue)) return "\u4e0a\u7ebf";
  if (/\u8054\u52a8/.test(textValue)) return "\u8054\u52a8";
  if (/\u6d3b\u52a8|\u4e3b\u9898\u670d|\u6e14\u4e50\u8282|MK2/.test(textValue)) return "\u6d3b\u52a8";
  if (/\u7248\u672c|\u66f4\u65b0|\u8d5b\u5b63/.test(textValue)) return "\u66f4\u65b0";
  if (/\u516c\u6d4b|\u5185\u6d4b|\u5220\u6863|\u4e0d\u5220\u6863|\u6d4b\u8bd5|\u5f00\u6d4b/.test(textValue)) return "\u5f00\u6d4b";
  if (/[，,：:]/.test(textValue) || textValue.length > 8) return "\u66f4\u65b0";
  return textValue || "\u5f00\u6d4b";
}

function normalizeNineGameEventType(value, status) {
  const textValue = [cleanText(value), cleanText(status)].filter(Boolean).join(" ");
  if (/\u7248\u672c|\u66f4\u65b0|\u6d3b\u52a8|\u8054\u52a8|\u8d5b\u5b63|\u65b0\u6d3b\u52a8|\u65b0\u7248\u672c/.test(textValue)) return "\u7248\u672c\u66f4\u65b0";
  if (/\u5f00\u6d4b|\u6d4b\u8bd5|\u5185\u6d4b|\u516c\u6d4b|\u5220\u6863|\u4e0d\u5220\u6863|\u8ba1\u8d39/.test(textValue)) return "\u5f00\u6d4b";
  return "\u65b0\u6e38";
}

function normalizeHykbStatus(value) {
  const textValue = cleanText(value);
  if (/\u4eca\u65e5\u4e0a\u7ebf/.test(textValue)) return "\u4eca\u65e5\u4e0a\u7ebf";
  if (/\u5373\u5c06\u4e0a\u7ebf/.test(textValue)) return "\u5373\u5c06\u4e0a\u7ebf";
  if (/\u8054\u52a8/.test(textValue)) return "\u8054\u52a8";
  if (/\u7248\u672c|\u66f4\u65b0|\u8d5b\u5b63|\u8fd4\u573a/.test(textValue)) return "\u66f4\u65b0";
  if (/\u6d3b\u52a8|\u4e3b\u9898\u670d|\u9650\u65f6/.test(textValue)) return "\u6d3b\u52a8";
  if (/\u6d4b\u8bd5|\u5f00\u6d4b|\u9996\u6d4b|\u7ec8\u6d4b|\u62db\u52df/.test(textValue)) return "\u5f00\u6d4b";
  if (/\u4e0a\u7ebf|\u5f00\u653e\u4e0b\u8f7d|\u6b63\u5f0f\u4e0a\u7ebf|\u6b63\u5f0f\u5f00\u670d/.test(textValue)) return "\u4e0a\u7ebf";
  if (/\u9884\u7ea6|\u9884\u4e0b\u8f7d/.test(textValue)) return "\u9884\u7ea6";
  return "\u6d3b\u52a8";
}

function normalizeHykbEventType(value, status) {
  if (status === "\u66f4\u65b0" || status === "\u6d3b\u52a8" || status === "\u8054\u52a8" || /\u7248\u672c|\u66f4\u65b0|\u8d5b\u5b63|\u8054\u52a8|\u8fd4\u573a|\u6d3b\u52a8/.test(value)) return "\u7248\u672c\u66f4\u65b0";
  if (status === "\u5f00\u6d4b") return "\u5f00\u6d4b";
  return "\u65b0\u6e38";
}

function prioritizeUpdateContent(textValue, title, summary) {
  const cleanTextValue = cleanText(textValue).replace(title, " ").trim();
  const clauses = cleanTextValue
    .split(/(?<=。)|(?<=！)|(?<=？)|\s{2,}| (?=\d{1,2}:\d{2})/)
    .map((part) => cleanContentText(part))
    .filter(Boolean);
  const ranked = clauses
    .filter((part) => part !== summary && /(版本|赛季|联动|返场|上线|开启|新增|公测|定档|测试招募|招募)/.test(part))
    .sort((left, right) => contentScore(right) - contentScore(left));
  const fallback = clauses.filter((part) => part !== summary && part.length >= 8).sort((left, right) => contentScore(right) - contentScore(left));
  return mergeUnique([summary, ...ranked, ...fallback]).filter(Boolean).slice(0, 2).join("\n");
}

function cleanHykbSummary(value, title) {
  const cleanValue = cleanText(value).replace(title, " ").trim();
  const matches = cleanValue.match(/(\d{1,2}:\d{2}\s+.+|.+(版本|赛季|联动|返场|上线|开启|新增|公测|定档).*)/g) || [];
  const best = matches.sort((left, right) => contentScore(right) - contentScore(left))[0] || cleanValue;
  return cleanContentText(best).slice(0, 120);
}

function chooseStatus(currentStatus, nextStatus, currentContent = "", nextContent = "", currentSource = "", nextSource = "") {
  const pairs = [
    { status: nextStatus, text: nextContent, source: nextSource },
    { status: currentStatus, text: currentContent, source: currentSource },
    { status: nextStatus, text: "", source: nextSource },
    { status: currentStatus, text: "", source: currentSource },
  ];
  const weight = (status, text, source) => {
    let score = 40;
    if (/今日上线/.test(status)) score = 120;
    else if (/更新|活动/.test(status) && /(版本|赛季|联动|返场|新增|上线)/.test(text)) score = 110;
    else if (/上线|首发/.test(status)) score = 90;
    else if (/预约/.test(status)) score = 70;
    else if (/开测/.test(status)) score = 60;
    if (source === "九游") score -= /更新|活动/.test(status) ? 42 : 18;
    return score;
  };
  return pairs.sort((left, right) => weight(right.status || "", right.text || "", right.source || "") - weight(left.status || "", left.text || "", left.source || ""))[0]?.status || currentStatus || nextStatus;
}

function chooseEventType(currentType, nextType) {
  const order = ["版本更新", "新游", "开测"];
  return [currentType, nextType].sort((left, right) => order.indexOf(left) - order.indexOf(right))[0] || currentType || nextType;
}

function pickBestText(currentSummary = "", nextSummary = "", currentContent = "", nextContent = "") {
  const candidates = [currentSummary, nextSummary, currentContent, nextContent]
    .map(cleanContentText)
    .filter(Boolean)
    .sort((left, right) => contentScore(right) - contentScore(left));
  return candidates[0] || "";
}

function pickBestUpdateContent(currentContent = "", nextContent = "", currentSummary = "", nextSummary = "") {
  const candidates = [currentContent, nextContent, currentSummary, nextSummary]
    .map(cleanContentText)
    .filter(Boolean);
  const merged = [];
  for (const candidate of candidates.sort((left, right) => contentScore(right) - contentScore(left))) {
    if (!merged.some((existing) => existing.includes(candidate) || candidate.includes(existing) || isSameEventContent(existing, candidate))) {
      merged.push(candidate);
    }
  }
  return merged.slice(0, 2).join("\n");
}

function pickBestSourceText(candidates = []) {
  return candidates
    .map((candidate) => ({ ...candidate, value: cleanContentText(candidate.value) }))
    .filter((candidate) => candidate.value)
    .sort((left, right) => sourceContentScore(right) - sourceContentScore(left))[0]?.value || "";
}

function pickBestSourceUpdateContent(candidates = []) {
  const merged = [];
  for (const candidate of candidates
    .map((item) => ({ ...item, value: cleanContentText(item.value) }))
    .filter((item) => item.value)
    .sort((left, right) => sourceContentScore(right) - sourceContentScore(left))) {
    if (!merged.some((existing) => existing.includes(candidate.value) || candidate.value.includes(existing) || isSameEventContent(existing, candidate.value))) {
      merged.push(candidate.value);
    }
  }
  return merged.slice(0, 2).join("\n");
}

function sourceContentScore(candidate = {}) {
  const source = String(candidate.source || "");
  const value = cleanContentText(candidate.value || candidate.summary || candidate.updateContent || "");
  let score = contentScore(value);
  if (source === "好游快爆") score += 90;
  if (source === "TapTap") score += 45;
  if (source === "九游") score -= 35;
  if (source === "九游" && /^\d{1,2}月\d{1,2}日新活动$/.test(value)) score -= 80;
  if (source === "九游" && /^(新活动|活动|更新|上线|开测)$/.test(value)) score -= 100;
  return score;
}

function earliestEventAt(left, right) {
  return new Date(left) <= new Date(right) ? left : right;
}

function contentScore(value = "") {
  const textValue = cleanContentText(value);
  if (!textValue) return 0;
  let score = Math.min(textValue.length, 140);
  if (/(\u516c\u6d4b|\u5185\u6d4b|\u5f00\u670d|\u5f00\u6d4b|\u9996\u53d1|\u4e0a\u7ebf|\u6d4b\u8bd5|\u62db\u52df|\u8d44\u683c|\u7248\u672c|\u8d5b\u5b63|\u8054\u52a8|\u8fd4\u573a|\u66f4\u65b0|\u5f00\u542f|\u65b0\u589e|\u6d3b\u52a8)/.test(textValue)) score += 60;
  if (/^\u4e8e\d{1,2}\u6708\d{1,2}\u65e5/.test(textValue)) score += 26;
  if (/(\d{1,2}\u6708\d{1,2}\u65e5|\d{1,2}:\d{2}|\u4e0a\u5348\d{1,2}\u70b9|\u4e0b\u5348\d{1,2}\u70b9)/.test(textValue)) score += 34;
  if (/^\d{1,2}:\d{2}/.test(textValue)) score -= 20;
  if (/\u9884\u7ea6|\u4e0b\u8f7d|\u8bd5\u73a9/.test(textValue)) score -= 18;
  if (/\u597d\u6e38\u5feb\u7206APP\u63d0\u4f9b|\u4e5d\u6e38.*\u63d0\u4f9b|t\d+_|\u731c\u4f60\u559c\u6b22|-->|\[\u8be6\u60c5\]|\u6765\u81ea\u4e8e \u4e5d\u6e38APP|\u8c4c\u8c46|<[^>]+>|\u5feb\u901f\u9884\u7ea6|\u5feb\u901f\u4e0b\u8f7d|\u4ec0\u4e48\u65f6\u5019\u51fa/.test(textValue)) score -= 140;
  if (/^(\u9996\u53d1|\u9884\u7ea6|\u4e0a\u7ebf|\u5f00\u6d4b|\u52a8\u6001|\u6d3b\u52a8|\u63d0\u9192|\u8be6\u60c5)$/.test(textValue)) score -= 90;
  return score;
}

function cleanContentText(value = "") {
  const textValue = cleanText(stripHtmlNoise(value))
    .replace(/\u7f16\u8f91\u63a8\u8350/g, "")
    .replace(/\u529b\u8350\u4f73\u4f5c/g, "")
    .replace(/\u5fc5\u73a9\u795e\u4f5c/g, "")
    .replace(/Steam\u9ad8\u5206\u795e\u4f5c/g, "")
    .replace(/Steam\u79fb\u690d/g, "")
    .replace(/\u624b\u6e38\u72ec\u5360/g, "")
    .replace(/PC\u6e38\u620f/g, "")
    .replace(/\u591a\u5e73\u53f0/g, "")
    .replace(/\u6b63\u5f0f\u5f00\u653e\u4e0b\u8f7d/g, "\u6b63\u5f0f\u4e0a\u7ebf")
    .replace(/\u5f00\u653e\u4e0b\u8f7d/g, "\u4e0a\u7ebf")
    .replace(/\u5173\u6ce8/g, "")
    .replace(/\u4e0b\u8f7d/g, "")
    .replace(/\u8bd5\u73a9/g, "")
    .replace(/\u7edd\u8d5e\u7acb\u7ed8/g, "")
    .replace(/\u6781\u81f4\u89c6\u542c\u4eab\u53d7/g, "")
    .replace(/\u597d\u8bc4\u539f\u58f0\u97f3\u8f68/g, "")
    .replace(/\u534a\u5468\u5e74\u5e86\u5f00\u542f/g, "")
    .replace(/\u5f00\u542f\u56fd\u670d\u9996\u6d4b/g, "")
    .replace(/\b\d\.\d\b/g, "")
    .replace(/(\u4eca\u65e5\u4e0a\u7ebf|\u5373\u5c06\u4e0a\u7ebf|\u4e0a\u7ebf|\u9884\u7ea6|\u5f00\u6d4b|\u9996\u53d1|\u66f4\u65b0|\u6d3b\u52a8|\u8054\u52a8)(\s+\1)+/g, "$1")
    .replace(/(\u5c04\u51fb|\u7ade\u6280|\u641c\u6253\u64a4|\u52a8\u4f5c|\u89d2\u8272\u626e\u6f14|\u7b56\u7565|\u5361\u724c|\u591a\u4eba\u8054\u673a|\u975e\u5bf9\u79f0\u7ade\u6280)(\s+\1)+/g, "$1")
    .replace(/[|?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return collapseStatusSandwich(dedupeRepeatedContent(textValue));
}

function dedupeRepeatedContent(value = "") {
  const textValue = cleanText(value);
  if (textValue.length < 24) return textValue;
  const pieces = textValue
    .replace(/(?=\d{1,2}月\d{1,2}日|第四十四赛季|娱乐玩法|电竞系列|象牙塔剧情活动)/g, "\n")
    .split(/\n+|(?<=[。！？；;])/u)
    .map((piece) => piece.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (pieces.length < 2) return textValue;
  const seen = new Set();
  const unique = pieces.filter((piece) => {
    const key = piece.replace(/[\s，。！？；：:、,.!?]/g, "").toLowerCase();
    if (key.length < 8 || seen.has(key)) return key.length < 8;
    if ([...seen].some((existing) => existing.length >= 16 && (existing.includes(key) || key.includes(existing)))) return false;
    seen.add(key);
    return true;
  });
  return unique.join(" ") || textValue;
}

function hasStatusSandwich(value = "") {
  const textValue = cleanText(value);
  return ["更新", "活动", "联动", "开测", "上线"].some((word) => {
    const marker = ` ${word} `;
    const index = textValue.indexOf(marker);
    if (index <= 0) return false;
    const left = textValue.slice(0, index);
    const right = textValue.slice(index + marker.length);
    return isEquivalentContent(left, right);
  });
}

function collapseStatusSandwich(value = "") {
  const textValue = cleanText(value);
  for (const word of ["更新", "活动", "联动", "开测", "上线"]) {
    const marker = ` ${word} `;
    const index = textValue.indexOf(marker);
    if (index <= 0) continue;
    const left = textValue.slice(0, index).trim();
    const right = textValue.slice(index + marker.length).trim();
    if (isEquivalentContent(left, right)) return left.length >= right.length ? left : right;
  }
  return textValue;
}

function isEquivalentContent(left = "", right = "") {
  const normalize = (value) => cleanText(value)
    .replace(/[\s\uff0c\u3002\uff01\uff1f\u3001,.!?:\uff1a\u300a\u300b\u3010\u3011\u201c\u201d"'\uff08\uff09()\-]/g, "")
    .toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  return a === b || (a.length >= 6 && b.includes(a)) || (b.length >= 6 && a.includes(b));
}

function sourceError(source, error) {
  return { source, type: "抓取失败", detail: error?.message || String(error) };
}

function buildSourceDiagnostic(sourceKey, payload = {}, startedAt = Date.now(), error = null) {
  const records = payload.records || [];
  const fieldStats = buildFieldStats(records);
  const total = Math.max(records.length, 1);
  const score = Math.round(Object.values(fieldStats).reduce((sum, value) => sum + value, 0) / Object.keys(fieldStats).length / total * 100);
  return {
    sourceKey,
    strategy: payload.strategy || "html",
    discovered: Number(payload.staticRows) || records.length,
    fetched: records.length,
    succeeded: records.length,
    failed: (payload.issues || []).length + (error ? 1 : 0),
    durationMs: Math.max(0, Date.now() - startedAt),
    completeness: Number.isFinite(score) ? score : 0,
    fieldStats,
    issues: (payload.issues || []).map((issue) => ({
      type: issue.type || "问题",
      detail: issue.detail || issue.message || "",
    })).slice(0, 8),
  };
}

function buildFieldStats(records = []) {
  const has = (checker) => records.filter(checker).length;
  return {
    name: has((item) => item.gameName),
    time: has((item) => item.eventAt),
    status: has((item) => item.status || item.eventType),
    image: has((item) => item.iconUrl),
    detail: has((item) => item.detailUrl || item.originalUrl),
    vendor: has((item) => item.vendor || item.operator),
    tags: has((item) => (item.tags || item.gameplayTags || []).length),
    summary: has((item) => item.summary || item.updateContent),
  };
}

function needsRenderedFallback(records = []) {
  if (!records.length) return true;
  if (records.length < STATIC_MIN_RECORDS) return true;
  const missingCritical = records.filter((record) => !record.detailUrl || !record.iconUrl || !(record.tags || []).length).length;
  return missingCritical > Math.max(3, records.length * 0.35);
}

function needsMobileDetailFetch(record = {}) {
  if (!record.detailUrl) return false;
  const tags = record.tags || record.gameplayTags || [];
  if (record.sourceKey === "xiaoqi" && !hasXiaoqiPopularity(record)) return true;
  return !record.iconUrl || !record.vendor || !tags.length || !(record.summary || record.updateContent);
}

function shouldRefreshHykbDetail(record = {}) {
  if (record.sourceKey !== "hykb" || !record.detailUrl) return false;
  const textValue = [record.status, record.eventType, record.summary, record.updateContent].map(cleanText).join(" ");
  if (hasStatusSandwich(textValue)) return true;
  if (!/更新|活动|联动|版本|赛季|返场|新增|开启/.test(textValue)) return false;
  const eventTime = Date.parse(record.eventAt || "");
  if (!Number.isFinite(eventTime)) return true;
  const now = Date.now();
  const pastWindow = 14 * 24 * 60 * 60 * 1000;
  const futureWindow = 45 * 24 * 60 * 60 * 1000;
  return eventTime >= now - pastWindow && eventTime <= now + futureWindow;
}

function applyExistingMobileDetail(record = {}, sourceKey = "", existingData = {}) {
  const existing = findExistingMobileRecord(record, sourceKey, existingData);
  if (!existing) return false;
  if (!record.iconUrl && existing.iconUrl) record.iconUrl = existing.iconUrl;
  if (!record.vendor && existing.vendor) record.vendor = existing.vendor;
  if (!record.operator && existing.operator) record.operator = existing.operator;
  if (!record.subtitle && existing.subtitle) record.subtitle = existing.subtitle;
  if (!(record.summary || "").trim() && existing.summary) record.summary = existing.summary;
  if (!(record.updateContent || "").trim() && existing.updateContent) record.updateContent = existing.updateContent;
  const existingTags = existing.gameplayTags?.length ? existing.gameplayTags : existing.tags || [];
  if (!(record.tags || []).length && existingTags.length) record.tags = mergeUnique([record.status, record.eventType, ...existingTags]);
  return true;
}

function findExistingMobileRecord(record = {}, sourceKey = "", existingData = {}) {
  const sourceName = mobileSources[sourceKey]?.name || sourceKey;
  const pools = [
    ...(existingData.rawMobileRecords || []),
    ...(existingData.rawWelfareRecords || []),
    ...(existingData.mobileGames || []),
    ...(existingData.welfareGames || []),
  ];
  const detailKey = compactUrl(record.detailUrl || record.originalUrl || "");
  const titleKey = gameIdentity(record.gameName || "");
  return pools.find((item) => {
    const itemSource = item.source || item.sourceKey || item.platform || "";
    const sameSource = !sourceName || itemSource === sourceName || itemSource === sourceKey || (item.sources || []).includes(sourceName) || (item.sources || []).includes(sourceKey);
    if (!sameSource) return false;
    const itemUrl = compactUrl(item.detailUrl || item.originalUrl || "");
    if (detailKey && itemUrl && detailKey === itemUrl) return true;
    return Boolean(titleKey && gameIdentity(item.gameName || "") === titleKey);
  });
}

function compactUrl(value = "") {
  return String(value || "").split("#")[0].replace(/[?&]utm_[^=&]+=[^&]+/gi, "").replace(/[?&]$/, "").trim().toLowerCase();
}

function extractMeta(html = "", names = []) {
  const wanted = new Set(names.map((name) => String(name).toLowerCase()));
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = attr(tag, /(?:name|property)=["\']([^"\']+)["\']/i).toLowerCase();
    if (!wanted.has(key)) continue;
    const content = attr(tag, /content=["\']([^"\']+)["\']/i);
    if (content) return cleanText(content);
  }
  return "";
}
const VENDOR_LABELS = {
  publisher: ["\u53d1\u884c\u5546", "\u53d1\u884c", "\u4ee3\u7406\u53d1\u884c"],
  operator: ["\u8fd0\u8425\u5546", "\u4f9b\u5e94\u5546"],
  developer: ["\u5f00\u53d1\u5546", "\u5f00\u53d1\u8005", "\u5f00\u53d1\u56e2\u961f", "\u5f00\u53d1", "\u5382\u5546"],
};
const VENDOR_STOP_LABELS = [
  ...VENDOR_LABELS.publisher,
  ...VENDOR_LABELS.operator,
  ...VENDOR_LABELS.developer,
  "\u5b98\u65b9Q\u7fa4", "QQ\u7fa4", "Q\u7fa4", "\u9690\u79c1", "\u7528\u6237\u534f\u8bae", "\u5b98\u7f51",
  "\u9884\u7ea6", "\u4e0b\u8f7d", "\u8bc4\u5206", "\u5173\u6ce8", "\u4e91\u6e38\u620f", "\u81ea\u52a8\u62fe\u53d6", "\u81ea\u52a8", "\u5212\u5206", "\u4e0a\u5343\u5730\u56fe\u7b49\u4f60\u63a2\u7d22",
    "\u7b80\u4ecb", "\u6e38\u620f\u4ecb\u7ecd",
];

function extractVendor(bodyText = "") {
  const textValue = cleanText(bodyText);
  return choosePreferredVendor(
    extractAfterLabel(textValue, VENDOR_LABELS.publisher, VENDOR_STOP_LABELS),
    extractAfterLabel(textValue, VENDOR_LABELS.operator, VENDOR_STOP_LABELS),
    extractAfterLabel(textValue, VENDOR_LABELS.developer, VENDOR_STOP_LABELS),
  );
}

function choosePreferredVendor(...values) {
  const candidates = values.flatMap((value) => splitVendorCandidates(value)).map(cleanVendor).filter(Boolean);
  return mergeUnique(candidates)[0] || "";
}

function splitVendorCandidates(value = "") {
  const textValue = cleanText(value);
  if (!textValue) return [];
  const labels = [...VENDOR_LABELS.publisher, ...VENDOR_LABELS.operator, ...VENDOR_LABELS.developer];
  const candidates = [];
  for (const label of labels) {
    const index = textValue.indexOf(label);
    if (index < 0) continue;
    const tail = textValue.slice(index + label.length).replace(/^[:\uff1a\s]+/, "");
    const stop = VENDOR_STOP_LABELS
      .map((word) => tail.indexOf(word))
      .filter((pos) => pos > 0)
      .sort((a, b) => a - b)[0];
    candidates.push(stop ? tail.slice(0, stop) : tail);
  }
  candidates.push(textValue);
  return candidates;
}

function cleanVendor(value = "") {
  let vendor = cleanText(stripHtmlNoise(value))
    .replace(/^[:\uff1a\-\u2014\s]+/, "")
    .replace(/(\u5b98\u65b9)?Q\u7fa4\s*\d+.*/i, "")
    .replace(/QQ\u7fa4\s*\d+.*/i, "")
    .replace(/\s*\u52a0\u901f\u5668.*$/, "")
    .replace(/(\u5b98\u7f51|\u9884\u7ea6|\u4e0b\u8f7d|\u8bba\u575b|\u5ba2\u670d|\u9690\u79c1\u653f\u7b56|\u9690\u79c1|\u7528\u6237\u534f\u8bae|\u6743\u9650|\u7ea0\u7eb7\u5904\u7406|\u9002\u9f84\u63d0\u793a|\u6e38\u620f\u4ecb\u7ecd|\u7b80\u4ecb|\u66f4\u591a\u652f\u6301|\u540e\u7eed\u4fee\u590d|\u8bf7\u8010\u5fc3|PV\u516c\u5f00|\u5f00\u542f\u7ebf\u4e0b).*$/, "")
    .trim();

  const extracted = splitVendorCandidates(vendor).find((item) => item && item !== vendor);
  if (extracted) vendor = extracted;
  vendor = cleanText(vendor)
    .replace(/^(\u53d1\u884c\u5546|\u53d1\u884c|\u4ee3\u7406\u53d1\u884c|\u8fd0\u8425\u5546|\u4f9b\u5e94\u5546|\u5f00\u53d1\u5546|\u5f00\u53d1\u8005|\u5f00\u53d1\u56e2\u961f|\u5f00\u53d1|\u5382\u5546|\u8005)[:\uff1a\s]*/, "")
    .replace(/\s*更多\s*$/, "")
    .replace(/[\uff0c,\u3001\uff1b;].*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  vendor = vendor.replace(/(\u79d1\u6280|\u7f51\u7edc|\u4fe1\u606f|\u4e92\u52a8|\u4e92\u5a31)\u6709$/, "$1\u6709\u9650\u516c\u53f8");

  if (!vendor) return "";
  if (vendor.length < 2 || vendor.length > 36) return "";
  if (/\u76f8\u5173\u6e38\u620f|\u67e5\u770b\u5168\u90e8|\u8363\u8000\u65f6\u523b|ICP|\u5907\u6848|\u8425\u4e1a\u6267\u7167|\u521b\u4f5c\u8005\u4e2d\u5fc3|\u516c\u53f8\u5730\u5740|\u6295\u8bc9\u4e3e\u62a5|\u7248\u6743|\u8fdd\u6cd5|\u8bba\u575b|\u793c\u5305|\u653b\u7565|\u4e0b\u8f7d|\u9884\u7ea6|\u8bc4\u5206|\u5173\u6ce8|\u5e7f\u544a|\u5f00\u53d1\u8005\u7684\u8bdd|^\u7684\u8bdd|\u66f4\u591a\u652f\u6301|\u540e\u7eed\u4fee\u590d|\u8bf7\u8010\u5fc3|\u9690\u79c1|\u7528\u6237\u534f\u8bae|\u4fee\u590d|PV\u516c\u5f00|\u5f00\u542f\u7ebf\u4e0b/.test(vendor)) return "";
  if (/^(\u6682\u65e0|\u672a\u77e5|TapTap|\u4e5d\u6e38|\u597d\u6e38\u5feb\u7206|\u5b98\u65b9|\u5b98\u670d|\u6e20\u9053\u670d)$/.test(vendor)) return "";
  if (/^[A-Za-z0-9\u4e00-\u9fa5\u00b7]{2,18}$/.test(vendor)) return vendor;
  if (!/(\u516c\u53f8|\u6709\u9650\u516c\u53f8|\u5de5\u4f5c\u5ba4|\u79d1\u6280|\u7f51\u7edc|\u4e92\u52a8|\u6e38\u620f|\u4e92\u5a31|\u8f6f\u4ef6|\u4fe1\u606f|Tencent|NetEase|miHoYo|\u7c73\u54c8\u6e38|\u817e\u8baf|\u7f51\u6613|\u5de8\u4eba|\u897f\u5c71\u5c45|\u8389\u8389\u4e1d|\u6563\u7206|\u53e0\u7eb8|Superpop|Gaggle|Team 17|\u6f5c\u8247\u4f1f\u4f1f\u8ff7)/i.test(vendor)) return "";
  return vendor;
}

function cleanNineGameVendor(value = "") {
  const textValue = cleanText(stripHtmlNoise(value));
  const company = textValue.match(/公司名称\s*[:：]\s*([^\n|；;，,]+?)(?=统一社会信用代码|公司地址|联系地址|开发者|运营商|发行商|厂商|$)/i)?.[1] || textValue;
  return cleanVendor(company);
}

function extractNineGameHtmlVendor(html = "") {
  const candidates = [];
  for (const match of html.matchAll(/<div[^>]+class=["'][^"']*company[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)) {
    candidates.push(cleanText(match[1]));
  }
  for (const match of html.matchAll(/<[^>]+class=["'][^"']*timeline_tag_box[^"']*["'][^>]*>[\s\S]{0,260}?(?:发行商|开发者|开发商|厂商)[：:\s]*<\/[^>]+>\s*<[^>]+class=["'][^"']*timeline_content_small[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>[\s\S]{0,120}?<\/[^>]+>/gi)) {
    candidates.push(cleanText(match[1]));
  }
  for (const match of html.matchAll(/<[^>]+class=["'][^"']*timeline_content_small[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi)) {
    candidates.push(cleanText(match[1]));
  }
  for (const match of html.matchAll(/<(?:div|span|li)[^>]*>[\s\S]{0,80}?(?:\u53d1\u884c|\u53d1\u884c\u5546|\u5f00\u53d1|\u5f00\u53d1\u8005|\u5382\u5546)[\uff1a:\s]*([\s\S]{2,80}?)<\/(?:div|span|li)>/gi)) {
    candidates.push(cleanText(match[1]));
  }
  return choosePreferredVendor(...candidates);
}

function extractHykbHtmlVendor(html = "") {
  const candidates = [];
  for (const match of html.matchAll(/<li[^>]*>\s*<span[^>]*>\s*(?:\u53d1\u884c|\u53d1\u884c\u5546|\u5f00\u53d1|\u5f00\u53d1\u8005|\u5382\u5546)[\uff1a:\s]*<\/span>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi)) {
    candidates.push(cleanText(match[1]));
  }
  for (const match of html.matchAll(/<(?:li|p|div)[^>]*>[\s\S]{0,80}?(?:\u53d1\u884c|\u53d1\u884c\u5546|\u5f00\u53d1|\u5f00\u53d1\u8005|\u5382\u5546)[\uff1a:\s]*([\s\S]{2,80}?)<\/(?:li|p|div)>/gi)) {
    candidates.push(cleanText(match[1]));
  }
  return choosePreferredVendor(...candidates);
}

function extractNineGameVendor(bodyText = "") {
  return choosePreferredVendor(
    extractAfterLabel(bodyText, VENDOR_LABELS.publisher, VENDOR_STOP_LABELS),
    extractAfterLabel(bodyText, VENDOR_LABELS.operator, VENDOR_STOP_LABELS),
    extractAfterLabel(bodyText, VENDOR_LABELS.developer, VENDOR_STOP_LABELS),
    extractVendor(bodyText),
  );
}

function extractHykbVendor(bodyText = "") {
  return choosePreferredVendor(
    extractAfterLabel(bodyText, VENDOR_LABELS.publisher, VENDOR_STOP_LABELS),
    extractAfterLabel(bodyText, VENDOR_LABELS.operator, VENDOR_STOP_LABELS),
    extractAfterLabel(bodyText, VENDOR_LABELS.developer, VENDOR_STOP_LABELS),
    extractVendor(bodyText),
  );
}

function extractNineGameUpdateText(textValue = "") {
  return extractAfterLabel(textValue, ["公测", "定档", "上线", "首发", "开测", "测试招募", "预约", "版本更新", "活动", "联动"], ["简介", "开发者", "厂商", "运营商", "发行商"]);
}

function extractAfterLabel(value = "", labels = [], stopLabels = []) {
  const textValue = cleanText(value);
  if (!textValue) return "";
  for (const label of labels) {
    const index = textValue.indexOf(label);
    if (index < 0) continue;
    const tail = cleanText(textValue.slice(index + label.length)).replace(/^[:：\s]+/, "");
    if (!tail) continue;
    const stopIndex = stopLabels
      .map((stop) => tail.indexOf(stop))
      .filter((position) => position > 0)
      .sort((left, right) => left - right)[0];
    const candidate = cleanText(stopIndex ? tail.slice(0, stopIndex) : tail);
    if (candidate) return candidate.slice(0, 320);
  }
  return "";
}

function extractDetailTags(html = "", bodyText = "") {
  return mergeGameplayTags([
    ...extractClassTagTexts(html),
    ...extractLabelTextCandidates(bodyText),
  ]);
}

function extractTapTapDetailTags(html = "", bodyText = "") {
  const tags = [
    ...extractTapTapStructuredTags(html),
    ...extractClassTagTexts(html),
    ...extractLabelTextCandidates(bodyText),
    ...extractTapTapFaqTags(html, bodyText),
  ];
  if (/Steam移植/.test(html) || /Steam移植/.test(bodyText)) tags.push("Steam移植");
  return mergeGameplayTags(tags);
}

function extractTapTapStructuredTags(html = "") {
  const tags = [];
  for (const match of html.matchAll(/<script type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = cleanText(match[1]);
    if (!raw) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    collectTapTapJsonTags(data, tags);
  }
  return tags;
}

function collectTapTapJsonTags(node, tags) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectTapTapJsonTags(item, tags);
    return;
  }
  if (typeof node !== "object") return;

  const type = cleanText(node["@type"] || node.type || "");
  if (node.genre) tags.push(...splitTagText(node.genre));
  if (node.applicationSubCategory) tags.push(...splitTagText(node.applicationSubCategory));
  if (type === "FAQPage") collectTapTapFaqNodeTags(node.mainEntity, tags);
}

function collectTapTapFaqNodeTags(node, tags) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectTapTapFaqNodeTags(item, tags);
    return;
  }
  if (typeof node !== "object") return;
  const question = cleanText(node.name || node.headline || "");
  const answer = cleanText(node.acceptedAnswer?.text || node.text || "");
  if (question && /标签|玩法|类型|题材/.test(question)) {
    tags.push(...splitTagText(answer));
  }
}

function extractHykbDetailTags(html = "", bodyText = "") {
  const tags = [
    ...extractHykbTagTexts(html),
    ...extractLabelTextCandidates(bodyText),
  ];
  return mergeGameplayTags(tags);
}

function extractNineGameDetailTags(html = "", bodyText = "") {
  const tags = [
    ...extractNineGameCloudTags(html),
    ...extractNineGameTypeTexts(html),
    ...extractClassTagTexts(html),
    ...extractLabelTextCandidates(bodyText),
  ];
  return mergeGameplayTags(tags);
}

function extractClassTagTexts(html = "") {
  const tags = [];
  for (const match of html.matchAll(/<[^>]+class=["'][^"']*(?:tag|label|type|category|classify|point)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi)) {
    const value = cleanText(match[1]);
    if (value) tags.push(...value.split(/[\s,，/、|]+/).map(cleanText));
  }
  return tags;
}

function extractLabelTextCandidates(bodyText = "") {
  const textValue = cleanText(bodyText);
  const tags = [];
  for (const match of textValue.matchAll(/(?:类型|标签|分类|玩法|题材)[:：\s]{0,4}([^。\n]{2,100})/g)) {
    tags.push(...match[1].split(/[\s,，/、|]+/).map(cleanText));
  }
  for (const match of textValue.matchAll(/(?:游戏标签|玩法标签|标签包括|标签为|标签有|游戏玩法)[:：\s]{0,4}([^。\n]{2,120})/g)) {
    tags.push(...match[1].split(/[\s,，/、|]+/).map(cleanText));
  }
  return tags;
}

function extractTapTapFaqTags(html = "", bodyText = "") {
  const tags = [];
  const textValue = cleanText([bodyText, html].join(" "));
  for (const match of textValue.matchAll(/(?:有哪些游戏标签|游戏标签|标签包括)[:：\s]{0,4}([^。！？\n]{2,120})/g)) {
    tags.push(...splitTagText(match[1]));
  }
  for (const match of html.matchAll(/"name":"([^"]+?)有哪些游戏标签？"[\s\S]*?"text":"([^"]{2,180})"/g)) {
    tags.push(...splitTagText(match[2]));
  }
  return tags;
}

function splitTagText(value = "") {
  return cleanText(value)
    .split(/[\s,，、/|]+/)
    .map(cleanText)
    .filter(Boolean);
}

function extractHykbTagTexts(html = "") {
  const tags = [];
  for (const block of html.matchAll(/<div class=["'][^"']*lb-tags[^"']*["'][\s\S]*?<ul class=["'][^"']*cf[^"']*["']>([\s\S]*?)<\/ul>/gi)) {
    const chunk = block[1];
    for (const match of chunk.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      const value = cleanText(stripTags(match[1]));
      if (value) tags.push(...splitTagText(value));
    }
    for (const match of chunk.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)) {
      const value = cleanText(stripTags(match[1]));
      if (value) tags.push(...splitTagText(value));
    }
  }
  for (const match of html.matchAll(/<p class=["'][^"']*tags[^"']*["']>([\s\S]*?)<\/p>/gi)) {
    const value = cleanText(stripTags(match[1]));
    if (value) tags.push(...splitTagText(value));
  }
  return tags;
}

function extractNineGameTypeTexts(html = "") {
  const tags = [];
  for (const match of html.matchAll(/<div class=["']ngame-types["'][\s\S]*?类型：([\s\S]*?)<\/div>/gi)) {
    const value = cleanText(match[1]);
    if (value) tags.push(...value.split(/[\s,，/、|]+/).map(cleanText));
  }
  return tags;
}

function extractNineGameCloudTitle(html = "") {
  return cleanText(
    text(html, /<[^>]+class=["'][^"']*topbanner--title[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i),
  );
}

function extractNineGameCloudIcon(html = "") {
  return attr(html, /<img[^>]+class=["'][^"']*topbanner--icon_game[^"']*["'][^>]+src=["']([^"']+)["']/i) ||
    attr(html, /<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*topbanner--icon_game[^"']*["']/i);
}

function extractNineGameCloudTags(html = "") {
  const tags = [];
  for (const match of html.matchAll(/<[^>]+class=["'][^"']*topbanner--tag_text[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi)) {
    tags.push(...splitTagText(match[1]));
  }
  return tags;
}

function extractNineGameScheduleText(html = "") {
  return cleanContentText(
    extractNineGameCloudTimelineUpdate(html) ||
    extractNineGameCloudEventText(html) ||
    extractNineGameAndroidScheduleText(html),
  );
}

function extractNineGameAndroidScheduleText(html = "") {
  const blocks = Array.from(html.matchAll(/<div[^>]+class=["']ngame-types["'][^>]*>([\s\S]*?)<\/div>/gi)).map((match) => match[1]);
  for (const block of blocks) {
    if (!/安卓|iOS|苹果/.test(block)) continue;
    const dateText = cleanText(text(block, /<span[^>]+class=["'][^"']*org[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    const eventText = cleanText(text(block, /<span[^>]+class=["'][^"']*point[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    const value = [dateText, eventText].filter(Boolean).join("");
    if (value) return value;
  }
  return "";
}

function extractNineGameCloudEventText(html = "") {
  return cleanText(
    text(html, /<[^>]+class=["'][^"']*game_event_info[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i),
  );
}

function extractNineGameCloudTimelineUpdate(html = "") {
  for (const match of html.matchAll(/<[^>]+class=["'][^"']*timeline--horizontal_layout_item[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>\s*<\/[^>]+>/gi)) {
    const block = match[1];
    const dayText = cleanText(text(block, /<[^>]+class=["'][^"']*timeline--time_text[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i));
    const infoText = cleanText(text(block, /<[^>]+class=["'][^"']*timeline--info_(?:true|false)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i));
    const eventText = cleanNineGameCloudTimelineText(dayText, infoText);
    if (eventText) return eventText;
  }
  const fallback = extractNineGameCloudEventText(html);
  return fallback;
}

function cleanNineGameCloudTimelineText(dayText = "", infoText = "") {
  const day = cleanText(dayText).replace(/^(\d{1,2})\.(\d{1,2})$/, (_, month, date) => `${Number(month)}月${Number(date)}日`);
  const info = cleanText(infoText).replace(/\s*更新[:：]\s*/g, "更新：");
  return cleanContentText([day, info].filter(Boolean).join(" "));
}


function extractEventSentences(value = "", title = "", limit = 2, eventAt = "") {
  const textValue = cleanText(value).replace(cleanText(title), " ");
  if (!textValue) return "";
  const candidates = [];
  const eventPattern = /(?:(?:\d{1,2}\u6708\d{1,2}\u65e5(?:[\uff08(][^\uff09)]{1,12}[\uff09)])?|\d{1,2}[\/-]\d{1,2}|\d{1,2}:\d{2}|\u4eca\u5929|\u4eca\u65e5|\u660e\u5929|\u540e\u5929|\u6628\u5929)[^\u3002\uff01\uff1f]{0,120})?(?:\u516c\u6d4b|\u5185\u6d4b|\u5f00\u670d|\u5f00\u6d4b|\u9996\u53d1|\u4e0a\u7ebf|\u5b9a\u6863|\u6d4b\u8bd5|\u62db\u52df|\u9884\u7ea6|\u7248\u672c|\u66f4\u65b0|\u6d3b\u52a8|\u8054\u52a8|\u8d5b\u5b63|\u65b0\u589e|\u5f00\u542f|\u4e0d\u5220\u6863|\u5220\u6863|\u8d44\u683c)[^\u3002\uff01\uff1f]{0,160}/g;
  for (const match of textValue.matchAll(eventPattern)) {
    const candidate = cleanEventSentence(match[0], title, eventAt);
    if (candidate) candidates.push(candidate);
  }
  for (const part of textValue.split(/\n+|(?<=[\u3002\uff01\uff1f])|\s{2,}/)) {
    const candidate = cleanEventSentence(part, title, eventAt);
    if (candidate && isEventSentence(candidate)) candidates.push(candidate);
  }

  const kept = [];
  for (const candidate of mergeUnique(candidates).sort((left, right) => eventDateScore(right, eventAt) - eventDateScore(left, eventAt) || eventSentenceScore(right) - eventSentenceScore(left))) {
    if (kept.some((existing) => isSimilarContent(existing, candidate))) continue;
    kept.push(candidate);
    if (kept.length >= limit) break;
  }
  return kept.join("\n");
}

function eventDateScore(value = "", eventAt = "") {
  if (!eventAt) return 0;
  const date = new Date(eventAt);
  if (Number.isNaN(date.getTime())) return 0;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const textValue = cleanText(value);
  const dates = [
    ...textValue.matchAll(/(\d{1,2})月(\d{1,2})日/g),
    ...textValue.matchAll(/(?:20\d{2}[.\/-])?(\d{1,2})[.\/-](\d{1,2})(?:日)?/g),
  ].map((match) => `${Number(match[1])}-${Number(match[2])}`);
  if (!dates.length) return 10;
  return dates.includes(`${month}-${day}`) ? 100 : -20;
}

function cleanEventSentence(value = "", title = "", eventAt = "") {
  let textValue = cleanContentText(value)
    .replace(/^[:\uff1a\-\u2014\s]+/, "")
    .replace(/\s*(\u5b98\u65b9|\u5b98\u670d)?(\u4e0b\u8f7d|\u9884\u7ea6|\u793c\u5305|\u653b\u7565|\u8bba\u575b|\u4e13\u533a).*$/g, "")
    .replace(/\u597d\u6e38\u5feb\u7206APP\u63d0\u4f9b.*?(\u9884\u7ea6|\u4e0b\u8f7d)/g, "")
    .replace(/\u4e5d\u6e38.*?\u63d0\u4f9b.*?(\u9884\u7ea6|\u4e0b\u8f7d|\u653b\u7565)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const cleanTitle = cleanText(title);
  if (cleanTitle) {
    textValue = textValue
      .replace(new RegExp("^" + escapeRegExp(cleanTitle) + "[\\s:\\uff1a\\-\\u2014]+"), "")
      .replace(new RegExp("[\\s:\\uff1a\\-\\u2014]+" + escapeRegExp(cleanTitle) + "$"), "");
  }
  textValue = normalizeEventDateText(textValue, eventAt);
  if (textValue.length > 220) textValue = textValue.slice(0, 217).trim() + "...";
  if (textValue.length < 6) return "";
  if (/^(\u9884\u7ea6|\u9996\u53d1|\u4e0a\u7ebf|\u5f00\u6d4b|\u66f4\u65b0|\u6d3b\u52a8|\u8054\u52a8|\u63d0\u9192|\u8be6\u60c5)$/.test(textValue)) return "";
  if (/^(?:\d{1,2}[-/]\d{1,2}|\d{1,2}\u6708\d{1,2}\u65e5)?\s*(?:\d{1,2}:\d{2})?\s*(\u8ba1\u8d39\u5220\u6863\u5185\u6d4b|\u65b0\u7248\u672c|\u65b0\u6d3b\u52a8|\u63d0\u9192)$/.test(textValue)) return "";
  if (/\u76f4\u64ad$/.test(textValue) && textValue.length < 40) return "";
  return textValue;
}

function isEventSentence(value = "") {
  const textValue = cleanContentText(value);
  return /(\u516c\u6d4b|\u5185\u6d4b|\u5f00\u670d|\u5f00\u6d4b|\u9996\u53d1|\u4e0a\u7ebf|\u5b9a\u6863|\u6d4b\u8bd5|\u62db\u52df|\u7248\u672c|\u66f4\u65b0|\u6d3b\u52a8|\u8054\u52a8|\u8d5b\u5b63|\u65b0\u589e|\u5f00\u542f|\u4e0d\u5220\u6863|\u5220\u6863)/.test(textValue)
    && !/(\u4e0b\u8f7d|\u793c\u5305|\u653b\u7565|\u600e\u4e48\u73a9|\u8bba\u575b|\u5ba2\u670d|\u9690\u79c1|\u7528\u6237\u534f\u8bae)/.test(textValue);
}

function eventSentenceScore(value = "") {
  const textValue = cleanContentText(value);
  let score = contentScore(textValue);
  if (/(\u516c\u6d4b|\u5185\u6d4b|\u5f00\u670d|\u5f00\u6d4b|\u4e0d\u5220\u6863|\u5220\u6863)/.test(textValue)) score += 80;
  if (/(\u7248\u672c|\u66f4\u65b0|\u8d5b\u5b63|\u65b0\u589e)/.test(textValue)) score += 75;
  if (/(\u6d3b\u52a8|\u8054\u52a8)/.test(textValue)) score += 70;
  if (/(\d{1,2}\u6708\d{1,2}\u65e5|\d{1,2}:\d{2}|\u4eca\u5929|\u660e\u5929|\u540e\u5929)/.test(textValue)) score += 30;
  if (/^(\u9884\u7ea6|\u9996\u53d1|\u4e0a\u7ebf|\u5f00\u6d4b)/.test(textValue) && textValue.length < 16) score -= 60;
  return score;
}

function extractHtmlBlockText(html = "", pattern) {
  const match = html.match(pattern);
  return match ? cleanText(match[0]) : "";
}

function extractHykbPriorityUpdate(html = "", bodyText = "", title = "", eventAt = "") {
  const notice = text(html, /<a[^>]+id=["']game_open_log_a["'][^>]*>([\s\S]*?)<\/a>/i);
  const noticeEvent = extractEventSentences(notice, title, 1, eventAt);
  if (noticeEvent) return noticeEvent;

  const importantBlocks = [];
  for (const match of html.matchAll(/<[^>]+class=["'][^"']*(?:open|notice|time|news|test|activity|event|log)[^"']*["'][^>]*>[\s\S]{0,900}?(?:\u516c\u6d4b|\u5185\u6d4b|\u5f00\u670d|\u5f00\u6d4b|\u9996\u53d1|\u4e0a\u7ebf|\u6d4b\u8bd5|\u62db\u52df|\u7248\u672c|\u66f4\u65b0|\u6d3b\u52a8|\u8054\u52a8|\u8d5b\u5b63|\u8d44\u683c)[\s\S]{0,900}?(?:<\/div>|<\/li>|<\/p>|<\/a>)/gi)) {
    importantBlocks.push(cleanText(match[0]));
  }
  const importantEvent = extractEventSentences(importantBlocks.join("\n"), title, 1, eventAt);
  if (importantEvent) return importantEvent;

  const updateRows = [];
  for (const match of html.matchAll(/(20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2})([\s\S]{0,420}?)(?=20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2}|<\/table>|<\/ul>|<\/div>\s*<\/div>|$)/gi)) {
    const value = cleanText(match[1] + " " + match[2]);
    if (value) updateRows.push(value);
  }
  const rowEvent = extractEventSentences(updateRows.join("\n"), title, 1, eventAt);
  if (rowEvent) return rowEvent;

  const updateBlocks = [];
  for (const match of html.matchAll(/<li[^>]*>[\s\S]{0,300}?(?:\u516c\u6d4b|\u5185\u6d4b|\u5f00\u670d|\u5f00\u6d4b|\u7248\u672c|\u66f4\u65b0|\u6d3b\u52a8|\u8054\u52a8|\u8d5b\u5b63|\u4e0a\u7ebf)[\s\S]{0,300}?<\/li>/gi)) {
    updateBlocks.push(cleanText(match[0]));
  }
  const blockEvent = extractEventSentences(updateBlocks.join("\n"), title, 1, eventAt);
  if (blockEvent) return blockEvent;
  return extractEventSentences(bodyText, title, 1, eventAt);
}

function extractNineGamePriorityUpdate(html = "", bodyText = "", title = "", scheduleText = "") {
  const newsUpdate = extractNineGameNewsUpdate(html, title, scheduleText);
  if (newsUpdate) return newsUpdate;
  if (scheduleText && isUsefulNineGameUpdate(scheduleText)) return scheduleText;

  const events = [];
  for (const match of html.matchAll(/<[^>]+class=["'][^"']*game_event_info[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi)) {
    events.push(cleanText(match[1]));
  }
  for (const match of html.matchAll(/<li[^>]*class=["'][^"']*android[^"']*["'][^>]*>[\s\S]*?<span class=["']d["']>([\s\S]*?)<\/span>[\s\S]*?<span class=["']t["']>([\s\S]*?)<\/span>[\s\S]*?<p class=["']des["']>([\s\S]*?)<\/p>[\s\S]*?<\/li>/gi)) {
    const value = cleanText(match[1]) + " " + cleanText(match[2]) + " " + cleanText(match[3]);
    if (value.trim()) events.push(value);
  }
  for (const match of html.matchAll(/(\d{1,2}-\d{1,2})\s+(\d{1,2}:\d{2})<\/span>\s*<span class=["']point["']>([\s\S]*?)<\/span>/gi)) {
    const value = cleanText(match[1]) + " " + cleanText(match[2]) + " " + cleanText(match[3]);
    if (value.trim()) events.push(value);
  }
  for (const match of html.matchAll(/<span[^>]+class=["'][^"']*point[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)) {
    const value = cleanText(match[1]);
    if (value.trim()) events.push(value);
  }
  const directEvent = events.map((value) => cleanEventSentence(value, title)).find(Boolean);
  if (directEvent) return directEvent;
  const eventText = extractEventSentences(events.join("\n"), title, 2);
  if (eventText) return eventText;

  const titles = [];
  for (const match of html.matchAll(/<a[^>]+title=["']([^"']*(?:\u516c\u6d4b|\u5185\u6d4b|\u5f00\u670d|\u5f00\u6d4b|\u7248\u672c|\u66f4\u65b0|\u6d3b\u52a8|\u8054\u52a8|\u4e0a\u7ebf|\u5b9a\u6863|\u9996\u53d1)[^"']*)["']/gi)) {
    titles.push(cleanText(match[1]));
  }
  return extractEventSentences(titles.join("\n"), title, 2);
}

function extractNineGameNewsUpdate(html = "", title = "", scheduleText = "") {
  const candidates = [];
  for (const match of html.matchAll(/<a[^>]+(?:title=["']([^"']+)["'][^>]*|[^>]*data-statis=["'][^"']*(?:jdtt|news)[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
    const value = cleanText(match[1] || stripTags(match[2]));
    if (value) candidates.push(value);
  }
  const cleanTitle = cleanText(title);
  const preferred = candidates
    .map(cleanContentText)
    .filter((value) => value && isUsefulNineGameUpdate(value))
    .filter((value) => !scheduleText || referencesNineGameScheduleDate(value, scheduleText))
    .filter((value) => !hasConflictingNineGameDate(value, scheduleText))
    .filter((value) => !hasConflictingNineGameDayOnly(value, scheduleText))
    .filter((value) => !cleanTitle || value.includes(cleanTitle) || value.length >= 8)
    .sort((left, right) => contentScore(right) - contentScore(left));
  return preferred[0] || "";
}

function referencesNineGameScheduleDate(value = "", scheduleText = "") {
  const schedule = parseNineGameMonthDay(scheduleText);
  if (!schedule) return true;
  const dates = extractNineGameMonthDays(value);
  if (dates.some((date) => date.month === schedule.month && date.day === schedule.day)) return true;
  if (dates.length) return false;
  const days = [...cleanText(value).matchAll(/(?:^|\D)(\d{1,2})日/g)].map((match) => Number(match[1]));
  return days.includes(schedule.day);
}

function hasConflictingNineGameDayOnly(value = "", scheduleText = "") {
  const schedule = parseNineGameMonthDay(scheduleText);
  if (!schedule) return false;
  const textValue = cleanText(value);
  if (extractNineGameMonthDays(textValue).length) return false;
  const days = [...textValue.matchAll(/(?:^|\D)(\d{1,2})日/g)].map((match) => Number(match[1]));
  if (!days.length) return false;
  return days.every((day) => day !== schedule.day);
}

function hasConflictingNineGameDate(value = "", scheduleText = "") {
  const schedule = parseNineGameMonthDay(scheduleText);
  if (!schedule) return false;
  const dates = extractNineGameMonthDays(value);
  if (!dates.length) return false;
  return dates.every((date) => date.month !== schedule.month || date.day !== schedule.day);
}

function parseNineGameMonthDay(value = "") {
  return extractNineGameMonthDays(value)[0] || null;
}

function extractNineGameMonthDays(value = "") {
  const textValue = cleanText(value);
  const dates = [];
  for (const match of textValue.matchAll(/(\d{1,2})月(\d{1,2})日/g)) {
    dates.push({ month: Number(match[1]), day: Number(match[2]) });
  }
  for (const match of textValue.matchAll(/(?:^|\D)(\d{1,2})[-.](\d{1,2})(?:\D|$)/g)) {
    dates.push({ month: Number(match[1]), day: Number(match[2]) });
  }
  return dates.filter((date) => date.month >= 1 && date.month <= 12 && date.day >= 1 && date.day <= 31);
}

function extractTapTapPriorityUpdate(html = "", bodyText = "") {
  const focused = [
    extractHtmlBlockText(html, /<[^>]+class=["'][^"']*app-new-version[^"']*["'][\s\S]{0,2400}/i),
    extractHtmlBlockText(html, /<[^>]+class=["'][^"']*(?:header|title|notice|update)[^"']*["'][\s\S]{0,1200}/i),
    ...Array.from(html.matchAll(/<[^>]+class=["'][^"']*app-new-version[^"']*["'][^>]*>[\s\S]{0,500}?<\/[^>]+>/gi)).map((match) => cleanText(match[0])),
  ].filter(Boolean).join(" ");
  return extractEventSentences([focused, bodyText].filter(Boolean).join(" "), "", 2);
}

function extractIntroText(bodyText = "") {
  const textValue = cleanText(bodyText);
  const match = textValue.match(/(?:游戏简介|简介|游戏介绍|介绍)[:：\s]{0,4}(.{20,260}?)(?:游戏截图|游戏特色|相关推荐|相关资讯|更新日志|玩家评论|展开|收起|$)/);
  return cleanText(match?.[1] || "");
}

function extractUpdateText(bodyText = "") {
  const textValue = cleanText(bodyText);
  const match = textValue.match(/(?:更新日志|版本更新|最新动态|开发者的话|游戏特色)[:：\s]{0,4}(.{20,300}?)(?:游戏简介|相关推荐|相关资讯|玩家评论|展开|收起|$)/);
  return cleanText(match?.[1] || "");
}

async function fetchHtml(url, encoding = "utf8") {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 NewgameWikiCrawler/0.3",
          "accept-language": "zh-CN,zh;q=0.9",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      return encoding === "utf8" ? buffer.toString("utf8") : iconv.decode(buffer, encoding);
    } catch (error) {
      lastError = error?.name === "AbortError" ? new Error(`${url} 请求超时`) : error;
      if (attempt === 0) await sleep(350);
    } finally {
      clearTimeout(timer);
    }
  }
  if (firecrawlConfigured() && process.env.NEWWIKI_FIRECRAWL_FALLBACK !== "0") {
    try {
      return await scrapeHtmlWithFirecrawl(url, { onlyMainContent: false });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function attr(value, pattern) {
  return value.match(pattern)?.[1] || "";
}

function text(value, pattern) {
  return stripTags(value.match(pattern)?.[1] || "");
}

function between(value, start, end) {
  const left = value.indexOf(start);
  if (left < 0) return "";
  const right = value.indexOf(end, left + start.length);
  return right < 0 ? value.slice(left) : value.slice(left, right);
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, " ");
}

function cleanText(value = "") {
  return decodeEntities(stripTags(String(value))).replace(/\\n/g, "\n")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitGameTitle(value = "") {
  const raw = cleanText(value);
  if (!raw) return { gameName: "", subtitle: "" };

  const protectedNames = [
    "像素火影-次世代",
    "BSide： Olivia Lin",
    "BSide: Olivia Lin",
    "阿比斯少年冒险团",
  ];

  if (protectedNames.includes(raw)) {
    return { gameName: raw, subtitle: "" };
  }

  let gameName = raw;
  const subtitles = [];

  const bracketMatches = [...raw.matchAll(/[（(]([^（）()]{1,24})[）)]/g)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  if (bracketMatches.length) {
    subtitles.push(...bracketMatches);
    gameName = gameName.replace(/[（(][^（）()]{1,24}[）)]/g, " ");
  }

  const dashMatch = gameName.match(/^(.*?)[\s\-—–－]+([^()（）\s].{1,24})$/);
  if (dashMatch) {
    const left = cleanText(dashMatch[1]);
    const right = cleanText(dashMatch[2]);
    if (left && right && !/^\d+$/.test(right)) {
      gameName = left;
      subtitles.push(right);
    }
  }

  return {
    gameName: cleanText(gameName),
    subtitle: mergeUnique(subtitles.map(cleanText)).join(" / "),
  };
}

function decodeEntities(value = "") {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] || match);
}
function normalizeUrl(url, base) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  try {
    return new URL(url, base).toString();
  } catch {
    return "";
  }
}

function normalizeImage(value, base) {
  if (Array.isArray(value)) return normalizeUrl(value[0], base);
  return normalizeUrl(value, base);
}

function stableId(prefix, value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`;
}

function toChinaIso(value) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date).replace(" ", "T");
  return `${parts}+08:00`;
}

function toChinaIsoFromUnix(value) {
  const timestamp = Number(value);
  if (!timestamp) return "";
  return toChinaIso(new Date(timestamp * 1000));
}

function todayInChina() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function compareDate(left, right) {
  return left.localeCompare(right);
}

function normalizeXiaoqiDiscount(value) {
  const discount = cleanText(value);
  if (!discount || discount === "0" || discount === "0.00") return "";
  if (/折$/.test(discount)) return discount;
  return `${discount}折`;
}

function parsePeopleCount(value) {
  const textValue = cleanText(value);
  if (!textValue) return 0;
  const match = textValue.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (!match) return 0;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * (match[2] ? 10000 : 1));
}

function formatPeopleCount(value) {
  const count = Number(value) || 0;
  if (!count) return "";
  if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1).replace(/\.0$/, "")}万`;
  return count.toLocaleString("zh-CN");
}

function buildXiaoqiPopularity({ kind = "", playerCount = 0, reservationCount = 0 } = {}) {
  const isReserve = kind === "预约";
  const parsedPlayer = parsePeopleCount(playerCount);
  const parsedReservation = parsePeopleCount(reservationCount);
  const count = isReserve ? parsedReservation : parsedPlayer;
  return {
    playerCount: parsedPlayer,
    reservationCount: parsedReservation,
    text: count ? `${formatPeopleCount(count)}人${isReserve ? "预约" : "在玩"}` : "",
  };
}

function applyXiaoqiPopularity(record = {}, popularity = {}) {
  if (!popularity || typeof popularity !== "object") return false;
  let changed = false;
  if (Number(popularity.playerCount) > 0 && !(Number(record.playerCount) > 0)) {
    record.playerCount = Number(popularity.playerCount);
    changed = true;
  }
  if (Number(popularity.reservationCount) > 0 && !(Number(record.reservationCount) > 0)) {
    record.reservationCount = Number(popularity.reservationCount);
    changed = true;
  }
  if (Number(popularity.downloadCount) > 0 && !(Number(record.downloadCount) > 0)) {
    record.downloadCount = Number(popularity.downloadCount);
    changed = true;
  }
  if (popularity.welfareKind && !record.welfareKind) {
    record.welfareKind = popularity.welfareKind;
    changed = true;
  }
  if (popularity.text && !record.popularityText) {
    record.popularityText = popularity.text;
    changed = true;
  }
  return changed;
}

function hasXiaoqiPopularity(item = {}) {
  return Boolean(item.popularityText) || Number(item.playerCount) > 0 || Number(item.reservationCount) > 0 || Number(item.downloadCount) > 0;
}

function collectXiaoqiPeopleTexts(node, texts = [], seen = new Set()) {
  if (node == null || seen.has(node)) return texts;
  if (typeof node === "string") {
    const value = cleanText(node);
    if (/\d/.test(value) && /人/.test(value) && /(在玩|预约)/.test(value)) texts.push(value);
    return texts;
  }
  if (typeof node !== "object") return texts;
  seen.add(node);
  if (Array.isArray(node)) node.forEach((item) => collectXiaoqiPeopleTexts(item, texts, seen));
  else Object.values(node).forEach((item) => collectXiaoqiPeopleTexts(item, texts, seen));
  return texts;
}

function parseXiaoqiDetailPopularity(buttonText = "", countText = "") {
  const action = cleanText(buttonText);
  const count = parsePeopleCount(countText);
  if (!count) return {};
  if (/预约/.test(action)) {
    return { reservationCount: count, welfareKind: "预约", text: `${formatPeopleCount(count)}人预约` };
  }
  if (/下载|开始|进入|在玩|玩/.test(action)) {
    return { playerCount: count, downloadCount: count, welfareKind: "新游", text: `${formatPeopleCount(count)}人在玩` };
  }
  return { playerCount: count, downloadCount: count, text: `${formatPeopleCount(count)}人在玩` };
}

function extractXiaoqiDetailPopularity(html = "", details = {}) {
  const candidates = [];
  const detailTexts = collectXiaoqiPeopleTexts(details);
  for (const value of detailTexts) {
    if (/预约/.test(value)) candidates.push({ ...parseXiaoqiDetailPopularity("预约", value), source: "detail-json" });
    else if (/在玩/.test(value)) candidates.push({ ...parseXiaoqiDetailPopularity("在玩", value), source: "detail-json" });
  }
  const buttonPattern = /<div[^>]+class="[^"]*game_btn[^"]*"[^>]*>([\s\S]*?)(?=<\/div>\s*<\/div>\s*<\/div>|<div[^>]+class="[^"]*game_btn|$)/gi;
  for (const match of html.matchAll(buttonPattern)) {
    const block = match[1];
    const buttonText = cleanText(text(block, /class="[^"]*btn_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || block);
    const countText = cleanText(text(block, /class="[^"]*count_num[^"]*"[^>]*>([\s\S]*?)<\/div>/i));
    const parsed = parseXiaoqiDetailPopularity(buttonText, countText);
    if (hasXiaoqiPopularity(parsed)) candidates.push({ ...parsed, source: "detail-html" });
  }
  return candidates.find((item) => item.reservationCount) || candidates.find((item) => item.playerCount || item.downloadCount) || {};
}

function inferWelfareKind(item = {}) {
  const textValue = [item.welfareKind, item.rawEventType, item.eventType, item.status, item.summary, item.updateContent, item.popularityText].join(" ");
  return /预约/.test(textValue) ? "预约" : "新游";
}

function formatWelfarePopularity(item = {}) {
  const kind = inferWelfareKind(item);
  const count = kind === "预约" ? Number(item.reservationCount) || 0 : Number(item.playerCount) || 0;
  return count ? `${formatPeopleCount(count)}人${kind === "预约" ? "预约" : "在玩"}` : "";
}

function pickLargestNumber(left, right) {
  return Math.max(Number(left) || 0, Number(right) || 0);
}

function resolveXiaoqiDate(value, today) {
  const date = extractDate(cleanText(value), today);
  return date ? `${date}T10:00:00+08:00` : "";
}

function resolveXiaoqiRenderedDate(collectionText = "", onlineText = "", today) {
  const textValue = cleanText(`${collectionText} ${onlineText}`);
  const explicitDate = extractDate(textValue, today);
  const time = (textValue.match(/(\d{1,2}:\d{2})/) || [])[1] || "10:00";
  if (explicitDate) return `${explicitDate}T${time}:00+08:00`;
  if (/昨天|已上线1天/.test(textValue)) return `${addDays(today, -1)}T${time}:00+08:00`;
  const onlineDays = textValue.match(/已上线(\d+)天/);
  if (onlineDays) return `${addDays(today, -Number(onlineDays[1]))}T${time}:00+08:00`;
  if (/今天/.test(textValue)) return `${today}T${time}:00+08:00`;
  if (/明天/.test(textValue)) return `${addDays(today, 1)}T${time}:00+08:00`;
  if (/后天/.test(textValue)) return `${addDays(today, 2)}T${time}:00+08:00`;
  const futureDays = textValue.match(/(\d+)天后/);
  if (futureDays) return `${addDays(today, Number(futureDays[1]))}T${time}:00+08:00`;
  return "";
}

function formatXiaoqiScheduleText(eventAt = "", kind = "", rawStatus = "") {
  const date = eventAt.slice(0, 10);
  const time = eventAt.slice(11, 16) || "10:00";
  const md = chinaMonthDay(date);
  const statusText = cleanText(rawStatus);
  const eventText = kind === "预约" ? "预约游戏上线" : "福利新游上线";
  if (!md) return statusText || eventText;
  return `${md}${time}${eventText}`;
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00+08:00`);
  next.setDate(next.getDate() + days);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(next);
}

function chinaMonthDay(dateText = "") {
  const text = String(dateText || "");
  const match = text.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${Number(match[2])}\u6708${Number(match[3])}\u65e5`;
}

function eventDateParts(eventAt = "") {
  const iso = String(eventAt || "").slice(0, 10);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(iso)) return { iso: "", md: "", yesterday: "", tomorrow: "", dayAfterTomorrow: "" };
  return {
    iso,
    md: chinaMonthDay(iso),
    yesterday: chinaMonthDay(addDays(iso, -1)),
    tomorrow: chinaMonthDay(addDays(iso, 1)),
    dayAfterTomorrow: chinaMonthDay(addDays(iso, 2)),
  };
}

function normalizeEventDateText(value = "", eventAt = "") {
  let textValue = cleanText(value);
  const parts = eventDateParts(eventAt);
  textValue = textValue
    .replace(/(\d{1,2})\u6708(\d{1,2})\u65e5[\uff08(][^\uff09)]{1,12}[\uff09)]/g, '$1\u6708$2\u65e5')
    .replace(/^\u5df2\u4e8e(\d{1,2})\u6708(\d{1,2})\u65e5(?:[\uff08(][^\uff09)]{1,12}[\uff09)])?/, "\u4e8e$1\u6708$2\u65e5")
    .replace(/^(\d{1,2})\u6708(\d{1,2})\u65e5\s+(\d{1,2}:\d{2})/, "$1\u6708$2\u65e5$3")
    .replace(/^(\d{1,2})\u6708(\d{1,2})\u65e5\s*\u66f4\u65b0[:\uff1a]/, "$1\u6708$2\u65e5\u66f4\u65b0\uff1a")
    .replace(/^(\d{1,2})\u6708(\d{1,2})\u65e5\s*([\u4e00-\u9fa5]{2,8})$/, "$1\u6708$2\u65e5$3");
  if (parts.md) {
    textValue = textValue
      .replace(/^(\u4eca\u5929|\u4eca\u65e5)\s*/, parts.md)
      .replace(/^\u660e\u5929\s*/, parts.tomorrow)
      .replace(/^\u540e\u5929\s*/, parts.dayAfterTomorrow)
      .replace(/^\u6628\u5929\s*/, parts.yesterday);
    if (/^\d{1,2}:\d{2}\s*(\u6b63\u5f0f)?(\u4e0a\u7ebf|\u9996\u53d1|\u5f00\u6d4b|\u66f4\u65b0|\u5f00\u542f)/.test(textValue)) {
      textValue = parts.md + textValue;
    }
  }
  return cleanText(textValue)
    .replace(/(\d{1,2}\u6708\d{1,2}\u65e5)(\d{1,2}:\d{2})\s+/g, "$1$2 ")
    .replace(/(\d{1,2}\u6708\d{1,2}\u65e5)\s*\u4e0a\u5348\s*(\d{1,2})\u70b9/g, "$1\u4e0a\u5348$2\u70b9")
    .replace(/(\d{1,2}\u6708\d{1,2}\u65e5)\s*\u4e0b\u5348\s*(\d{1,2})\u70b9/g, "$1\u4e0b\u5348$2\u70b9");
}

function stripHtmlNoise(value = "") {
  return cleanText(decodeEntities(value))
    .replace(/<[^>]+>/g, " ")
    .replace(/data-spm-anchor-id=["'][^"']+["']/g, " ")
    .replace(/class=["'][^"']+["']/g, " ")
    .replace(/style=["'][^"']+["']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function resolveNineGameDay(value, today) {
  if (/明天/.test(value)) return addDays(today, 1);
  if (/后天/.test(value)) return addDays(today, 2);
  const md = value.match(/(\d{1,2})[月/-](\d{1,2})/);
  if (md) return `${today.slice(0, 4)}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;
  return today;
}

function extractDate(value, today) {
  const md = value.match(/(\d{1,2})月(\d{1,2})日/);
  if (md) return `${today.slice(0, 4)}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;
  const slash = value.match(/(\d{1,2})[/-](\d{1,2})/);
  if (slash) return `${today.slice(0, 4)}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  if (/今天/.test(value)) return today;
  if (/明天/.test(value)) return addDays(today, 1);
  if (/后天/.test(value)) return addDays(today, 2);
  return "";
}

function mergeUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function gameIdentity(name) {
  const normalized = splitGameTitle(name).gameName
    .replace(/[\uFF08(].*?[\uFF09)]/g, "")
    .replace(/[\[\u3010].*?[\]\u3011]/g, "")
    .replace(/[\u300A\u300B\u201C\u201D"']/g, "")
    .replace(/[-\uFF0D\u2014].*?(\u4E0A\u7EBF|\u5F00\u6D4B|\u6D4B\u8BD5|\u62DB\u52DF|\u9884\u7EA6|\u7248\u672C|\u5B98\u670D|\u6E20\u9053\u670D|\u56FD\u9645\u670D|\u4F53\u9A8C\u670D|\u5148\u9063\u670D|\u516C\u6D4B|\u5185\u6D4B|\u5220\u6863|\u4E0D\u5220\u6863).*$/g, "")
    .replace(/[-\uFF0D\u2014].*$/g, "")
    .replace(/(\u624B\u6E38|\u5B98\u65B9\u6B63\u7248|\u4E2D\u6587\u7248|\u5B98\u670D|\u624B\u673A\u7248|\u6B63\u7248\u624B\u6E38|\u65B0\u4F5C|\u9884\u7EA6|\u6D4B\u8BD5\u7248|\u4F53\u9A8C\u7248|\u5B89\u5353\u7248|\u82F9\u679C\u7248|iOS\u7248|PC\u7248|\u4E91\u6E38\u620F)$/gi, "")
    .replace(/(tap|taptap|\u597D\u6E38\u5FEB\u7206|\u4E5D\u6E38|4399|3839|\u4E13\u533A|\u4E0B\u8F7D|\u9884\u7EA6)$/gi, "")
    .replace(/[\s_:\uff1a\uff0c,\u3002.?!\uff01\uff1f\u300a\u300b/\\|]/g, "")
    .toLowerCase();
  return GAME_IDENTITY_ALIASES[normalized] || normalized;
}

const GAME_IDENTITY_ALIASES = {
  bsideolivialin: "bside",
  bside: "bside",
  "洛克王国世界": "洛克王国",
  "地下城堡4骑士与破碎编年史": "地下城堡4",
};

const KNOWN_GAMEPLAY_TAGS = {
  "跃迁世界": ["平台跳跃", "解谜", "休闲"],
  "帝国雄师": ["战略"],
};





async function enrichTapTapJsonRecords(records, existingData = {}) {
  for (const record of records.slice(0, TAPTAP_DETAIL_ENRICH_LIMIT)) {
    applyExistingMobileDetail(record, "taptap", existingData);
    if (!needsMobileDetailFetch(record)) continue;
    if (!record.detailUrl) continue;
    try {
      const html = await fetchHtml(record.detailUrl);
      const detail = extractTapTapDetailFields(html);
      if (detail.gameName) applyRecordTitle(record, detail.gameName);
      if (!record.iconUrl && detail.iconUrl) record.iconUrl = detail.iconUrl;
      if (detail.vendor) record.vendor = detail.vendor;
      const tags = mergeGameplayTags([...(record.tags || []), ...(detail.tags || [])]);
      record.tags = mergeUnique([record.status, record.eventType, ...tags]);
      if (detail.summary && contentScore(detail.summary) >= contentScore(record.summary)) record.summary = detail.summary;
      if (detail.updateContent && contentScore(detail.updateContent) >= contentScore(record.updateContent)) record.updateContent = detail.updateContent;
    } catch {
      // Keep calendar data when TapTap detail enrichment fails.
    }
  }
}

function extractTapTapDetailFields(html = "") {
  const metaDescription = attr(html, /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)
    || attr(html, /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
  const ogTitle = attr(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogImage = attr(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const bodyText = cleanText(html);
  const gameName = cleanTapTapTitle(ogTitle || text(html, /<h1[^>]*>([\s\S]*?)<\/h1>/));
  return {
    gameName,
    iconUrl: normalizeImage(ogImage, "https://www.taptap.cn"),
    vendor: extractTapTapVendor(bodyText),
    tags: extractTapTapDetailTags(html, bodyText),
    summary: cleanTapTapField(extractTapTapBestIntro(html, bodyText, metaDescription, gameName), gameName),
    updateContent: cleanTapTapField(extractTapTapPriorityUpdate(html, bodyText) || extractTapTapDeveloperContent(bodyText) || extractTapTapAnnouncement(bodyText) || metaDescription || extractTapTapBestIntro(html, bodyText, metaDescription, gameName), gameName),
  };
}

function cleanTapTapTitle(value = "") {
  return cleanText(value).replace(/\s*[-_|].*TapTap.*$/i, "").replace(/\s*\|.*$/, "");
}

function extractTapTapVendor(bodyText = "") {
  return choosePreferredVendor(
    extractAfterLabel(bodyText, VENDOR_LABELS.publisher, VENDOR_STOP_LABELS),
    extractAfterLabel(bodyText, VENDOR_LABELS.operator, VENDOR_STOP_LABELS),
    extractAfterLabel(bodyText, VENDOR_LABELS.developer, VENDOR_STOP_LABELS),
    bodyText.match(/(?:\u4f9b\u5e94\u5546|\u5f00\u53d1\u8005|\u5382\u5546|\u53d1\u884c|\u53d1\u884c\u5546|\u5f00\u53d1\u56e2\u961f)\s*([^\n\u3002]{2,40})/)?.[1] || "",
  );
}

function extractTapTapBestIntro(html = "", bodyText = "", metaDescription = "", gameName = "") {
  const candidates = [extractTapTapIntro(bodyText), metaDescription];
  for (const match of html.matchAll(/"(?:description|summary|intro|brief|content)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/gi)) {
    try {
      candidates.push(JSON.parse('"' + match[1] + '"'));
    } catch {
      candidates.push(match[1]);
    }
  }
  for (const match of bodyText.matchAll(/(?:\u7b80\u4ecb|\u6e38\u620f\u4ecb\u7ecd|\u4ecb\u7ecd)[:\uff1a\s]{0,4}([^\u3002\uff01\uff1f]{20,220})/g)) {
    candidates.push(match[1]);
  }
  return candidates
    .map((value) => cleanTapTapField(value, gameName))
    .filter(Boolean)
    .filter((value) => !/(apk_size|version_name|privacy_policy|acceptedAnswer|@type|TapTap\s*\u63d0\u4f9b|按标签浏览更多同类游戏|上有大量同类型游戏推荐|您可以在\s*TapTap|有哪些游戏标签|游戏标签|玩法标签|官方入驻|共\s*\d+\s*条评价|上线日期)/i.test(value))
    .sort((left, right) => contentScore(right) - contentScore(left))[0] || "";
}

function extractTapTapIntro(bodyText = "") {
  return extractAfterLabel(bodyText, ["简介", "游戏介绍"]) || cleanText(bodyText.match(/(?:简介|游戏介绍)[:：\s]*([\s\S]{12,220}?)(?:开发者的话|开发者|供应商|厂商|发行|展开|收起|$)/)?.[1] || "");
}

function extractTapTapDeveloperContent(bodyText = "") {
  return extractAfterLabel(bodyText, ["开发者的话", "测试招募", "开发者公告", "最新动态"]) || cleanText(bodyText.match(/(?:开发者的话|测试招募|开发者公告|最新动态)[:：\s]*([\s\S]{10,260}?)(?:简介|游戏介绍|供应商|厂商|发行|展开|收起|$)/)?.[1] || "");
}

function extractTapTapAnnouncement(bodyText = "") {
  const textValue = cleanText(bodyText);
  const candidates = textValue.match(/(?:测试招募|招募已开启|预约开启|版本更新|活动开启|联动开启|上线|开测)[^。！？\n]{0,50}/g) || [];
  return candidates.sort((left, right) => contentScore(right) - contentScore(left))[0] || "";
}

async function crawlTapTapRendered(date) {
  const records = await crawlTapTapRenderedSource({ date, url: mobileSources.taptap.url });
  return { records: records.map(normalizeRecord), issues: [] };
}
























