import iconv from "iconv-lite";
import { crawlTapTapRenderedSource } from "./taptap-rendered.js";

const mobileSources = {
  taptap: { key: "taptap", name: "TapTap", url: "https://www.taptap.cn/app-calendar" },
  ninegame: { key: "ninegame", name: "九游", url: "https://www.9game.cn/kc/" },
  hykb: { key: "hykb", name: "好游快爆", url: "https://www.3839.com/timeline.html" },
};


const GAMEPLAY_TAG_ALLOWLIST = new Set([
  "3D",
  "ARPG",
  "AVG",
  "DBG",
  "JRPG",
  "MMO",
  "MOBA",
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
  "休闲",
  "体育",
  "修仙",
  "偶像",
  "像素",
  "克苏鲁",
  "养成",
  "冒险",
  "冒险解谜",
  "农场",
  "农场模拟",
  "刷宝",
  "剧情",
  "剪草",
  "割草",
  "动作",
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
  "篮球",
  "类逃离塔科夫",
  "类银河恶魔城",
  "经营",
  "美少女",
  "美食",
  "自走棋",
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
  "魔幻"
]);

const GAMEPLAY_TAG_BLOCKLIST = new Set([
  "BOSS讨伐",
  "CV控",
  "PC",
  "TapTap",
  "[详情]",
  "iOS",
  "up主推荐",
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
  "热门标签：",
  "版本更新",
  "社区",
  "私藏佳作",
  "简介",
  "精品",
  "编辑推荐",
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

export async function crawlToday({ sources = ["taptap", "ninegame", "hykb"], date = todayInChina() } = {}) {
  const selected = normalizeSources(sources);
  const result = emptyDataset(date);
  const rawIssues = [];
  const rawMobileRecords = [];

  for (const sourceKey of selected) {
    try {
      const payload = await crawlBySource(sourceKey, date);
      rawMobileRecords.push(...payload.records);
      rawIssues.push(...payload.issues);
    } catch (error) {
      rawIssues.push(sourceError(mobileSources[sourceKey]?.name || sourceKey, error));
    }
  }

  result.rawMobileRecords = rawMobileRecords;
  result.mobileGames = buildMobilePool(rawMobileRecords);
  result.cleanupIssues = buildIssues([...rawIssues, ...findPoolIssues(result.mobileGames)]);
  result.updateLogs = buildUpdateLogs(result, selected);
  result.sourceGroups = buildSourceGroups(selected, result, rawIssues);
  result.metrics = buildMetrics(result);
  result.generatedAt = new Date().toISOString();
  return result;
}

export function cleanExistingMobileDataset(data = {}) {
  const next = { ...data };
  const rawMobileRecords = (data.rawMobileRecords || []).map((record) => normalizeRecord(record));
  next.rawMobileRecords = rawMobileRecords;
  next.mobileGames = rawMobileRecords.length ? buildMobilePool(rawMobileRecords) : (data.mobileGames || []).map((item) => cleanPoolItem(item));
  next.cleanupIssues = buildIssues([...(data.cleanupIssues || []).filter((issue) => !["\u7f3a\u8be6\u60c5\u9875", "\u7f3a\u56fe\u6807", "\u7f3a\u73a9\u6cd5\u6807\u7b7e"].includes(issue.type)), ...findPoolIssues(next.mobileGames)]);
  next.metrics = buildMetrics(next);
  next.generatedAt = new Date().toISOString();
  return next;
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
      { id: "job-1", name: "手游核心源更新", scope: "TapTap / 好游快爆 / 九游", cron: "09:00, 12:00, 18:00", status: "待配置", nextRun: "待配置" },
      { id: "job-2", name: "福利新游池更新", scope: "小七 / 果盘 / 一元 / 爱趣", cron: "10:00, 20:00", status: "待接入", nextRun: "待配置" },
      { id: "job-3", name: "PC/Steam 热游更新", scope: "Steam / PC资讯", cron: "待配置", status: "未启用", nextRun: "待配置" },
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
async function crawlBySource(sourceKey, date) {
  if (sourceKey === "taptap") return crawlTapTap(date);
  if (sourceKey === "ninegame") return crawlNineGame(date);
  if (sourceKey === "hykb") return crawlHykb(date);
  return { records: [], issues: [] };
}

async function crawlTapTap(date) {
  try {
    const rendered = await withTimeout(crawlTapTapRendered(date), 25000, "TapTap 渲染抓取超时");
    if (rendered.records.length) return rendered;
  } catch (error) {
    // Fall back to JSON-LD parsing when the rendered TapTap page cannot be controlled.
  }

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

  if (records.length) await enrichTapTapJsonRecords(records);

  if (!records.length) {
    issues.push({ source: "TapTap", type: "无排期记录", detail: `${date} 之后未从 TapTap 日历解析到游戏。` });
  }

  return { records, issues };
}

async function crawlNineGame(date) {
  const html = await fetchHtml(mobileSources.ninegame.url, "utf8");
  const records = [];

  const todayBlock = between(html, 'class="box today-new-server"', 'class="box open-test-con"') || "";
  for (const block of [...todayBlock.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => match[1])) {
    const record = parseNineGameBlock(block, date, "\u4eca\u65e5\u5f00\u6d4b");
    if (record) records.push(record);
  }

  const soonBlock = between(html, 'class="box open-test-con"', 'class="footerWrap"') || "";
  const sections = [...soonBlock.matchAll(/<div class="des-table1">([\s\S]*?)(?=<div class="des-table1">|<\/div>\s*<\/div>\s*<\/div>)/g)].map((match) => match[1]);
  for (const section of sections) {
    const dayText = cleanText(text(section, /<div class="day">([\s\S]*?)<\/div>/));
    const eventDate = resolveNineGameDay(dayText, date);
    for (const row of [...section.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((match) => match[1])) {
      const record = parseNineGameBlock(row, eventDate, "\u5373\u5c06\u5f00\u6d4b");
      if (record) records.push(record);
    }
  }

  await enrichNineGameRecords(records);

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

function isNineGameCloudAd(record = {}) {
  return /\u4e91\u6e38\u620f|\u5728\u7ebf\u73a9|\u7f51\u9875\u7248|\u79d2\u73a9\u5165\u53e3/.test([
    record.gameName,
    record.summary,
    record.updateContent,
    record.detailUrl,
    record.originalUrl,
  ].filter(Boolean).join(" "));
}

function parseNineGameBlock(block, date, fallbackStatus) {
  const name = cleanText(attr(block, /class="name"[^>]*title="([^"]+)"/) || text(block, /class="name"[^>]*>([\s\S]*?)<\/a>/));
  const detailUrl = normalizeUrl(attr(block, /<a[^>]+href="([^"]+)"[^>]+class="name"/) || attr(block, /class="name"[^>]+href="([^"]+)"/), "https://www.9game.cn");
  if (!name || !detailUrl || detailUrl.includes("javascript:")) return null;

  const iconUrl = normalizeImage(attr(block, /xLazyImg="([^"]+)"/) || attr(block, /<img[^>]+src="([^"]+)"/), "https://www.9game.cn");
  const status = cleanText(text(block, /状态：\s*<span class="na">([\s\S]*?)<\/span>/)) || cleanText(text(block, /<span class="time">([\s\S]*?)<\/span>/)) || fallbackStatus;
  const category = cleanText(text(block, /类型：\s*(?:<td class="na">)?([\s\S]*?)(?:<\/td>|<\/span>)/));
  const updateContent = cleanContentText(extractNineGameUpdateText(block) || `${normalizeNineGameStatus(status)} ${category || ""}`);

  return normalizeRecord({
    id: stableId("ninegame", detailUrl),
    sourceKey: "ninegame",
    source: "九游",
    gameName: name,
    icon: name.slice(0, 1),
    iconUrl,
    platform: "手游",
    pool: "公共手游池",
    status: normalizeNineGameStatus(status),
    eventType: /首发|上线/.test(status) ? "新游" : "开测",
    eventAt: `${date}T10:00:00+08:00`,
    tags: [category, normalizeNineGameStatus(status)].filter(Boolean),
    summary: category ? `${normalizeNineGameStatus(status)} · ${category}` : normalizeNineGameStatus(status),
    updateContent,
    originalUrl: mobileSources.ninegame.url,
    detailUrl,
  });
}

async function enrichNineGameRecords(records) {
  for (const record of records) {
    if (!record?.detailUrl) continue;
    try {
      const html = await fetchHtml(record.detailUrl, "utf8");
      const detail = extractNineGameDetailFields(html);
      if (detail.gameName && shouldUseDetailTitle(record.gameName, detail.gameName)) applyRecordTitle(record, detail.gameName);
      if (!record.iconUrl && detail.iconUrl) record.iconUrl = detail.iconUrl;
      if (detail.vendor) record.vendor = detail.vendor;
      const gameplayTags = mergeGameplayTags([...(record.tags || []), ...(detail.tags || [])].filter((tag) => tag !== record.gameName && tag !== detail.gameName));
      record.tags = mergeUnique([record.status, record.eventType, ...gameplayTags]);
      if (detail.summary && contentScore(detail.summary) >= contentScore(record.summary)) record.summary = detail.summary;
      if (detail.updateContent && contentScore(detail.updateContent) >= contentScore(record.updateContent)) record.updateContent = detail.updateContent;
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

function extractNineGameDetailTitle(html = "") {
  return cleanText(
    text(html, /<h1 class="ngame-title"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h1>/) ||
    text(html, /<input type="hidden" id="_gamename" value="([^"]+)"/) ||
    text(html, /<title>([\s\S]*?)_(?:预约下载|攻略|礼包|九游)/),
  );
}

function extractNineGameDetailFields(html = "") {
  const bodyText = cleanText(html);
  const metaDescription = extractMeta(html, ["description", "og:description"]);
  const title = extractNineGameDetailTitle(html);
  const iconUrl = normalizeImage(
    attr(html, /<input[^>]+id=["']_gameIcon["'][^>]+value=["']([^"']+)["']/i) ||
    extractMeta(html, ["og:image"]) ||
    attr(html, /<img[^>]+(?:class=["'][^"']*(?:icon|game-icon)[^"']*["'][^>]+)?(?:src|data-src|xLazyImg)=["']([^"']+)["']/i),
    "https://www.9game.cn",
  );
  const tags = extractNineGameDetailTags(html, bodyText);
  const htmlVendor = extractNineGameHtmlVendor(html);
  return {
    gameName: title,
    iconUrl,
    vendor: choosePreferredVendor(htmlVendor, extractNineGameVendor(bodyText)),
    tags,
    summary: cleanContentText(extractIntroText(bodyText) || metaDescription),
    updateContent: cleanContentText(extractNineGamePriorityUpdate(html, bodyText, title) || extractUpdateText(bodyText) || metaDescription || extractIntroText(bodyText)),
  };
}

function extractHykbDetailFields(html = "") {
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
    updateContent: cleanContentText(extractHykbPriorityUpdate(html, bodyText, cleanTitle) || extractUpdateText(bodyText) || metaDescription || extractIntroText(bodyText)),
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

function seedPoolItem(record) {
  return {
    id: stableId("mobile", gameIdentity(record.gameName) || record.detailUrl || record.gameName),
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
    vendor: cleanVendor(record.vendor || ""),
    originalUrl: record.originalUrl,
    detailUrl: record.detailUrl,
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
  const status = chooseStatus(current.status, record.status, current.updateContent, record.updateContent);
  const eventType = chooseEventType(current.eventType, record.eventType);
  const summary = pickBestText(current.summary, record.summary, current.updateContent, record.updateContent);
  const updateContent = pickBestUpdateContent(current.updateContent, record.updateContent, current.summary, record.summary);

  return {
    ...current,
    gameName: primary.gameName || current.gameName,
    subtitle: primary.subtitle || current.subtitle || "",
    icon: primary.icon || current.icon,
    iconUrl: primary.iconUrl || current.iconUrl,
    status,
    eventType,
    eventAt: earliestEventAt(current.eventAt, record.eventAt),
    sources: mergeUnique([...(current.sources || []), record.source]),
    tags: mergeUnique([status, eventType, ...gameplayTags]).slice(0, 12),
    summary,
    updateContent,
    vendor: choosePreferredVendor(primary.vendor, current.vendor, record.vendor),
    originalUrl: primary.originalUrl || current.originalUrl,
    detailUrl: primary.detailUrl || current.detailUrl,
    sourceRecords: allSourceRecords,
    mergedCount: allSourceRecords.length,
    primarySource: primary.source,
  };
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
  };
  return recordScore(record) > recordScore(currentRecord) ? record : currentRecord;
}

function recordScore(record) {
  const sourceWeights = { TapTap: 34, 好游快爆: 28, 九游: 22 };
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
      issues.push({ source: item.primarySource || item.sources?.[0] || "未知", type: "缺详情页", title: item.gameName, detail: "聚合后缺少来源站详情页，原文按钮不可用。" });
    }
    if (!item.iconUrl) {
      issues.push({ source: item.primarySource || item.sources?.[0] || "未知", type: "缺图标", title: item.gameName, detail: "当前游戏缺少可展示的图标链接。" });
    }
    if (!((item.gameplayTags || []).length || mergeGameplayTags(item.tags || []).length)) {
      issues.push({ source: item.primarySource || item.sources?.[0] || "未知", type: "缺玩法标签", title: item.gameName, detail: "多来源合并后仍未提取到稳定玩法标签。" });
    }
    return issues;
  });
}

function buildIssues(issues) {
  return issues.map((issue, index) => ({
    id: `issue-${index + 1}`,
    severity: /缺详情页|缺图标/.test(issue.type) ? "高" : "中",
    type: issue.type || "抓取问题",
    title: issue.title || issue.source || "来源问题",
    detail: issue.detail || "待检查。",
  }));
}

function buildSourceGroups(selected, data, rawIssues) {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const selectedSet = new Set(selected);

  const sourceRecordCount = (source) => (data.rawMobileRecords || []).filter((item) => item.source === source).length;
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
    },
    {
      key: "welfare",
      name: "福利新游源",
      sources: ["小七手游", "果盘游戏", "一元手游", "爱趣游戏"],
      enabled: false,
      lastRun: "待接入",
      status: "只抓新游",
      count: data.welfareGames.length,
      rawCount: data.rawWelfareRecords?.length || 0,
    },
    {
      key: "pc",
      name: "PC / Steam 源",
      sources: ["Steam", "端游资讯", "主机资讯"],
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
    todayUpdates: data.mobileGames.filter((item) => item.eventAt.startsWith(data.date)).length,
    cleanupIssues: data.cleanupIssues.length,
    rawMobileRecords: data.rawMobileRecords.length,
  };
}

function normalizeSources(sources) {
  const map = {
    mobile: ["taptap", "ninegame", "hykb"],
    taptap: ["taptap"],
    ninegame: ["ninegame"],
    hykb: ["hykb"],
  };
  return [...new Set((sources || []).flatMap((source) => map[source] || [source]).filter((source) => mobileSources[source]))];
}

function normalizeRecord(record) {
  const titleParts = splitGameTitle(record.gameName);
  const mergedContent = mergeSummaryAndUpdate(record.summary, record.updateContent, titleParts.gameName, record.status, record.eventType, record.eventAt);
  return {
    ...record,
    gameName: titleParts.gameName,
    subtitle: titleParts.subtitle,
    summary: mergedContent.summary,
    updateContent: mergedContent.updateContent,
    tags: mergeUnique((record.tags || []).map(cleanText).filter(Boolean)),
    vendor: cleanVendor(record.vendor || ""),
    originalUrl: record.originalUrl || "",
    detailUrl: record.detailUrl || "",
    crawlerRule: "detailUrl required; missing detailUrl enters cleanup issues.",
  };
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
    gameName: record.gameName,
    subtitle: record.subtitle || "",
    detailUrl: record.detailUrl,
    originalUrl: record.originalUrl,
    status: record.status,
    eventType: record.eventType,
    eventAt: record.eventAt,
    summary: record.summary,
    updateContent: record.updateContent,
    tags: record.tags,
    vendor: record.vendor || "",
    iconUrl: record.iconUrl || "",
  };
}

function dedupeSourceRecords(records) {
  const seen = new Map();
  for (const record of records) {
    const key = `${record.source}:${record.detailUrl || record.eventAt}:${record.status}:${record.eventType}`;
    if (!seen.has(key)) seen.set(key, record);
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
  const rawStatus = normalizePoolStatus(item.status, item);
  const rawEventType = normalizePoolEventType(item.eventType, rawStatus, item);
  const status = normalizeStatusGroup(rawStatus, rawEventType, item);
  const gameplayTags = normalizePoolGameplayTags(item, rawStatus, rawEventType);
  const sourceRecords = (item.sourceRecords || []).map((record) => {
    const recordStatus = normalizePoolStatus(record.status, record);
    const recordEventType = normalizePoolEventType(record.eventType, recordStatus, record);
    const grouped = normalizeStatusGroup(recordStatus, recordEventType, record);
    return {
      ...record,
      rawStatus: recordStatus,
      rawEventType: recordEventType,
      status: grouped,
      eventType: grouped,
      tags: normalizeSourceRecordTags(record),
      ...mergeSummaryAndUpdate(record.summary, record.updateContent, record.gameName || item.gameName, record.status, record.eventType, record.eventAt || item.eventAt),
      vendor: cleanVendor(record.vendor || ""),
      iconUrl: record.iconUrl || "",
    };
  });
  const mergedContent = mergeSummaryAndUpdate(item.summary, item.updateContent, item.gameName, rawStatus, rawEventType, item.eventAt);

  return {
    ...item,
    rawStatus,
    rawEventType,
    status,
    eventType: status,
    gameplayTags,
    tags: mergeUnique([status, ...gameplayTags]).slice(0, 12),
    summary: mergedContent.summary,
    updateContent: mergedContent.updateContent,
    vendor: choosePreferredVendor(item.vendor, ...sourceRecords.map((record) => record.vendor)),
    sourceRecords,
  };
}

function normalizeStatusGroup(status, eventType, item = {}) {
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
    /^[A-Z][A-Za-z0-9:_-]{1,}$/,
  ];

  const rawTags = mergeUnique([
    ...(item.tags || []),
    ...((item.sourceRecords || []).flatMap((record) => record.tags || [])),
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
    if (kept.some((existing) => isSimilarContent(existing, candidate))) continue;
    kept.push(candidate);
  }

  const firstKept = kept[0] || "";
  const eventLimit = firstKept.length > 40 || /^\u4e8e\d{1,2}\u6708\d{1,2}\u65e5/.test(firstKept) ? 1 : 2;
  const summaryText = kept.slice(0, eventCandidates.length ? eventLimit : 2).join("\n");
  return { summary: summaryText, updateContent: "" };
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

function normalizeNineGameStatus(value) {
  const textValue = cleanText(value);
  if (/\u9996\u53d1/.test(textValue)) return "\u9996\u53d1";
  if (/\u4e0a\u7ebf/.test(textValue)) return "\u4e0a\u7ebf";
  if (/\u8054\u52a8/.test(textValue)) return "\u8054\u52a8";
  if (/\u6d3b\u52a8|\u4e3b\u9898\u670d|\u6e14\u4e50\u8282|MK2/.test(textValue)) return "\u6d3b\u52a8";
  if (/\u7248\u672c|\u66f4\u65b0|\u8d5b\u5b63/.test(textValue)) return "\u66f4\u65b0";
  if (/\u516c\u6d4b|\u5185\u6d4b|\u5220\u6863|\u4e0d\u5220\u6863|\u6d4b\u8bd5|\u5f00\u6d4b/.test(textValue)) return "\u5f00\u6d4b";
  return textValue || "\u5f00\u6d4b";
}

function normalizeHykbStatus(value) {
  const textValue = cleanText(value);
  if (/\u4eca\u65e5\u4e0a\u7ebf/.test(textValue)) return "\u4eca\u65e5\u4e0a\u7ebf";
  if (/\u5373\u5c06\u4e0a\u7ebf/.test(textValue)) return "\u5373\u5c06\u4e0a\u7ebf";
  if (/\u9884\u7ea6/.test(textValue)) return "\u9884\u7ea6";
  if (/\u8054\u52a8/.test(textValue)) return "\u8054\u52a8";
  if (/\u4e0a\u7ebf|\u5f00\u653e\u4e0b\u8f7d|\u6b63\u5f0f\u4e0a\u7ebf|\u6b63\u5f0f\u5f00\u670d/.test(textValue)) return "\u4e0a\u7ebf";
  if (/\u7248\u672c|\u66f4\u65b0|\u8d5b\u5b63|\u8fd4\u573a/.test(textValue)) return "\u66f4\u65b0";
  if (/\u6d3b\u52a8|\u4e3b\u9898\u670d|\u9650\u65f6/.test(textValue)) return "\u6d3b\u52a8";
  if (/\u6d4b\u8bd5|\u5f00\u6d4b|\u9996\u6d4b|\u7ec8\u6d4b|\u62db\u52df/.test(textValue)) return "\u5f00\u6d4b";
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

function chooseStatus(currentStatus, nextStatus, currentContent = "", nextContent = "") {
  const pairs = [
    { status: nextStatus, text: nextContent },
    { status: currentStatus, text: currentContent },
    { status: nextStatus, text: "" },
    { status: currentStatus, text: "" },
  ];
  const weight = (status, text) => {
    if (/今日上线/.test(status)) return 120;
    if (/更新|活动/.test(status) && /(版本|赛季|联动|返场|新增|上线)/.test(text)) return 110;
    if (/上线|首发/.test(status)) return 90;
    if (/预约/.test(status)) return 70;
    if (/开测/.test(status)) return 60;
    return 40;
  };
  return pairs.sort((left, right) => weight(right.status || "", right.text || "") - weight(left.status || "", left.text || ""))[0]?.status || currentStatus || nextStatus;
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
    if (!merged.some((existing) => existing.includes(candidate) || candidate.includes(existing))) {
      merged.push(candidate);
    }
  }
  return merged.slice(0, 2).join("\n");
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
  return cleanText(stripHtmlNoise(value))
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
}

function sourceError(source, error) {
  return { source, type: "抓取失败", detail: error?.message || String(error) };
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
    .replace(/^(\u53d1\u884c\u5546|\u53d1\u884c|\u4ee3\u7406\u53d1\u884c|\u8fd0\u8425\u5546|\u4f9b\u5e94\u5546|\u5f00\u53d1\u5546|\u5f00\u53d1\u8005|\u5f00\u53d1\u56e2\u961f|\u5f00\u53d1|\u5382\u5546)[:\uff1a\s]*/, "")
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

function extractNineGameHtmlVendor(html = "") {
  const candidates = [];
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
  for (const candidate of mergeUnique(candidates).sort((left, right) => eventSentenceScore(right) - eventSentenceScore(left))) {
    if (kept.some((existing) => isSimilarContent(existing, candidate))) continue;
    kept.push(candidate);
    if (kept.length >= limit) break;
  }
  return kept.join("\n");
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

function extractHykbPriorityUpdate(html = "", bodyText = "", title = "") {
  const notice = text(html, /<a[^>]+id=["']game_open_log_a["'][^>]*>([\s\S]*?)<\/a>/i);
  const noticeEvent = extractEventSentences(notice, title, 1);
  if (noticeEvent) return noticeEvent;

  const importantBlocks = [];
  for (const match of html.matchAll(/<[^>]+class=["'][^"']*(?:open|notice|time|news|test|activity|event|log)[^"']*["'][^>]*>[\s\S]{0,900}?(?:\u516c\u6d4b|\u5185\u6d4b|\u5f00\u670d|\u5f00\u6d4b|\u9996\u53d1|\u4e0a\u7ebf|\u6d4b\u8bd5|\u62db\u52df|\u7248\u672c|\u66f4\u65b0|\u6d3b\u52a8|\u8054\u52a8|\u8d5b\u5b63|\u8d44\u683c)[\s\S]{0,900}?(?:<\/div>|<\/li>|<\/p>|<\/a>)/gi)) {
    importantBlocks.push(cleanText(match[0]));
  }
  const importantEvent = extractEventSentences(importantBlocks.join("\n"), title, 2);
  if (importantEvent) return importantEvent;

  const updateRows = [];
  for (const match of html.matchAll(/(20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2})([\s\S]{0,420}?)(?=20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2}|<\/table>|<\/ul>|<\/div>\s*<\/div>|$)/gi)) {
    const value = cleanText(match[1] + " " + match[2]);
    if (value) updateRows.push(value);
  }
  const rowEvent = extractEventSentences(updateRows.join("\n"), title, 2);
  if (rowEvent) return rowEvent;

  const updateBlocks = [];
  for (const match of html.matchAll(/<li[^>]*>[\s\S]{0,300}?(?:\u516c\u6d4b|\u5185\u6d4b|\u5f00\u670d|\u5f00\u6d4b|\u7248\u672c|\u66f4\u65b0|\u6d3b\u52a8|\u8054\u52a8|\u8d5b\u5b63|\u4e0a\u7ebf)[\s\S]{0,300}?<\/li>/gi)) {
    updateBlocks.push(cleanText(match[0]));
  }
  const blockEvent = extractEventSentences(updateBlocks.join("\n"), title, 2);
  if (blockEvent) return blockEvent;
  return extractEventSentences(bodyText, title, 2);
}

function extractNineGamePriorityUpdate(html = "", bodyText = "", title = "") {
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
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 NewgameWikiCrawler/0.2",
      "accept-language": "zh-CN,zh;q=0.9",
    },
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  return encoding === "utf8" ? buffer.toString("utf8") : iconv.decode(buffer, encoding);
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

function gameIdentity(name) {
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
};





async function enrichTapTapJsonRecords(records) {
  for (const record of records.slice(0, 80)) {
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
  return {
    gameName: cleanTapTapTitle(ogTitle || text(html, /<h1[^>]*>([\s\S]*?)<\/h1>/)),
    iconUrl: normalizeImage(ogImage, "https://www.taptap.cn"),
    vendor: extractTapTapVendor(bodyText),
    tags: extractTapTapDetailTags(html, bodyText),
    summary: cleanContentText(extractTapTapBestIntro(html, bodyText, metaDescription)),
    updateContent: cleanContentText(extractTapTapPriorityUpdate(html, bodyText) || extractTapTapDeveloperContent(bodyText) || extractTapTapAnnouncement(bodyText) || metaDescription || extractTapTapBestIntro(html, bodyText, metaDescription)),
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

function extractTapTapBestIntro(html = "", bodyText = "", metaDescription = "") {
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
    .map((value) => cleanMergedContentText(value, ""))
    .filter(Boolean)
    .filter((value) => !/(apk_size|version_name|privacy_policy|acceptedAnswer|@type|TapTap\s*\u63d0\u4f9b|按标签浏览更多同类游戏|上有大量同类型游戏推荐|您可以在\s*TapTap|有哪些游戏标签|游戏标签|玩法标签)/i.test(value))
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
























