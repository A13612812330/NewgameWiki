import express from "express";
import "./env.js";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildCleanupIssuesForItems, cleanExistingMobileDataset, crawlSingleMobileRecord, crawlToday, emptyDataset, gameIdentity, mobileAssociationKeys } from "./crawler/mobile.js";
import { normalizeDataShape } from "./data-shape.js";
import {
  appendOperationLog,
  cleanupHistoricalSchedulerFailures,
  deleteGameRecord as deleteLocalGameRecord,
  ensureDefaultSchedulerJobs,
  getDueSchedulerJobs,
  getDatabaseOverview,
  getLocalCacheStatus,
  getOperationLogs,
  getSchedulerJobDetail,
  getSchedulerJobs,
  getSchedulerRuns,
  getWelfareReferenceRecords,
  getWelfareReferenceStatus,
  initializeLocalCache,
  readDataFromLocalCache,
  rebuildCurrentDataFromRecords,
  recordSchedulerRun,
  syncLocalCache,
  updateSchedulerRun,
  updateGameRecordPayload,
  upsertGameRecord,
  upsertSchedulerJob,
} from "./local-cache.js";
import { sampleSingleSteamApp, sampleSteamOfficial, writeSteamSampleToCurrentData } from "./crawler/steam-sample.js";
import { samplePcNews, sampleSinglePcNewsRecord, writePcNewsToCurrentData } from "./crawler/pc-news-sample.js";

const app = express();
const port = Number(process.env.PORT || 64111);
const readOnlyShareMode = process.env.NEWWIKI_READONLY === "1";
const localAdminShareMode = process.env.NEWWIKI_LOCAL_ADMIN === "1";
const portHostDefault = readOnlyShareMode || localAdminShareMode ? "0.0.0.0" : "127.0.0.1";
const host = process.env.HOST || portHostDefault;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const dataDir = path.join(root, "data");
const currentDataFile = path.join(dataDir, "current.json");
const excelDir = path.join(dataDir, "excel");
const mobileWorkbookFile = path.join(excelDir, "手游池整理表.xlsx");
const localDbFile = path.join(dataDir, "newgamewiki.db");
const runtimeCacheDir = path.join(root, "runtime-cache");
const undoDir = path.join(dataDir, "undo");
const backupDir = path.join(dataDir, "backups");
const schedulerCheckMs = Number(process.env.SCHEDULER_CHECK_MS || 60000);
const schedulerTimeoutMs = Number(process.env.SCHEDULER_TIMEOUT_MS || 5 * 60 * 1000);
const schedulerInitialDelayMs = Number(process.env.SCHEDULER_INITIAL_DELAY_MS || 2 * 60 * 1000);
const runningSchedulerJobs = new Set();
const schedulerStopRequests = new Map();
let schedulerSweepRunning = false;
let currentDataMemory = null;

const defaultSchedulerJobs = [
  { sourceKey: "taptap", module: "手机游戏", name: "TapTap", sources: ["taptap"], runTimes: ["09:00"], cronText: "每日 09:00", legacyRunTimes: [["06:10", "13:00"], ["09:10", "18:10"], ["09:00", "12:00", "18:00"]] },
  { sourceKey: "hykb", module: "手机游戏", name: "好游快爆", sources: ["hykb"], runTimes: ["09:15"], cronText: "每日 09:15", legacyRunTimes: [["06:30", "13:07"], ["09:35", "18:35"], ["09:00", "12:00", "18:00"]] },
  { sourceKey: "ninegame", module: "手机游戏", name: "九游", sources: ["ninegame"], runTimes: ["09:30"], cronText: "每日 09:30", legacyRunTimes: [["06:50", "13:14"], ["10:00", "19:00"], ["09:00", "12:00", "18:00"]] },
  { sourceKey: "xiaoqi", module: "福利游戏", name: "小七手游", sources: ["xiaoqi"], runTimes: ["09:45"], cronText: "每日 09:45", legacyRunTimes: [["07:10", "13:21"], ["10:30", "19:30"], ["10:00", "18:00"], ["09:00", "12:00", "18:00"]] },
  { sourceKey: "steam", module: "端游", name: "Steam游戏", sources: ["steam"], runTimes: ["周一07:30", "周五21:30"], cronText: "周一 07:30、周五 21:30", legacyRunTimes: [["07:30"], ["07:30", "13:28"], ["11:10", "20:10"], ["11:00", "20:00"], ["09:00", "12:00", "18:00"]] },
  { sourceKey: "steamNew", module: "端游", name: "Steam新游", sources: ["steamNew"], runTimes: ["周一07:50", "周五21:50"], cronText: "周一 07:50、周五 21:50", legacyRunTimes: [["07:50"], ["07:50", "13:35"], ["11:35", "20:35"], ["11:00", "20:00"], ["09:00", "12:00", "18:00"]] },
  { sourceKey: "gcores", module: "资讯", name: "机核", sources: ["gcores"], runTimes: ["12:10"], cronText: "每日 12:10", legacyRunTimes: [["08:10", "13:42"], ["12:10", "21:10"], ["09:30", "14:30", "20:30"], ["09:00", "12:00", "18:00"]] },
  { sourceKey: "gamersky", module: "资讯", name: "游民星空", sources: ["gamersky"], runTimes: ["12:25"], cronText: "每日 12:25", legacyRunTimes: [["08:30", "13:49"], ["12:30", "21:30"], ["09:30", "14:30", "20:30"], ["09:00", "12:00", "18:00"]] },
  { sourceKey: "ali213", module: "资讯", name: "游侠网", sources: ["ali213"], runTimes: ["12:40"], cronText: "每日 12:40", legacyRunTimes: [["08:50", "13:56"], ["12:50", "21:50"], ["09:30", "14:30", "20:30"], ["09:00", "12:00", "18:00"]] },
];

app.use(express.json({ limit: "20mb" }));
app.use((request, response, next) => {
  if (!readOnlyShareMode && !localAdminShareMode) return next();
  if (request.method !== "GET" && request.path.startsWith("/api/")) {
    if (localAdminShareMode && isLocalRequest(request)) return next();
    const message = localAdminShareMode
      ? "当前为访客只读入口，管理操作请使用本机管理网址。"
      : "当前为只读分享模式，禁止修改数据。";
    return response.status(403).json({ ok: false, message });
  }
  return next();
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "newgame-wiki", phase: "excel-admin" });
});

app.get("/api/data", async (_request, response) => {
  response.json(await readCurrentData());
});

app.get("/api/data/meta", async (_request, response) => {
  try {
    const stat = await fs.stat(currentDataFile).catch(() => null);
    response.json({
      ok: true,
      generatedAt: currentDataMemory?.generatedAt || "",
      snapshotUpdatedAt: stat ? stat.mtime.toISOString() : "",
      snapshotSize: stat ? stat.size : 0,
    });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "数据状态读取失败" });
  }
});

app.get("/api/cache/status", async (_request, response) => {
  response.json(await getLocalCacheStatus(localDbFile));
});

app.get("/api/system/status", async (_request, response) => {
  try {
    const [cache, jobs, runs, data] = await Promise.all([
      getLocalCacheStatus(localDbFile),
      getSchedulerJobs(localDbFile),
      getSchedulerRuns(localDbFile, { limit: 1 }),
      readCurrentData(),
    ]);
    response.json({
      ok: true,
      cache,
      jobs: { total: jobs.length, enabled: jobs.filter((job) => job.enabled).length },
      lastRun: runs[0] || null,
      generatedAt: data.generatedAt || "",
      cleanupIssues: (data.cleanupIssues || []).filter((issue) => !["ignored", "resolved"].includes(issue.status)).length,
    });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "系统状态读取失败" });
  }
});

app.get("/api/system/files", async (_request, response) => {
  try {
    const [currentInfo, dbInfo, excelInfo, cache, database] = await Promise.all([
      fileInfo(currentDataFile),
      fileInfo(localDbFile),
      fileInfo(mobileWorkbookFile),
      getLocalCacheStatus(localDbFile),
      getDatabaseOverview(localDbFile),
    ]);
    response.json({
      ok: true,
      files: {
        current: { key: "current", name: "current.json 前端快照", path: currentDataFile, ...currentInfo },
        sqlite: { key: "sqlite", name: "SQLite 主数据库", path: localDbFile, ...dbInfo },
        excel: { key: "excel", name: "手游 Excel 整理表", path: mobileWorkbookFile, ...excelInfo },
        backups: { key: "backups", name: "备份目录", path: backupDir, ...(await fileInfo(backupDir)) },
      },
      cache,
      database,
    });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "数据文件读取失败" });
  }
});

app.post("/api/system/open-path", async (request, response) => {
  try {
    const target = String(request.body?.target || "").trim();
    const targetMap = {
      current: currentDataFile,
      sqlite: localDbFile,
      excel: mobileWorkbookFile,
      backups: backupDir,
      data: dataDir,
    };
    const targetPath = targetMap[target];
    if (!targetPath) return response.status(400).json({ ok: false, message: "不支持的打开目标" });
    await openInExplorer(targetPath);
    response.json({ ok: true, path: targetPath });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "打开位置失败" });
  }
});

app.get("/api/scheduler/jobs", async (_request, response) => {
  response.json({ ok: true, jobs: await getSchedulerJobs(localDbFile) });
});

app.get("/api/scheduler/runs", async (request, response) => {
  response.json({
    ok: true,
    runs: await getSchedulerRuns(localDbFile, {
      sourceKey: String(request.query.sourceKey || ""),
      limit: Number(request.query.limit || 30),
    }),
  });
});

app.post("/api/scheduler/runs/cleanup-failures", async (_request, response) => {
  try {
    const result = await cleanupHistoricalSchedulerFailures(localDbFile);
    await appendOperationLog(localDbFile, {
      type: "任务",
      targetType: "scheduler_runs",
      targetId: "historical_failures",
      title: "清理历史失败日志",
      detail: `已清理 ${result.deleted || 0} 条旧失败记录，保留当前失败 ${result.preservedCurrentFailures || 0} 条。`,
      payload: result,
    });
    response.json({ ok: true, ...result, runs: await getSchedulerRuns(localDbFile, { limit: 60 }) });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "清理失败日志失败" });
  }
});

app.get("/api/scheduler/job-detail", async (request, response) => {
  try {
    const detail = await getSchedulerJobDetail(localDbFile, String(request.query.sourceKey || ""));
    if (!detail) return response.status(404).json({ ok: false, message: "未找到任务" });
    response.json({ ok: true, ...detail });
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || "任务详情读取失败" });
  }
});

app.post("/api/scheduler/job", async (request, response) => {
  try {
    const job = await upsertSchedulerJob(localDbFile, request.body || {});
    const data = await readCurrentData();
    data.schedulerJobs = await getSchedulerJobs(localDbFile);
    appendUpdateLog(data, {
      type: "任务",
      title: job.enabled ? "启用定时任务" : "停用定时任务",
      detail: `${job.name}：${job.enabled ? "已启用" : "已停用"}，时间点 ${formatSchedulerTimes(job)}。`,
    });
    await writeCurrentData(data);
    await appendOperationLog(localDbFile, {
      type: "任务",
      targetType: "scheduler_job",
      targetId: job.sourceKey,
      title: job.enabled ? "启用定时任务" : "停用定时任务",
      detail: `${job.name}：时间点 ${formatSchedulerTimes(job)}。`,
      payload: job,
    });
    response.json({ ok: true, job, jobs: data.schedulerJobs });
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || "任务保存失败" });
  }
});

function formatSchedulerTimes(job = {}) {
  return job.runTimes?.length ? job.runTimes.join("、") : (job.cronText || "未设置");
}

function normalizePoolApiKey(value = "") {
  const key = String(value || "").trim();
  const map = {
    mobile: "mobile",
    "mobile-games": "mobile",
    welfare: "welfare",
    "welfare-games": "welfare",
    steam: "steam",
    "steam-games": "steam",
    steamNew: "steamNew",
    "steam-new": "steamNew",
    "steam-new-games": "steamNew",
    pcNews: "pcNews",
    "pc-news": "pcNews",
    news: "pcNews",
  };
  return map[key] || "";
}

async function parseWelfareCompareInput(body = {}) {
  const hasDirectInput = Array.isArray(body.records)
    || String(body.workbookBase64 || "").trim()
    || String(body.workbookPath || body.xlsxPath || "").trim()
    || String(body.recordsText || body.text || "").trim();
  if (body.useCachedReference || !hasDirectInput) {
    return getWelfareReferenceRecords(localDbFile);
  }
  if (Array.isArray(body.records)) {
    return body.records.map((item) => ({
      gameName: String(item.gameName || item.name || item.title || "").trim(),
      subtitle: String(item.subtitle || item.subTitle || item.benefit || item.label || "").trim(),
    })).filter((item) => item.gameName);
  }
  const workbookBase64 = String(body.workbookBase64 || "").trim();
  if (workbookBase64) {
    const fileName = String(body.workbookFileName || "welfare-compare.xlsx").replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
    if (!/\.xlsx$/i.test(fileName)) throw new Error("福利对比表仅支持 .xlsx 文件");
    const uploadDir = path.join(runtimeCacheDir, "uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    const uploadFile = path.join(uploadDir, `${Date.now()}-${fileName}`);
    await fs.writeFile(uploadFile, Buffer.from(workbookBase64, "base64"));
    const stdout = await runPython(path.join(root, "server", "excel", "parse_welfare_compare.py"), [uploadFile]);
    const parsed = JSON.parse(stdout || "{}");
    return Array.isArray(parsed.records) ? parsed.records : [];
  }
  const workbookPath = String(body.workbookPath || body.xlsxPath || "").trim();
  if (workbookPath) {
    const resolved = path.resolve(workbookPath);
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat?.isFile()) throw new Error("福利对比表不存在：" + resolved);
    if (!/\.xlsx$/i.test(resolved)) throw new Error("福利对比表仅支持 .xlsx 文件");
    const stdout = await runPython(path.join(root, "server", "excel", "parse_welfare_compare.py"), [resolved]);
    const parsed = JSON.parse(stdout || "{}");
    return Array.isArray(parsed.records) ? parsed.records : [];
  }
  const text = String(body.recordsText || body.text || "").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const cleanLine = line.replace(/^["']|["']$/g, "").trim();
    if (!cleanLine || /^游戏名\s*[,，\t|]\s*副标题/.test(cleanLine)) continue;
    const parts = cleanLine.split(/\t|,|，|\|/).map((item) => item.trim()).filter(Boolean);
    if (parts.length >= 2) {
      rows.push({ gameName: parts[0], subtitle: parts.slice(1).join(" ") });
      continue;
    }
    const bracket = cleanLine.match(/^(.+?)[（(【\[](.+?)[）)】\]]$/);
    if (bracket) {
      rows.push({ gameName: bracket[1].trim(), subtitle: bracket[2].trim() });
      continue;
    }
    rows.push({ gameName: cleanLine, subtitle: "" });
  }
  return rows.filter((item) => item.gameName);
}

function welfareSubtitle(item = {}) {
  return String(item.subtitle || item.benefitSubtitle || item.welfareTitle || item.rawStatus || item.status || "").trim();
}

function isRegularWelfareSubtitle(value = "") {
  const text = normalizeWelfareCompareText(value);
  return !text || text === "常规" || text === "普通" || text === "默认";
}

function welfareCompareKey(gameName = "", subtitle = "") {
  const name = normalizeWelfareCompareText(gameName);
  const sub = normalizeWelfareCompareText(subtitle);
  return name ? `${name}::${sub}` : "";
}

function groupWelfareRecordsByName(records = []) {
  const map = new Map();
  for (const record of records) {
    const key = normalizeWelfareCompareText(record.gameName);
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(record);
    map.set(key, list);
  }
  return map;
}

function matchWelfareRecord(target = {}, exactKeySet, ownByName) {
  if (isRegularWelfareSubtitle(target.subtitle)) return { included: false, type: "regular-skipped" };
  if (target.key && exactKeySet.has(target.key)) return { included: true, type: "exact", subtitle: target.subtitle };
  const nameKey = normalizeWelfareCompareText(target.gameName);
  const candidates = ownByName.get(nameKey) || [];
  if (!candidates.length) return { included: false, type: "none" };
  const targetTokens = welfareSubtitleTokens(target.subtitle);
  for (const candidate of candidates) {
    const candidateSubtitle = String(candidate.subtitle || "").trim();
    const candidateTokens = welfareSubtitleTokens(candidateSubtitle);
    if (welfareSubtitleMatched(target.subtitle, candidateSubtitle, targetTokens, candidateTokens)) {
      return { included: true, type: "subtitle", subtitle: candidateSubtitle };
    }
  }
  return { included: false, type: "name-only", subtitle: candidates[0]?.subtitle || "" };
}

function welfareSubtitleMatched(left = "", right = "", leftTokens = welfareSubtitleTokens(left), rightTokens = welfareSubtitleTokens(right)) {
  const leftText = normalizeWelfareCompareText(left);
  const rightText = normalizeWelfareCompareText(right);
  if (leftText && rightText && (leftText.includes(rightText) || rightText.includes(leftText))) return true;
  const leftCommon = !leftText || leftText === "常规";
  const rightCommon = !rightText || rightText === "常规";
  if (leftCommon || rightCommon) return leftCommon && rightCommon;
  const strongOverlap = [...leftTokens].filter((token) => rightTokens.has(token));
  return strongOverlap.length > 0;
}

function welfareSubtitleTokens(value = "") {
  const text = normalizeWelfareCompareText(value).replace(/(\d+)\.0折/g, "$1折");
  const tokens = new Set();
  const discountMatches = text.match(/\d+(?:\.\d+)?折/g) || [];
  for (const discount of discountMatches) tokens.add(discount.replace(/\.0折$/, "折"));
  const keywords = ["免费", "买断", "代金", "折扣", "内置", "官方正版", "畅玩", "免广告", "送千抽", "千抽", "打金", "青春版", "狂享版"];
  for (const keyword of keywords) {
    if (text.includes(keyword)) tokens.add(keyword);
  }
  return tokens;
}

function normalizeWelfareCompareText(value = "") {
  return String(value || "")
    .replace(/免费版|福利版|折扣版/g, (match) => match)
    .replace(/[\s"'“”‘’`~!！?？,，.。:：;；、|/\\\-_=+·・《》<>【】\[\]（）(){}]/g, "")
    .toLowerCase();
}

function localDateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const match = String(value).match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/);
    return match ? match[0].replace(/\//g, "-").split("-").map((part, index) => index ? part.padStart(2, "0") : part).join("-") : "";
  }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

app.post("/api/scheduler/run", async (request, response) => {
  const sourceKey = String(request.body?.sourceKey || "").trim();
  try {
    if (!sourceKey) return response.status(400).json({ ok: false, message: "缺少任务来源" });
    const result = await runSchedulerJob(sourceKey, { manual: true });
    response.json({ ok: true, ...result });
  } catch (error) {
    response.status(500).json({
      ok: false,
      sourceKey,
      sourceName: sourceKeyLabel(sourceKey),
      failureReason: error?.message || "任务运行失败",
      message: error?.message || "任务运行失败",
    });
  }
});

app.post("/api/scheduler/stop", async (request, response) => {
  try {
    const sourceKey = String(request.body?.sourceKey || "").trim();
    const keys = sourceKey ? [sourceKey] : [...runningSchedulerJobs];
    if (!keys.length) return response.json({ ok: true, stopped: [], message: "当前没有运行中的任务" });
    const stopped = [];
    for (const key of keys) {
      const requestInfo = schedulerStopRequests.get(key);
      if (!requestInfo) continue;
      requestInfo.stopped = true;
      requestInfo.reason = "用户手动停止任务";
      requestInfo.reject?.(createSchedulerStopError(key));
      stopped.push(key);
    }
    response.json({ ok: true, stopped, message: stopped.length ? "已发送停止请求" : "未找到可停止的运行任务" });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "停止任务失败" });
  }
});

app.post("/api/scheduler/pause-all", async (_request, response) => {
  try {
    const jobs = await getSchedulerJobs(localDbFile);
    for (const job of jobs) {
      await upsertSchedulerJob(localDbFile, { ...job, enabled: false });
    }
    const data = await readCurrentData();
    data.schedulerJobs = await getSchedulerJobs(localDbFile);
    appendUpdateLog(data, { type: "任务", title: "暂停全部定时任务", detail: "所有平台任务已停用，仍可手动立即运行。" });
    await writeCurrentData(data);
    await appendOperationLog(localDbFile, {
      type: "任务",
      targetType: "scheduler_job",
      targetId: "all",
      title: "暂停全部定时任务",
      detail: `已停用 ${jobs.length} 个任务。`,
      payload: { before: jobs, after: data.schedulerJobs },
    });
    response.json({ ok: true, jobs: data.schedulerJobs });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "暂停任务失败" });
  }
});

app.post("/api/cache/sync", async (_request, response) => {
  try {
    const status = await syncLocalCache(await readCurrentData(), localDbFile);
    response.json({ ok: true, status });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "同步本地缓存失败" });
  }
});

app.post("/api/backup/create", async (_request, response) => {
  try {
    const backup = await createDataBackup("manual");
    response.json({ ok: true, backup });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "备份失败" });
  }
});

app.get("/api/operation-logs", async (request, response) => {
  response.json({
    ok: true,
    logs: await getOperationLogs(localDbFile, {
      type: String(request.query.type || ""),
      limit: Number(request.query.limit || 80),
    }),
  });
});

app.get("/api/logs/operations", async (request, response) => {
  response.json({
    ok: true,
    logs: await getOperationLogs(localDbFile, {
      type: String(request.query.type || ""),
      limit: Number(request.query.limit || 80),
    }),
  });
});

app.get("/api/welfare/reference", async (_request, response) => {
  try {
    response.json({ ok: true, ...(await getWelfareReferenceStatus(localDbFile)) });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "福利参考库读取失败" });
  }
});

app.post("/api/welfare/reference/import", async (request, response) => {
  try {
    const workbookBase64 = String(request.body?.workbookBase64 || "").trim();
    const workbookPath = String(request.body?.workbookPath || request.body?.xlsxPath || "").trim();
    let importFile = "";
    if (workbookBase64) {
      const fileName = String(request.body?.workbookFileName || "welfare-reference.xlsx").replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
      if (!/\.xlsx$/i.test(fileName)) throw new Error("福利参考表仅支持 .xlsx 文件");
      const uploadDir = path.join(runtimeCacheDir, "uploads");
      await fs.mkdir(uploadDir, { recursive: true });
      importFile = path.join(uploadDir, `${Date.now()}-${fileName}`);
      await fs.writeFile(importFile, Buffer.from(workbookBase64, "base64"));
    } else if (workbookPath) {
      const resolved = path.resolve(workbookPath);
      const stat = await fs.stat(resolved).catch(() => null);
      if (!stat?.isFile()) throw new Error("福利参考表不存在：" + resolved);
      if (!/\.xlsx$/i.test(resolved)) throw new Error("福利参考表仅支持 .xlsx 文件");
      importFile = resolved;
    } else {
      throw new Error("请选择或填写要导入的福利参考表");
    }
    await createDataBackup("welfare-reference");
    const stdout = await runPython(path.join(root, "server", "excel", "import_welfare_compare_reference.py"), [importFile, "--db", localDbFile]);
    const imported = JSON.parse(stdout || "{}");
    response.json({ ok: true, imported, ...(await getWelfareReferenceStatus(localDbFile)) });
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || "福利参考表导入失败" });
  }
});

app.post("/api/welfare/compare", async (request, response) => {
  try {
    const data = await readCurrentData();
    const ownRecords = (await parseWelfareCompareInput(request.body || {}))
      .filter((item) => !isRegularWelfareSubtitle(item.subtitle));
    const reference = await getWelfareReferenceStatus(localDbFile);
    const ownKeySet = new Set(ownRecords.map((item) => welfareCompareKey(item.gameName, item.subtitle)));
    const ownByName = groupWelfareRecordsByName(ownRecords);
    const allWelfareItems = (data.welfareGames || []).filter((item) => item.visible !== false);
    const skippedRegular = allWelfareItems.filter((item) => isRegularWelfareSubtitle(welfareSubtitle(item)));
    const welfareItems = allWelfareItems.filter((item) => !isRegularWelfareSubtitle(welfareSubtitle(item)));
    const rows = welfareItems.map((item) => {
      const gameName = String(item.gameName || "").trim();
      const subtitle = welfareSubtitle(item);
      const key = welfareCompareKey(gameName, subtitle);
      const match = matchWelfareRecord({ gameName, subtitle, key }, ownKeySet, ownByName);
      const included = Boolean(match.included);
      const eventKind = /预约/.test([item.welfareKind, item.rawEventType, item.eventType, item.status, item.summary, item.updateContent].join(" ")) ? "预约" : "新游";
      const popularityText = item.popularityText || formatWelfareComparePopularity(item, eventKind);
      return {
        id: item.id || key,
        gameName,
        subtitle,
        eventAt: item.eventAt || "",
        eventKind,
        playerCount: Number(item.playerCount) || 0,
        reservationCount: Number(item.reservationCount) || 0,
        popularityText,
        source: (item.sources || []).join(" / ") || "小七手游",
        status: included ? "已收录" : "未收录",
        included,
        matchType: match.type,
        matchedSubtitle: match.subtitle || "",
      };
    }).sort(sortWelfareCompareRows);
    const today = localDateKey(new Date());
    const included = rows.filter((row) => row.included);
    const missing = rows.filter((row) => !row.included);
    const todayMissing = missing.filter((row) => localDateKey(row.eventAt) === today);
    response.json({
      ok: true,
      summary: {
        ownCount: ownRecords.length,
        welfareCount: rows.length,
        included: included.length,
        missing: missing.length,
        todayMissing: todayMissing.length,
        skippedRegular: skippedRegular.length,
      },
      reference,
      included,
      missing,
      todayMissing,
    });
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || "福利对比失败" });
  }
});

function sortWelfareCompareRows(left = {}, right = {}) {
  const rightTime = new Date(right.eventAt || 0).getTime() || 0;
  const leftTime = new Date(left.eventAt || 0).getTime() || 0;
  if (rightTime !== leftTime) return rightTime - leftTime;
  return String(left.gameName || "").localeCompare(String(right.gameName || ""), "zh-CN");
}

function formatWelfareComparePopularity(item = {}, eventKind = "") {
  const isReserve = eventKind === "预约";
  const count = Number(isReserve ? item.reservationCount : item.playerCount) || 0;
  if (!count) return "";
  const value = count >= 10000 ? `${(count / 10000).toFixed(count >= 100000 ? 0 : 1).replace(/\.0$/, "")}万` : count.toLocaleString("zh-CN");
  return `${value}人${isReserve ? "预约" : "在玩"}`;
}

app.get("/api/pools/:pool", async (request, response) => {
  const data = await readCurrentData();
  const poolKey = normalizePoolApiKey(request.params.pool);
  const pools = {
    mobile: data.mobileGames || [],
    welfare: data.welfareGames || [],
    steam: data.steamGames || [],
    steamNew: data.steamNewGames || [],
    pcNews: data.pcNews || [],
  };
  if (!poolKey || !Object.hasOwn(pools, poolKey)) {
    return response.status(404).json({ ok: false, message: "不支持的数据池" });
  }
  response.json({
    ok: true,
    pool: poolKey,
    items: pools[poolKey],
    date: data.date,
    generatedAt: data.generatedAt,
    rawRecords: poolKey === "mobile" ? data.rawMobileRecords || [] : [],
    cleanupIssues: data.cleanupIssues || [],
  });
});

app.get("/api/mobile-pool", async (_request, response) => {
  const data = await readCurrentData();
  const items = data.mobileGames || [];
  response.json({
    ok: true,
    date: data.date,
    generatedAt: data.generatedAt,
    pool: items,
    poolKey: "mobile",
    items,
    mobileGames: items,
    rawRecords: data.rawMobileRecords || [],
    cleanupIssues: data.cleanupIssues || [],
  });
});

app.get("/api/cleanup/excel", async (_request, response) => {
  try {
    const workbook = await exportWorkbook();
    response.json({
      ok: true,
      file: workbook.file,
      updatedAt: workbook.updatedAt,
    });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "导出 Excel 失败" });
  }
});

app.post("/api/cleanup/excel/apply", async (_request, response) => {
  try {
    const data = await applyWorkbook();
    response.json({ ok: true, data });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "应用 Excel 失败" });
  }
});

app.post("/api/cleanup/issues/status", async (request, response) => {
  try {
    const { issueId, title, status, sourceKey, targetId } = request.body || {};
    if (!issueId && !title) return response.status(400).json({ ok: false, message: "缺少清洗问题ID或标题" });
    if (!["open", "ignored", "resolved"].includes(status)) return response.status(400).json({ ok: false, message: "不支持的清洗问题状态" });
    const data = await readCurrentData();
    const currentIssue = (data.cleanupIssues || []).map((rawIssue) => {
      const issue = normalizeCleanupIssue(rawIssue);
      return { ...issue, legacyId: String(rawIssue.id || "").trim() };
    }).find((issue) =>
      (issueId && (issue.id === issueId || issue.legacyId === issueId)) || (!issueId && title && compactText(issue.title) === compactText(title))
    );
    if (!currentIssue) return response.status(404).json({ ok: false, message: "未找到清洗问题" });
    if (status === "resolved") {
      const target = findPoolEntry(data, targetId || currentIssue.targetId || "", currentIssue.title)?.item;
      if (!target) return response.status(400).json({ ok: false, message: "问题未关联到具体记录，请先定位或重抓后再解决。" });
      const liveIssues = buildCleanupIssuesForItems([target]);
      const stillOpen = liveIssues.some((issue) => issueMatchesTarget(issue, {
        title: currentIssue.title,
        sourceKey: sourceKey || currentIssue.sourceKey,
        targetId: targetId || currentIssue.targetId,
      }));
      if (stillOpen) return response.status(409).json({ ok: false, message: "当前数据仍存在这个问题，请先编辑修正或重抓后再解决。" });
    }
    const result = updateCleanupIssueStatus(data, { issueId: currentIssue.id, title, status });
    if (!result.ok) return response.status(404).json({ ok: false, message: result.message || "未找到清洗问题" });
    appendUpdateLog(data, {
      type: "清洗",
      title: status === "ignored" ? "忽略清洗问题" : status === "resolved" ? "标记问题解决" : "恢复清洗问题",
      detail: `${result.issue.title || title || issueId}：${cleanupStatusLabel(status)}。`,
    });
    await writeCurrentData(data);
    await appendOperationLog(localDbFile, {
      type: "清洗",
      targetType: "cleanup_issue",
      targetId: result.issue.id || issueId || title,
      title: "更新清洗问题状态",
      detail: `${result.issue.title || title || issueId}：${cleanupStatusLabel(status)}。`,
      payload: { before: result.before, after: result.issue },
    });
    response.json({ ok: true, data, issue: result.issue });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "清洗问题状态更新失败" });
  }
});

app.post("/api/pool/field-choice", async (request, response) => {
  try {
    const { gameId, field, value, source } = request.body || {};
    if (!gameId || !field) return response.status(400).json({ ok: false, message: "缺少游戏ID或字段" });
    const baseData = await readCurrentData();
    const result = await updateGameRecordPayload(localDbFile, gameId, (item) => {
      const fieldResult = applyFieldToRecord(item, { field, value, source });
      if (!fieldResult.ok) throw new Error(fieldResult.message || "字段更新失败");
      return fieldResult.item;
    });
    if (!result) return response.status(404).json({ ok: false, message: "未找到对应记录" });
    let data = await rebuildCurrentDataFromRecords(localDbFile, baseData);
    const refreshedTarget = findPoolEntry(data, gameId, result.item.gameName || result.item.newsTitle || "")?.item;
    const cleanupRefresh = refreshCleanupIssuesForRecord(data, refreshedTarget || result.item);
    appendUpdateLog(data, {
      type: "审核",
      title: "字段采用",
      detail: `${result.item.gameName || result.item.newsTitle || gameId}：${fieldLabel(field)}采用 ${source || "手动值"}。`,
    });
    await writeCurrentData(data);
    await appendOperationLog(localDbFile, {
      type: "编辑",
      targetType: "pool_record",
      targetId: gameId,
      title: "字段编辑",
      detail: `${result.item.gameName || result.item.newsTitle || gameId}：${fieldLabel(field)} 已更新。`,
      payload: { pool: result.pool, before: result.before, after: result.item, field, value, source },
    });
    response.json({ ok: true, data, cleanupResolvedCount: cleanupRefresh.resolvedCount });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "字段写回失败" });
  }
});

app.post("/api/pool/visibility", async (request, response) => {
  try {
    const { gameId, visible } = request.body || {};
    if (!gameId) return response.status(400).json({ ok: false, message: "缺少游戏ID" });
    const baseData = await readCurrentData();
    const result = await updateGameRecordPayload(localDbFile, gameId, (item) => ({
      ...item,
      visible: visible !== false,
      deletedAt: visible !== false ? "" : item.deletedAt,
      manualChoices: {
        ...(item.manualChoices || {}),
        visible: { value: visible !== false, source: "来源管理", updatedAt: new Date().toISOString() },
      },
    }));
    if (!result) return response.status(404).json({ ok: false, message: "未找到对应记录" });
    let data = await rebuildCurrentDataFromRecords(localDbFile, baseData);
    appendUpdateLog(data, {
      type: "管理",
      title: visible === false ? "隐藏前端展示" : "恢复前端展示",
      detail: `${result.item.gameName || result.item.newsTitle || gameId}：${visible === false ? "已从前端隐藏" : "已恢复展示"}。`,
    });
    await writeCurrentData(data);
    await appendOperationLog(localDbFile, {
      type: "可见状态",
      targetType: "pool_record",
      targetId: gameId,
      title: visible === false ? "隐藏记录" : "恢复展示",
      detail: `${result.item.gameName || result.item.newsTitle || gameId}：${visible === false ? "已隐藏" : "已恢复展示"}。`,
      payload: { pool: result.pool, before: result.before, after: result.item, visible: visible !== false },
    });
    response.json({ ok: true, data });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "可见状态更新失败" });
  }
});

app.post("/api/pool/delete", async (request, response) => {
  try {
    const { gameId } = request.body || {};
    if (!gameId) return response.status(400).json({ ok: false, message: "缺少游戏ID" });
    const baseData = await readCurrentData();
    const result = await deleteLocalGameRecord(localDbFile, gameId, { softDelete: true });
    if (!result) return response.status(404).json({ ok: false, message: "未找到对应记录" });
    const removed = { id: result.item.id || gameId, title: result.item.gameName || result.item.newsTitle || gameId };
    let data = await rebuildCurrentDataFromRecords(localDbFile, baseData);
    appendUpdateLog(data, {
      type: "管理",
      title: "删除单条记录",
      detail: `${removed.title} 已标记删除并从前端隐藏。`,
    });
    await writeCurrentData(data);
    await appendOperationLog(localDbFile, {
      type: "删除",
      targetType: "pool_record",
      targetId: gameId,
      title: "删除单条记录",
      detail: removed.title,
      payload: { pool: result.pool, before: result.before, after: result.item, removed },
    });
    response.json({ ok: true, data, removed });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "删除记录失败" });
  }
});

app.post("/api/logs/undo-latest", async (_request, response) => {
  try {
    const restored = await restoreLatestUndoSnapshot();
    response.json({ ok: true, data: restored.data, restoredFrom: restored.file });
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || "撤销失败" });
  }
});

app.post("/api/logs/undo-operation", async (_request, response) => {
  try {
    const restored = await restoreLatestOperation();
    response.json({ ok: true, data: restored.data, operation: restored.operation });
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || "撤销操作失败" });
  }
});

app.post("/api/crawl/today", async (request, response) => {
  try {
    const sources = request.body?.sources?.length ? request.body.sources : ["taptap", "ninegame", "hykb"];
    const data = await runCrawlSources(sources);
    response.json({ ok: true, data, sources });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "抓取失败" });
  }
});

app.post("/api/crawl/record", async (request, response) => {
  try {
    const { gameId, title, source } = request.body || {};
    let data = await readCurrentData();
    const target = gameId ? findPoolRecord(data, gameId) : null;
    const targetTitle = String(target?.gameName || target?.newsTitle || title || "").trim();
    if (!targetTitle) return response.status(400).json({ ok: false, message: "缺少要重抓的记录标题" });
    const sourceKey = sourceKeyForRecord(source || target?.primarySource || target?.sources?.[0] || target?.platform || "") || inferSourceKeyForRecord(target);
    if (!sourceKey) return response.status(400).json({ ok: false, message: "当前来源暂不支持单条重抓" });
    const lookupTarget = findRecordWithPlatformDetail(data, target, sourceKey) || target;
    const platformId = platformIdForRecord(lookupTarget, sourceKey);
    const detailUrl = detailUrlForRecord(lookupTarget, sourceKey);
    const partial = await crawlSingleRecordBySource({ sourceKey, platformId, detailUrl, target });
    const updatedEntry = mergeSingleRecordIntoPool(data, partial, { sourceKey, target, gameId, title: targetTitle });
    if (updatedEntry.previousPool && updatedEntry.previousPool !== updatedEntry.pool) {
      await deleteLocalGameRecord(localDbFile, updatedEntry.item.id || gameId || targetTitle, { softDelete: false });
    }
    await upsertGameRecord(localDbFile, updatedEntry.pool, updatedEntry.item);
    const baseData = {
      ...data,
      rawMobileRecords: mergeRawSingleRecords(data.rawMobileRecords || [], partial.rawMobileRecords || [], sourceKey, targetTitle),
      rawWelfareRecords: mergeRawSingleRecords(data.rawWelfareRecords || [], partial.rawWelfareRecords || [], sourceKey, targetTitle),
      rawPcRecords: mergeRawSingleRecords(data.rawPcRecords || [], [...(partial.rawPcRecords || []), ...(partial.items || []), ...(partial.records || [])], sourceKey, targetTitle),
      cleanupIssues: mergeSingleIssues(data.cleanupIssues || [], partial.cleanupIssues || [], { title: targetTitle, issueId: request.body?.issueId, sourceKey, targetId: gameId }),
      sourceGroups: mergeSourceGroups(data.sourceGroups || [], partial.sourceGroups || []),
    };
    data = await rebuildCurrentDataFromRecords(localDbFile, baseData);
    appendUpdateLog(data, {
      type: "重抓",
      title: "单条记录重抓完成",
      detail: `${targetTitle} 已按 ${source || target?.sources?.[0] || sourceKey} 的详情页ID ${platformId || "详情链接"} 重新抓取并合并。`,
    });
    await writeCurrentData(data);
    await appendOperationLog(localDbFile, {
      type: "重抓",
      targetType: "pool_record",
      targetId: updatedEntry.item.id || gameId || targetTitle,
      title: "单条记录重抓完成",
      detail: `${targetTitle}：${sourceKey}`,
      payload: { sourceKey, platformId, detailUrl, pool: updatedEntry.pool, before: updatedEntry.before, after: pickRecordAuditFields(updatedEntry.item), changedFields: updatedEntry.changedFields },
    });
    response.json({
      ok: true,
      data,
      updated: targetTitle,
      updatedId: updatedEntry.item.id || updatedEntry.item.appid || gameId || targetTitle,
      pool: updatedEntry.pool,
      sourceKey,
      platformId,
      detailUrl,
      changedFields: updatedEntry.changedFields,
      cleanupResolvedCount: updatedEntry.cleanupResolvedCount,
    });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "单条重抓失败" });
  }
});

app.post("/api/data/clear", async (_request, response) => {
  response.status(410).json({ ok: false, message: "清空当前数据接口已禁用，请使用备份或撤销功能恢复数据。" });
});

app.get("/api/image", async (request, response) => {
  const url = String(request.query.url || "");
  if (!/^https?:\/\//.test(url)) return response.status(400).send("bad url");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 NewgameWikiImageProxy/0.1",
        "referer": new URL(url).origin,
      },
    });
    if (!upstream.ok) return sendImageFallback(response);
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await upstream.arrayBuffer());
    response.setHeader("Content-Type", contentType);
    response.setHeader("Cache-Control", "public, max-age=86400");
    response.send(buffer);
  } catch (error) {
    sendImageFallback(response);
  } finally {
    clearTimeout(timer);
  }
});

function sendImageFallback(response) {
  response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.send(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#e9eef2"/><path d="M92 120h136l-38-48-31 36-20-24-47 36z" fill="#b8c5cf"/><circle cx="112" cy="62" r="16" fill="#cdd7df"/></svg>`);
}

if (process.env.SERVE_WEB === "1") {
  app.use((request, response, next) => {
    if (request.method === "GET" && !request.path.startsWith("/api") && (request.path === "/" || !path.extname(request.path))) {
      response.setHeader("Cache-Control", "no-store");
    }
    next();
  });
  app.use(express.static(distDir));
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api")) return next();
    response.setHeader("Cache-Control", "no-store");
    response.sendFile(path.join(distDir, "index.html"));
  });
}

if (!readOnlyShareMode) {
  await createDataBackup("startup");
  await bootstrapLocalData();
  startSchedulerTimer();
}

app.listen(port, host, () => {
  console.log(`NewgameWiki API listening on http://${host}:${port}${readOnlyShareMode ? " (readonly share mode)" : ""}`);
});

async function readCurrentData() {
  if (currentDataMemory) return cloneData(currentDataMemory);
  const cached = await readDataFromLocalCache(localDbFile);
  if (cached) {
    currentDataMemory = normalizeDataShape(cached);
    currentDataMemory.cleanupIssues = (currentDataMemory.cleanupIssues || []).map(normalizeCleanupIssue);
    return cloneData(currentDataMemory);
  }
  try {
    const data = normalizeDataShape(JSON.parse(await fs.readFile(currentDataFile, "utf8")));
    data.cleanupIssues = (data.cleanupIssues || []).map(normalizeCleanupIssue);
    await initializeLocalCache(data, localDbFile);
    currentDataMemory = data;
    return cloneData(currentDataMemory);
  } catch {
    const data = normalizeDataShape(emptyDataset());
    await writeCurrentData(data);
    return cloneData(data);
  }
}

async function writeCurrentData(data, { skipBackup = false } = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  if (!skipBackup) await backupCurrentData();
  const normalized = normalizeDataShape(data);
  await fs.writeFile(currentDataFile, JSON.stringify(normalized, null, 2), "utf8");
  await syncLocalCache(normalized, localDbFile);
  currentDataMemory = normalized;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data || {}));
}

function isLocalRequest(request) {
  const rawAddress = String(request.ip || request.socket?.remoteAddress || "");
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const address = forwarded || rawAddress;
  return [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "localhost",
  ].includes(address) || address.endsWith(":127.0.0.1");
}

async function bootstrapLocalData() {
  let data;
  const cached = await readDataFromLocalCache(localDbFile);
  if (cached) {
    data = normalizeDataShape(cached);
  } else {
    try {
      data = normalizeDataShape(JSON.parse(await fs.readFile(currentDataFile, "utf8")));
    } catch {
      data = normalizeDataShape(emptyDataset());
    }
  }
  data = normalizeDataShape(cleanExistingMobileDataset(data));
  data.cleanupIssues = (data.cleanupIssues || []).map(normalizeCleanupIssue);
  await ensureDefaultSchedulerJobs(localDbFile, defaultSchedulerJobs);
  await refreshSchedulerNextRuns();
  data.schedulerJobs = await getSchedulerJobs(localDbFile);
  await writeCurrentData(data, { skipBackup: true });
}

async function refreshSchedulerNextRuns() {
  const jobs = await getSchedulerJobs(localDbFile);
  const runs = await getSchedulerRuns(localDbFile, { limit: 200 });
  const now = new Date().toISOString();
  const staleRuns = runs.filter((run) => run.status === "running");
  for (const run of staleRuns) {
    await updateSchedulerRun(localDbFile, run.id, {
      finishedAt: now,
      status: "failed",
      message: "服务重启后自动释放旧运行状态",
    });
  }
  for (const job of jobs) {
    const patch = job.lastStatus === "运行中"
      ? { lastStatus: "已中断", lastMessage: "服务重启后自动释放旧运行状态" }
      : {};
    if (!job.enabled) continue;
    await saveSchedulerJobWithNextRun(job, patch);
  }
}

function startSchedulerTimer() {
  setTimeout(() => {
    runDueSchedulerJobs().catch((error) => console.error("scheduler check failed", error));
    setInterval(() => {
      runDueSchedulerJobs().catch((error) => console.error("scheduler check failed", error));
    }, schedulerCheckMs).unref?.();
  }, schedulerInitialDelayMs).unref?.();
}

async function runDueSchedulerJobs() {
  if (schedulerSweepRunning) return;
  schedulerSweepRunning = true;
  try {
    const jobs = await getDueSchedulerJobs(localDbFile);
    for (const job of jobs) {
      try {
        await runSchedulerJob(job.sourceKey, { manual: false });
      } catch (error) {
        console.error(`scheduler job ${job.sourceKey} failed`, error);
      }
    }
  } finally {
    schedulerSweepRunning = false;
  }
}

async function runSchedulerJob(sourceKey, { manual = false } = {}) {
  if (runningSchedulerJobs.has(sourceKey)) throw new Error("该来源正在运行，请稍后再试");
  const jobs = await getSchedulerJobs(localDbFile);
  const job = jobs.find((item) => item.sourceKey === sourceKey);
  if (!job) throw new Error("未找到任务：" + sourceKey);
  const beforeData = await readCurrentData();
  runningSchedulerJobs.add(sourceKey);
  const stopRequest = { stopped: false, reason: "", reject: null };
  const stopPromise = new Promise((_, reject) => {
    stopRequest.reject = reject;
  });
  schedulerStopRequests.set(sourceKey, stopRequest);
  let timedOut = false;
  let crawlPromise = null;
  const startedAt = new Date().toISOString();
  const runId = await recordSchedulerRun(localDbFile, {
    jobId: job.id,
    sourceKey,
    startedAt,
    status: "running",
    message: manual ? "后台立即运行" : "定时任务运行",
  });
  console.log(`[scheduler] ${job.name || sourceKey} start (${manual ? "manual" : "auto"})`);
  await saveSchedulerJobWithNextRun(job, { lastRunAt: startedAt, lastStatus: "运行中", lastMessage: manual ? "后台立即运行中" : "定时任务运行中" });
  try {
    const shouldStop = () => Boolean(stopRequest.stopped);
    crawlPromise = runCrawlSources(job.sources?.length ? job.sources : [sourceKey], { shouldStop, stopSourceKey: sourceKey });
    const data = await Promise.race([
      withTimeout(crawlPromise, schedulerTimeoutMs, `${job.name} 运行超过 ${Math.round(schedulerTimeoutMs / 60000)} 分钟`),
      stopPromise,
    ]);
    const finishedAt = new Date().toISOString();
    const counts = {
      mobileGames: data.mobileGames?.length || 0,
      welfareGames: data.welfareGames?.length || 0,
      steamGames: data.steamGames?.length || 0,
      steamNewGames: data.steamNewGames?.length || 0,
      pcNews: data.pcNews?.length || 0,
      cleanupIssues: data.cleanupIssues?.length || 0,
    };
    await updateSchedulerRun(localDbFile, runId, { finishedAt, status: "success", message: "运行完成", counts });
    await saveSchedulerJobWithNextRun(job, {
      lastRunAt: finishedAt,
      lastStatus: "已抓取",
      lastMessage: "运行完成",
    });
    data.schedulerJobs = await getSchedulerJobs(localDbFile);
    await writeCurrentData(data, { skipBackup: true });
    console.log(`[scheduler] ${job.name || sourceKey} success ${finishedAt}`);
    return { data, job: data.schedulerJobs.find((item) => item.sourceKey === sourceKey), runId, counts, sourceStats: buildSourceRunStats(data, beforeData, sourceKey) };
  } catch (error) {
    timedOut = error?.code === "SCHEDULER_TIMEOUT";
    const finishedAt = new Date().toISOString();
    const stopped = error?.code === "SCHEDULER_STOPPED";
    await updateSchedulerRun(localDbFile, runId, { finishedAt, status: stopped ? "stopped" : "failed", message: error?.message || (stopped ? "任务已停止" : "运行失败") });
    await saveSchedulerJobWithNextRun(job, {
      lastRunAt: finishedAt,
      lastStatus: stopped ? "已停止" : "失败",
      lastMessage: error?.message || (stopped ? "任务已停止" : "运行失败"),
    });
    console.error(`[scheduler] ${job.name || sourceKey} failed: ${error?.message || "运行失败"}`);
    throw error;
  } finally {
    if (timedOut && crawlPromise) crawlPromise.catch(() => {});
    if (stopRequest.stopped && crawlPromise) crawlPromise.catch(() => {});
    schedulerStopRequests.delete(sourceKey);
    runningSchedulerJobs.delete(sourceKey);
  }
}

async function saveSchedulerJobWithNextRun(job = {}, patch = {}) {
  const { nextRunAt, ...withoutNextRun } = job;
  return upsertSchedulerJob(localDbFile, { ...withoutNextRun, ...patch, nextRunAt: undefined });
}

function buildSourceRunStats(data = {}, beforeData = {}, sourceKey = "") {
  const afterGroup = (data.sourceGroups || []).find((group) => group.key === sourceKey) || {};
  const beforeGroup = (beforeData.sourceGroups || []).find((group) => group.key === sourceKey) || {};
  const afterCount = Number(afterGroup.count) || countSourcePoolItems(data, sourceKey);
  const beforeCount = Number(beforeGroup.count) || countSourcePoolItems(beforeData, sourceKey);
  const rawCount = Number(afterGroup.rawCount) || afterCount;
  const cleanupIssues = (data.cleanupIssues || []).filter((issue) => cleanupIssueMatchesSource(issue, sourceKey)).length;
  const diagnostics = afterGroup.diagnostics || data.crawlDiagnostics?.[sourceKey] || {};
  return {
    sourceKey,
    fetched: rawCount,
    discovered: diagnostics.discovered ?? rawCount,
    crawled: rawCount,
    current: afterCount,
    added: Math.max(0, afterCount - beforeCount),
    changed: Math.abs(afterCount - beforeCount),
    cleanupIssues,
    failed: diagnostics.failed ?? cleanupIssues,
    completeness: diagnostics.completeness ?? null,
    strategy: diagnostics.strategy || "",
    durationMs: diagnostics.durationMs || 0,
    fieldStats: diagnostics.fieldStats || null,
    issueSamples: diagnostics.issues || [],
    lastRun: afterGroup.lastRun || data.generatedAt || "",
  };
}

function countSourcePoolItems(data = {}, sourceKey = "") {
  const label = sourceKeyLabel(sourceKey);
  if (["taptap", "hykb", "ninegame"].includes(sourceKey)) {
    return (data.mobileGames || []).filter((item) => (item.sources || []).includes(label)).length;
  }
  if (sourceKey === "xiaoqi") return (data.welfareGames || []).length;
  if (sourceKey === "steam") return (data.steamGames || []).length;
  if (sourceKey === "steamNew") return (data.steamNewGames || []).length;
  if (["gcores", "gamersky", "ali213"].includes(sourceKey)) {
    return (data.pcNews || []).filter((item) => (item.sources || []).includes(label) || item.platform === label).length;
  }
  return 0;
}

function cleanupIssueMatchesSource(issue = {}, sourceKey = "") {
  const label = sourceKeyLabel(sourceKey);
  const text = [issue.source, issue.title, issue.detail, issue.type].join(" ");
  return text.includes(label) || text.includes(sourceKey);
}

function sourceKeyLabel(sourceKey = "") {
  const map = { taptap: "TapTap", hykb: "好游快爆", ninegame: "九游", xiaoqi: "小七手游", steam: "Steam", steamNew: "Steam", gcores: "机核", gamersky: "游民星空", ali213: "游侠网" };
  return map[sourceKey] || sourceKey;
}

async function runCrawlSources(sources = [], { shouldStop = () => false, stopSourceKey = "" } = {}) {
  const checkStopped = () => {
    if (shouldStop?.()) throw createSchedulerStopError(stopSourceKey || sources[0] || "");
  };
  let data = await readCurrentData();
  const mobileSources = sources.filter((source) => ["taptap", "ninegame", "hykb", "xiaoqi", "mobile"].includes(source));
  const shouldCrawlSteam = sources.some((source) => ["steam", "steamNew", "pc", "pc-steam"].includes(source));
  const shouldCrawlSteamGames = sources.some((source) => ["steam", "pc", "pc-steam"].includes(source));
  const shouldCrawlSteamNew = sources.some((source) => ["steamNew", "pc", "pc-steam"].includes(source));
  const shouldCrawlNews = sources.some((source) => ["gcores", "gamersky", "ali213", "pcNews", "news", "pc-news"].includes(source));
  checkStopped();
  if (mobileSources.length) {
    const mobileData = await crawlToday({ sources: mobileSources, existingData: data });
    checkStopped();
    data = mergeCrawlData(data, mobileData, mobileSources);
    await writeCurrentData(data);
  }
  if (shouldCrawlSteam) {
    checkStopped();
    const steamOptions = shouldCrawlSteamGames && shouldCrawlSteamNew
      ? { maxApps: 56, discoverLimit: 60, targetItems: 28, targetNewItems: 12, delayMs: 5, concurrency: 8 }
      : shouldCrawlSteamGames
        ? { maxApps: 28, discoverLimit: 35, targetItems: 22, targetNewItems: 0, delayMs: 5, concurrency: 8 }
        : { maxApps: 34, discoverLimit: 45, targetItems: 0, targetNewItems: 16, delayMs: 5, concurrency: 8 };
    const sample = await sampleSteamOfficial(steamOptions);
    checkStopped();
    data = await writeSteamSampleToCurrentData(sample);
  }
  if (shouldCrawlNews) {
    checkStopped();
    const newsSourceKeys = sources.filter((source) => ["gcores", "gamersky", "ali213"].includes(source));
    const sample = await samplePcNews({ limitPerSource: 20, apply: false, sourceKeys: newsSourceKeys, existingRecords: data.pcNews || [] });
    checkStopped();
    data = await writePcNewsToCurrentData(sample);
  }
  checkStopped();
  data.schedulerJobs = await getSchedulerJobs(localDbFile);
  await writeCurrentData(data);
  return normalizeDataShape(data);
}

async function fileInfo(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return {
      exists: true,
      size: stat.isFile() ? stat.size : 0,
      modifiedAt: stat.mtime.toISOString(),
      isDirectory: stat.isDirectory(),
    };
  } catch {
    return { exists: false, size: 0, modifiedAt: "", isDirectory: false };
  }
}

async function openInExplorer(targetPath) {
  const resolved = path.resolve(targetPath);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat) throw new Error("路径不存在：" + resolved);
  const args = [stat.isDirectory() ? resolved : path.dirname(resolved)];
  const child = spawn("explorer.exe", args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

async function backupCurrentData() {
  try {
    const content = await fs.readFile(currentDataFile, "utf8");
    await fs.mkdir(undoDir, { recursive: true });
    const file = path.join(undoDir, `current-${Date.now()}.json`);
    await fs.writeFile(file, content, "utf8");
    const files = (await fs.readdir(undoDir)).filter((name) => /^current-\d+\.json$/.test(name)).sort().reverse();
    await Promise.all(files.slice(20).map((name) => fs.rm(path.join(undoDir, name), { force: true })));
  } catch {
    // No previous current.json yet.
  }
}

async function createDataBackup(reason = "manual") {
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const result = { reason, createdAt: new Date().toISOString(), files: [] };
  const copyIfExists = async (source, suffix) => {
    try {
      await fs.access(source);
      const target = path.join(backupDir, `${stamp}-${reason}-${suffix}`);
      await fs.copyFile(source, target);
      result.files.push(target);
    } catch {
      // Source does not exist yet.
    }
  };
  await copyIfExists(currentDataFile, "current.json");
  if (reason !== "startup") await copyIfExists(localDbFile, "newgamewiki.db");
  const files = (await fs.readdir(backupDir).catch(() => []))
    .filter((name) => /-current\.json$|-newgamewiki\.db$/.test(name))
    .sort()
    .reverse();
  await Promise.all(files.slice(20).map((name) => fs.rm(path.join(backupDir, name), { force: true })));
  return result;
}

async function restoreLatestUndoSnapshot() {
  const files = (await fs.readdir(undoDir).catch(() => [])).filter((name) => /^current-\d+\.json$/.test(name)).sort().reverse();
  if (!files.length) throw new Error("暂无可撤销的本地备份");
  const file = path.join(undoDir, files[0]);
  const data = normalizeDataShape(JSON.parse(await fs.readFile(file, "utf8")));
  data.updateLogs = [
    { id: `log-undo-${Date.now()}`, time: new Date().toISOString(), type: "撤销", title: "恢复到上一次数据备份", detail: `已从 ${files[0]} 恢复 current.json。` },
    ...(data.updateLogs || []),
  ].slice(0, 80);
  data.generatedAt = new Date().toISOString();
  await writeCurrentData(data, { skipBackup: true });
  await fs.rm(file, { force: true });
  return { data, file };
}

async function restoreLatestOperation() {
  const logs = await getOperationLogs(localDbFile, { limit: 50 });
  const operation = logs.find((log) => ["编辑", "可见状态", "删除"].includes(log.type) && log.payload?.before && log.payload?.pool);
  if (!operation) throw new Error("暂无可撤销的数据库操作");
  const before = operation.payload.before;
  const pool = operation.payload.pool;
  const baseData = await readCurrentData();
  await upsertGameRecord(localDbFile, pool, before);
  let data = await rebuildCurrentDataFromRecords(localDbFile, baseData);
  appendUpdateLog(data, {
    type: "撤销",
    title: "撤销最近一次数据库操作",
    detail: `${before.gameName || before.newsTitle || operation.targetId} 已恢复到操作前状态。`,
  });
  await writeCurrentData(data);
  await appendOperationLog(localDbFile, {
    type: "撤销",
    targetType: operation.targetType,
    targetId: operation.targetId,
    title: "撤销数据库操作",
    detail: `已撤销：${operation.title}`,
    payload: { revertedOperationId: operation.id, restored: before, pool },
  });
  return { data, operation };
}

async function exportWorkbook() {
  await fs.mkdir(excelDir, { recursive: true });
  await runPython(path.join(root, "server", "excel", "export_excel.py"), [currentDataFile, mobileWorkbookFile]);
  const stat = await fs.stat(mobileWorkbookFile);
  return {
    file: mobileWorkbookFile,
    updatedAt: stat.mtime.toISOString(),
  };
}

async function applyWorkbook() {
  await runPython(path.join(root, "server", "excel", "import_excel.py"), [mobileWorkbookFile, currentDataFile, currentDataFile]);
  return readCurrentData();
}

function applyFieldChoice(data, { gameId, field, value, source }) {
  const game = [...(data.mobileGames || []), ...(data.welfareGames || []), ...(data.pcGames || []), ...(data.steamGames || []), ...(data.steamNewGames || []), ...(data.pcNews || [])].find((item) => item.id === gameId);
  if (!game) return { ok: false, message: "未找到对应游戏" };
  const result = applyFieldToRecord(game, { field, value, source });
  if (!result.ok) return result;
  Object.assign(game, result.item);
  syncPcSplitPools(data, game);
  data.updateLogs = [
    { id: `log-field-${Date.now()}`, time: new Date().toISOString(), type: "审核", title: "字段采用", detail: `${game.gameName}：${fieldLabel(field)}采用 ${source || "手动值"}。` },
    ...(data.updateLogs || []),
  ].slice(0, 80);
  data.generatedAt = new Date().toISOString();
  return { ok: true, title: game.gameName || game.newsTitle || game.id };
}

function applyFieldToRecord(record, { field, value, source }) {
  const game = { ...(record || {}) };
  const allowed = new Set([
    "gameName", "subtitle", "gameplayTags", "vendor", "summary", "status", "eventAt", "iconUrl",
    "newsTitle", "relatedGame", "author", "category", "publishText", "price", "releaseText", "appid",
    "developers", "publishers", "screenshotUrls", "lastKnownPlayers", "previousPlayers", "playerGrowth",
    "playerCount", "reservationCount", "downloadCount", "popularityText", "welfareKind", "importanceLevel",
  ]);
  if (!allowed.has(field)) return { ok: false, message: "不支持的字段" };
  const cleanedValue = Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : String(value || "").trim();
  if (field === "gameplayTags") {
    const tags = Array.isArray(cleanedValue) ? cleanedValue : String(cleanedValue || "").split(/[\/、,，]/).map((item) => item.trim()).filter(Boolean);
    game.gameplayTags = [...new Set(tags)];
    game.tags = [...new Set([game.status, game.eventType, ...game.gameplayTags].filter(Boolean))];
  } else if (field === "summary") {
    game.summary = String(cleanedValue || "");
    game.updateContent = game.updateContent || "";
  } else if (field === "status") {
    game.status = String(cleanedValue || "");
    game.tags = [...new Set([game.status, game.eventType, ...(game.gameplayTags || [])].filter(Boolean))];
  } else if (field === "importanceLevel") {
    const level = String(cleanedValue || "").trim().toUpperCase();
    game.importanceLevel = ["S", "A", "B", "C"].includes(level) ? level : "C";
  } else if (["developers", "publishers", "screenshotUrls"].includes(field)) {
    game[field] = Array.isArray(cleanedValue) ? cleanedValue : String(cleanedValue || "").split(/[|/、,，\s]+/).map((item) => item.trim()).filter(Boolean);
  } else if (["lastKnownPlayers", "previousPlayers", "playerGrowth", "playerCount", "reservationCount", "downloadCount"].includes(field)) {
    const numeric = Number(cleanedValue);
    game[field] = Number.isFinite(numeric) ? numeric : null;
  } else {
    game[field] = String(cleanedValue || "");
  }
  game.manualChoices = {
    ...(game.manualChoices || {}),
    [field]: { value: cleanedValue, source: source || "手动审核", updatedAt: new Date().toISOString() },
  };
  return { ok: true, item: game, title: game.gameName || game.newsTitle || game.id };
}

function fieldLabel(field) {
  const labelMap = { gameName: "游戏名称", subtitle: "副标题", gameplayTags: "玩法标签", vendor: "游戏厂商", summary: "整理内容", status: "状态分类", eventAt: "日期", iconUrl: "游戏图标", newsTitle: "资讯标题", relatedGame: "关联游戏", author: "作者", category: "资讯类型", publishText: "发布时间", price: "价格", releaseText: "发售日期", appid: "Steam AppID", developers: "开发商", publishers: "发行商", screenshotUrls: "截图", lastKnownPlayers: "最近在线", previousPlayers: "上次在线", playerGrowth: "人数增长", playerCount: "在玩人数", reservationCount: "预约人数", downloadCount: "下载人数", popularityText: "热度文本", welfareKind: "福利类型", importanceLevel: "重要级别" };
  return labelMap[field] || field;
}

function pickRecordAuditFields(item = {}) {
  return {
    id: item.id,
    gameName: item.gameName,
    newsTitle: item.newsTitle,
    visible: item.visible,
    deletedAt: item.deletedAt,
    status: item.status,
    eventAt: item.eventAt,
    summary: item.summary,
  };
}

function mergeCrawlData(current, next, selectedSources = []) {
  const selected = new Set(selectedSources);
  const updatesMobile = selected.has("taptap") || selected.has("ninegame") || selected.has("hykb") || selected.has("mobile");
  const updatesWelfare = selected.has("xiaoqi");
  const merged = {
    ...current,
    ...next,
    mobileGames: updatesMobile ? upsertPoolRecords(current.mobileGames || [], next.mobileGames || []) : (current.mobileGames || []),
    rawMobileRecords: updatesMobile ? upsertPoolRecords(current.rawMobileRecords || [], next.rawMobileRecords || []) : (current.rawMobileRecords || []),
    welfareGames: updatesWelfare ? upsertPoolRecords(current.welfareGames || [], next.welfareGames || []) : (current.welfareGames || []),
    rawWelfareRecords: updatesWelfare ? upsertPoolRecords(current.rawWelfareRecords || [], next.rawWelfareRecords || []) : (current.rawWelfareRecords || []),
    pcGames: current.pcGames || [],
    steamGames: current.steamGames || [],
    steamNewGames: current.steamNewGames || [],
    pcNews: current.pcNews || [],
    rawPcRecords: current.rawPcRecords || [],
    cleanupIssues: next.partialSingle
      ? mergeSingleIssues(current.cleanupIssues || [], next.cleanupIssues || [], next.partialTitle)
      : mergeIssues(current.cleanupIssues || [], next.cleanupIssues || [], { updatesMobile, updatesWelfare, current, next }),
    sourceGroups: mergeSourceGroups(current.sourceGroups || [], next.sourceGroups || []),
    updateLogs: [...(next.updateLogs || []), ...(current.updateLogs || [])].slice(0, 80),
    schedulerJobs: current.schedulerJobs?.length ? current.schedulerJobs : next.schedulerJobs,
  };
  const normalized = normalizeDataShape(merged);
  const cleaned = cleanExistingMobileDataset({ ...normalized, rawMobileRecords: [], rawWelfareRecords: [] });
  return normalizeDataShape({
    ...normalized,
    mobileGames: cleaned.mobileGames,
    welfareGames: cleaned.welfareGames,
    cleanupIssues: cleaned.cleanupIssues,
    metrics: cleaned.metrics,
  });
}

function upsertPoolRecords(existing = [], incoming = []) {
  const items = new Map();
  const keyToId = new Map();
  for (const item of existing) {
    const id = poolRecordKey(item);
    if (!id) continue;
    items.set(id, item);
    for (const key of poolRecordKeys(item)) keyToId.set(key, id);
  }
  for (const item of incoming) {
    const keys = poolRecordKeys(item);
    const matchedId = keys.map((key) => keyToId.get(key)).find(Boolean);
    const id = matchedId || poolRecordKey(item);
    if (!id) continue;
    const old = items.get(id) || {};
    const merged = mergePoolRecordForUpsert(old, item);
    items.set(id, merged);
    for (const key of poolRecordKeys(merged)) keyToId.set(key, id);
  }
  return [...items.values()];
}

function poolRecordKey(item = {}) {
  const keys = poolRecordKeys(item);
  if (keys.length) return keys[0];
  return String(item.id || item.appid || item.detailUrl || item.originalUrl || item.sourceId || item.gameName || item.newsTitle || "").trim();
}

function poolRecordKeys(item = {}) {
  const mobileText = [item.pool, item.platform, item.source, item.sourceKey, ...(item.sources || [])].filter(Boolean).join(" ");
  if (!item.newsTitle && /手游|小七|TapTap|好游快爆|九游|taptap|hykb|ninegame|xiaoqi/i.test(mobileText)) {
    return mobileAssociationKeys(item).map((key) => `mobile:${key}`);
  }
  return [String(item.id || item.appid || item.detailUrl || item.originalUrl || item.sourceId || item.gameName || item.newsTitle || "").trim()].filter(Boolean);
}

function mergePoolRecordForUpsert(old = {}, item = {}) {
  const sourceRecords = dedupeUpsertSourceRecords([
    ...normalizeSourceRecordsForUpsert(old),
    ...normalizeSourceRecordsForUpsert(item),
  ]);
  const bestContentRecord = chooseBestUpsertContentRecord(sourceRecords, item, old);
  const merged = {
    ...old,
    ...item,
    sources: mergeUpsertUnique([...(old.sources || []), ...(item.sources || []), old.primarySource, item.primarySource, old.source, item.source]).filter(Boolean),
    sourceRecords,
    mergedCount: sourceRecords.length || item.mergedCount || old.mergedCount,
    visible: old.visible === false ? false : item.visible,
    deletedAt: old.deletedAt && item.deletedAt === undefined ? old.deletedAt : item.deletedAt,
    manualChoices: { ...(old.manualChoices || {}), ...(item.manualChoices || {}) },
  };
  if (bestContentRecord) {
    merged.summary = chooseBestUpsertContent([
      { text: old.summary, source: old.primarySource || old.source },
      { text: item.summary, source: item.primarySource || item.source },
      { text: bestContentRecord.summary, source: bestContentRecord.source },
      { text: old.updateContent, source: old.primarySource || old.source },
      { text: item.updateContent, source: item.primarySource || item.source },
      { text: bestContentRecord.updateContent, source: bestContentRecord.source },
    ]);
    merged.updateContent = chooseBestUpsertUpdateContent([
      { text: old.updateContent, source: old.primarySource || old.source },
      { text: item.updateContent, source: item.primarySource || item.source },
      { text: bestContentRecord.updateContent, source: bestContentRecord.source },
      { text: old.summary, source: old.primarySource || old.source },
      { text: item.summary, source: item.primarySource || item.source },
      { text: bestContentRecord.summary, source: bestContentRecord.source },
    ]);
    merged.primarySource = bestContentRecord.source || item.primarySource || item.source || old.primarySource || old.source;
    merged.detailUrl = bestContentRecord.detailUrl || item.detailUrl || old.detailUrl;
    merged.originalUrl = bestContentRecord.originalUrl || item.originalUrl || old.originalUrl;
    merged.iconUrl = bestContentRecord.iconUrl || item.iconUrl || old.iconUrl;
    merged.icon = bestContentRecord.icon || item.icon || old.icon;
    merged.vendor = bestContentRecord.vendor || item.vendor || old.vendor;
  }
  return merged;
}

function normalizeSourceRecordsForUpsert(item = {}) {
  const records = Array.isArray(item.sourceRecords) ? item.sourceRecords : [];
  const fallbackSource = item.primarySource || item.source || item.sources?.[0] || "";
  const fallbackRecord = fallbackSource || item.detailUrl || item.summary || item.updateContent
    ? [{
        source: fallbackSource,
        sourceKey: item.sourceKey,
        gameName: item.gameName || item.title,
        status: item.status,
        eventType: item.eventType,
        eventAt: item.eventAt,
        summary: item.summary,
        updateContent: item.updateContent,
        detailUrl: item.detailUrl,
        originalUrl: item.originalUrl,
        iconUrl: item.iconUrl,
        icon: item.icon,
        vendor: item.vendor,
        operator: item.operator,
        tags: item.tags,
        sourceId: item.sourceId,
        platformIds: item.platformIds,
      }]
    : [];
  return [...records, ...fallbackRecord].filter((record) => record && (record.source || record.detailUrl || record.summary || record.updateContent));
}

function dedupeUpsertSourceRecords(records = []) {
  const map = new Map();
  for (const record of records) {
    const sourceKey = sourceKeyForRecord(record.sourceKey || record.source);
    const platformId = record.platformIds?.[sourceKey] || record.platformId || record.sourceId || record.gid || "";
    const key = [record.source || sourceKey || "", platformId || record.detailUrl || record.originalUrl || record.gameName || ""].join("|");
    const previous = map.get(key);
    if (!previous) {
      map.set(key, record);
      continue;
    }
    const previousText = cleanUpsertContent(previous.summary || previous.updateContent);
    const nextText = cleanUpsertContent(record.summary || record.updateContent);
    const preferred = upsertContentScore(record) > upsertContentScore(previous) ? record : previous;
    const previousDate = new Date(previous.eventAt || "");
    const nextDate = new Date(record.eventAt || "");
    const eventAt = Number.isNaN(previousDate.getTime()) ? record.eventAt : Number.isNaN(nextDate.getTime()) ? previous.eventAt : (previousDate <= nextDate ? previous.eventAt : record.eventAt);
    map.set(key, {
      ...previous,
      ...preferred,
      eventAt: eventAt || preferred.eventAt || previous.eventAt || record.eventAt,
      summary: preferred.summary || previous.summary || record.summary || previousText || nextText,
      updateContent: preferred.updateContent || previous.updateContent || record.updateContent || previousText || nextText,
      tags: [...new Set([...(previous.tags || []), ...(record.tags || [])].filter(Boolean))],
      platformIds: { ...(previous.platformIds || {}), ...(record.platformIds || {}) },
    });
  }
  return [...map.values()];
}

function chooseBestUpsertContentRecord(records = [], item = {}, old = {}) {
  const candidates = [
    ...records,
    { ...old, source: old.primarySource || old.source },
    { ...item, source: item.primarySource || item.source },
  ].filter((record) => cleanUpsertContent(record.summary || record.updateContent));
  return candidates.sort((left, right) => upsertContentScore(right) - upsertContentScore(left))[0] || null;
}

function chooseBestUpsertContent(candidates = []) {
  return candidates
    .map((candidate) => ({ ...candidate, text: cleanUpsertContent(candidate.text) }))
    .filter((candidate) => candidate.text)
    .sort((left, right) => upsertContentScore({ source: right.source, summary: right.text }) - upsertContentScore({ source: left.source, summary: left.text }))[0]?.text || "";
}

function chooseBestUpsertUpdateContent(candidates = []) {
  const merged = [];
  for (const candidate of candidates
    .map((item) => ({ ...item, text: cleanUpsertContent(item.text) }))
    .filter((item) => item.text)
    .sort((left, right) => upsertContentScore({ source: right.source, summary: right.text }) - upsertContentScore({ source: left.source, summary: left.text }))) {
    if (!merged.some((text) => text.includes(candidate.text) || candidate.text.includes(text) || compactText(text) === compactText(candidate.text))) {
      merged.push(candidate.text);
    }
  }
  return merged.slice(0, 2).join("\n");
}

function upsertContentScore(record = {}) {
  const source = String(record.source || "");
  const text = cleanUpsertContent(record.summary || record.updateContent || "");
  if (!text) return 0;
  let score = Math.min(text.length, 140);
  if (/(公测|内测|开服|开测|首发|上线|测试|招募|资格|版本|赛季|联动|返场|更新|开启|新增|活动)/.test(text)) score += 70;
  if (/(\d{1,2}月\d{1,2}日|\d{1,2}:\d{2}|上午\d{1,2}点|下午\d{1,2}点)/.test(text)) score += 30;
  if (source === "好游快爆") score += 100;
  if (source === "TapTap") score += 45;
  if (source === "九游") score -= 40;
  if (source === "九游" && /^\d{1,2}月\d{1,2}日新活动$/.test(text)) score -= 90;
  if (/^(新活动|活动|更新|上线|开测|预约|下载|试玩)$/.test(text)) score -= 110;
  return score;
}

function cleanUpsertContent(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mergeUpsertUnique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function sourceKeyForRecord(source = "") {
  const normalized = String(source || "").trim();
  const map = {
    TapTap: "taptap",
    好游快爆: "hykb",
    九游: "ninegame",
    小七手游: "xiaoqi",
    Steam: "steam",
    Steam游戏: "steam",
    Steam新游: "steam",
    机核: "gcores",
    游民星空: "gamersky",
    游侠网: "ali213",
    taptap: "taptap",
    hykb: "hykb",
    ninegame: "ninegame",
    xiaoqi: "xiaoqi",
    steam: "steam",
    steamNew: "steam",
    gcores: "gcores",
    gamersky: "gamersky",
    ali213: "ali213",
  };
  return map[normalized] || "";
}

function inferSourceKeyForRecord(item = {}) {
  const ids = item?.platformIds || {};
  const priority = ["xiaoqi", "taptap", "hykb", "ninegame", "steam", "gcores", "gamersky", "ali213"];
  const fromIds = priority.find((key) => ids[key]);
  if (fromIds) return fromIds;
  for (const record of item?.sourceRecords || []) {
    const key = sourceKeyForRecord(record.sourceKey || record.source || "");
    if (key) return key;
    const recordIds = record.platformIds || {};
    const fromRecordIds = priority.find((idKey) => recordIds[idKey]);
    if (fromRecordIds) return fromRecordIds;
  }
  return "";
}

async function crawlSingleRecordBySource({ sourceKey, platformId, detailUrl, target }) {
  if (["taptap", "ninegame", "hykb", "xiaoqi"].includes(sourceKey)) {
    return crawlSingleMobileRecord({ sourceKey, platformId, detailUrl, target });
  }
  if (sourceKey === "steam") {
    return sampleSingleSteamApp({ appid: platformId || target?.appid, target });
  }
  if (["gcores", "gamersky", "ali213"].includes(sourceKey)) {
    return sampleSinglePcNewsRecord({ sourceKey, platformId, detailUrl, target });
  }
  throw new Error("当前来源暂不支持单条详情页重抓");
}

function mergeSingleRecordData(data, partial, { sourceKey, target } = {}) {
  if (["taptap", "ninegame", "hykb", "xiaoqi"].includes(sourceKey)) {
    return mergeCrawlData(data, partial, [sourceKey]);
  }
  if (sourceKey === "steam") {
    const incoming = partial.records || [];
    if (!incoming.length) throw new Error("Steam 单条详情未生成入池记录");
    data.pcGames = upsertPoolRecords([...(data.pcGames || []), ...(data.steamGames || []), ...(data.steamNewGames || [])], incoming);
    data.steamGames = [];
    data.steamNewGames = [];
    data.rawPcRecords = upsertPoolRecords(data.rawPcRecords || [], partial.items || []);
    return normalizeDataShape(data);
  }
  if (["gcores", "gamersky", "ali213"].includes(sourceKey)) {
    const incoming = partial.records || [];
    if (!incoming.length) throw new Error("资讯单条详情未生成入池记录");
    data.pcNews = upsertPoolRecords(data.pcNews || [], incoming);
    data.pcGames = upsertPoolRecords(data.pcGames || [], incoming);
    data.rawPcRecords = upsertPoolRecords(data.rawPcRecords || [], incoming);
    return normalizeDataShape(data);
  }
  if (!target) throw new Error("未找到可合并的单条记录");
  return normalizeDataShape(data);
}

function mergeSingleRecordIntoPool(data, partial, { sourceKey, target, gameId = "", title = "" } = {}) {
  const incoming = pickSingleIncomingRecord(partial, { sourceKey, target, title });
  if (!incoming) throw new Error("单条重抓未返回可合并记录");
  const existingEntry = findPoolEntry(data, gameId || target?.id, title || target?.gameName || target?.newsTitle);
  const beforeItem = existingEntry?.item || target || {};
  const pool = chooseSingleRecordPool(sourceKey, incoming, existingEntry?.pool);
  const mergedItem = preserveRecordIdentity(beforeItem, incoming, sourceKey);
  const changedFields = diffRecordFields(beforeItem, mergedItem);
  const cleanupBefore = (data.cleanupIssues || []).filter((issue) => issueMatchesTarget(issue, { title, targetId: gameId || target?.id, sourceKey })).length;
  const cleanupAfter = (partial.cleanupIssues || []).filter((issue) => issueMatchesTarget(issue, { title, targetId: gameId || target?.id, sourceKey })).length;
  return {
    pool,
    previousPool: existingEntry?.pool || "",
    key: poolMapKey(pool),
    item: mergedItem,
    before: pickRecordAuditFields(beforeItem),
    changedFields,
    cleanupResolvedCount: Math.max(0, cleanupBefore - cleanupAfter),
  };
}

function pickSingleIncomingRecord(partial = {}, { sourceKey, target = {}, title = "" } = {}) {
  const records = sourceKey === "xiaoqi"
    ? partial.welfareGames || []
    : ["taptap", "ninegame", "hykb"].includes(sourceKey)
      ? partial.mobileGames || []
      : ["gcores", "gamersky", "ali213"].includes(sourceKey)
        ? partial.records || partial.pcNews || []
        : partial.records || partial.steamGames || partial.steamNewGames || [];
  const targetValues = new Set(recordLookupValues(target));
  const targetTitle = compactText(title || target.gameName || target.newsTitle);
  return records.find((item) => recordLookupValues(item).some((value) => targetValues.has(value)))
    || records.find((item) => targetTitle && compactText(item.gameName || item.newsTitle || "") === targetTitle)
    || records[0]
    || null;
}

function chooseSingleRecordPool(sourceKey = "", item = {}, fallbackPool = "") {
  if (sourceKey === "xiaoqi") return "welfare";
  if (["taptap", "ninegame", "hykb"].includes(sourceKey)) return "mobile";
  if (["gcores", "gamersky", "ali213"].includes(sourceKey)) return "pc_news";
  if (sourceKey === "steam") {
    if (Number(item.lastKnownPlayers ?? item.currentPlayers) >= 1000) return "steam";
    if (isSteamNewRecord(item)) return "steam_new";
    return fallbackPool === "steam" || fallbackPool === "steam_new" ? fallbackPool : "steam_new";
  }
  return fallbackPool || "mobile";
}

function preserveRecordIdentity(oldItem = {}, incoming = {}, sourceKey = "") {
  const manualChoices = { ...(oldItem.manualChoices || {}), ...(incoming.manualChoices || {}) };
  const next = {
    ...oldItem,
    ...incoming,
    id: oldItem.id || incoming.id,
    visible: oldItem.visible === false ? false : incoming.visible,
    deletedAt: oldItem.deletedAt || incoming.deletedAt,
    manualChoices,
    platformIds: { ...(oldItem.platformIds || {}), ...(incoming.platformIds || {}) },
    sourceRecords: mergeSourceRecords(oldItem.sourceRecords || [], incoming.sourceRecords || [], sourceKey),
  };
  for (const [field, choice] of Object.entries(oldItem.manualChoices || {})) {
    if (!choice || !Object.prototype.hasOwnProperty.call(choice, "value")) continue;
    next[field] = choice.value;
  }
  return next;
}

function mergeSourceRecords(existing = [], incoming = [], sourceKey = "") {
  const map = new Map();
  for (const record of existing) {
    const key = sourceRecordKey(record, sourceKey);
    if (key) map.set(key, record);
  }
  for (const record of incoming) {
    const key = sourceRecordKey(record, sourceKey);
    if (!key) continue;
    map.set(key, { ...(map.get(key) || {}), ...record, platformIds: { ...(map.get(key)?.platformIds || {}), ...(record.platformIds || {}) } });
  }
  return [...map.values()];
}

function sourceRecordKey(record = {}, fallbackSourceKey = "") {
  return String(sourceKeyForRecord(record.sourceKey || record.source || fallbackSourceKey) || record.detailUrl || record.originalUrl || record.sourceId || record.platformId || JSON.stringify(record.platformIds || {})).trim();
}

function isSteamNewRecord(item = {}) {
  const labels = [item.status, item.eventType, item.category, ...(Array.isArray(item.steamLabels) ? item.steamLabels : [])];
  return Boolean(item.comingSoon || labels.some((value) => /新游|预约|即将推出/.test(String(value || ""))));
}

function diffRecordFields(before = {}, after = {}) {
  const fields = ["gameName", "newsTitle", "subtitle", "summary", "status", "eventAt", "publishedAt", "author", "relatedGame", "price", "releaseText", "lastKnownPlayers", "iconUrl", "detailUrl", "originalUrl"];
  return fields.filter((field) => JSON.stringify(before[field] ?? "") !== JSON.stringify(after[field] ?? ""));
}

function mergeRawSingleRecords(existing = [], incoming = [], sourceKey = "", title = "") {
  const targetTitle = compactText(title);
  const filtered = incoming.filter((item) => {
    if (!targetTitle) return true;
    return compactText(item.gameName || item.newsTitle || item.title || "") === targetTitle;
  });
  return filtered.length ? upsertPoolRecords(existing, filtered) : existing;
}

function poolMapKey(pool = "") {
  const map = { mobile: "mobileGames", welfare: "welfareGames", steam: "steamGames", steam_new: "steamNewGames", pc_news: "pcNews" };
  return map[pool] || "";
}

function platformIdForRecord(item = {}, sourceKey = "") {
  const direct = item?.platformIds?.[sourceKey];
  if (direct) return String(direct);
  if (sourceKey === "steam" && item?.appid) return String(item.appid);
  if (sourceKey === "xiaoqi" && item?.gid) return String(item.gid);
  const sourceRecord = (item?.sourceRecords || []).find((record) => sourceKeyForRecord(record.sourceKey || record.source) === sourceKey);
  if (sourceRecord?.platformIds?.[sourceKey]) return String(sourceRecord.platformIds[sourceKey]);
  if (sourceKey === "xiaoqi" && sourceRecord?.gid) return String(sourceRecord.gid);
  return idFromUrl(detailUrlForRecord(item, sourceKey), sourceKey);
}

function detailUrlForRecord(item = {}, sourceKey = "") {
  const sourceRecord = (item?.sourceRecords || []).find((record) => sourceKeyForRecord(record.sourceKey || record.source) === sourceKey);
  return String(sourceRecord?.detailUrl || sourceRecord?.originalUrl || item?.detailUrl || item?.originalUrl || "");
}

function findRecordWithPlatformDetail(data = {}, target = {}, sourceKey = "") {
  const titleKey = compactText(target?.gameName || target?.newsTitle || "");
  if (!titleKey) return null;
  const pools = ["mobileGames", "welfareGames", "pcGames", "steamGames", "steamNewGames", "pcNews", "rawMobileRecords", "rawWelfareRecords", "rawPcRecords"];
  for (const key of pools) {
    for (const item of data[key] || []) {
      const itemTitle = compactText(item.gameName || item.newsTitle || "");
      if (itemTitle !== titleKey) continue;
      const id = platformIdForRecord(item, sourceKey);
      const url = detailUrlForRecord(item, sourceKey);
      if (id || url) return item;
    }
  }
  return null;
}

function idFromUrl(url = "", sourceKey = "") {
  const value = String(url || "");
  const patterns = {
    taptap: /taptap\.cn\/app\/(\d+)/i,
    xiaoqi: /x7sy\.com\/game\/(?:app|h5)\/([^/?#]+)/i,
    steam: /store\.steampowered\.com\/app\/(\d+)/i,
    gcores: /gcores\.com\/articles\/(\d+)/i,
    ninegame: /9game\.cn\/([^/?#]+)\/?/i,
    hykb: /3839\.com\/a\/(\d+)\.htm/i,
  };
  return value.match(patterns[sourceKey])?.[1] || "";
}

function pickSingleCrawlRecord(crawled, { sourceKey, targetTitle }) {
  const sameTitle = (item) => compactText(item.gameName || item.newsTitle || "") === compactText(targetTitle);
  const mobileGames = (crawled.mobileGames || []).filter(sameTitle);
  const welfareGames = (crawled.welfareGames || []).filter(sameTitle);
  const rawMobileRecords = (crawled.rawMobileRecords || []).filter(sameTitle);
  const rawWelfareRecords = (crawled.rawWelfareRecords || []).filter(sameTitle);
  const cleanupIssues = [
    ...(crawled.cleanupIssues || []).filter((issue) => compactText(issue.title || "") === compactText(targetTitle)),
  ];
  return {
    ...crawled,
    mobileGames: sourceKey === "xiaoqi" ? [] : mobileGames,
    welfareGames: sourceKey === "xiaoqi" ? welfareGames : [],
    rawMobileRecords: sourceKey === "xiaoqi" ? [] : rawMobileRecords,
    rawWelfareRecords: sourceKey === "xiaoqi" ? rawWelfareRecords : [],
    cleanupIssues,
    updateLogs: [],
    partialSingle: true,
    partialTitle: targetTitle,
  };
}

function compactText(value = "") {
  return String(value || "").replace(/[\s:：\-—_·・《》【】（）()]/g, "").toLowerCase();
}

function mergeIssues(currentIssues, nextIssues, { updatesMobile, updatesWelfare, current = {}, next = {} }) {
  const mobileTitles = updatesMobile ? issueTitleSet([...(current.mobileGames || []), ...(next.mobileGames || [])]) : new Set();
  const welfareTitles = updatesWelfare ? issueTitleSet([...(current.welfareGames || []), ...(next.welfareGames || [])]) : new Set();
  const keepCurrent = currentIssues.filter((issue) => {
    const source = issue.source || "";
    if (updatesMobile && ["TapTap", "九游", "好游快爆"].includes(source)) return false;
    if (updatesWelfare && source === "小七手游") return false;
    const titleKey = compactText(issue.title || "");
    if (updatesWelfare && titleKey === compactText("小七手游")) return false;
    if (updatesMobile && titleKey && mobileTitles.has(titleKey)) return false;
    if (updatesWelfare && titleKey && welfareTitles.has(titleKey)) return false;
    return true;
  });
  return [...nextIssues.map(normalizeCleanupIssue), ...keepCurrent.map(normalizeCleanupIssue)].slice(0, 300);
}

function issueTitleSet(items = []) {
  return new Set(items.map((item) => compactText(item.gameName || item.newsTitle || item.title || "")).filter(Boolean));
}

function mergeSingleIssues(currentIssues, nextIssues, target = "") {
  const targetInfo = typeof target === "string" ? { title: target } : (target || {});
  const keepCurrent = currentIssues.filter((issue) => !issueMatchesTarget(issue, targetInfo));
  return [...nextIssues.map(normalizeCleanupIssue), ...keepCurrent.map(normalizeCleanupIssue)].slice(0, 300);
}

function issueMatchesTarget(issue = {}, { issueId = "", title = "", sourceKey = "", targetId = "" } = {}) {
  const normalized = normalizeCleanupIssue(issue);
  const issueSourceKey = sourceKeyForRecord(normalized.source || normalized.platform || normalized.sourceKey || "");
  const sourceMatches = !sourceKey || !issueSourceKey || issueSourceKey === sourceKey;
  if (issueId && (normalized.id === issueId || String(issue.id || "").trim() === issueId)) return true;
  if (targetId && recordLookupValues(normalized).includes(String(targetId))) return sourceMatches;
  const titleKey = compactText(title);
  return Boolean(titleKey && compactText(normalized.title || normalized.gameName || normalized.newsTitle || "") === titleKey && sourceMatches);
}

function normalizeCleanupIssue(issue = {}) {
  const title = String(issue.title || issue.gameName || issue.newsTitle || issue.detail || "").slice(0, 80);
  const source = String(issue.source || issue.platform || "");
  const sourceKey = sourceKeyForRecord(issue.sourceKey || source);
  const targetId = String(issue.targetId || issue.platformId || issue.sourceId || issue.gid || "").trim();
  const detailUrl = String(issue.detailUrl || "").trim();
  const type = String(issue.type || "抓取问题");
  const existingId = String(issue.id || "").trim();
  const stableId = `issue-${compactText(sourceKey || source || "source")}-${compactText(title || "record")}-${compactText(type)}`.slice(0, 128);
  return {
    ...issue,
    id: existingId && !/^issue-\d+$/i.test(existingId) ? existingId : stableId,
    sourceKey,
    targetId,
    detailUrl,
    type,
    status: issue.status || "open",
  };
}

function refreshCleanupIssuesForRecord(data, item) {
  if (!item) return { resolvedCount: 0, remainingCount: 0 };
  const title = item.gameName || item.newsTitle || "";
  const targetId = item.id || item.appid || item.detailUrl || "";
  const sourceKeys = [...new Set([
    inferSourceKeyForRecord(item),
    ...(item.sourceRecords || []).map((record) => sourceKeyForRecord(record.sourceKey || record.source)),
  ].filter(Boolean))];
  const related = (data.cleanupIssues || [])
    .map(normalizeCleanupIssue)
    .filter((issue) => issueMatchesTarget(issue, { title, targetId }) || sourceKeys.some((sourceKey) => issueMatchesTarget(issue, { title, targetId, sourceKey })));
  const live = buildCleanupIssuesForItems([item]).map(normalizeCleanupIssue);
  const liveWithStatus = live.map((issue) => {
    const previous = related.find((oldIssue) => issueMatchesTarget(oldIssue, {
      title: issue.title,
      sourceKey: issue.sourceKey,
      targetId: issue.targetId || targetId,
    }) && oldIssue.type === issue.type);
    return previous?.status === "ignored" ? { ...issue, status: "ignored" } : issue;
  });
  const relatedIds = new Set(related.map((issue) => issue.id));
  data.cleanupIssues = [
    ...liveWithStatus,
    ...(data.cleanupIssues || []).map(normalizeCleanupIssue).filter((issue) => !relatedIds.has(issue.id)),
  ].slice(0, 300);
  data.generatedAt = new Date().toISOString();
  return { resolvedCount: Math.max(0, related.length - liveWithStatus.length), remainingCount: liveWithStatus.length };
}

function updateCleanupIssueStatus(data, { issueId = "", title = "", status = "open" }) {
  const lookupId = String(issueId || "").trim();
  const lookupTitle = compactText(title);
  let found = null;
  data.cleanupIssues = (data.cleanupIssues || []).map((issue) => {
    const normalized = normalizeCleanupIssue(issue);
    const matched = (lookupId && (normalized.id === lookupId || String(issue.id || "").trim() === lookupId)) || (lookupTitle && compactText(normalized.title || "") === lookupTitle);
    if (!matched) return normalized;
    const before = { ...normalized };
    found = { before, issue: { ...normalized, status, updatedAt: new Date().toISOString() } };
    return found.issue;
  });
  data.generatedAt = new Date().toISOString();
  return found ? { ok: true, ...found } : { ok: false, message: "未找到对应清洗问题" };
}

function cleanupStatusLabel(status = "") {
  if (status === "ignored") return "已忽略";
  if (status === "resolved") return "已解决";
  return "待处理";
}

function mergeSourceGroups(currentGroups, nextGroups) {
  const map = new Map(currentGroups.map((group) => [group.key, group]));
  for (const group of nextGroups) map.set(group.key, { ...(map.get(group.key) || {}), ...group });
  return [...map.values()];
}

function setPoolRecordVisibility(data, { gameId, visible }) {
  const game = findPoolRecord(data, gameId);
  if (!game) return { ok: false, message: "未找到对应记录" };
  game.visible = Boolean(visible);
  game.manualChoices = {
    ...(game.manualChoices || {}),
    visible: { value: game.visible, source: "来源管理", updatedAt: new Date().toISOString() },
  };
  syncPcSplitPools(data, game);
  appendUpdateLog(data, {
    type: "管理",
    title: game.visible ? "恢复前端展示" : "隐藏前端展示",
    detail: `${game.gameName || game.newsTitle || game.id}：${game.visible ? "已恢复展示" : "已从前端隐藏"}。`,
  });
  return { ok: true, title: game.gameName || game.newsTitle || game.id };
}

function deletePoolRecord(data, { gameId }) {
  const game = findPoolRecord(data, gameId);
  if (!game) return { ok: false, message: "未找到对应记录" };
  const removed = { id: game.id, title: game.gameName || game.newsTitle || game.id };
  for (const key of ["mobileGames", "welfareGames", "pcGames", "steamGames", "steamNewGames", "pcNews"]) {
    if (!Array.isArray(data[key])) continue;
    data[key] = data[key].filter((item) => item.id !== gameId);
  }
  appendUpdateLog(data, {
    type: "管理",
    title: "删除单条记录",
    detail: `${removed.title} 已从当前数据池移除。`,
  });
  return { ok: true, removed };
}

function findPoolRecord(data, gameId) {
  return [...(data.mobileGames || []), ...(data.welfareGames || []), ...(data.pcGames || []), ...(data.steamGames || []), ...(data.steamNewGames || []), ...(data.pcNews || [])].find((item) => item.id === gameId);
}

function findPoolEntry(data, gameId = "", title = "") {
  const pools = [
    ["mobile", "mobileGames"],
    ["welfare", "welfareGames"],
    ["steam", "steamGames"],
    ["steam_new", "steamNewGames"],
    ["pc_news", "pcNews"],
  ];
  const lookup = String(gameId || "").trim();
  const titleKey = compactText(title);
  for (const [pool, key] of pools) {
    for (const item of data[key] || []) {
      if (lookup && recordLookupValues(item).includes(lookup)) return { pool, key, item };
      if (titleKey && compactText(item.gameName || item.newsTitle || "") === titleKey) return { pool, key, item };
    }
  }
  return null;
}

function recordLookupValues(item = {}) {
  const sourceRecordValues = (item.sourceRecords || []).flatMap((record) => [
    record.id,
    record.sourceId,
    record.platformId,
    record.detailUrl,
    record.originalUrl,
    record.url,
    ...Object.values(record.platformIds || {}),
  ]);
  return [
    item.id,
    item.appid,
    item.steamAppId,
    item.detailUrl,
    item.originalUrl,
    item.url,
    item.sourceId,
    item.platformId,
    item.gid,
    ...Object.values(item.platformIds || {}),
    ...sourceRecordValues,
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function appendUpdateLog(data, { type, title, detail }) {
  data.updateLogs = [
    { id: `log-manage-${Date.now()}`, time: new Date().toISOString(), type, title, detail },
    ...(data.updateLogs || []),
  ].slice(0, 80);
  data.generatedAt = new Date().toISOString();
}

function syncPcSplitPools(data, updatedGame) {
  if (!updatedGame?.id) return;
  for (const key of ["pcGames", "steamGames", "steamNewGames", "pcNews"]) {
    if (!Array.isArray(data[key])) continue;
    data[key] = data[key].map((item) => item.id === updatedGame.id ? { ...item, ...updatedGame } : item);
  }
}

function runPython(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [scriptPath, ...args], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `python exited with code ${code}`));
    });
  });
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message || "任务运行超时");
      error.code = "SCHEDULER_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createSchedulerStopError(sourceKey = "") {
  const error = new Error((sourceKeyLabel(sourceKey) || "任务") + " 已手动停止");
  error.code = "SCHEDULER_STOPPED";
  return error;
}
