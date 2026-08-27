import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Database, FileSpreadsheet, FolderOpen, Play, RefreshCcw, ShieldAlert, SlidersHorizontal, X } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { MetricCard, PageTitle, SectionHead, TagList } from "./shared.jsx";
import { normalizeImportanceLevel, sortByTodayFuturePast } from "../utils/timeSort.js";

const T = { overview: "数据总览", sources: "来源管理", pools: "游戏管理", welfareCompare: "福利对比", files: "数据文件", logs: "任务计划", operations: "操作日志", all: "全部" };
const FIELD_LABELS = { gameName: "游戏名称", subtitle: "副标题", gameplayTags: "玩法标签", vendor: "游戏厂商", summary: "整理内容", status: "状态分类", eventAt: "日期", iconUrl: "游戏图标", sources: "来源平台", playerCount: "在玩人数", reservationCount: "预约人数", downloadCount: "下载人数", popularityText: "热度文本", welfareKind: "福利类型", importanceLevel: "重要级别" };
const EDITABLE_POOL_FIELDS = new Set(["gameName", "subtitle", "iconUrl", "status", "eventAt", "gameplayTags", "vendor", "summary", "importanceLevel", "playerCount", "reservationCount", "downloadCount", "popularityText", "welfareKind"]);
const panels = [T.overview, T.sources, T.pools, T.welfareCompare, T.files, T.logs, T.operations];
const MANUAL_SOURCE_KEYS = ["taptap", "ninegame", "hykb", "xiaoqi", "steam", "steamNew", "gcores", "gamersky", "ali213"];
const CRAWL_SOURCE_LABELS = {
  taptap: "TapTap",
  ninegame: "九游",
  hykb: "好游快爆",
  xiaoqi: "小七手游",
  steam: "Steam游戏",
  steamNew: "Steam新游",
  gcores: "机核",
  gamersky: "游民星空",
  ali213: "游侠网",
};
const ADMIN_INFO = {
  title: "管理后台操作说明",
  summary: "后台直接管理 SQLite 主数据源，保存后会刷新 current.json 前端快照。这里不是独立假数据页面。",
  sections: [
    { title: "数据总览", items: ["查看 SQLite 主记录数、数据池数量、任务配置和最近抓取状态。", "这里只读，不会修改数据。"] },
    { title: "来源管理", items: ["勾选本次要更新的平台后点击更新。", "查看可打开来源记录弹窗，支持编辑、隐藏/恢复、软删除单条记录。", "更新结果会写入 SQLite，并同步刷新前端快照。"] },
    { title: "游戏管理", items: ["按手游、福利、端游、资讯分池管理。", "可按平台、状态、时间范围、过去/未来筛选。", "详情区可编辑字段，保存后前端页面同步变化。"] },
    { title: "任务计划", items: ["定时任务按固定时间点运行，也可单独立即运行。", "查看可编辑单个平台时间点、启用状态，并查看最近运行记录。", "批量管理用于统一启用、停用或立即运行所选来源。"] },
    { title: "操作日志", items: ["查看编辑、删除、隐藏、重抓、任务等数据库级操作。", "支持搜索、类型筛选和撤销最近一次可逆操作。"] },
  ],
};

export default function AdminPage() {
  const data = useGameData({ includeHidden: true });
  const [activePanel, setActivePanel] = useState(T.overview);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [selectedSources, setSelectedSources] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [poolKeyword, setPoolKeyword] = useState("");
  const [poolStatus, setPoolStatus] = useState(T.all);
  const [poolSource, setPoolSource] = useState(T.all);
  const [poolDateFrom, setPoolDateFrom] = useState("");
  const [poolDateTo, setPoolDateTo] = useState("");
  const [poolTimeSide, setPoolTimeSide] = useState(T.all);
  const [activePoolKind, setActivePoolKind] = useState("mobile");
  const [activeMobileSource, setActiveMobileSource] = useState(T.all);
  const [activeWelfareType, setActiveWelfareType] = useState(T.all);
  const [activePcPoolType, setActivePcPoolType] = useState("steam");
  const [activeNewsSource, setActiveNewsSource] = useState(T.all);
  const [excelInfo, setExcelInfo] = useState(null);
  const [editingGame, setEditingGame] = useState(null);
  const [crawlProgress, setCrawlProgress] = useState(0);
  const [recrawlingIssueId, setRecrawlingIssueId] = useState("");
  const [schedulerRuns, setSchedulerRuns] = useState([]);
  const [schedulerDetail, setSchedulerDetail] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [crawlRun, setCrawlRun] = useState({ open: false, items: [], completed: 0, total: 0, current: "", startedAt: "", finishedAt: "" });
  const [recordRecrawl, setRecordRecrawl] = useState({ open: false, stage: "", title: "", detail: "", updatedId: "" });
  const initializedSources = useRef(false);
  const crawlTimer = useRef(null);
  const stopRunRequested = useRef(false);
  const currentRunSource = useRef("");

  useEffect(() => {
    if (!initializedSources.current && data.sourceGroups.length) {
      initializedSources.current = true;
      setSelectedSources(MANUAL_SOURCE_KEYS);
    }
  }, [data.sourceGroups]);

  useEffect(() => {
    loadSchedulerRuns();
    loadSystemStatus();
  }, []);

  const poolRows = useMemo(() => [
    { key: "mobile", name: "手游", count: data.mobileGames.length, desc: "公共手游池", tags: ["TapTap", "好游快爆", "九游"] },
    { key: "welfare", name: "福利", count: data.welfareGames.length, desc: "福利新游池", tags: ["小七手游", "只要新游", "排除新服"] },
    { key: "pc", name: "端游", count: data.steamGames.length + data.steamNewGames.length, desc: "Steam 游戏池", tags: ["端游", "Steam"] },
    { key: "news", name: "资讯", count: data.pcNews.length, desc: "端游资讯池", tags: ["机核", "游民星空", "游侠网"] },
  ], [data.mobileGames.length, data.pcNews.length, data.steamGames.length, data.steamNewGames.length, data.welfareGames.length]);

  const activePoolGames = useMemo(() => {
    const byTime = (items) => [...items].sort(sortByAdminPoolTime);
    if (activePoolKind === "welfare") {
      if (activeWelfareType === "discount") return byTime(data.welfareGames.filter((item) => /折|免费|福利|代金券/.test([item.subtitle, item.summary, item.updateContent].join(" "))));
      if (activeWelfareType === "regular") return byTime(data.welfareGames.filter((item) => !/折|免费|福利|代金券/.test([item.subtitle, item.summary, item.updateContent].join(" "))));
      return byTime(data.welfareGames);
    }
    if (activePoolKind === "pc") {
      if (activePcPoolType === "steam") return [...data.steamGames].sort(sortSteamByPlayers);
      if (activePcPoolType === "steamNew") return byTime(data.steamNewGames);
      return [...data.steamGames].sort(sortSteamByPlayers);
    }
    if (activePoolKind === "news") {
      const news = [...data.pcNews];
      if (activeNewsSource !== T.all) return news.filter((item) => item.sources?.includes(activeNewsSource) || item.platform === activeNewsSource).sort(sortPcNewsByDate);
      return news.sort(sortPcNewsByDate);
    }
    if (activeMobileSource !== T.all) return byTime(data.mobileGames.filter((item) => item.sources?.includes(activeMobileSource)));
    return byTime(data.mobileGames);
  }, [activeMobileSource, activeNewsSource, activePcPoolType, activePoolKind, activeWelfareType, data.mobileGames, data.pcNews, data.steamGames, data.steamNewGames, data.welfareGames]);
  const mobilePoolCounts = useMemo(() => {
    const sources = ["TapTap", "好游快爆", "九游"];
    return Object.fromEntries([[T.all, data.mobileGames.length], ...sources.map((source) => [source, data.mobileGames.filter((item) => item.sources?.includes(source)).length])]);
  }, [data.mobileGames]);
  const welfarePoolCounts = useMemo(() => ({
    [T.all]: data.welfareGames.length,
    discount: data.welfareGames.filter((item) => /折|免费|福利|代金券/.test([item.subtitle, item.summary, item.updateContent].join(" "))).length,
    regular: data.welfareGames.filter((item) => !/折|免费|福利|代金券/.test([item.subtitle, item.summary, item.updateContent].join(" "))).length,
  }), [data.welfareGames]);
  const pcPoolCounts = useMemo(() => ({
    steam: data.steamGames.length,
    steamNew: data.steamNewGames.length,
  }), [data.steamGames.length, data.steamNewGames.length]);
  const newsPoolCounts = useMemo(() => {
    const sources = ["机核", "游民星空", "游侠网"];
    const news = data.pcNews;
    return Object.fromEntries([[T.all, news.length], ...sources.map((source) => [source, news.filter((item) => item.sources?.includes(source) || item.platform === source).length])]);
  }, [data.pcNews]);
  const activePoolRow = useMemo(() => poolRows.find((row) => row.key === activePoolKind) || poolRows[0], [activePoolKind, poolRows]);
  const mobileStatuses = useMemo(() => [T.all, ...new Set(activePoolGames.map((item) => item.status).filter(Boolean))], [activePoolGames]);
  const filteredMobileGames = useMemo(() => activePoolGames.filter((item) => {
    const keyword = poolKeyword.trim().toLowerCase();
    const haystack = [item.gameName, item.newsTitle, item.relatedGame, item.summary, item.updateContent, item.rawStatus, item.rawEventType, item.publishText, item.appid, ...(item.gameplayTags || []), ...(item.tags || []), ...(item.sources || [])].join(" ").toLowerCase();
    if (keyword && !haystack.includes(keyword)) return false;
    if (poolStatus !== T.all && item.status !== poolStatus) return false;
    if (!matchesDateRange(item, poolDateFrom, poolDateTo)) return false;
    if (["mobile", "welfare"].includes(activePoolKind) || (activePoolKind === "pc" && activePcPoolType === "steamNew")) {
      if (!matchesTimeSide(item, poolTimeSide)) return false;
    }
    return true;
  }), [activePcPoolType, activePoolGames, activePoolKind, poolDateFrom, poolDateTo, poolKeyword, poolStatus, poolTimeSide]);
  const selectedGame = useMemo(() => filteredMobileGames.find((item) => item.id === selectedGameId) || filteredMobileGames[0] || null, [filteredMobileGames, selectedGameId]);

  useEffect(() => {
    if (!filteredMobileGames.length) { setSelectedGameId(""); return; }
    if (!filteredMobileGames.some((item) => item.id === selectedGameId)) setSelectedGameId(filteredMobileGames[0].id);
  }, [filteredMobileGames, selectedGameId]);

  const showToast = (message, tone = "") => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone: tone || (/失败|报错|错误|缺少|不支持/.test(String(message || "")) ? "error" : "success") });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
  };
  const closeToast = () => {
    window.clearTimeout(toastTimerRef.current);
    setToast(null);
  };
  const toggleSource = (key) => setSelectedSources((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const startCrawlProgress = () => {
    window.clearInterval(crawlTimer.current);
    setCrawlProgress(4);
    crawlTimer.current = window.setInterval(() => {
      setCrawlProgress((current) => Math.min(92, current + Math.max(1, Math.round((100 - current) * 0.08))));
    }, 700);
  };
  const stopCrawlProgress = () => {
    window.clearInterval(crawlTimer.current);
    setCrawlProgress(100);
    window.setTimeout(() => setCrawlProgress(0), 900);
  };
  const loadSchedulerRuns = async () => {
    try {
      const response = await fetch("/api/scheduler/runs?limit=30", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && payload.ok) setSchedulerRuns(payload.runs || []);
    } catch {
      // Scheduler history is auxiliary; the main admin page can still work without it.
    }
  };
  const loadSystemStatus = async () => {
    try {
      const response = await fetch("/api/system/status", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && payload.ok) setSystemStatus(payload);
    } catch {
      // Health info is read-only; the admin page can work without it.
    }
  };
  const runCrawl = async () => {
    const sources = selectedSources.filter((item) => MANUAL_SOURCE_KEYS.includes(item));
    if (!sources.length) return showToast("请至少选择一个可手动更新的来源。");
    const initialItems = sources.map((key) => ({ key, name: CRAWL_SOURCE_LABELS[key] || key, status: "pending", message: "等待中", startedAt: "", finishedAt: "", stats: null, error: "" }));
    const updateCrawlItem = (key, patch) => {
      setCrawlRun((current) => ({
        ...current,
        items: current.items.map((item) => item.key === key ? { ...item, ...patch } : item),
      }));
    };
    setRunning(true);
    setCrawlProgress(0);
    setCrawlRun({ open: true, items: initialItems, completed: 0, total: sources.length, current: sources[0] || "", startedAt: new Date().toISOString(), finishedAt: "" });
    showToast("已开始更新：" + sources.map((key) => CRAWL_SOURCE_LABELS[key] || key).join(" / ") + "。");
    let completed = 0;
    const failures = [];
    stopRunRequested.current = false;
    try {
      for (const sourceKey of sources) {
        if (stopRunRequested.current) break;
        currentRunSource.current = sourceKey;
        setCrawlRun((current) => ({ ...current, current: sourceKey }));
        updateCrawlItem(sourceKey, { status: "running", message: "运行中", startedAt: new Date().toISOString() });
        try {
          const response = await fetch("/api/scheduler/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceKey }),
          });
          let payload = {};
          try { payload = await response.json(); } catch { payload = {}; }
          if (!response.ok || !payload.ok) throw new Error(payload.failureReason || payload.message || ("HTTP " + response.status));
          completed += 1;
          updateCrawlItem(sourceKey, { status: "success", message: crawlStatsMessage(payload.sourceStats), stats: payload.sourceStats || null, finishedAt: new Date().toISOString() });
        } catch (error) {
          completed += 1;
          const message = error?.message || String(error);
          const stopped = /手动停止|已停止/.test(message) || stopRunRequested.current;
          if (!stopped) failures.push({ sourceKey, message });
          updateCrawlItem(sourceKey, { status: stopped ? "stopped" : "failed", message: stopped ? "已停止" : message, error: stopped ? "" : message, finishedAt: new Date().toISOString() });
          if (stopped) break;
        }
        setCrawlProgress(Math.round((completed / sources.length) * 100));
        setCrawlRun((current) => ({ ...current, completed }));
      }
      await data.reload();
      await loadSchedulerRuns();
      await loadSystemStatus();
      setCrawlRun((current) => ({ ...current, current: "", finishedAt: new Date().toISOString(), failures }));
      showToast(stopRunRequested.current ? "已停止本次来源更新。" : failures.length ? "更新完成，失败 " + failures.length + " 个来源。" : "所选来源更新完成。");
    } finally {
      setRunning(false);
      currentRunSource.current = "";
      stopRunRequested.current = false;
    }
  };
  const stopCrawlRun = async () => {
    stopRunRequested.current = true;
    const sourceKey = currentRunSource.current;
    setCrawlRun((current) => ({ ...current, stopRequested: true }));
    try {
      await fetch("/api/scheduler/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey }),
      });
      showToast("已发送停止请求。");
    } catch (error) {
      showToast("停止任务失败：" + (error?.message || error));
    }
  };
  const setRecordVisibility = async ({ gameId, visible }) => {
    setRunning(true);
    try {
      const response = await fetch("/api/pool/visibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId, visible }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      await data.reload();
      await loadSystemStatus();
      showToast(visible ? "已恢复前端展示。" : "已从前端隐藏。");
    } catch (error) { showToast("状态更新失败：" + (error?.message || error)); }
    finally { setRunning(false); }
  };
  const deletePoolRecord = async ({ gameId, title }) => {
    const ok = window.confirm("确认删除这条记录？\n" + (title || gameId) + "\n\n删除后会从当前数据池移除。");
    if (!ok) return;
    setRunning(true);
    try {
      const response = await fetch("/api/pool/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      await data.reload();
      await loadSystemStatus();
      showToast("已删除单条记录。");
    } catch (error) { showToast("删除失败：" + (error?.message || error)); }
    finally { setRunning(false); }
  };
  const exportExcel = async () => { setRunning(true); try { const response = await fetch("/api/cleanup/excel"); const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status)); setExcelInfo(payload); showToast("已生成 Excel 整理表。"); } catch (error) { showToast("生成 Excel 失败：" + (error?.message || error)); } finally { setRunning(false); } };
  const applyExcel = async () => { setRunning(true); try { const response = await fetch("/api/cleanup/excel/apply", { method: "POST" }); const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status)); await data.reload(); showToast("已应用 Excel 整理内容。"); } catch (error) { showToast("应用 Excel 失败：" + (error?.message || error)); } finally { setRunning(false); } };
  const recrawlIssueRecord = async ({ issueId, gameId, title, source }) => {
    if (!gameId && !title) return showToast("未找到可重抓的记录。");
    const targetLabel = title || gameId;
    setRecrawlingIssueId(issueId || gameId || title || "record");
    setRecordRecrawl({ open: true, stage: "running", title: targetLabel, detail: "正在读取详情页并合并到 SQLite 主数据。", updatedId: gameId || "" });
    showToast("正在单独重抓：" + targetLabel);
    try {
      const response = await fetch("/api/crawl/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, title, source, issueId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      const updatedId = payload.updatedId || gameId || "";
      setRecordRecrawl({ open: true, stage: "syncing", title: targetLabel, detail: "抓取完成，正在刷新页面数据。", updatedId });
      await data.reload();
      if (updatedId) setSelectedGameId(updatedId);
      await loadSystemStatus();
      setRecordRecrawl({ open: true, stage: "done", title: targetLabel, detail: `已同步 ${payload.changedFields?.length || 0} 个字段，清理 ${payload.cleanupResolvedCount || 0} 个问题。`, updatedId });
      showToast("已单独重抓并合并：" + (payload.updated || title || gameId));
    } catch (error) {
      setRecordRecrawl({ open: true, stage: "failed", title: targetLabel, detail: error?.message || String(error), updatedId: gameId || "" });
      showToast("单条重抓失败：" + (error?.message || error));
    } finally {
      setRecrawlingIssueId("");
    }
  };
  const undoLatestLog = async () => {
    const ok = window.confirm("确认撤销最近一次数据写入？\n将恢复到上一次本地备份。");
    if (!ok) return;
    setRunning(true);
    try {
      const response = await fetch("/api/logs/undo-latest", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      await data.reload();
      await loadSystemStatus();
      showToast("已撤销到上一次本地备份。");
    } catch (error) {
      showToast("撤销失败：" + (error?.message || error));
    } finally {
      setRunning(false);
    }
  };
  const undoLatestOperation = async () => {
    const ok = window.confirm("确认撤销最近一次可逆数据库操作？\n支持字段编辑、隐藏/显示、软删除恢复。");
    if (!ok) return;
    setRunning(true);
    try {
      const response = await fetch("/api/logs/undo-operation", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      await data.reload();
      await loadSystemStatus();
      showToast("已撤销最近一次数据库操作。");
    } catch (error) {
      showToast("撤销操作失败：" + (error?.message || error));
    } finally {
      setRunning(false);
    }
  };
  const openSchedulerDetail = async (sourceKey) => {
    if (!sourceKey) return showToast("缺少任务来源。");
    try {
      const response = await fetch("/api/scheduler/job-detail?sourceKey=" + encodeURIComponent(sourceKey), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      setSchedulerDetail(payload);
    } catch (error) {
      showToast("任务详情读取失败：" + (error?.message || error));
    }
  };
  const runSchedulerNow = async (sourceKey) => {
    const sourceKeys = (Array.isArray(sourceKey) ? sourceKey : [sourceKey]).filter(Boolean);
    if (!sourceKeys.length) return showToast("缺少任务来源。");
    const startedAt = new Date().toISOString();
    const initialItems = sourceKeys.map((key) => ({
      key,
      name: CRAWL_SOURCE_LABELS[key] || schedulerSourceLabel(key) || key,
      status: "pending",
      message: "等待中",
      startedAt: "",
      finishedAt: "",
      stats: null,
      error: "",
    }));
    const updateSchedulerRunItem = (key, patch) => {
      setCrawlRun((current) => ({
        ...current,
        items: current.items.map((item) => item.key === key ? { ...item, ...patch } : item),
      }));
    };
    setRunning(true);
    setCrawlProgress(5);
    setCrawlRun({
      open: true,
      items: initialItems,
      completed: 0,
      total: sourceKeys.length,
      current: sourceKeys[0],
      startedAt,
      finishedAt: "",
      failures: [],
    });
    showToast("正在运行任务：" + initialItems.map((item) => item.name).join(" / "));
    let completed = 0;
    const failures = [];
    stopRunRequested.current = false;
    try {
      for (const key of sourceKeys) {
        if (stopRunRequested.current) break;
        currentRunSource.current = key;
        setCrawlRun((current) => ({ ...current, current: key }));
        updateSchedulerRunItem(key, { status: "running", message: "正在运行任务", startedAt: new Date().toISOString() });
        try {
          const response = await fetch("/api/scheduler/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceKey: key }),
          });
          let payload = {};
          try { payload = await response.json(); } catch { payload = {}; }
          if (!response.ok || !payload.ok) throw new Error(payload.failureReason || payload.message || ("HTTP " + response.status));
          completed += 1;
          updateSchedulerRunItem(key, { status: "success", message: crawlStatsMessage(payload.sourceStats), stats: payload.sourceStats || null, finishedAt: new Date().toISOString() });
        } catch (error) {
          completed += 1;
          const message = error?.message || "任务运行失败";
          const stopped = /手动停止|已停止/.test(message) || stopRunRequested.current;
          if (!stopped) failures.push({ sourceKey: key, message });
          updateSchedulerRunItem(key, { status: stopped ? "stopped" : "failed", message: stopped ? "已停止" : message, error: stopped ? "" : message, finishedAt: new Date().toISOString() });
          if (stopped) break;
        }
        setCrawlProgress(Math.round((completed / sourceKeys.length) * 100));
        setCrawlRun((current) => ({ ...current, completed }));
      }
      await data.reload();
      await loadSchedulerRuns();
      await loadSystemStatus();
      setCrawlRun((current) => ({ ...current, current: "", finishedAt: new Date().toISOString(), failures }));
      showToast(stopRunRequested.current ? "已停止本次任务。" : failures.length ? "任务运行完成，失败 " + failures.length + " 个来源。" : "任务运行完成。");
    } catch (error) {
      const message = error?.message || "任务运行失败";
      setCrawlProgress(100);
      setCrawlRun((current) => ({
        ...current,
        completed,
        current: "",
        finishedAt: new Date().toISOString(),
        failures: failures.length ? failures : [{ sourceKey: sourceKeys[0], message }],
      }));
      await loadSchedulerRuns();
      await loadSystemStatus();
      showToast("任务运行失败：" + message);
    } finally {
      setRunning(false);
      currentRunSource.current = "";
      stopRunRequested.current = false;
    }
  };
  const toggleSchedulerJob = async (sourceKey, enabled, scheduleValue) => {
    if (!sourceKey) return showToast("缺少任务来源。");
    setRunning(true);
    try {
      const body = { sourceKey, enabled };
      if (Array.isArray(scheduleValue)) body.runTimes = scheduleValue;
      else if (typeof scheduleValue === "string") body.runTimes = parseRunTimesInput(scheduleValue);
      else if (scheduleValue !== undefined) body.intervalMinutes = Number(scheduleValue) || 0;
      const response = await fetch("/api/scheduler/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      await data.reload();
      await loadSchedulerRuns();
      await loadSystemStatus();
      showToast((enabled ? "已启用任务：" : "已停用任务：") + sourceKey);
    } catch (error) {
      showToast("任务设置失败：" + (error?.message || error));
    } finally {
      setRunning(false);
    }
  };
  const pauseAllSchedulerJobs = async () => {
    const ok = window.confirm("确认暂停全部定时任务？\n手动立即运行不受影响。");
    if (!ok) return;
    setRunning(true);
    try {
      const response = await fetch("/api/scheduler/pause-all", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      await data.reload();
      await loadSchedulerRuns();
      await loadSystemStatus();
      showToast("已暂停全部定时任务。");
    } catch (error) {
      showToast("暂停任务失败：" + (error?.message || error));
    } finally {
      setRunning(false);
    }
  };
  const cleanupFailureRuns = async () => {
    const ok = window.confirm("确认清理旧的失败日志？\n会保留当前仍失败的平台记录，只清理历史失败。");
    if (!ok) return;
    setRunning(true);
    try {
      const response = await fetch("/api/scheduler/runs/cleanup-failures", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      setSchedulerRuns(payload.runs || []);
      showToast(`已清理 ${payload.deleted || 0} 条历史失败，保留当前失败 ${payload.preservedCurrentFailures || 0} 条。`);
    } catch (error) {
      showToast("清理失败日志失败：" + (error?.message || error));
    } finally {
      setRunning(false);
    }
  };
  const updateCleanupIssueStatus = async ({ issueId, title, status, sourceKey, targetId }) => {
    setRunning(true);
    try {
      const response = await fetch("/api/cleanup/issues/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, title, status, sourceKey, targetId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      await data.reload();
      await loadSystemStatus();
      showToast(status === "ignored" ? "已忽略清洗问题。" : status === "resolved" ? "已验证数据正常，问题已移出待处理。" : "已恢复待处理。");
    } catch (error) {
      showToast("清洗问题更新失败：" + (error?.message || error));
    } finally {
      setRunning(false);
    }
  };
  const applyFieldChoice = async ({ field, value, source }) => {
    if (!selectedGame) return;
    const label = FIELD_LABELS[field] || field;
    const preview = Array.isArray(value) ? value.join(" / ") : String(value || "");
    const ok = window.confirm(`确认将「${selectedGame.gameName}」的「${label}」改为：\n${preview}\n\n确认后会同步到 SQLite 和前端数据快照。Excel 可在整理表区域手动导出。`);
    if (!ok) return;
    setRunning(true);
    try {
      const response = await fetch("/api/pool/field-choice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: selectedGame.id, field, value, source }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      await data.reload();
      await loadSystemStatus();
      showToast("已采用字段，并同步到 SQLite 和前端快照。");
    } catch (error) {
      showToast("字段同步失败：" + (error?.message || error));
    } finally {
      setRunning(false);
    }
  };
  const saveFieldEdits = async ({ gameId, gameName, values, changedFields }) => {
    const safeFields = (changedFields || []).filter((field) => EDITABLE_POOL_FIELDS.has(field));
    if (!gameId || !safeFields.length) return showToast("没有需要保存的字段。");
    setRunning(true);
    try {
      for (const field of safeFields) {
        const response = await fetch("/api/pool/field-choice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId, field, value: values[field], source: "手动编辑" }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(`${FIELD_LABELS[field] || field}：${payload.message || ("HTTP " + response.status)}`);
      }
      await data.reload();
      await loadSystemStatus();
      setEditingGame(null);
      showToast("已保存字段，并同步到 SQLite 和前端快照。");
    } catch (error) {
      showToast("保存失败：" + (error?.message || error), "error");
    } finally {
      setRunning(false);
    }
  };

  return <main className="page-grid admin-page">
    <PageTitle kicker="Admin" title="管理后台" desc={ADMIN_INFO} />
    {toast ? <ToastModal toast={toast} onClose={closeToast} /> : null}
    <div className="admin-layout">
      <aside className="admin-menu">
        {panels.map((panel) => <div className="admin-menu-group" key={panel}>
          <button className={activePanel === panel ? "active" : ""} type="button" onClick={() => setActivePanel(panel)}>{panel}</button>
          {panel === T.pools && activePanel === T.pools ? <div className="admin-submenu">{poolRows.map((row) => <button className={activePoolKind === row.key ? "active" : ""} type="button" onClick={() => { setActivePoolKind(row.key); setPoolKeyword(""); setPoolStatus(T.all); setPoolSource(T.all); setPoolDateFrom(""); setPoolDateTo(""); setPoolTimeSide(T.all); setSelectedGameId(""); setActivePcPoolType("steam"); setActiveMobileSource(T.all); setActiveWelfareType(T.all); setActiveNewsSource(T.all); }} key={row.key}>{row.name}<span>{row.count}</span></button>)}</div> : null}
        </div>)}
      </aside>
      <section className="admin-content">
        {activePanel === T.overview ? <Overview data={data} systemStatus={systemStatus} /> : null}
        {activePanel === T.sources ? <SourceManager sourceGroups={data.sourceGroups} games={[...data.mobileGames, ...data.welfareGames, ...data.steamGames, ...data.steamNewGames, ...data.pcNews]} selectedSources={selectedSources} toggleSource={toggleSource} running={running} crawlProgress={crawlProgress} runCrawl={runCrawl} onStopCrawl={stopCrawlRun} onVisibilityChange={setRecordVisibility} onDeleteRecord={deletePoolRecord} onEditRecord={setEditingGame} /> : null}
        {activePanel === T.logs ? <UpdateLogs schedulerJobs={data.schedulerJobs} schedulerRuns={schedulerRuns} sourceGroups={data.sourceGroups} running={running} showToast={showToast} onRunSchedulerNow={runSchedulerNow} onToggleSchedulerJob={toggleSchedulerJob} onOpenSchedulerDetail={openSchedulerDetail} onPauseAllScheduler={pauseAllSchedulerJobs} onCleanupFailureRuns={cleanupFailureRuns} /> : null}
        {activePanel === T.operations ? <OperationLogsPanel running={running} onUndoLatest={undoLatestLog} onUndoOperation={undoLatestOperation} showToast={showToast} /> : null}
        {activePanel === T.files ? <DataFilesPanel running={running} showToast={showToast} exportExcel={exportExcel} /> : null}
        {activePanel === T.welfareCompare ? <WelfareComparePanel welfareGames={data.welfareGames} running={running} showToast={showToast} /> : null}
        {activePanel === T.pools ? <PoolManager activePoolKind={activePoolKind} activePoolRow={activePoolRow} mobilePoolSource={activeMobileSource} onMobilePoolSourceChange={(value) => { setActiveMobileSource(value); setSelectedGameId(""); }} mobilePoolCounts={mobilePoolCounts} welfarePoolType={activeWelfareType} onWelfarePoolTypeChange={(value) => { setActiveWelfareType(value); setSelectedGameId(""); }} welfarePoolCounts={welfarePoolCounts} pcPoolType={activePcPoolType} onPcPoolTypeChange={(value) => { setActivePcPoolType(value); setSelectedGameId(""); setPoolTimeSide(T.all); }} pcPoolCounts={pcPoolCounts} newsSource={activeNewsSource} onNewsSourceChange={(value) => { setActiveNewsSource(value); setSelectedGameId(""); }} newsPoolCounts={newsPoolCounts} mobileGames={filteredMobileGames} totalMobileGames={activePoolGames.length} selectedGame={selectedGame} onSelectGame={setSelectedGameId} onEditGame={setEditingGame} keyword={poolKeyword} onKeywordChange={setPoolKeyword} status={poolStatus} onStatusChange={setPoolStatus} statuses={mobileStatuses} dateFrom={poolDateFrom} onDateFromChange={setPoolDateFrom} dateTo={poolDateTo} onDateToChange={setPoolDateTo} timeSide={poolTimeSide} onTimeSideChange={setPoolTimeSide} cleanupIssues={data.cleanupIssues} running={running} recrawlingIssueId={recrawlingIssueId} showToast={showToast} onRecrawlIssue={recrawlIssueRecord} onUpdateIssueStatus={updateCleanupIssueStatus} /> : null}
      </section>
    </div>
    {editingGame ? <GameEditModal game={editingGame} running={running} onClose={() => setEditingGame(null)} onSave={saveFieldEdits} /> : null}
    {schedulerDetail ? <SchedulerDetailModal detail={schedulerDetail} running={running} onClose={() => setSchedulerDetail(null)} onToggleSchedulerJob={toggleSchedulerJob} onRunSchedulerNow={runSchedulerNow} /> : null}
    {crawlRun.open ? <CrawlProgressModal run={crawlRun} progress={crawlProgress} running={running} onStop={stopCrawlRun} onClose={() => !running && setCrawlRun((current) => ({ ...current, open: false }))} /> : null}
    {recordRecrawl.open ? <RecordRecrawlModal run={recordRecrawl} onClose={() => setRecordRecrawl((current) => ({ ...current, open: false }))} /> : null}
  </main>;
}

function ToastModal({ toast, onClose }) {
  const isError = toast?.tone === "error";
  return <div className={"toast-modal " + (isError ? "error" : "success")} role="status" aria-live="polite">
    <span className="toast-modal-icon"><CheckCircle2 size={18} /></span>
    <p>{toast?.message}</p>
    <button type="button" aria-label="关闭提示" onClick={onClose}><X size={14} /></button>
  </div>;
}

function Overview({ data, systemStatus }) {
  const cache = systemStatus?.cache || {};
  const jobs = systemStatus?.jobs || {};
  const lastRun = systemStatus?.lastRun;
  return <div className="admin-stack">
    <section className="metrics-grid">
      <MetricCard label="全站游戏" value={data.metrics.totalGames} detail="聚合后的游戏数" icon={<Database size={18} />} />
      <MetricCard label="手机游戏" value={data.metrics.mobilePool} detail={"原始记录 " + (data.metrics.rawMobileRecords || 0) + " 条"} icon={<SlidersHorizontal size={18} />} />
      <MetricCard label="福利游戏" value={data.metrics.welfarePool} detail="小七手游" icon={<ShieldAlert size={18} />} />
      <MetricCard label="PC/资讯" value={data.metrics.pcPool} detail={(data.metrics.steamPool || 0) + " Steam / " + (data.metrics.pcNewsPool || 0) + " 资讯"} icon={<RefreshCcw size={18} />} />
    </section>
    <section className="panel"><SectionHead kicker="Health" title="主数据状态" note="只读状态，不会修改数据" />
      <div className="status-grid">
        <StatusCard title="SQLite 主记录" value={cache.records ?? "-"} desc={"最近快照 " + formatSourceRunTime(cache.latestSnapshot)} />
        <StatusCard title="数据池" value={cache.pools?.length ?? "-"} desc={(cache.pools || []).map((pool) => pool.pool + " " + pool.count).join(" / ") || "暂无池统计"} />
        <StatusCard title="任务配置" value={(jobs.enabled ?? 0) + " / " + (jobs.total ?? 0)} desc="已启用 / 全部任务" />
        <StatusCard title="最近抓取" value={lastRun ? schedulerSourceLabel(lastRun.sourceKey) : "暂无"} desc={lastRun ? `${lastRun.status} / ${formatDuration(lastRun.durationMs)} / ${formatSourceRunTime(lastRun.finishedAt || lastRun.startedAt)}` : "暂无运行记录"} />
      </div>
    </section>
    <section className="panel"><SectionHead kicker="Status" title="后台模块状态" />
      <div className="status-grid">
        <StatusCard title="每日缓存" value="SQLite 已接入" desc="写入 current.json 时同步缓存每日快照，后续可替代 Excel 做历史保留。" />
        <StatusCard title="数据池拆分" value="已拆分" desc="手机、福利、Steam 游戏、Steam 新游、端游资讯分别管理，首页只做聚合展示。" />
        <StatusCard title="字段管理" value="已扩展" desc="Steam/资讯字段已加入后端保存白名单，后续可补专属编辑表单。" />
        <StatusCard title="Excel" value="辅助保留" desc="当前仍可导出手游整理表，数据库稳定后再决定是否弱化。" />
      </div>
    </section>
  </div>;
}

function DataFilesPanel({ running, showToast, exportExcel }) {
  const [info, setInfo] = useState(null);
  const [databaseOpen, setDatabaseOpen] = useState(false);
  const loadInfo = async () => {
    try {
      const response = await fetch("/api/system/files", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      setInfo(payload);
    } catch (error) {
      showToast?.("数据文件读取失败：" + (error?.message || error));
    }
  };
  useEffect(() => { loadInfo(); }, []);
  const openPath = async (target) => {
    try {
      const response = await fetch("/api/system/open-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      showToast?.("已打开位置：" + payload.path);
    } catch (error) {
      showToast?.("打开位置失败：" + (error?.message || error));
    }
  };
  const copyPath = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showToast?.("已复制路径");
    } catch {
      showToast?.("复制失败，请手动选择路径文本");
    }
  };
  const files = info?.files || {};
  const rows = [
    { key: "sqlite", title: "SQLite 主数据库", type: "主库", desc: "保存所有池记录、任务、日志和快照。", file: files.sqlite },
    { key: "current", title: "current.json 快照", type: "快照", desc: "前端读取缓存和恢复兜底文件。", file: files.current },
    { key: "excel", title: "Excel 整理表", type: "整理表", desc: "手游池辅助导出，不作为自动主链路。", file: files.excel },
    { key: "backups", title: "备份目录", type: "备份", desc: "current.json 和 SQLite 的本地备份。", file: files.backups },
  ];
  const tables = info?.database?.tables || [];
  return <div className="admin-stack">
    <section className="panel data-files-panel">
      <SectionHead kicker="Files" title="数据文件" note="本页只负责查看和打开本地位置，不直接修改数据库。" action={<button type="button" onClick={loadInfo}>刷新</button>} />
      <div className="data-bi-strip">
        <StatusCard title="主记录" value={info?.cache?.records ?? "-"} desc="SQLite game_records" />
        <StatusCard title="快照" value={info?.cache?.snapshots ?? "-"} desc={"最近 " + formatSourceRunTime(info?.cache?.latestSnapshot)} />
        <StatusCard title="数据库表" value={tables.length || "-"} desc="可在下方查看中文表单" />
        <StatusCard title="主库大小" value={formatFileSize(files.sqlite?.size)} desc={formatSourceRunTime(files.sqlite?.modifiedAt)} />
      </div>
      <div className="data-file-table-wrap">
        <table className="data-file-table">
          <thead><tr><th>文件</th><th>类型</th><th>状态</th><th>大小</th><th>更新时间</th><th>路径</th><th>操作</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.key}>
              <td><strong>{row.title}</strong><span>{row.desc}</span></td>
              <td>{row.type}</td>
              <td><em className={row.file?.exists ? "ok" : "warn"}>{row.file?.exists ? "可用" : "不存在"}</em></td>
              <td>{formatFileSize(row.file?.size)}</td>
              <td>{row.file?.exists ? formatDateMinute(row.file.modifiedAt) : "暂无"}</td>
              <td><code title={row.file?.path || ""}>{row.file?.path || "未配置"}</code></td>
              <td>
                <div className="data-file-actions">
                  {row.key === "excel" ? <button type="button" disabled={running} onClick={exportExcel}>生成</button> : null}
                  <button type="button" disabled={!row.file?.exists} onClick={() => openPath(row.key)}>打开目录</button>
                  <button type="button" disabled={!row.file?.path} onClick={() => copyPath(row.file?.path)}>复制路径</button>
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    <section className="panel database-overview-panel">
      <SectionHead kicker="SQLite" title="数据库中文表单" note={info?.database?.exists ? "文字方式查看表用途、记录数量和关键字段。" : "数据库文件暂不存在。"} action={<button className="primary-button" type="button" disabled={!info?.database?.exists} onClick={() => setDatabaseOpen(true)}>查看全部字段</button>} />
      <div className="database-bi-table-wrap">
        <table className="database-bi-table">
          <thead><tr><th>中文表名</th><th>数据库表</th><th>记录数</th><th>用途</th><th>关键字段</th></tr></thead>
          <tbody>
            {tables.length ? tables.map((table) => {
              const meta = databaseTableMeta(table.name);
              const keyColumns = (table.columns || []).slice(0, 6).map((column) => databaseColumnLabel(table.name, column.name)).join(" / ");
              return <tr key={table.name}><td><strong>{meta.title}</strong></td><td><code>{table.name}</code></td><td>{table.count} 条</td><td>{meta.desc}</td><td>{keyColumns || "暂无"}</td></tr>;
            }) : <tr><td colSpan={5}>暂无数据库表信息。</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
    {databaseOpen ? <DatabaseOverviewModal database={info?.database} onClose={() => setDatabaseOpen(false)} /> : null}
  </div>;
}

function DatabaseOverviewModal({ database, onClose }) {
  const tables = database?.tables || [];
  return <div className="modal-backdrop" role="presentation">
    <section className="database-modal" role="dialog" aria-modal="true" aria-label="数据库表查看">
      <div className="database-modal-head">
        <div><span>SQLite</span><h3>数据库表查看</h3><p>{database?.file}</p></div>
        <button type="button" onClick={onClose}>关闭</button>
      </div>
      <div className="database-table-list">
        {tables.map((table) => {
          const meta = databaseTableMeta(table.name);
          return <article className="database-table-card" key={table.name}>
          <div className="database-table-title"><div><strong>{meta.title}</strong><p>{table.name} / {meta.desc}</p></div><span>{table.count} 条</span></div>
          <div className="database-column-list">
            {(table.columns || []).map((column) => <em key={column.name}><span>{databaseColumnLabel(table.name, column.name)}</span><small>{column.name}</small><b>{column.type || "TEXT"}</b>{column.primaryKey ? <i>主键</i> : null}</em>)}
          </div>
        </article>;
        })}
      </div>
    </section>
  </div>;
}

function SourceManager({ sourceGroups, games, selectedSources, toggleSource, running, crawlProgress, runCrawl, onStopCrawl, onVisibilityChange, onDeleteRecord, onEditRecord }) {
  const modules = useMemo(() => buildSourceModules(sourceGroups, games), [sourceGroups, games]);
  const flatRows = modules.flatMap((module) => module.rows);
  const [detailKey, setDetailKey] = useState("");
  const detailRow = flatRows.find((row) => row.key === detailKey);
  return <section className="panel source-manager-panel">
    <SectionHead kicker="Sources" title="来源管理" note="按模块管理来源。本次更新开关只控制手动抓取，不是前端展示开关。" />
    <div className="source-manager-top">
      <div className="source-rule-note">
        <strong>说明</strong>
        <p>前端展示由各数据池决定；这里的开关只用于选择“手动更新”要跑哪些来源。抓取范围来自每个平台的入口页、详情页和当前爬虫规则。</p>
      </div>
      <button className={"primary-button source-update-button " + (running ? "is-loading" : "")} type="button" disabled={running} onClick={runCrawl}>
        {running ? <span className="button-spinner" aria-hidden="true" /> : <Play size={16} />}
        <span>{running ? "正在更新来源" : "更新本次勾选来源"}</span>
        <b>{running ? Math.round(crawlProgress) + "%" : selectedSources.length + "项"}</b>
        {running ? <i style={{ width: Math.max(4, Math.min(100, crawlProgress || 4)) + "%" }} /> : null}
      </button>
      {running ? <button className="source-stop-button" type="button" onClick={onStopCrawl}>停止任务</button> : null}
    </div>
    <div className="source-module-stack">
      {modules.map((module) => <article className="source-module-card" key={module.key}>
        <div className="source-module-head"><strong>{module.name}</strong><span>{module.rows.reduce((sum, row) => sum + row.count, 0)} 条</span></div>
        <div className="source-table-wrap source-module-table"><table className="source-table"><thead><tr><th>本次更新</th><th>来源平台</th><th>图片预览</th><th>状态</th><th>数据量</th><th>最近运行</th><th>抓取范围</th><th>操作</th></tr></thead><tbody>{module.rows.map((row) => {
          const selected = selectedSources.includes(row.key);
          const samples = sourceSamples(games, row.sources, row.match);
          return <tr className={selected ? "source-enabled" : ""} key={row.key}>
            <td>{row.manual ? <label className="table-switch" title="只控制本次手动更新"><input type="checkbox" checked={selected} onChange={() => toggleSource(row.key)} /><span /></label> : <span className="source-readonly">自动</span>}</td>
            <td><div className="source-name-cell"><strong>{row.name}</strong></div></td>
            <td><div className="source-images">{samples.length ? samples.map((item, index) => <img src={proxiedAdminImage(item.iconUrl)} alt="" title={item.gameName || item.newsTitle} key={(item.id || item.gameName || item.newsTitle) + index} />) : <span>待补图</span>}</div></td>
            <td><span className={"source-status " + statusTone(row.status)}>{row.status}</span>{row.diagnostics?.strategy ? <small>{crawlStrategyLabel(row.diagnostics.strategy)} / 完整度 {row.diagnostics.completeness ?? 0}%</small> : null}</td>
            <td><strong className="source-count">{row.count}</strong>{row.rawCount ? <small>原始 {row.rawCount}</small> : null}</td>
            <td>{formatSourceRunTime(row.lastRun)}</td>
            <td><span className="source-scope">{row.scope}</span></td>
            <td><button type="button" onClick={() => setDetailKey(row.key)}>查看</button></td>
          </tr>;
        })}</tbody></table></div>
      </article>)}
    </div>
    {detailRow ? <SourceDetailModal row={detailRow} games={games} running={running} onClose={() => setDetailKey("")} onVisibilityChange={onVisibilityChange} onDeleteRecord={onDeleteRecord} onEditRecord={onEditRecord} /> : null}
  </section>;
}
function CrawlProgressModal({ run, progress, running, onStop, onClose }) {
  if (!run.items?.length) return null;
  const total = run.total || run.items.length || 1;
  const completed = run.completed || run.items.filter((item) => ["success", "failed"].includes(item.status)).length;
  const percent = Math.round((completed / total) * 100);
  const visibleProgress = Math.max(progress || 0, percent);
  const failedCount = run.items.filter((item) => item.status === "failed").length;
  const successCount = run.items.filter((item) => item.status === "success").length;
  const currentItem = run.items.find((item) => item.key === run.current);
  const totals = run.items.reduce((sum, item) => {
    const stats = item.stats || {};
    sum.fetched += Number(stats.fetched) || 0;
    sum.current += Number(stats.current) || 0;
    sum.added += Number(stats.added) || 0;
    sum.changed += Number(stats.changed) || 0;
    sum.issues += Number(stats.cleanupIssues) || 0;
    return sum;
  }, { fetched: 0, current: 0, added: 0, changed: 0, issues: 0 });
  const resultClass = failedCount ? "failed" : (running ? "running" : "success");
  return <div className="modal-backdrop crawl-progress-backdrop" role="presentation">
    <section className="crawl-progress-modal" role="dialog" aria-modal="true" aria-label="抓取进度">
      <div className="crawl-progress-head">
        <div>
          <p className="kicker">Crawler</p>
          <h3>{running ? "正在抓取所选来源" : "抓取任务完成"}</h3>
          <span>{completed} / {total} 个来源已完成{failedCount ? "，失败 " + failedCount + " 个" : ""}</span>
        </div>
        <div className="crawl-progress-head-actions">
          {running ? <button className="danger" type="button" onClick={onStop}>{run.stopRequested ? "停止中" : "停止任务"}</button> : null}
          <button type="button" disabled={running} onClick={onClose}>{running ? "运行中" : "关闭"}</button>
        </div>
      </div>
      <div className={"crawl-progress-result " + resultClass}>
        <strong>{running ? "当前平台：" + (currentItem?.name || "准备中") : (failedCount ? "本次抓取完成，但有失败来源" : "本次抓取已全部完成")}</strong>
        <span>{run.stopRequested ? "已发送停止请求，当前平台释放后会停止本轮任务。" : running ? "平台内部明细会在该平台完成后回填；当前先按来源维度显示真实完成数。" : `成功 ${successCount} 个，失败 ${failedCount} 个，新增 ${totals.added} 条，清洗问题 ${totals.issues} 条。`}</span>
      </div>
      <div className="crawl-progress-main">
        <div className="crawl-progress-bar"><span style={{ width: visibleProgress + "%" }} /></div>
        <strong>{visibleProgress}%</strong>
      </div>
      <div className="crawl-progress-summary">
        <b>成功 {successCount}</b>
        <b>失败 {failedCount}</b>
        <b>已抓 {totals.fetched}</b>
        <b>入库 {totals.current}</b>
        <b>新增 {totals.added}</b>
        <b>变动 {totals.changed}</b>
      </div>
      <div className="crawl-progress-meta">
        <span>本轮来源 {total}</span>
        <span>已完成 {completed}</span>
        <span>清洗问题 {totals.issues}</span>
      </div>
      <div className="crawl-progress-list">
        {run.items.map((item, index) => <article className={"crawl-progress-row " + item.status} key={item.key}>
          <span>{index + 1}</span>
          <div>
            <b>{item.name}</b>
            <p>{item.message || "等待中"}</p>
            {item.stats ? <div className="crawl-progress-stats">
              <small>发现 {item.stats.discovered ?? item.stats.fetched ?? 0}</small>
              <small>已抓 {item.stats.fetched ?? 0}</small>
              <small>入库 {item.stats.current ?? 0}</small>
              <small>新增 {item.stats.added ?? 0}</small>
              <small>变动 {item.stats.changed ?? 0}</small>
              <small>失败 {item.stats.failed ?? 0}</small>
              <small>问题 {item.stats.cleanupIssues ?? 0}</small>
              {item.stats.completeness !== null && item.stats.completeness !== undefined ? <small>完整度 {item.stats.completeness}%</small> : null}
              {item.stats.strategy ? <small>方式 {crawlStrategyLabel(item.stats.strategy)}</small> : null}
            </div> : null}
            {item.stats?.issueSamples?.length ? <div className="crawl-progress-issues">{item.stats.issueSamples.slice(0, 3).map((issue, issueIndex) => <small key={issue.type + issueIndex}>{issue.type}：{issue.detail || "待检查"}</small>)}</div> : null}
            {item.error ? <strong className="crawl-error-reason">失败原因：{item.error}</strong> : null}
          </div>
          <em>{crawlStatusLabel(item.status)}</em>
        </article>)}
      </div>
      {!running && failedCount ? <div className="crawl-failure-box"><strong>失败原因</strong>{run.items.filter((item) => item.status === "failed").map((item) => <p key={item.key}>{item.name}：{item.error || item.message || "运行失败"}</p>)}</div> : null}
    </section>
  </div>;
}
function RecordRecrawlModal({ run, onClose }) {
  const stageMap = {
    running: ["抓取中", "正在从来源详情页读取字段"],
    syncing: ["同步中", "正在写入 SQLite 并刷新前端快照"],
    done: ["已完成", "记录已同步到当前页面"],
    failed: ["失败", "请查看错误信息后重试"],
  };
  const [label, desc] = stageMap[run.stage] || ["准备中", "正在准备单条重抓"];
  return <div className="modal-backdrop recrawl-status-backdrop" role="presentation">
    <section className={"recrawl-status-modal " + run.stage} role="dialog" aria-modal="true" aria-label="单条重抓状态">
      <div className="recrawl-status-head">
        <div>
          <p className="kicker">Recrawl</p>
          <h3>{label}</h3>
          <span>{desc}</span>
        </div>
        <button type="button" onClick={onClose}>{run.stage === "running" || run.stage === "syncing" ? "后台运行" : "关闭"}</button>
      </div>
      <div className="recrawl-status-body">
        <strong>{run.title || "单条记录"}</strong>
        <p>{run.detail || "正在处理。"}</p>
        {run.updatedId ? <em>ID：{run.updatedId}</em> : null}
      </div>
      <div className="recrawl-status-bar"><span /></div>
    </section>
  </div>;
}
function SourceDetailModal({ row, games, running, onClose, onVisibilityChange, onDeleteRecord, onEditRecord }) {
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const records = sourceRecordsFor(games, row.sources, row.match);
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRecords = records.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [row.key]);
  return <div className="modal-backdrop source-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="source-detail-modal" role="dialog" aria-modal="true" aria-label={row.name + "来源记录"}>
      <div className="source-detail-head source-modal-head">
        <div><p className="kicker">Detail</p><h3>{row.name}</h3></div>
        <div className="source-modal-head-actions">
          <span className={"source-status " + statusTone(row.status)}>{row.status}</span>
          <button className="edit-modal-close" type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
      <div className="source-detail-grid source-modal-summary">
        <div><strong>所属模块</strong><span>{row.moduleName}</span></div>
        <div><strong>数据规模</strong><span>{row.count} 条{row.rawCount ? " / 原始 " + row.rawCount + " 条" : ""}</span></div>
        <div><strong>最近运行</strong><span>{formatSourceRunTime(row.lastRun)}</span></div>
        <div><strong>更新开关</strong><span>{row.manual ? "控制本次手动更新" : "暂不支持手动选择"}</span></div>
      </div>
      <div className="source-detail-copy source-modal-scope"><strong>爬取范围判断</strong><p>{row.scopeDetail || row.scope}</p></div>
      <div className="source-record-table-wrap">
        <table className="source-record-table">
          <thead><tr><th>记录</th><th>状态</th><th>时间</th><th>厂商/作者</th><th>标签</th><th>可见</th><th>操作</th></tr></thead>
          <tbody>{pageRecords.length ? pageRecords.map((item) => <tr className={item.visible === false ? "is-hidden" : ""} key={item.id || item.gameName || item.newsTitle}>
            <td><a className="source-record-title" href={item.detailUrl || item.originalUrl || "#"} target="_blank" rel="noreferrer"><span>{item.gameName || item.newsTitle || "未命名记录"}</span>{item.subtitle ? <em>{item.subtitle}</em> : null}</a></td>
            <td><span className={"source-status " + statusTone(item.status || item.eventType || item.category || "")}>{item.status || item.eventType || item.category || "记录"}</span></td>
            <td><span className="source-record-text">{formatSourceRecordDate(item)}</span></td>
            <td><span className="source-record-text">{formatSourceRecordOwner(item)}</span></td>
            <td><div className="source-record-tags">{formatSourceRecordTags(item).map((tag) => <span key={tag}>{tag}</span>)}</div></td>
            <td><span className={item.visible === false ? "visibility-pill hidden" : "visibility-pill"}>{item.visible === false ? "已隐藏" : "前端可见"}</span></td>
            <td><div className="source-record-actions">
              <button type="button" disabled={running || !item.id} onClick={() => { onEditRecord?.(item); onClose(); }}>编辑</button>
              <button type="button" disabled={running || !item.id} onClick={() => onVisibilityChange?.({ gameId: item.id, visible: item.visible === false })}>{item.visible === false ? "恢复" : "隐藏"}</button>
              <button className="danger" type="button" disabled={running || !item.id} onClick={() => onDeleteRecord?.({ gameId: item.id, title: item.gameName || item.newsTitle })}>删除</button>
            </div></td>
          </tr>) : <tr><td colSpan={7}><div className="empty-search inline">暂无可展示记录。</div></td></tr>}</tbody>
        </table>
      </div>
      <div className="source-modal-pagination">
        <span>第 {safePage} / {totalPages} 页，每页 10 条，共 {records.length} 条</span>
        <div>
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</button>
        </div>
      </div>
    </aside>
  </div>;
}
function buildSourceModules(sourceGroups = [], games = []) {
  const groupMap = new Map(sourceGroups.map((group) => [group.key, group]));
  const rows = [
    { module: "mobile", moduleName: "手机游戏", key: "taptap", name: "TapTap", sources: ["TapTap"], manual: true, scope: "新游日历 / 游戏详情", scopeDetail: "从 TapTap 新游日历读取排期卡片，再进入详情页补图标、厂商、标签与简介。" },
    { module: "mobile", moduleName: "手机游戏", key: "hykb", name: "好游快爆", sources: ["好游快爆"], manual: true, scope: "时间线 / 游戏详情", scopeDetail: "从好游快爆时间线提取新游、测试、更新信息，详情页用于补全图标、标签与正文。" },
    { module: "mobile", moduleName: "手机游戏", key: "ninegame", name: "九游", sources: ["九游"], manual: true, scope: "开测表 / 游戏详情", scopeDetail: "从九游开测表获取测试和上线排期。九游状态权重较低，主要作为补充来源。" },
    { module: "welfare", moduleName: "福利游戏", key: "xiaoqi", name: "小七手游", sources: ["小七手游"], manual: true, scope: "新游 / 预约 / 福利详情", scopeDetail: "从小七新游与预约页获取福利手游，进入详情页补厂商、运营单位、副标题和福利简介。" },
    { module: "pc", moduleName: "端游", key: "steam", name: "Steam游戏", sources: ["Steam"], match: "steam", manual: true, scope: "Steam 官方接口 / 在线人数", scopeDetail: "以 Steam 官方接口和在线人数数据作为主来源，按最近在线人数排序，过滤在线不足阈值的常规候选。" },
    { module: "pc", moduleName: "端游", key: "steamNew", name: "Steam新游", sources: ["Steam"], match: "steamNew", manual: true, scope: "Steam 即将推出 / 发售日期", scopeDetail: "从 Steam 新游、即将推出和发售日期相关数据里筛选，按已知发售日期或预约/即将推出状态管理。" },
    { module: "news", moduleName: "资讯", key: "gcores", name: "机核", sources: ["机核"], manual: true, scope: "新闻列表 / 文章详情", scopeDetail: "从机核资讯列表获取标题、发布时间、作者、关联游戏、摘要和封面，按发布时间和同日热度排序。" },
    { module: "news", moduleName: "资讯", key: "gamersky", name: "游民星空", sources: ["游民星空"], manual: true, scope: "新闻列表 / 文章详情", scopeDetail: "从游民星空资讯列表与详情页获取端游、主机相关新闻，PS5 或无明确游戏时关联游戏标为其他。" },
    { module: "news", moduleName: "资讯", key: "ali213", name: "游侠网", sources: ["游侠网"], manual: true, scope: "新闻列表 / 文章详情", scopeDetail: "从游侠网资讯列表与文章页获取标题、发布时间、标签、摘要和封面。" },
  ].map((row) => enrichSourceRow(row, groupMap, games));
  const moduleDefs = [
    { key: "mobile", name: "手机游戏" },
    { key: "welfare", name: "福利游戏" },
    { key: "pc", name: "端游" },
    { key: "news", name: "资讯" },
  ];
  return moduleDefs.map((module) => ({ ...module, rows: rows.filter((row) => row.module === module.key) }));
}
function enrichSourceRow(row, groupMap, games) {
  const group = groupMap.get(row.key);
  const records = sourceRecordsFor(games, row.sources, row.match);
  const hasGroupData = Number(group?.count || 0) > 0 || Number(group?.rawCount || 0) > 0;
  return {
    ...row,
    status: hasGroupData ? group.status : (records.length ? "已入池" : group?.status || "待接入"),
    lastRun: hasGroupData ? group.lastRun : (records.length ? "来自当前数据" : group?.lastRun || "待接入"),
    count: records.length || group?.count || 0,
    rawCount: group?.rawCount || 0,
    diagnostics: group?.diagnostics || null,
  };
}
function sourceRecordsFor(games = [], sources = [], match = "") {
  return games.filter((item) => {
    if (match === "steam") return isSteamListedGameItem(item);
    if (match === "steamNew") return isSteamNewGameItem(item);
    return item.sources?.some((source) => sources.includes(source)) || sources.includes(item.platform);
  });
}
function sourceSamples(games = [], sources = [], match = "") { return sourceRecordsFor(games, sources, match).filter((item) => item.iconUrl).slice(0, 4); }
function proxiedAdminImage(url) {
  if (!url) return "";
  if (isDirectImageHost(url)) return url;
  return "/api/image?url=" + encodeURIComponent(url);
}
function isDirectImageHost(url = "") {
  try {
    const host = new URL(url).hostname;
    return /(^|\.)steamstatic\.com$/i.test(host) || /(^|\.)akamai\.steamstatic\.com$/i.test(host);
  } catch {
    return false;
  }
}
function statusTone(status = "") { if (status.includes("已抓取")) return "ok"; if (status.includes("规划") || status.includes("待接入") || status.includes("只抓")) return "idle"; if (status.includes("需检查") || status.includes("失败")) return "warn"; return "normal"; }
function formatSourceRecordDate(item) {
  const value = item.publishedAt || item.eventAt || item.releaseText || item.publishText || "";
  if (!value) return "待定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
function formatSourceRecordOwner(item) {
  const developers = Array.isArray(item.developers) ? item.developers.join(" / ") : "";
  const publishers = Array.isArray(item.publishers) ? item.publishers.join(" / ") : "";
  return item.vendor || item.author || developers || publishers || "暂无";
}
function formatSourceRecordTags(item) {
  const blocked = new Set([item.status, item.eventType, item.platform, ...(item.sources || []), "上线/测试", "更新", "活动/联动", "TapTap", "好游快爆", "九游", "小七手游", "Steam"]);
  const gameplay = (item.gameplayTags || [])
    .map((tag) => String(tag || "").trim())
    .filter((tag) => tag && !blocked.has(tag));
  const fallback = (item.tags || [])
    .map((tag) => String(tag || "").trim())
    .filter((tag) => tag && !blocked.has(tag));
  return [...new Set(gameplay.length ? gameplay : fallback)].slice(0, 4);
}
function UpdateLogs({ schedulerJobs, schedulerRuns = [], sourceGroups, running, showToast, onRunSchedulerNow, onToggleSchedulerJob, onOpenSchedulerDetail, onPauseAllScheduler, onCleanupFailureRuns }) {
  return <div className="admin-stack">
    <Scheduler schedulerJobs={schedulerJobs || []} schedulerRuns={schedulerRuns || []} sourceGroups={sourceGroups || []} running={running} showToast={showToast} onRunSchedulerNow={onRunSchedulerNow} onToggleSchedulerJob={onToggleSchedulerJob} onOpenSchedulerDetail={onOpenSchedulerDetail} onPauseAllScheduler={onPauseAllScheduler} onCleanupFailureRuns={onCleanupFailureRuns} embedded />
  </div>;
}
function WelfareComparePanel({ welfareGames = [], running, showToast }) {
  const [recordsText, setRecordsText] = useState("");
  const [workbookPath, setWorkbookPath] = useState("");
  const [workbookUpload, setWorkbookUpload] = useState(null);
  const [reference, setReference] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("missing");
  const [kindFilter, setKindFilter] = useState(T.all);
  const [sortMode, setSortMode] = useState("time");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const sampleText = "游戏名,副标题\n萌回三国,免费版\n无悔华夏,年度主时代大宋";
  const loadReference = async () => {
    try {
      const response = await fetch("/api/welfare/reference", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      setReference(payload);
    } catch (error) {
      showToast?.("福利参考库读取失败：" + (error?.message || error));
    }
  };
  useEffect(() => { loadReference(); }, []);
  const importReference = async () => {
    if (!workbookUpload && !workbookPath.trim()) {
      showToast?.("请先选择或填写要更新的 Excel 文件。");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/welfare/reference/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workbookPath: workbookUpload ? "" : workbookPath, workbookBase64: workbookUpload?.base64 || "", workbookFileName: workbookUpload?.name || "" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      setReference(payload);
      setWorkbookUpload(null);
      showToast?.(`福利参考库已更新：${payload.recordCount || payload.imported?.rowCount || 0} 条。`);
    } catch (error) {
      showToast?.("福利参考库更新失败：" + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };
  const compare = async (useCachedReference = true) => {
    setBusy(true);
    try {
      const response = await fetch("/api/welfare/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useCachedReference
          ? { useCachedReference: true }
          : { recordsText, workbookPath: workbookUpload ? "" : workbookPath, workbookBase64: workbookUpload?.base64 || "", workbookFileName: workbookUpload?.name || "" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      setResult(payload);
      setActiveTab(payload.missing?.length ? "missing" : "included");
      setKindFilter(T.all);
      setPage(1);
      if (payload.reference) setReference(payload.reference);
      showToast?.(`对比完成：未收录 ${payload.summary?.missing || 0} 条，今日新增未收录 ${payload.summary?.todayMissing || 0} 条。`);
    } catch (error) {
      showToast?.("福利对比失败：" + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };
  const sourceRows = activeTab === "included" ? (result?.included || []) : activeTab === "today" ? (result?.todayMissing || []) : (result?.missing || []);
  const rows = sourceRows
    .filter((row) => kindFilter === T.all || row.eventKind === kindFilter)
    .sort(sortMode === "heat" ? sortWelfareCompareByHeat : sortWelfareCompareByTime);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectWorkbookFile = async (file) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      showToast?.("请选择 .xlsx 文件。");
      return;
    }
    const base64 = await fileToBase64(file);
    setWorkbookUpload({ name: file.name, size: file.size, base64 });
    setPickerOpen(false);
    showToast?.("已选择：" + file.name);
  };
  return <div className="admin-stack">
    <section className="panel welfare-compare-panel">
      <SectionHead kicker="Welfare" title="福利对比" note="用于对比小七新增福利游戏是否已被我方平台收录。" />
      <div className="welfare-compare-layout">
        <div className="welfare-compare-input">
          <div className="welfare-reference-card">
            <div className="welfare-reference-main">
              <span>默认参考库</span>
              <strong>{reference?.exists ? (reference.activeImport?.fileName || "已缓存文件") : "未缓存"}</strong>
              <p>{reference?.exists ? `更新于 ${formatDateMinute(reference.activeImport?.importedAt)}` : "选择 Excel 后写入数据库，后续可直接复用。"}</p>
            </div>
            <div className="welfare-reference-count">
              <b>{reference?.recordCount || 0}</b>
              <em>条记录</em>
            </div>
          </div>
          <div className="welfare-compare-form-block">
            <div className="welfare-block-head"><span>更新参考表</span><small>用于替换默认缓存</small></div>
            <label>
              <span>Excel 文件</span>
              <div className="welfare-file-row">
                <input value={workbookUpload ? workbookUpload.name : workbookPath} placeholder="选择文件，或填写本机 .xlsx 路径" onChange={(event) => { setWorkbookUpload(null); setWorkbookPath(event.target.value); }} />
                <button type="button" disabled={busy || running} onClick={() => setPickerOpen(true)} title="选择 Excel"><FolderOpen size={15} /></button>
              </div>
            </label>
            {workbookUpload ? <div className="welfare-selected-file"><FileSpreadsheet size={14} /><span>{workbookUpload.name}</span><em>{formatFileSize(workbookUpload.size)}</em><button type="button" onClick={() => setWorkbookUpload(null)}>移除</button></div> : null}
          </div>
          <div className="welfare-compare-form-block">
            <div className="welfare-block-head"><span>临时清单</span><small>不覆盖默认缓存</small></div>
            <label>
              <span>粘贴内容</span>
              <textarea value={recordsText} rows={7} placeholder="游戏名,副标题" onChange={(event) => setRecordsText(event.target.value)} />
            </label>
          </div>
          <div className="welfare-compare-actions">
            <button type="button" disabled={busy || running} onClick={() => setRecordsText(sampleText)}>填入示例</button>
            <button type="button" disabled={busy || running} onClick={loadReference}>刷新缓存状态</button>
            <button type="button" disabled={busy || running} onClick={importReference}>{busy ? "更新中..." : "更新默认缓存"}</button>
            <button type="button" disabled={busy || running} onClick={() => { setRecordsText(""); setWorkbookUpload(null); setResult(null); setPage(1); }}>清空</button>
            <button type="button" disabled={busy || running} onClick={() => compare(false)}>临时表对比</button>
            <button className="primary-button" type="button" disabled={busy || running || !reference?.exists} onClick={() => compare(true)}>{busy ? "对比中..." : "使用缓存对比"}</button>
          </div>
        </div>
        <div className="welfare-compare-result">
          <div className="welfare-compare-metrics">
            <StatusCard title="小七福利" value={result?.summary?.welfareCount ?? welfareGames.length} desc="当前福利池" />
            <StatusCard title="我方记录" value={result?.summary?.ownCount ?? "-"} desc="粘贴/导入清单" />
            <StatusCard title="已收录" value={result?.summary?.included ?? "-"} desc="游戏名+副标题命中" />
            <StatusCard title="未收录" value={result?.summary?.missing ?? "-"} desc="需要提醒收录" />
            <StatusCard title="今日新增未收录" value={result?.summary?.todayMissing ?? "-"} desc="按 eventAt 今日统计" />
            <StatusCard title="已排除常规" value={result?.summary?.skippedRegular ?? "-"} desc="不参与福利对比" />
          </div>
          <div className="pool-button-tabs welfare-compare-tabs">
            <button className={activeTab === "missing" ? "active" : ""} type="button" onClick={() => { setActiveTab("missing"); setPage(1); }}><span>未收录</span><b>{result?.missing?.length || 0}</b></button>
            <button className={activeTab === "today" ? "active" : ""} type="button" onClick={() => { setActiveTab("today"); setPage(1); }}><span>今日新增未收录</span><b>{result?.todayMissing?.length || 0}</b></button>
            <button className={activeTab === "included" ? "active" : ""} type="button" onClick={() => { setActiveTab("included"); setPage(1); }}><span>已收录</span><b>{result?.included?.length || 0}</b></button>
          </div>
          <div className="welfare-compare-toolbar">
            <div className="pool-button-tabs compact">
              {[T.all, "新游", "预约"].map((item) => <button className={kindFilter === item ? "active" : ""} type="button" key={item} onClick={() => { setKindFilter(item); setPage(1); }}><span>{item}</span></button>)}
            </div>
            <div className="pool-button-tabs compact">
              <button className={sortMode === "time" ? "active" : ""} type="button" onClick={() => { setSortMode("time"); setPage(1); }}><span>时间</span></button>
              <button className={sortMode === "heat" ? "active" : ""} type="button" onClick={() => { setSortMode("heat"); setPage(1); }}><span>热度</span></button>
            </div>
            <span>{rows.length ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, rows.length)} / ${rows.length}` : "0 / 0"}</span>
          </div>
          <div className="welfare-compare-table-wrap">
            <table className="welfare-compare-table">
              <thead><tr><th>游戏名</th><th>副标题</th><th>类型</th><th>热度</th><th>日期</th><th>状态</th></tr></thead>
              <tbody>{result ? (pageRows.length ? pageRows.map((row) => <tr key={row.id || row.gameName + row.subtitle}>
                <td><strong>{row.gameName || "未命名"}</strong></td>
                <td>{row.subtitle || "-"}</td>
                <td>{row.eventKind || "-"}</td>
                <td>{row.popularityText || "-"}</td>
                <td>{formatDateMinute(row.eventAt).slice(0, 10)}</td>
                <td><em className={row.included ? "ok" : "warn"}>{row.status}</em></td>
              </tr>) : <tr><td colSpan={6}>当前分类暂无记录。</td></tr>) : <tr><td colSpan={6}>先选择或填写我方平台导出清单，然后开始对比。</td></tr>}</tbody>
            </table>
          </div>
          <div className="welfare-compare-pagination">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
            <span>{currentPage} / {pageCount}</span>
            <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一页</button>
          </div>
        </div>
      </div>
    </section>
    {pickerOpen ? <WelfareFilePickerModal onClose={() => setPickerOpen(false)} onSelect={selectWorkbookFile} /> : null}
  </div>;
}

function WelfareFilePickerModal({ onClose, onSelect }) {
  return <div className="modal-backdrop welfare-file-backdrop">
    <section className="welfare-file-modal">
      <div className="modal-head"><div><span>EXCEL</span><h3>选择福利对比表</h3></div><button type="button" onClick={onClose}>关闭</button></div>
      <label className="welfare-file-drop">
        <FileSpreadsheet size={22} />
        <strong>选择 .xlsx 文件</strong>
        <span>选择后会直接读取表格内容，不依赖浏览器暴露本机路径。</span>
        <input type="file" accept=".xlsx" onChange={(event) => onSelect(event.target.files?.[0])} />
      </label>
    </section>
  </div>;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function sortWelfareCompareByTime(left, right) {
  return new Date(right.eventAt || 0) - new Date(left.eventAt || 0);
}

function sortWelfareCompareByHeat(left, right) {
  const heatDiff = welfareCompareHeat(right) - welfareCompareHeat(left);
  if (heatDiff) return heatDiff;
  return sortWelfareCompareByTime(left, right);
}

function welfareCompareHeat(row = {}) {
  return Math.max(Number(row.playerCount) || 0, Number(row.reservationCount) || 0);
}

function OperationLogsPanel({ running, onUndoLatest, onUndoOperation, showToast }) {
  const pageSize = 15;
  const [logs, setLogs] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState(T.all);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const loadLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/operation-logs?limit=160", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      setLogs(payload.logs || []);
    } catch (error) {
      showToast?.("操作日志读取失败：" + (error?.message || error));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadLogs(); }, []);
  const types = useMemo(() => [T.all, ...new Set(logs.map((log) => log.type).filter(Boolean))], [logs]);
  const filteredLogs = useMemo(() => logs.filter((log) => {
    const text = [log.type, log.title, log.detail, log.targetId, log.targetType, log.createdAt].join(" ").toLowerCase();
    if (type !== T.all && log.type !== type) return false;
    return !keyword.trim() || text.includes(keyword.trim().toLowerCase());
  }), [keyword, logs, type]);
  useEffect(() => { setPage(1); }, [keyword, type]);
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageLogs = filteredLogs.slice((safePage - 1) * pageSize, safePage * pageSize);
  const undoOperation = async () => {
    await onUndoOperation?.();
    await loadLogs();
  };
  const undoSnapshot = async () => {
    await onUndoLatest?.();
    await loadLogs();
  };
  return <section className="panel logs-panel operation-logs-panel">
    <SectionHead kicker="Operations" title="操作日志" note={loading ? "读取中..." : `${filteredLogs.length} / ${logs.length} 条`} action={<button type="button" disabled={loading} onClick={loadLogs}>刷新</button>} />
    <div className="log-toolbar">
      <label><span>搜索</span><input value={keyword} placeholder="搜索标题、详情、目标 ID" onChange={(event) => setKeyword(event.target.value)} /></label>
      <label><span>类型</span><select value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      <button type="button" disabled={running} onClick={undoOperation}>{running ? "处理中..." : "撤销最近操作"}</button>
      <button type="button" disabled={running} onClick={undoSnapshot}>{running ? "处理中..." : "整包撤销"}</button>
    </div>
    <div className="log-list">{pageLogs.length ? pageLogs.map((log) => <article className={"log-row tone-" + logTone(log.type)} key={log.id}>
      <span>{log.type || "操作"}</span>
      <div>
        <strong>{log.title || log.targetId || "未命名操作"}</strong>
        <p>{log.detail || "无详情"}</p>
        <small>{log.targetType || "目标"}：{log.targetId || "-"}</small>
      </div>
      <time>{formatDateTime(log.createdAt)}</time>
    </article>) : <div className="empty-search inline">暂无匹配操作日志。</div>}</div>
    <div className="source-modal-pagination operation-log-pagination">
      <span>{filteredLogs.length ? `第 ${safePage} / ${totalPages} 页，共 ${filteredLogs.length} 条` : "0 / 0"}</span>
      <div>
        <button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
        <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</button>
      </div>
    </div>
  </section>;
}
function formatDateTime(value) { if (!value) return "暂无"; return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function formatDateMinute(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
function formatSourceRunTime(value) {
  if (!value || ["来自当前数据", "待接入"].includes(value)) return value || "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(/\//g, "-");
}
function formatDuration(value = 0) {
  const ms = Number(value) || 0;
  if (!ms) return "-";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return seconds + " 秒";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes + " 分" + (rest ? rest + " 秒" : "");
}
function formatFileSize(value = 0) {
  const bytes = Number(value) || 0;
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
}
function databaseTableMeta(name = "") {
  const map = {
    app_state: ["当前数据快照", "保存 /api/data 使用的完整前端数据包"],
    daily_snapshots: ["每日汇总快照", "按日期记录每次同步后的各池数量"],
    game_record_history: ["记录历史快照", "每次同步时保存单条记录历史版本"],
    game_records: ["游戏/资讯主记录", "SQLite 主数据表，前端五个数据池都来自这里"],
    operation_logs: ["操作日志", "记录编辑、隐藏、删除、重抓、撤销等后台操作"],
    scheduler_jobs: ["任务配置", "各平台定时任务的启用状态和时间点"],
    scheduler_runs: ["任务运行记录", "每次定时/手动抓取的运行结果和失败原因"],
  };
  const [title, desc] = map[name] || [name, "系统表"];
  return { title, desc };
}
function databaseColumnLabel(table = "", column = "") {
  const labels = {
    id: "ID",
    key: "键名",
    payload_json: "完整内容",
    updated_at: "更新时间",
    date: "日期",
    generated_at: "生成时间",
    counts_json: "数量汇总",
    snapshot_id: "快照ID",
    pool: "数据池",
    item_id: "记录ID",
    game_name: "名称",
    source_key: "来源标识",
    event_at: "事件时间",
    platform_ids_json: "平台ID",
    first_seen_at: "首次入库",
    last_seen_at: "最近更新",
    type: "类型",
    target_type: "目标类型",
    target_id: "目标ID",
    title: "标题",
    detail: "详情",
    created_at: "创建时间",
    source_key: "来源标识",
    module: "模块",
    name: "名称",
    sources_json: "来源配置",
    enabled: "启用状态",
    cron_text: "时间说明",
    interval_minutes: "间隔分钟",
    next_run_at: "下次运行",
    last_run_at: "上次运行",
    last_status: "上次状态",
    last_message: "上次消息",
    run_times_json: "运行时间点",
    job_id: "任务ID",
    started_at: "开始时间",
    finished_at: "结束时间",
    duration_ms: "耗时",
    status: "状态",
    message: "消息",
  };
  return labels[column] || column;
}
function schedulerSourceLabel(sourceKey = "") {
  const map = { taptap: "TapTap", hykb: "好游快爆", ninegame: "九游", xiaoqi: "小七", steam: "Steam", steamNew: "Steam新游", gcores: "机核", gamersky: "游民", ali213: "游侠" };
  return map[sourceKey] || sourceKey || "任务";
}
function parseRunTimesInput(value = "") {
  const items = Array.isArray(value) ? value : tokenizeRunTimesInput(value);
  return [...new Set(items.map((item) => {
    const text = String(item || "").trim().replace(/\s+/g, "");
    const weekly = text.match(/^(?:周|星期)([一二三四五六日天])(\d{1,2}):?(\d{2})$/);
    const daily = text.match(/^(\d{1,2}):?(\d{2})$/);
    const match = weekly || daily;
    if (!match) return "";
    const hourIndex = weekly ? 2 : 1;
    const minuteIndex = weekly ? 3 : 2;
    const hour = Math.max(0, Math.min(23, Number(match[hourIndex]) || 0));
    const minute = Math.max(0, Math.min(59, Number(match[minuteIndex]) || 0));
    const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return weekly ? `周${weekly[1] === "天" ? "日" : weekly[1]}${time}` : time;
  }).filter(Boolean))].sort();
}

function tokenizeRunTimesInput(value = "") {
  return String(value || "")
    .replace(/周([一二三四五六日天])\s+/g, "周$1")
    .replace(/星期([一二三四五六日天])\s+/g, "星期$1")
    .split(/[,，、/|]+|\s+(?!\d{1,2}:?\d{2})/)
    .map((item) => item.trim())
    .filter(Boolean);
}
function formatRunTimesInput(runTimes = [], fallback = "") {
  const times = parseRunTimesInput(runTimes);
  if (times.length) return times.join("、");
  return parseRunTimesInput(fallback).join("、");
}
function formatRunTimesDisplay(runTimes = [], fallback = "未设置") {
  return formatRunTimesInput(runTimes, fallback) || fallback;
}
function Scheduler({ schedulerJobs, schedulerRuns = [], sourceGroups = [], running, showToast, onRunSchedulerNow, onToggleSchedulerJob, onOpenSchedulerDetail, onPauseAllScheduler, onCleanupFailureRuns, embedded = false }) {
  const modules = buildSchedulerModules(schedulerJobs, sourceGroups, schedulerRuns);
  const recentRuns = schedulerRuns.slice(0, 5);
  const { currentFailures, historicalFailures } = splitSchedulerFailures(schedulerRuns);
  const [batchOpen, setBatchOpen] = useState(false);
  const platforms = modules.flatMap((module) => module.platforms.map((platform) => ({ ...platform, moduleName: module.name }))).filter((platform) => platform.sourceKey);
  return <section className={"panel scheduler-panel " + (embedded ? "embedded-panel" : "")}><SectionHead kicker="Scheduler" title="任务计划" action={<div className="scheduler-head-actions"><span>启用后按固定时间点运行，也可单独立即运行。</span><button className="primary-button" type="button" disabled={running || !platforms.length} onClick={() => onRunSchedulerNow?.(platforms.map((platform) => platform.sourceKey))}>{running ? "运行中" : "全部执行"}</button><button type="button" disabled={running} onClick={() => setBatchOpen(true)}>批量管理</button><button type="button" disabled={running} onClick={onCleanupFailureRuns}>清理旧失败</button><button type="button" disabled={running} onClick={onPauseAllScheduler}>全部暂停</button></div>} /><div className="scheduler-module-grid">{modules.map((module) => <article className="scheduler-module-card" key={module.name}><div className="scheduler-module-head"><strong>{module.name}</strong><span className={"scheduler-status " + statusTone(module.status)}>{safeText(module.status, "待接入")}</span></div><div className="scheduler-platform-list">{module.platforms.map((platform) => <SchedulerPlatformRow key={platform.sourceKey || platform.name} platform={platform} moduleName={module.name} running={running} showToast={showToast} onRunSchedulerNow={onRunSchedulerNow} onToggleSchedulerJob={onToggleSchedulerJob} onOpenSchedulerDetail={onOpenSchedulerDetail} />)}</div></article>)}</div>{currentFailures.length || historicalFailures.length ? <div className="scheduler-failure-grid">{currentFailures.length ? <SchedulerFailureBox title="当前失败" runs={currentFailures} current /> : <SchedulerFailureBox title="当前失败" runs={[]} current />}{historicalFailures.length ? <SchedulerFailureBox title="历史失败" runs={historicalFailures.slice(0, 6)} /> : null}</div> : null}{recentRuns.length ? <div className="scheduler-run-strip">{recentRuns.map((run) => <article className={"scheduler-run-chip " + (run.status === "success" ? "ok" : run.status === "failed" ? "warn" : "normal")} key={run.id}><b>{schedulerSourceLabel(run.sourceKey)}</b><span>{run.status === "success" ? "成功" : run.status === "failed" ? "失败" : run.status}</span><em>{formatDuration(run.durationMs)}</em><time>{formatSourceRunTime(run.finishedAt || run.startedAt)}</time></article>)}</div> : null}{batchOpen ? <SchedulerBatchModal platforms={platforms} running={running} onClose={() => setBatchOpen(false)} onToggleSchedulerJob={onToggleSchedulerJob} onRunSchedulerNow={onRunSchedulerNow} showToast={showToast} /> : null}</section>;
}
function SchedulerFailureBox({ title, runs = [], current = false }) {
  return <article className={"scheduler-failure-box " + (current ? "current" : "")}>
    <div><strong>{title}</strong><span>{runs.length ? `${runs.length} 条` : "无"}</span></div>
    {runs.length ? runs.map((run) => <p key={run.id}><b>{schedulerSourceLabel(run.sourceKey)}</b><span>{run.message || "运行失败"}</span><time>{formatSourceRunTime(run.finishedAt || run.startedAt)}</time></p>) : <p><span>当前没有正在影响判断的失败记录。</span></p>}
  </article>;
}
function splitSchedulerFailures(runs = []) {
  const latestBySource = new Map();
  for (const run of runs) {
    if (!latestBySource.has(run.sourceKey)) latestBySource.set(run.sourceKey, run);
  }
  const currentFailures = [];
  const historicalFailures = [];
  for (const run of runs) {
    if (run.status !== "failed") continue;
    if (latestBySource.get(run.sourceKey)?.id === run.id) currentFailures.push(run);
    else historicalFailures.push(run);
  }
  return { currentFailures, historicalFailures };
}
function SchedulerPlatformRow({ platform, moduleName, running, showToast, onRunSchedulerNow, onToggleSchedulerJob, onOpenSchedulerDetail }) {
  const lastText = platform.lastFailure
    ? "失败：" + platform.lastFailure
    : (platform.lastRun ? "上次 " + formatSourceRunTime(platform.lastRun) + " / " + formatDuration(platform.lastDurationMs) : "暂无运行记录");
  const nextText = " · 下次 " + safeText(platform.nextRun, platform.enabled ? "等待排程" : "手动");
  return <div className="scheduler-platform-row"><div className="scheduler-platform-main"><b>{platform.name}</b><p>{platform.scope}</p><small>{lastText}<i>{nextText}</i></small></div><span className="scheduler-frequency">{platform.enabled ? safeText(platform.frequency, "定时") : "未启用"}</span><div className="scheduler-actions"><button type="button" disabled={running} onClick={() => onOpenSchedulerDetail?.(platform.sourceKey)}>查看</button><button className="primary-button" type="button" disabled={running} onClick={() => onRunSchedulerNow?.(platform.sourceKey)}>{running ? "运行中" : "立即运行"}</button></div></div>;
}
function SchedulerDetailModal({ detail, running, onClose, onToggleSchedulerJob, onRunSchedulerNow }) {
  const job = detail?.job || {};
  const runs = detail?.runs || [];
  const lastFailure = detail?.lastFailure;
  const [timeInput, setTimeInput] = useState(formatRunTimesInput(job.runTimes, job.cronText));
  useEffect(() => { setTimeInput(formatRunTimesInput(job.runTimes, job.cronText)); }, [job.runTimes, job.cronText]);
  const normalizedInput = formatRunTimesInput(parseRunTimesInput(timeInput));
  const currentTimes = formatRunTimesInput(job.runTimes, job.cronText);
  const timeChanged = normalizedInput !== currentTimes;
  const saveTimes = async () => {
    await onToggleSchedulerJob?.(job.sourceKey, Boolean(job.enabled), timeInput);
    onClose?.();
  };
  const toggleEnabled = async () => {
    await onToggleSchedulerJob?.(job.sourceKey, !job.enabled, timeInput);
    onClose?.();
  };
  const runNow = async () => {
    await onRunSchedulerNow?.(job.sourceKey);
    onClose?.();
  };
  return <div className="modal-backdrop" role="presentation"><section className="scheduler-detail-modal" role="dialog" aria-modal="true" aria-label="任务详情"><div className="scheduler-detail-head"><div><span>Scheduler</span><h3>{job.name || job.sourceKey || "任务详情"}</h3><p>{job.module || "未分组"} / {job.enabled ? "已启用" : "未启用"}</p></div><button type="button" onClick={onClose}>关闭</button></div><div className="scheduler-detail-grid"><article><b>下次运行</b><strong>{formatSourceRunTime(job.nextRunAt)}</strong></article><article><b>最近状态</b><strong>{job.lastStatus || "待配置"}</strong></article><article><b>最近失败</b><strong>{lastFailure ? lastFailure.message : "无"}</strong></article></div><div className="scheduler-time-editor"><div><b>运行时间点</b><p>按 24 小时制填写，多个时间用顿号、逗号或空格分隔。</p></div><div className="scheduler-time-input-wrap"><input value={timeInput} placeholder="09:00、12:00、18:00" onChange={(event) => setTimeInput(event.target.value)} /><span>{parseRunTimesInput(timeInput).length || 0} 个时间点</span></div><div className="scheduler-time-preview">{parseRunTimesInput(timeInput).map((time) => <em key={time}>{time}</em>)}</div><div className="scheduler-detail-actions"><button type="button" disabled={running} onClick={toggleEnabled}>{job.enabled ? "停用任务" : "启用任务"}</button><button type="button" disabled={running || !timeChanged} onClick={saveTimes}>{running ? "保存中..." : "保存时间点"}</button><button className="primary-button" type="button" disabled={running} onClick={runNow}>{running ? "运行中" : "立即运行"}</button></div></div><div className="scheduler-detail-runs"><h4>最近运行</h4>{runs.length ? runs.map((run) => <article className={"scheduler-detail-run " + (run.status === "success" ? "ok" : run.status === "failed" ? "warn" : "")} key={run.id}><span>{run.status === "success" ? "成功" : run.status === "failed" ? "失败" : run.status}</span><div><b>{formatSourceRunTime(run.startedAt)} - {formatSourceRunTime(run.finishedAt)}</b><p>{run.message || "无详情"} / 耗时 {formatDuration(run.durationMs)}</p></div><em>{run.counts?.pcNews || run.counts?.mobileGames || run.counts?.welfareGames || run.counts?.steamGames || 0} 条</em></article>) : <div className="empty-search inline">暂无运行记录。</div>}</div></section></div>;
}
function SchedulerBatchModal({ platforms = [], running, onClose, onToggleSchedulerJob, onRunSchedulerNow, showToast }) {
  const [selected, setSelected] = useState(() => new Set(platforms.map((platform) => platform.sourceKey)));
  const [busy, setBusy] = useState("");
  const selectedList = platforms.filter((platform) => selected.has(platform.sourceKey));
  const toggle = (sourceKey) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(sourceKey)) next.delete(sourceKey);
    else next.add(sourceKey);
    return next;
  });
  const runBatch = async (mode) => {
    if (!selectedList.length) return showToast?.("请先选择至少一个任务。");
    setBusy(mode);
    try {
      for (const platform of selectedList) {
        const times = formatRunTimesInput(platform.runTimes, platform.frequency);
        if (mode === "enable") await onToggleSchedulerJob?.(platform.sourceKey, true, times);
        if (mode === "disable") await onToggleSchedulerJob?.(platform.sourceKey, false, times);
      }
      if (mode === "run") await onRunSchedulerNow?.(selectedList.map((platform) => platform.sourceKey));
      showToast?.(mode === "enable" ? "已启用所选任务。" : mode === "disable" ? "已停用所选任务。" : "所选任务已运行完成。");
      if (mode !== "run") onClose?.();
    } catch (error) {
      showToast?.("批量任务失败：" + (error?.message || error));
    } finally {
      setBusy("");
    }
  };
  return <div className="modal-backdrop scheduler-batch-backdrop" role="presentation"><section className="scheduler-batch-modal" role="dialog" aria-modal="true" aria-label="任务批量管理"><div className="scheduler-batch-head"><div><span>Scheduler</span><h3>任务批量管理</h3><p>已选择 {selectedList.length} / {platforms.length} 个平台</p></div><button type="button" disabled={Boolean(busy) || running} onClick={onClose}>关闭</button></div><div className="scheduler-batch-toolbar"><button type="button" onClick={() => setSelected(new Set(platforms.map((platform) => platform.sourceKey)))}>全选</button><button type="button" onClick={() => setSelected(new Set())}>清空</button><button type="button" disabled={Boolean(busy) || running} onClick={() => runBatch("enable")}>{busy === "enable" ? "启用中..." : "启用所选"}</button><button type="button" disabled={Boolean(busy) || running} onClick={() => runBatch("disable")}>{busy === "disable" ? "停用中..." : "停用所选"}</button><button className="primary-button" type="button" disabled={Boolean(busy) || running} onClick={() => runBatch("run")}>{busy === "run" ? "运行中..." : "立即运行所选"}</button></div><div className="scheduler-batch-list">{platforms.map((platform) => <label className="scheduler-batch-row" key={platform.sourceKey}><input type="checkbox" checked={selected.has(platform.sourceKey)} onChange={() => toggle(platform.sourceKey)} /><div><strong>{platform.name}</strong><span>{platform.moduleName} / {platform.enabled ? "已启用" : "未启用"} / {formatRunTimesDisplay(platform.runTimes, platform.frequency)}</span></div></label>)}</div></section></div>;
}
function buildSchedulerModules(jobs = [], sourceGroups = [], schedulerRuns = []) {
  const bySource = new Map(jobs.map((job) => [job.sourceKey, job]));
  const latestRunBySource = new Map();
  for (const run of schedulerRuns) {
    if (!latestRunBySource.has(run.sourceKey)) latestRunBySource.set(run.sourceKey, run);
  }
  const sourceMap = new Map(sourceGroups.map((group) => [group.key, group]));
  const sourcePlatform = (key, fallback) => {
    const group = sourceMap.get(key) || {};
    const job = bySource.get(key) || {};
    const latestRun = latestRunBySource.get(key) || {};
    return {
      ...fallback,
      sourceKey: key,
      enabled: Boolean(job.enabled),
      intervalMinutes: Number(job.intervalMinutes) || 0,
      runTimes: job.runTimes?.length ? job.runTimes : parseRunTimesInput(job.cronText || fallback.frequency),
      status: group.status || fallback.status || "待配置",
      count: group.count ?? fallback.count ?? 0,
      rawCount: group.rawCount ?? fallback.rawCount ?? 0,
      frequency: formatRunTimesDisplay(job.runTimes, job.cronText || fallback.frequency),
      nextRun: formatSourceRunTime(job.nextRunAt) || formatSourceRunTime(group.lastRun) || fallback.nextRun || "待配置",
      lastRun: latestRun.finishedAt || job.lastRunAt || group.lastRun || "",
      lastDurationMs: latestRun.durationMs || 0,
      lastFailure: (job.lastStatus === "失败" ? job.lastMessage : "") || (latestRun.status === "failed" ? latestRun.message : ""),
    };
  };
  const sourcePlatformMany = (keys, fallback) => {
    const groups = keys.map((key) => sourceMap.get(key)).filter(Boolean);
    const latest = groups.map((group) => group.lastRun).filter(Boolean).sort((left, right) => new Date(right) - new Date(left))[0] || "";
    return {
      ...fallback,
      sourceKey: keys[0],
      enabled: keys.some((key) => bySource.get(key)?.enabled),
      status: moduleStatus(keys, sourceMap, fallback.status),
      count: groups.reduce((sum, group) => sum + (Number(group.count) || 0), 0),
      rawCount: groups.reduce((sum, group) => sum + (Number(group.rawCount) || 0), 0),
      nextRun: formatSourceRunTime(latest) || fallback.nextRun || "待配置",
    };
  };
  return [
    { name: "手机游戏", status: moduleStatus(["taptap", "hykb", "ninegame"], sourceMap), platforms: [
      sourcePlatform("taptap", { name: "TapTap", scope: "新游日历 / 详情页", frequency: "06:10、13:00" }),
      sourcePlatform("hykb", { name: "好游快爆", scope: "时间线 / 详情页", frequency: "06:30、13:07" }),
      sourcePlatform("ninegame", { name: "九游", scope: "开测表 / 详情页", frequency: "06:50、13:14" }),
    ] },
    { name: "福利游戏", status: moduleStatus(["xiaoqi"], sourceMap), platforms: [
      sourcePlatform("xiaoqi", { name: "小七手游", scope: "新游 / 预约 / 福利详情", frequency: "07:10、13:21" }),
    ] },
    { name: "端游", status: moduleStatus(["steam", "steamNew"], sourceMap), platforms: [
      sourcePlatform("steam", { name: "Steam游戏", scope: "官方接口 / 在线人数", frequency: "07:30" }),
      sourcePlatform("steamNew", { name: "Steam新游", scope: "新品 / 即将推出", frequency: "07:50" }),
    ] },
    { name: "资讯", status: moduleStatus(["gcores", "gamersky", "ali213"], sourceMap), platforms: [
      sourcePlatform("gcores", { name: "机核", scope: "资讯列表 / 详情页", frequency: "08:10、13:42" }),
      sourcePlatform("gamersky", { name: "游民星空", scope: "资讯列表 / 详情页", frequency: "08:30、13:49" }),
      sourcePlatform("ali213", { name: "游侠网", scope: "资讯列表 / 详情页", frequency: "08:50、13:56" }),
    ] },
  ];
}
function moduleStatus(keys = [], sourceMap, fallback = "") {
  const groups = keys.map((key) => sourceMap.get(key)).filter(Boolean);
  if (!groups.length) return fallback || "待配置";
  if (groups.some((group) => group.status === "需检查")) return "需检查";
  if (groups.some((group) => group.status === "已抓取")) return "已抓取";
  return fallback || groups[0]?.status || "待配置";
}
function logTone(type = "") {
  if (/失败|删除|错误/.test(type)) return "danger";
  if (/重抓|抓取|更新/.test(type)) return "info";
  if (/审核|整理/.test(type)) return "review";
  if (/撤销/.test(type)) return "undo";
  if (/管理/.test(type)) return "manage";
  return "default";
}
function normalizeSchedulerName(value = "") {
  if (/手游核心|手机游戏/.test(value)) return "手机游戏";
  if (/福利新游|福利游戏/.test(value)) return "福利游戏";
  if (/PC\/Steam/.test(value)) return "PC/Steam";
  return value;
}
function safeText(value = "", fallback = "待配置") {
  const text = String(value || "").trim();
  if (!text || /^\?+$/.test(text) || /\?{4,}/.test(text)) return fallback;
  return text;
}
function normalizeChoiceLine(value = "") {
  return String(value || "")
    .replace(/[\u201C\u201D"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[-\uFF1A:\u3001\uFF0C\u3002\s]+/, "")
    .trim();
}
function compactCompareText(value = "") {
  return normalizeChoiceLine(value).replace(/[\s\uFF0C\u3002\uFF01\uFF1F\u3001,.!?:\uFF1A\uFF1B;\u300A\u300B\u300C\u300D\u300E\u300F\uFF08\uFF09()\[\]\u3010\u3011]/g, "").toLowerCase();
}
function cleanSummaryChoice(value = "", gameName = "") {
  const lines = String(value || "")
    .split(/\n+|(?<=[\u3002\uFF01\uFF1F])/)
    .map(normalizeChoiceLine)
    .filter(Boolean)
    .filter((line) => !/(TapTap|\u597D\u6E38\u5FEB\u7206APP|\u4E5D\u6E38APP|\u4E13\u533A|\u793C\u5305|\u653B\u7565|\u4E0B\u8F7D|\u9884\u7EA6\u4E0B\u8F7D|\u9690\u79C1\u653F\u7B56|\u7528\u6237\u534F\u8BAE)/i.test(line));
  const datedEventLines = lines.filter((line) => /(\d{1,2}\u6708\d{1,2}\u65E5|\d{1,2}[/-]\d{1,2}|\u4ECA\u5929|\u660E\u5929|\u540E\u5929|\d{1,2}:\d{2})/.test(line) && /(\u516C\u6D4B|\u5185\u6D4B|\u5F00\u6D4B|\u6D4B\u8BD5|\u62DB\u52DF|\u4E0A\u7EBF|\u66F4\u65B0|\u7248\u672C|\u6D3B\u52A8|\u8054\u52A8|\u8D5B\u5B63|\u5F00\u542F|\u5B9A\u6863|\u8D44\u683C)/.test(line));
  const eventLines = lines.filter((line) => /(\u516C\u6D4B|\u5185\u6D4B|\u5F00\u6D4B|\u6D4B\u8BD5|\u62DB\u52DF|\u4E0A\u7EBF|\u66F4\u65B0|\u7248\u672C|\u6D3B\u52A8|\u8054\u52A8|\u8D5B\u5B63|\u5F00\u542F|\u5B9A\u6863|\u8D44\u683C)/.test(line));
  const source = datedEventLines.length ? datedEventLines : (eventLines.length ? eventLines : lines);
  const kept = [];
  for (const line of source) {
    const text = compactCompareText(line);
    if (!text || text.length < 4) continue;
    if (kept.some((item) => {
      const existing = compactCompareText(item);
      return existing.includes(text) || text.includes(existing);
    })) continue;
    kept.push(line);
    if (kept.length >= 2) break;
  }
  if (!kept.length) return "";
  return kept.join("\n");
}
function normalizeChoiceValue(value, field, gameName = "") {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (field === "summary") return cleanSummaryChoice(value, gameName);
  return String(value || "").trim();
}
function formatChoiceValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ");
  return String(value || "").trim();
}
function choiceKeyValue(value) {
  if (Array.isArray(value)) return value.map(compactCompareText).filter(Boolean).sort().join("|");
  return compactCompareText(formatChoiceValue(value));
}
function sameChoiceValue(left, right) { return choiceKeyValue(left) === choiceKeyValue(right); }
function uniqueChoices(choices) {
  const byText = new Map();
  for (const choice of choices) {
    const text = formatChoiceValue(choice.value);
    const key = choiceKeyValue(choice.value);
    if (!text || text === "-" || !key) continue;
    const current = byText.get(key);
    if (current) {
      current.source = [...new Set([...(current.source || "").split(" / ").filter(Boolean), choice.source].filter(Boolean))].join(" / ");
      continue;
    }
    byText.set(key, { ...choice });
  }
  return [...byText.values()];
}
function cleanRecordTags(record, selectedGame) {
  const blocked = [selectedGame?.status, selectedGame?.eventType, selectedGame?.rawStatus, selectedGame?.rawEventType, record?.status, record?.eventType, ...(selectedGame?.sources || [])];
  return (record?.gameplayTags?.length ? record.gameplayTags : record?.tags || []).filter((tag) => tag && !blocked.includes(tag));
}
function buildFieldRows(selectedGame, gameTags, sourceRecords) {
  if (!selectedGame) return [];
  const contentValue = normalizeChoiceValue(selectedGame.summary || selectedGame.updateContent || "", "summary", selectedGame.gameName);
  const makeChoice = (source, value, field) => ({ source, value: normalizeChoiceValue(value, field, selectedGame.gameName) });
  return [
    { field: "gameName", label: "\u6E38\u620F\u540D\u79F0", current: selectedGame.gameName || "", choices: uniqueChoices([makeChoice("\u6E05\u6D17\u540E", selectedGame.gameName || "", "gameName"), ...sourceRecords.map((record) => makeChoice(record.source || "\u6765\u6E90", record.gameName || "", "gameName"))]) },
    { field: "gameplayTags", label: "\u73A9\u6CD5\u6807\u7B7E", current: gameTags, choices: uniqueChoices([{ source: "\u6E05\u6D17\u540E", value: gameTags }, ...sourceRecords.map((record) => ({ source: record.source || "\u6765\u6E90", value: cleanRecordTags(record, selectedGame) }))]) },
    { field: "vendor", label: "\u6E38\u620F\u5382\u5546", current: selectedGame.vendor || "", choices: uniqueChoices([makeChoice("\u6E05\u6D17\u540E", selectedGame.vendor || "", "vendor"), ...sourceRecords.map((record) => makeChoice(record.source || "\u6765\u6E90", record.vendor || "", "vendor"))]) },
    { field: "summary", label: "\u6574\u7406\u5185\u5BB9", current: contentValue, choices: uniqueChoices([makeChoice("\u6E05\u6D17\u540E", contentValue, "summary"), ...sourceRecords.map((record) => makeChoice(record.source || "\u6765\u6E90", record.summary || record.updateContent || "", "summary"))]) },
  ];
}
function findIssueTarget(issue, games = []) {
  if (!issue || /\u5E7F\u544A\u8FC7\u6EE4/.test(issue.type || "")) return null;
  const titleKey = compactCompareText(issue.title || "");
  if (!titleKey || titleKey.length < 2) return null;
  return games.find((game) => compactCompareText(game.gameName || "") === titleKey || (game.sourceRecords || []).some((record) => compactCompareText(record.gameName || "") === titleKey)) || null;
}

function GameEditModal({ game, running, onClose, onSave }) {
  const initialTags = (game.gameplayTags?.length ? game.gameplayTags : game.tags || []).filter((tag) => tag && ![game.status, game.eventType, game.rawStatus, game.rawEventType, ...(game.sources || [])].includes(tag));
  const statusOptions = ["上线/测试", "更新", "活动/联动", "首发", "预约", "待整理"];
  const sourceList = game.sources?.length ? game.sources : ["来源未知"];
  const isWelfareGame = isWelfareGameItem(game);
  const hasImportanceLevel = isImportanceGameItem(game);
  const formatEditDate = (value = "") => {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    const match = String(value).match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/);
    return match ? match[0].replace(/\//g, "-") : String(value).slice(0, 10);
  };
  const [draft, setDraft] = useState({
    gameName: game.gameName || "",
    subtitle: game.subtitle || "",
    iconUrl: game.iconUrl || "",
    status: game.status || "",
    eventAt: formatEditDate(game.eventAt),
    sources: game.sources || [],
    gameplayTags: initialTags.join("、"),
    vendor: game.vendor || "",
    summary: game.summary || game.updateContent || "",
    importanceLevel: normalizeImportanceLevel(game.importanceLevel),
    playerCount: formatEditNumber(game.playerCount),
    reservationCount: formatEditNumber(game.reservationCount),
    downloadCount: formatEditNumber(game.downloadCount),
    popularityText: game.popularityText || formatWelfarePopularityForAdmin(game),
    welfareKind: game.welfareKind || game.eventType || "",
  });

  useEffect(() => {
    setDraft({
      gameName: game.gameName || "",
      subtitle: game.subtitle || "",
      iconUrl: game.iconUrl || "",
      status: game.status || "",
      eventAt: formatEditDate(game.eventAt),
      sources: game.sources || [],
      gameplayTags: initialTags.join("、"),
      vendor: game.vendor || "",
      summary: game.summary || game.updateContent || "",
      importanceLevel: normalizeImportanceLevel(game.importanceLevel),
      playerCount: formatEditNumber(game.playerCount),
      reservationCount: formatEditNumber(game.reservationCount),
      downloadCount: formatEditNumber(game.downloadCount),
      popularityText: game.popularityText || formatWelfarePopularityForAdmin(game),
      welfareKind: game.welfareKind || game.eventType || "",
    });
  }, [game.id]);

  const splitList = (value) => String(value || "").split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
  const values = {
    gameName: draft.gameName.trim(),
    iconUrl: draft.iconUrl.trim(),
    subtitle: draft.subtitle.trim(),
    status: draft.status.trim(),
    eventAt: draft.eventAt ? `${draft.eventAt}T10:00:00+08:00` : "",
    sources: draft.sources,
    gameplayTags: splitList(draft.gameplayTags),
    vendor: draft.vendor.trim(),
    summary: draft.summary.trim(),
    importanceLevel: normalizeImportanceLevel(draft.importanceLevel),
    playerCount: draft.playerCount === "" ? "" : Number(draft.playerCount),
    reservationCount: draft.reservationCount === "" ? "" : Number(draft.reservationCount),
    downloadCount: draft.downloadCount === "" ? "" : Number(draft.downloadCount),
    popularityText: draft.popularityText.trim(),
    welfareKind: draft.welfareKind.trim(),
  };
  const changedFields = [
    values.gameName !== (game.gameName || "") ? "gameName" : "",
    values.subtitle !== (game.subtitle || "") ? "subtitle" : "",
    values.iconUrl !== (game.iconUrl || "") ? "iconUrl" : "",
    values.status !== (game.status || "") ? "status" : "",
    draft.eventAt !== formatEditDate(game.eventAt) ? "eventAt" : "",
    choiceKeyValue(values.sources) !== choiceKeyValue(game.sources || []) ? "sources" : "",
    choiceKeyValue(values.gameplayTags) !== choiceKeyValue(initialTags) ? "gameplayTags" : "",
    values.vendor !== (game.vendor || "") ? "vendor" : "",
    values.summary !== (game.summary || game.updateContent || "") ? "summary" : "",
    hasImportanceLevel && values.importanceLevel !== normalizeImportanceLevel(game.importanceLevel) ? "importanceLevel" : "",
    isWelfareGame && String(values.playerCount) !== String(formatEditNumber(game.playerCount)) ? "playerCount" : "",
    isWelfareGame && String(values.reservationCount) !== String(formatEditNumber(game.reservationCount)) ? "reservationCount" : "",
    isWelfareGame && String(values.downloadCount) !== String(formatEditNumber(game.downloadCount)) ? "downloadCount" : "",
    isWelfareGame && values.popularityText !== (game.popularityText || formatWelfarePopularityForAdmin(game) || "") ? "popularityText" : "",
    isWelfareGame && values.welfareKind !== (game.welfareKind || game.eventType || "") ? "welfareKind" : "",
  ].filter(Boolean);

  const update = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const setStatus = (value) => setDraft((current) => ({ ...current, status: value }));
  const changeIcon = () => {
    const next = window.prompt("填写新的游戏图标链接", draft.iconUrl);
    if (next !== null) setDraft((current) => ({ ...current, iconUrl: next.trim() }));
  };

  return <div className="modal-backdrop" role="presentation"><section className="edit-modal" role="dialog" aria-modal="true" aria-label="编辑游戏字段"><div className="edit-modal-head"><div className="edit-icon-column"><div className="edit-modal-title"><strong>编辑游戏</strong></div><button className={"edit-icon-picker large " + (draft.iconUrl ? "has-image" : "is-empty")} type="button" onClick={changeIcon}>{draft.iconUrl ? <span className="edit-icon-frame"><img src={proxiedAdminImage(draft.iconUrl)} alt="" /></span> : <span className="edit-icon-empty" aria-hidden="true">+</span>}<em>换图标</em></button></div><div className="edit-hero-main"><h3>{game.gameName}</h3><div className="edit-source-pills">{sourceList.map((source) => <b key={source}>{source}</b>)}</div></div><button className="edit-modal-close" type="button" onClick={onClose}>关闭</button></div><div className="edit-modal-grid"><label><span>游戏名称</span><input value={draft.gameName} onChange={update("gameName")} /></label><label><span>副标题</span><input value={draft.subtitle} onChange={update("subtitle")} placeholder="福利游戏可填写，其他游戏可留空" /></label><label><span>状态分类</span><select value={draft.status} onChange={(event) => setStatus(event.target.value)}>{[...new Set([draft.status, ...statusOptions].filter(Boolean))].map((item) => <option value={item} key={item}>{item}</option>)}</select></label>{hasImportanceLevel ? <label><span>重要级别</span><select value={draft.importanceLevel} onChange={update("importanceLevel")}><option value="S">S 最高</option><option value="A">A 重点</option><option value="B">B 关注</option><option value="C">C 默认</option></select></label> : null}<label><span>日期</span><input type="date" value={draft.eventAt} onChange={update("eventAt")} /></label>{isWelfareGame ? <><label><span>在玩人数</span><input type="number" min="0" value={draft.playerCount} onChange={update("playerCount")} placeholder="例如 19651" /></label><label><span>预约人数</span><input type="number" min="0" value={draft.reservationCount} onChange={update("reservationCount")} placeholder="例如 2487" /></label><label><span>下载人数</span><input type="number" min="0" value={draft.downloadCount} onChange={update("downloadCount")} placeholder="例如 63" /></label><label><span>热度文本</span><input value={draft.popularityText} onChange={update("popularityText")} placeholder="例如 2487人预约" /></label><label><span>福利类型</span><select value={draft.welfareKind} onChange={update("welfareKind")}><option value="">自动判断</option><option value="新游">新游</option><option value="预约">预约</option></select></label></> : null}<label><span>游戏厂商</span><input value={draft.vendor} onChange={update("vendor")} /></label><label><span>玩法标签</span><input value={draft.gameplayTags} onChange={update("gameplayTags")} placeholder="用、分隔，例如：射击、竞技、搜打撤" /></label><label className="wide"><span>简介 / 整理内容</span><textarea value={draft.summary} rows={5} onChange={update("summary")} /></label></div><div className="edit-modal-actions"><span>{changedFields.length ? "待保存 " + changedFields.length + " 项" : "当前无修改"}</span><button type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={running || !changedFields.length} onClick={() => onSave({ gameId: game.id, gameName: game.gameName, values, changedFields })}>{running ? "保存中..." : "保存并同步"}</button></div></section></div>;
}
function PoolGovernance({ mobileGames, onSelectGame, onEditGame, cleanupIssues, running, recrawlingIssueId, showToast, onRecrawlIssue, onUpdateIssueStatus }) {
  const [issuePage, setIssuePage] = useState(1);
  const [issueStatus, setIssueStatus] = useState("open");
  const matchedIssues = cleanupIssues
    .map(normalizeIssueForUi)
    .filter((issue) => findIssueTarget(issue, mobileGames))
    .filter((issue) => issueStatus === T.all || issue.status === issueStatus);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(matchedIssues.length / pageSize));
  const safePage = Math.min(issuePage, totalPages);
  const visibleIssues = matchedIssues.slice((safePage - 1) * pageSize, safePage * pageSize);
  const locateIssue = (issue) => {
    const target = findIssueTarget(issue, mobileGames);
    if (!target) return showToast(issue.title + " \u6ca1\u6709\u5173\u8054\u5230\u5177\u4f53\u6e38\u620f\u3002");
    onSelectGame(target.id);
    window.setTimeout(() => document.querySelector(".mobile-pool-layout")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    showToast("\u5df2\u5b9a\u4f4d\u5230\uff1a" + target.gameName);
  };
  return <section className="pool-governance"><div className="governance-grid"><article className="governance-card"><SectionHead kicker="Issues" title={"\u6e05\u6d17\u95ee\u9898"} action={<div className="issue-filter-tabs">{[["open", "待处理"], ["ignored", "已忽略"], ["resolved", "已解决"], [T.all, "全部"]].map(([key, label]) => <button className={issueStatus === key ? "active" : ""} type="button" onClick={() => { setIssueStatus(key); setIssuePage(1); }} key={key}>{label}</button>)}</div>} compact /><div className="issue-list compact">{visibleIssues.length ? visibleIssues.map((issue) => { const target = findIssueTarget(issue, mobileGames); const isRecrawling = recrawlingIssueId === issue.id; return <article className={"issue-card issue-" + issue.status} key={issue.id}><span>{issue.severity || "中"}</span><div><strong>{issue.type}{"\uff1a"}{issue.title}</strong><p>{issue.detail}</p><em>{issueStatusLabel(issue.status)}</em></div><div className="issue-actions"><button type="button" disabled={!target} onClick={() => locateIssue(issue)}>定位</button>{target && issue.type !== "活动日期不一致" ? <button type="button" disabled={running} onClick={() => onEditGame?.(target)}>编辑修正</button> : null}<button type="button" disabled={!target || isRecrawling} onClick={() => onRecrawlIssue?.({ issueId: issue.id, gameId: target?.id, title: issue.title, source: issue.sourceKey || issue.source || target?.sources?.[0] })}>{isRecrawling ? "重抓中..." : "重抓"}</button><button type="button" disabled={running || issue.status === "ignored"} onClick={() => onUpdateIssueStatus?.({ issueId: issue.id, title: issue.title, status: "ignored" })}>忽略</button><button type="button" disabled={running || issue.status === "resolved"} onClick={() => onUpdateIssueStatus?.({ issueId: issue.id, title: issue.title, status: "resolved" })}>解决</button></div></article>; }) : <div className="empty-search inline">当前模块暂无清洗问题。</div>}</div><div className="source-modal-pagination issue-pagination"><span>第 {safePage} / {totalPages} 页，共 {matchedIssues.length} 条</span><div><button type="button" disabled={safePage <= 1} onClick={() => setIssuePage((value) => Math.max(1, value - 1))}>上一页</button><button type="button" disabled={safePage >= totalPages} onClick={() => setIssuePage((value) => Math.min(totalPages, value + 1))}>下一页</button></div></div></article></div></section>;
}

function normalizeIssueForUi(issue = {}) {
  const title = String(issue.title || issue.gameName || issue.newsTitle || issue.detail || "").slice(0, 80);
  const source = String(issue.source || issue.platform || "");
  const type = String(issue.type || "抓取问题");
  return {
    ...issue,
    id: issue.id && !/^issue-\d+$/i.test(String(issue.id)) ? issue.id : `issue-${compactCompareText(issue.sourceKey || source || "source")}-${compactCompareText(title || "record")}-${compactCompareText(type)}`.slice(0, 128),
    title,
    sourceKey: issue.sourceKey || source,
    targetId: issue.targetId || issue.platformId || issue.sourceId || "",
    status: issue.status || "open",
  };
}

function issueStatusLabel(status = "") {
  if (status === "ignored") return "已忽略";
  if (status === "resolved") return "已解决";
  return "待处理";
}

function ImportancePill({ item, compact = false }) {
  if (!isImportanceGameItem(item)) return null;
  const level = normalizeImportanceLevel(item?.importanceLevel);
  return <span className={"importance-pill level-" + level.toLowerCase() + (compact ? " compact" : "")}>{level}</span>;
}

function isImportanceGameItem(item = {}) {
  if (isSteamGameItem(item) || isPcNewsItem(item)) return false;
  return isWelfareGameItem(item) || isMobileGameItem(item);
}

function isMobileGameItem(item = {}) {
  const textValue = [item.pool, item.platform, item.source, item.sourceKey, ...(item.sources || [])].join(" ");
  return /手游|TapTap|好游快爆|九游|taptap|hykb|ninegame/i.test(textValue);
}

function isWelfareGameItem(item = {}) {
  const textValue = [item.pool, item.source, item.sourceKey, ...(item.sources || []), item.welfareKind, item.subtitle].join(" ");
  return /小七|福利|xiaoqi/i.test(textValue);
}

function formatEditNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : "";
}

function formatAdminPeopleCount(value) {
  const numeric = Number(value) || 0;
  if (!numeric) return "";
  if (numeric >= 10000) return `${(numeric / 10000).toFixed(numeric >= 100000 ? 0 : 1).replace(/\.0$/, "")}万`;
  return numeric.toLocaleString("zh-CN");
}

function welfareKindForAdmin(item = {}) {
  const textValue = [item.welfareKind, item.eventType, item.status, item.popularityText, item.summary, item.updateContent].join(" ");
  return /预约/.test(textValue) ? "预约" : "新游";
}

function formatWelfarePopularityForAdmin(item = {}) {
  const kind = welfareKindForAdmin(item);
  const count = kind === "预约" ? Number(item.reservationCount) || 0 : Number(item.playerCount) || Number(item.downloadCount) || 0;
  return count ? `${formatAdminPeopleCount(count)}人${kind === "预约" ? "预约" : "在玩"}` : "";
}

function welfarePopularityParts(item = {}) {
  if (!isWelfareGameItem(item)) return [];
  const parts = [];
  if (Number(item.playerCount) > 0) parts.push({ label: "在玩人数", value: `${formatAdminPeopleCount(item.playerCount)}人在玩` });
  if (Number(item.reservationCount) > 0) parts.push({ label: "预约人数", value: `${formatAdminPeopleCount(item.reservationCount)}人预约` });
  if (Number(item.downloadCount) > 0) parts.push({ label: "下载人数", value: `${formatAdminPeopleCount(item.downloadCount)}人` });
  if (!parts.length && item.popularityText) parts.push({ label: welfareKindForAdmin(item) === "预约" ? "预约人数" : "在玩人数", value: item.popularityText });
  return parts;
}
function PoolManager({ activePoolKind, activePoolRow, mobilePoolSource, onMobilePoolSourceChange, mobilePoolCounts, welfarePoolType, onWelfarePoolTypeChange, welfarePoolCounts, pcPoolType, onPcPoolTypeChange, pcPoolCounts, newsSource, onNewsSourceChange, newsPoolCounts, mobileGames, totalMobileGames, selectedGame, onSelectGame, onEditGame, keyword, onKeywordChange, status, onStatusChange, statuses, dateFrom, onDateFromChange, dateTo, onDateToChange, timeSide, onTimeSideChange, cleanupIssues, rawCount, poolCount, excelInfo, running, recrawlingIssueId, exportExcel, applyExcel, showToast, onRecrawlIssue, onUpdateIssueStatus }) {
  const isPcPool = activePoolKind === "pc" || activePoolKind === "news";
  const isSteamPool = activePoolKind === "pc";
  const isNewsPool = activePoolKind === "news";
  const isMobilePool = activePoolKind === "mobile";
  const isWelfarePool = activePoolKind === "welfare";
  const showPastFuture = isMobilePool || isWelfarePool || (isSteamPool && pcPoolType === "steamNew");
  return <div className="admin-stack">
    <section className="panel">
      <SectionHead kicker={activePoolRow?.name || "Pool"} title={(activePoolRow?.name || "游戏") + "管理"} note={"当前为" + (activePoolRow?.desc || "游戏池") + "，筛选后 " + mobileGames.length + " / 全部 " + totalMobileGames + " 条"} />
      {isMobilePool ? <PoolButtonTabs value={mobilePoolSource} onChange={onMobilePoolSourceChange} items={[
        { key: T.all, label: "全部", count: mobilePoolCounts[T.all] },
        { key: "TapTap", label: "TapTap", count: mobilePoolCounts.TapTap },
        { key: "好游快爆", label: "好游快爆", count: mobilePoolCounts.好游快爆 },
        { key: "九游", label: "九游", count: mobilePoolCounts.九游 },
      ]} /> : null}
      {isWelfarePool ? <PoolButtonTabs value={welfarePoolType} onChange={onWelfarePoolTypeChange} items={[
        { key: T.all, label: "全部", count: welfarePoolCounts[T.all] },
        { key: "discount", label: "福利折扣", count: welfarePoolCounts.discount },
        { key: "regular", label: "常规收录", count: welfarePoolCounts.regular },
      ]} /> : null}
      {isSteamPool ? <PoolButtonTabs value={pcPoolType} onChange={onPcPoolTypeChange} items={[
        { key: "steam", label: "Steam 游戏", count: pcPoolCounts.steam },
        { key: "steamNew", label: "Steam 新游", count: pcPoolCounts.steamNew },
      ]} /> : null}
      {isNewsPool ? <PoolButtonTabs value={newsSource} onChange={onNewsSourceChange} items={[
        { key: T.all, label: "全部", count: newsPoolCounts[T.all] },
        { key: "机核", label: "机核", count: newsPoolCounts.机核 },
        { key: "游民星空", label: "游民星空", count: newsPoolCounts.游民星空 },
        { key: "游侠网", label: "游侠网", count: newsPoolCounts.游侠网 },
      ]} /> : null}
      <div className="pool-quick-filters">
        <label><span>搜索</span><input type="text" value={keyword} placeholder={isPcPool ? "资讯标题、游戏名、标签" : "游戏名、标签、内容"} onChange={(event) => onKeywordChange(event.target.value)} /></label>
        <label><span>状态</span><select value={status} onChange={(event) => onStatusChange(event.target.value)}>{statuses.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label><span>开始时间</span><input type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} /></label>
        <label><span>结束时间</span><input type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} /></label>
        {showPastFuture ? <label><span>时间方向</span><select value={timeSide} onChange={(event) => onTimeSideChange(event.target.value)}><option value={T.all}>全部</option><option value="future">未来（含今日）</option><option value="past">过去</option></select></label> : null}
      </div>
      <div className={"mobile-pool-layout " + (isPcPool ? "pc-pool-layout" : "")}>
        <div className="pool-list">
          {mobileGames.map((item) => <button className={"pool-list-row " + (isPcPool ? "pc-pool-list-row " : "") + (selectedGame?.id === item.id ? "active" : "")} type="button" onClick={() => onSelectGame(item.id)} key={item.id}>
            <div className={isPcPool ? "pool-list-cover" : "pool-list-icon"}>{item.iconUrl ? <img src={proxiedAdminImage(item.iconUrl)} alt="" /> : item.icon}</div>
            <div className="pool-list-main"><div className="pool-list-title-row"><strong>{item.newsTitle || item.gameName}</strong><ImportancePill item={item} compact /></div>{isPcPool ? <span>{pcPoolListSubline(item)}</span> : null}</div>
            <div className="pool-list-side">{isSteamGameItem(item) && !isSteamNewGameItem(item) ? <em>{formatPlayerCount(item.lastKnownPlayers ?? item.currentPlayers)}</em> : isWelfareGameItem(item) && (item.popularityText || formatWelfarePopularityForAdmin(item)) ? <><em>{item.popularityText || formatWelfarePopularityForAdmin(item)}</em><time>{formatPoolDate(item)}</time></> : <time>{formatPoolDate(item)}</time>}</div>
          </button>)}
        </div>
        <div className="pool-detail">{selectedGame ? <GamePoolDetail item={selectedGame} onEditGame={() => onEditGame(selectedGame)} /> : <div className="empty-search inline">{"暂无" + (activePoolRow?.name || "游戏") + "池数据。"}</div>}</div>
      </div>
    </section>
    <PoolGovernance selectedGame={selectedGame} mobileGames={mobileGames} onSelectGame={onSelectGame} onEditGame={onEditGame} cleanupIssues={cleanupIssues} rawCount={rawCount} poolCount={poolCount} excelInfo={excelInfo} running={running} recrawlingIssueId={recrawlingIssueId} exportExcel={exportExcel} applyExcel={applyExcel} showToast={showToast} onRecrawlIssue={onRecrawlIssue} onUpdateIssueStatus={onUpdateIssueStatus} />
  </div>;
}
function PoolButtonTabs({ value, onChange, items }) {
  return <div className="pool-button-tabs">{items.map((item) => <button className={value === item.key ? "active" : ""} type="button" onClick={() => onChange(item.key)} key={item.key}><span>{item.label}</span><b>{item.count || 0}</b></button>)}</div>;
}
function GamePoolDetail({ item, onEditGame }) {
  if (isSteamGameItem(item)) return <SteamPoolDetail item={item} onEditGame={onEditGame} />;
  if (isPcNewsItem(item)) return <PcNewsPoolDetail item={item} onEditGame={onEditGame} />;
  const gameTags = (item.gameplayTags?.length ? item.gameplayTags : item.tags || []).filter((tag) => ![item.status, item.eventType, item.rawStatus, item.rawEventType, ...(item.sources || [])].includes(tag)).slice(0, 6);
  const sourceRecords = item.sourceRecords || [];
  const sourceGroups = groupLatestSourceRecords(sourceRecords);
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySource, setHistorySource] = useState(null);
  const activeGroup = sourceGroups[Math.min(activeSourceIndex, Math.max(sourceGroups.length - 1, 0))];
  const activeSource = activeGroup?.latest;
  const contentParts = [item.summary, item.updateContent].map((value) => String(value || "").trim()).filter(Boolean);
  const preferredSource = pickPreferredSourceContent(sourceGroups);
  const mergedContent = preferredSource?.summary || [...new Set(contentParts)].join("\n");
  const vendorText = item.vendor || item.publisher || item.developer || "\u6682\u65e0\u5382\u5546\u4fe1\u606f";
  const activeSourceTags = activeSource ? (activeSource.gameplayTags?.length ? activeSource.gameplayTags : activeSource.tags || [])
    .filter((tag) => tag && ![activeSource.status, activeSource.eventType, item.status, item.eventType].includes(tag))
    .slice(0, 6) : [];
  const welfareParts = welfarePopularityParts(item);
  return <article className="pool-detail-card">
    <div className="pool-detail-head">
      {onEditGame ? <button className="inline-edit-button detail-main-edit" type="button" onClick={onEditGame}>编辑</button> : null}
      <div className="pool-detail-icon">{item.iconUrl ? <img src={proxiedAdminImage(item.iconUrl)} alt="" /> : item.icon}</div>
      <div className="pool-detail-main">
        <div className="pool-detail-title-row">
          <h3>{item.gameName}</h3>
          <div className="pool-detail-title-actions">
            {item.subtitle ? <span className="pool-subtitle-pill">{item.subtitle}</span> : null}
            <time>{new Date(item.eventAt).toLocaleDateString("zh-CN")}</time>
          </div>
        </div>
        <div className="pool-detail-head-tags"><div className="pool-detail-chip-row"><ImportancePill item={item} /><span className="pool-detail-chip">{item.status || "\u72b6\u6001\u672a\u77e5"}</span><span className="pool-detail-chip subtle">{(item.sources || []).join("、") || "\u6765\u6e90\u672a\u77e5"}</span>{welfareParts.map((part) => <span className="pool-detail-chip welfare-popularity-chip" key={part.label}>{part.value}</span>)}</div></div>
      </div>
    </div>
    <div className="pool-detail-copy pool-detail-content"><div className="editable-label"><strong>{"\u7b80\u4ecb"}</strong></div><p>{mergedContent || "\u6682\u65e0\u7b80\u4ecb"}</p></div>
    <div className="pool-detail-copy pool-detail-tags-box"><div className="editable-label"><b>{"\u73a9\u6cd5\u6807\u7b7e"}</b></div><div className="pool-inline-tags"><TagList tags={gameTags} tone="game" /></div></div>
    <div className="pool-detail-grid info-row">
      <div><strong>{"\u72b6\u6001\u5206\u7c7b"}</strong><span>{item.status}</span></div>
      <div><strong>{"\u65e5\u671f"}</strong><span>{new Date(item.eventAt).toLocaleDateString("zh-CN")}</span></div>
      <div><VendorLines vendor={vendorText} operator={item.operator} /></div>
    </div>
    {welfareParts.length ? <div className="pool-detail-grid welfare-popularity-grid">{welfareParts.map((part) => <div key={part.label}><strong>{part.label}</strong><span>{part.value}</span></div>)}<div><strong>福利类型</strong><span>{item.welfareKind || item.eventType || welfareKindForAdmin(item)}</span></div></div> : null}
    <div className="pool-detail-sources">
      <div className="pool-source-section-head">
        <strong>{"\u6765\u6e90\u8bb0\u5f55"}</strong>
        {sourceGroups.length > 1 ? <div className="source-switcher">{sourceGroups.map((group, index) => <button className={index === activeSourceIndex ? "active" : ""} type="button" onClick={() => setActiveSourceIndex(index)} key={group.sourceKey || group.source}>{group.source}</button>)}</div> : null}
      </div>
      {activeSource ? <div className="pool-source-record-card selected">
        <div className="pool-source-record-head">
          <div>
            <b>{activeSource.source}</b>
            <span>{activeSource.status || item.status || "待整理"}</span>
          </div>
          <time>{new Date(activeSource.effectiveEventAt || activeSource.eventAt).toLocaleDateString("zh-CN")}</time>
        </div>
        <div className="pool-source-record-body">
          <div className="pool-source-record-meta">
            <VendorLines vendor={activeSource.vendor || "待补充"} operator={activeSource.operator} compact />
          </div>
          <div className="pool-source-record-tags">
            <label>玩法标签</label>
            <TagList tags={activeSourceTags} tone="game" />
          </div>
        </div>
        <div className="pool-source-record-note"><label>补充内容</label><p>{activeSource.summary || activeSource.updateContent || "\u6682\u65e0\u8865\u5145\u5185\u5bb9"}</p></div>
        <div className="pool-source-record-actions">
          {activeSource.detailUrl || activeSource.originalUrl ? <a className="source-link" href={activeSource.detailUrl || activeSource.originalUrl} target="_blank" rel="noreferrer">{"\u539f\u6587"}</a> : null}
          <button className="source-history-button" type="button" onClick={() => { setHistorySource(activeGroup); setHistoryOpen(true); }}>查看历史{activeGroup.history.length > 1 ? `（${activeGroup.history.length}）` : ""}</button>
        </div>
      </div> : <div className="empty-search inline">暂无来源记录。</div>}
    </div>
    {historyOpen && historySource ? <SourceHistoryModal group={historySource} onClose={() => { setHistoryOpen(false); setHistorySource(null); }} /> : null}
  </article>;
}

function groupLatestSourceRecords(records = []) {
  const groups = new Map();
  for (const record of records) {
    const normalizedRecord = normalizeSourceHistoryRecord(record);
    const rawSource = String(normalizedRecord.sourceKey || normalizedRecord.source || "来源未知").trim();
    const sourceKey = normalizeAdminSourceKey(rawSource);
    const source = adminSourceLabel(sourceKey, normalizedRecord.source || rawSource);
    const key = sourceKey || source;
    const group = groups.get(key) || { source, sourceKey, history: [] };
    group.history.push(normalizedRecord);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, history: dedupeSourceHistory(group.history) }))
    .map((group) => ({ ...group, latest: pickCurrentSourceRecord(group.history) }))
    .filter((group) => group.latest)
    .sort((left, right) => sourceDisplayRank(left.sourceKey || left.source) - sourceDisplayRank(right.sourceKey || right.source));
}

function sourceDisplayRank(source = "") {
  const key = normalizeAdminSourceKey(source);
  return { hykb: 0, taptap: 1, ninegame: 2, xiaoqi: 3 }[key] ?? 99;
}

function pickCurrentSourceRecord(records = []) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const currentRecords = records.filter((record) => new Date(record.effectiveEventAt || record.eventAt || 0) <= today.getTime());
  return currentRecords[0] || [...records].sort((left, right) => new Date(left.effectiveEventAt || left.eventAt || 0) - new Date(right.effectiveEventAt || right.eventAt || 0))[0] || null;
}

function normalizeAdminSourceKey(value = "") {
  const source = String(value || "").trim().toLowerCase();
  const aliases = {
    hykb: "hykb",
    "好游快爆": "hykb",
    ninegame: "ninegame",
    "九游": "ninegame",
    taptap: "taptap",
    xiaoqi: "xiaoqi",
    "小七手游": "xiaoqi",
    steam: "steam",
    "steam游戏": "steam",
    "steam新游": "steamNew",
  };
  return aliases[source] || source || "unknown";
}

function adminSourceLabel(sourceKey = "", fallback = "") {
  const labels = { hykb: "好游快爆", ninegame: "九游", taptap: "TapTap", xiaoqi: "小七手游", steam: "Steam", steamNew: "Steam新游" };
  return labels[sourceKey] || fallback || "来源未知";
}

function normalizeSourceHistoryRecord(record = {}) {
  const rawContent = String(record.summary || record.updateContent || "").replace(/\s+/g, " ").trim();
  const originalDate = new Date(record.eventAt || "");
  const targetMonth = Number.isNaN(originalDate.getTime()) ? 0 : originalDate.getMonth() + 1;
  const targetDay = Number.isNaN(originalDate.getTime()) ? 0 : originalDate.getDate();
  const matches = [...rawContent.matchAll(/(\d{1,2})月(\d{1,2})日/g)];
  const targetMatch = matches.find((match) => Number(match[1]) === targetMonth && Number(match[2]) === targetDay);
  const match = targetMatch || matches[0];
  let content = rawContent;
  let effectiveEventAt = record.eventAt || "";
  if (match) {
    content = rawContent.slice(match.index).trim();
    const year = Number.isNaN(originalDate.getTime()) ? new Date().getFullYear() : originalDate.getFullYear();
    const effectiveDate = new Date(year, Number(match[1]) - 1, Number(match[2]), Number.isNaN(originalDate.getTime()) ? 10 : originalDate.getHours(), Number.isNaN(originalDate.getTime()) ? 0 : originalDate.getMinutes());
    effectiveEventAt = effectiveDate.toISOString();
  }
  return { ...record, summary: content, updateContent: content, effectiveEventAt };
}

function dedupeSourceHistory(records = []) {
  const byDate = new Map();
  for (const record of records) {
    const date = String(record.effectiveEventAt || record.eventAt || "").slice(0, 10) || "unknown";
    const previous = byDate.get(date);
    if (!previous || sourceHistoryScore(record) > sourceHistoryScore(previous)) byDate.set(date, record);
  }
  return [...byDate.values()].sort((left, right) => new Date(right.effectiveEventAt || right.eventAt || 0) - new Date(left.effectiveEventAt || left.eventAt || 0));
}

function sourceHistoryScore(record = {}) {
  const text = String(record.summary || record.updateContent || "");
  const source = String(record.sourceKey || record.source || "");
  const sourceWeight = source === "hykb" || source === "好游快爆" ? 30 : source === "taptap" || source === "TapTap" ? 20 : 0;
  return Math.min(text.length, 260) + sourceWeight + (/更新|活动|联动|赛季|上线/.test(text) ? 35 : 0);
}

function pickPreferredSourceContent(groups = []) {
  return groups
    .map((group) => group.latest)
    .filter((record) => record?.summary || record?.updateContent)
    .sort((left, right) => new Date(right.effectiveEventAt || right.eventAt || 0) - new Date(left.effectiveEventAt || left.eventAt || 0) || sourceHistoryScore(right) - sourceHistoryScore(left))[0] || null;
}

function SourceHistoryModal({ group, onClose }) {
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(group.history.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = group.history.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [group.sourceKey]);
  return <div className="modal-backdrop source-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="source-history-modal" role="dialog" aria-modal="true" aria-label={`${group.source}历史记录`}>
      <div className="source-history-head">
        <div><p className="kicker">History</p><h3>{group.source}历史记录</h3><span>按时间倒序展示，共 {group.history.length} 条</span></div>
        <button className="edit-modal-close" type="button" onClick={onClose}>关闭</button>
      </div>
      <div className="source-history-list">
        {pageRows.map((record, index) => <article className="source-history-row" key={`${record.detailUrl || record.originalUrl || record.source}-${record.eventAt}-${index}`}>
          <div className="source-history-row-head"><strong>{record.status || record.eventType || "记录"}</strong><time>{formatDateTime(record.effectiveEventAt || record.eventAt)}</time></div>
          <p>{record.summary || record.updateContent || "暂无补充内容"}</p>
          {record.detailUrl || record.originalUrl ? <a className="source-link" href={record.detailUrl || record.originalUrl} target="_blank" rel="noreferrer">查看原文</a> : null}
        </article>)}
      </div>
      <div className="source-modal-pagination"><span>第 {safePage} / {totalPages} 页</span><div><button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button><button type="button" disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</button></div></div>
    </section>
  </div>;
}

function SteamPoolDetail({ item, onEditGame }) {
  const sourceRecords = item.sourceRecords || [];
  const statusLabels = mergeSteamStatusLabels(item);
  const tags = mergeSteamGameplayTags(item);
  const screenshots = (item.screenshotUrls || []).filter(Boolean).slice(0, 8);
  const recentPlayersValue = Number.isFinite(Number(item.lastKnownPlayers)) ? item.lastKnownPlayers : item.currentPlayers;
  const recentPlayers = Number.isFinite(Number(recentPlayersValue)) ? Number(recentPlayersValue).toLocaleString("zh-CN") : "待获取";
  const previousPlayers = Number.isFinite(item.previousPlayers) ? item.previousPlayers.toLocaleString("zh-CN") : "待获取";
  const growth = Number.isFinite(item.playerGrowth) ? `${item.playerGrowth > 0 ? "+" : ""}${item.playerGrowth.toLocaleString("zh-CN")}` : "待获取";
  const growthTone = Number.isFinite(item.playerGrowth) ? (item.playerGrowth > 0 ? "positive" : item.playerGrowth < 0 ? "negative" : "neutral") : "neutral";
  const developers = uniqueText(item.developers || []);
  const publishers = uniqueText(item.publishers || []);
  const sameVendor = developers.length && publishers.length && developers.join("、") === publishers.join("、");
  const isSteamNew = isSteamNewGameItem(item);
  return <article className="pool-detail-card pc-pool-detail-card steam-pool-detail-card">
    <div className="pc-detail-hero">
      {onEditGame ? <button className="inline-edit-button detail-main-edit" type="button" onClick={onEditGame}>编辑</button> : null}
      <div className="pc-detail-cover">{item.iconUrl ? <img src={proxiedAdminImage(item.iconUrl)} alt="" /> : <span>{String(item.gameName || "S").slice(0, 1)}</span>}</div>
      <div className="pc-detail-main">
        <div className="pool-detail-chip-row">
          <ImportancePill item={item} />
          <span className="pool-detail-chip">Steam 游戏</span>
          {statusLabels.length ? statusLabels.map((label) => <span className="pool-detail-chip subtle" key={label}>{label}</span>) : <span className="pool-detail-chip subtle">状态未知</span>}
        </div>
        <h3>{item.gameName}</h3>
        <div className="steam-hero-tags"><TagList tags={tags} tone="game" /></div>
        <div className="steam-vendor-lines">
          <span>开发商：{developers.join("、") || item.vendor || "待补充"}</span>
          {!sameVendor ? <span>发行商：{publishers.join("、") || item.vendor || "待补充"}</span> : null}
        </div>
      </div>
    </div>
    <div className="pool-detail-copy pool-detail-content steam-summary-card"><div className="editable-label"><strong>游戏简介</strong></div><p>{item.summary || "暂无简介"}</p></div>
    <div className="pc-field-board steam-field-board steam-meta-board">
      <div className="pc-field-card"><strong>Steam AppID</strong><span>{item.appid || "待获取"}</span></div>
      <div className="pc-field-card"><strong>发售日期</strong><span>{item.releaseText || new Date(item.eventAt).toLocaleDateString("zh-CN")}</span></div>
      <div className="pc-field-card"><strong>价格</strong><span>{item.price || "待获取"}</span></div>
    </div>
    {!isSteamNew ? <div className="pc-field-board steam-field-board steam-player-board">
      <div className="pc-field-card"><strong>最近在线</strong><span>{recentPlayers}</span></div>
      <div className="pc-field-card"><strong>上次在线</strong><span>{previousPlayers}</span></div>
      <div className={"pc-field-card growth-" + growthTone}><strong>人数增长</strong><span>{growth}</span></div>
    </div> : null}
    {screenshots.length ? <div className="steam-screenshot-panel"><div className="pool-source-section-head"><strong>游戏截图</strong><span>{screenshots.length} 张</span></div><div className="steam-screenshot-strip">{screenshots.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}><img src={proxiedAdminImage(url)} alt={item.gameName + "截图" + (index + 1)} /></a>)}</div></div> : null}
    <div className="pool-detail-sources">
      <div className="pool-source-section-head"><strong>Steam 来源</strong>{item.detailUrl ? <a className="source-link" href={item.detailUrl} target="_blank" rel="noreferrer">打开商店</a> : null}</div>
      {sourceRecords.length ? <div className="pc-source-record-list">{sourceRecords.map((record, index) => <a className="pc-source-record steam-source-record" href={record.detailUrl || item.detailUrl} target="_blank" rel="noreferrer" key={(record.source || "steam") + index}><b>{record.source || "Steam"}</b><span>{record.status || item.status || "Steam"}</span><p>{record.summary || record.updateContent || item.gameName}</p></a>)}</div> : <div className="empty-search inline">暂无来源记录。</div>}
    </div>
  </article>;
}
function mergeSteamGameplayTags(item) {
  const statusWords = new Set(uniqueText([item.status, item.eventType, ...(item.steamLabels || []), ...(item.sources || [])]).map(normalizeSteamStatusLabel));
  const blocked = new Set(["Steam", "新游", "热门", "爆火", "已发售", "常规观察", "热门候选", "增长候选", "新游候选", "可以仅用鼠标", "随时保存", "已启用 Valve 反作弊保护"]);
  return uniqueText([...(item.gameplayTags || []), ...(item.tags || [])])
    .map(cleanSteamGameplayTag)
    .filter((tag) => tag && !blocked.has(tag) && !statusWords.has(tag))
    .slice(0, 8);
}
function mergeSteamStatusLabels(item) {
  return uniqueText([item.status, item.eventType, ...(item.steamLabels || [])])
    .map(normalizeSteamStatusLabel)
    .filter((label) => label && label !== "常规观察")
    .filter((label, index, list) => list.indexOf(label) === index);
}
function normalizeSteamStatusLabel(value) {
  const label = String(value || "").trim();
  if (/增长候选|增长|爆火/.test(label)) return "爆火";
  if (/新游候选|新品候选|新游/.test(label)) return "新游";
  if (/热门候选|热门|热游/.test(label)) return "热门";
  return label;
}
function cleanSteamGameplayTag(value) {
  const label = String(value || "").replace(/\s+/g, " ").trim();
  const map = {
    免费开玩: "免费",
    线上玩家对战: "在线对战",
    玩家对战: "PVP",
    大型多人在线: "MMO",
    角色扮演: "RPG",
    动画制作和建模: "动画建模",
    设计和插画: "设计插画",
  };
  return map[label] || label;
}
function uniqueText(values) {
  const list = Array.isArray(values) ? values : String(values || "").split(/[|/、,，\s]+/);
  return [...new Set(list.map((value) => String(value || "").trim()).filter(Boolean))];
}
function PcNewsPoolDetail({ item, onEditGame }) {
  const sourceRecords = item.sourceRecords || [];
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const activeSource = sourceRecords[Math.min(activeSourceIndex, Math.max(sourceRecords.length - 1, 0))];
  const title = item.newsTitle || item.gameName || "未命名资讯";
  const relatedGame = item.relatedGame || (item.newsTitle ? item.gameName : "");
  const sources = item.sources?.length ? item.sources : [item.platform || "来源未知"];
  const summary = item.summary || item.updateContent || "暂无摘要";
  const activeTags = activeSource?.tags?.length ? activeSource.tags : item.tags || [];
  const activeSummary = activeSource?.summary || activeSource?.updateContent || summary;
  const activeDate = activeSource?.eventAt || item.eventAt;
  return <article className="pool-detail-card pc-pool-detail-card pc-news-detail-card">
    <div className="pc-detail-hero">
      {onEditGame ? <button className="inline-edit-button detail-main-edit" type="button" onClick={onEditGame}>编辑</button> : null}
      <div className="pc-detail-cover">{item.iconUrl ? <img src={proxiedAdminImage(item.iconUrl)} alt="" /> : <span>{title.slice(0, 1)}</span>}</div>
      <div className="pc-detail-main">
        <div className="pool-detail-chip-row">
          <ImportancePill item={item} />
          <span className="pool-detail-chip">{item.status || "资讯"}</span>
          {sources.map((source) => <span className="pool-detail-chip subtle" key={source}>{source}</span>)}
        </div>
        <h3>{title}</h3>
      </div>
    </div>
    <div className="pc-field-board news-field-board">
      <div className="pc-field-card strong"><strong>资讯类型</strong><span>{item.status || item.eventType || "资讯"}</span></div>
      <div className="pc-field-card"><strong>发布时间</strong><span>{new Date(activeDate).toLocaleString("zh-CN", { hour12: false })}</span></div>
      <div className="pc-field-card"><strong>来源平台</strong><span>{sources.join("、")}</span></div>
      <div className="pc-field-card"><strong>关联游戏</strong><span>{relatedGame || "未提取"}</span></div>
      <div className="pc-field-card"><strong>热度</strong><span>{item.heat ?? "待统计"}</span></div>
    </div>
    <div className="pool-detail-copy pool-detail-content"><div className="editable-label"><strong>资讯摘要</strong></div><p>{summary}</p></div>
    <div className="pool-detail-sources">
      <div className="pool-source-section-head">
        <strong>来源记录</strong>
        {sourceRecords.length > 1 ? <div className="source-switcher">{sourceRecords.map((record, index) => <button className={index === activeSourceIndex ? "active" : ""} type="button" onClick={() => setActiveSourceIndex(index)} key={(record.source || "source") + "-" + index}>{record.source || "来源"}</button>)}</div> : null}
      </div>
      {activeSource ? <a className="pc-source-record selected news-source-record" href={activeSource.detailUrl || item.detailUrl} target="_blank" rel="noreferrer">
        <div className="pool-source-record-head">
          <div><b>{activeSource.source || sources[0] || "来源"}</b><span>{activeSource.status || item.status || "资讯"}</span></div>
          <time>{new Date(activeDate).toLocaleString("zh-CN", { hour12: false })}</time>
        </div>
        <div className="pool-source-record-body">
          <div className="pool-source-record-meta news-source-author">
            <label>作者</label>
            <p>{activeSource.author || item.author || item.vendor || "作者待补充"}</p>
          </div>
          <div className="pool-source-record-tags">
            <label>资讯标签</label>
            <TagList tags={activeTags} tone="game" />
          </div>
        </div>
        <div className="pool-source-record-note"><label>摘要</label><p>{activeSummary || "暂无摘要"}</p></div>
        <span className="source-link">打开原文</span>
      </a> : <div className="empty-search inline">暂无来源记录。</div>}
    </div>
  </article>;
}
function pcPoolListSubline(item) {
  if (isSteamGameItem(item)) {
    return "Steam";
  }
  return item.relatedGame || item.platform || item.sources?.[0] || "端游资讯";
}
function sortSteamByPlayers(left, right) {
  return (Number(right.lastKnownPlayers ?? right.currentPlayers) || 0) - (Number(left.lastKnownPlayers ?? left.currentPlayers) || 0);
}
function sortSteamByRelease(left, right) {
  return new Date(left.eventAt || 0).getTime() - new Date(right.eventAt || 0).getTime();
}
function sortByAdminPoolTime(left, right) {
  return sortByTodayFuturePast(left, right);
}
function sortPcNewsByDate(left, right) {
  const leftDate = newsDayTime(left);
  const rightDate = newsDayTime(right);
  if (leftDate !== rightDate) return rightDate - leftDate;
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
function recordTimeValue(item) {
  const value = item?.eventAt || item?.publishedAt || item?.releaseDate || item?.sampledAt || item?.updatedAt || 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
function recordDayValue(item) {
  const time = recordTimeValue(item);
  if (!time) return 0;
  return startOfLocalDay(new Date(time)).getTime();
}
function parseFilterDay(value = "", endOfDay = false) {
  if (!value) return 0;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 0;
  return endOfDay ? startOfLocalDay(date).getTime() + 86400000 - 1 : startOfLocalDay(date).getTime();
}
function matchesDateRange(item, from = "", to = "") {
  const day = recordDayValue(item);
  if (!day) return true;
  const start = parseFilterDay(from);
  const end = parseFilterDay(to, true);
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}
function matchesTimeSide(item, side = "全部") {
  if (side === "全部") return true;
  const day = recordDayValue(item);
  if (!day) return true;
  const today = startOfLocalDay(new Date()).getTime();
  if (side === "future") return day >= today;
  if (side === "past") return day < today;
  return true;
}
function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function crawlStatusLabel(status = "") {
  if (status === "success") return "完成";
  if (status === "failed") return "失败";
  if (status === "stopped") return "已停止";
  if (status === "running") return "运行中";
  return "等待";
}
function crawlStatsMessage(stats = null) {
  if (!stats) return "完成，暂无统计";
  const discovered = Number(stats.discovered) || 0;
  const fetched = Number(stats.fetched) || 0;
  const current = Number(stats.current) || 0;
  const added = Number(stats.added) || 0;
  const issues = Number(stats.cleanupIssues) || 0;
  const failed = Number(stats.failed) || 0;
  const completeness = stats.completeness !== null && stats.completeness !== undefined ? `，完整度 ${stats.completeness}%` : "";
  return `完成：发现 ${discovered || fetched}，已抓 ${fetched}，入库 ${current}，新增 ${added}，失败 ${failed}，问题 ${issues}${completeness}`;
}
function crawlStrategyLabel(value = "") {
  const map = {
    "static-json": "静态优先",
    "static-json-partial": "静态部分",
    "rendered-fallback": "浏览器兜底",
    "static+rendered-fallback": "静态+兜底",
    static: "静态页面",
    html: "网页解析",
    "html+detail": "列表+详情",
    "official-api+store-html": "官方接口",
    failed: "失败",
  };
  return map[value] || value || "默认";
}
function formatPlayerCount(value) {
  if (!Number.isFinite(Number(value))) return "待获取";
  return Number(value).toLocaleString("zh-CN");
}
function formatPoolDate(item) {
  if (!item?.eventAt) return item?.releaseText || "待定";
  const date = new Date(item.eventAt);
  if (Number.isNaN(date.getTime())) return item.releaseText || "待定";
  const diff = startOfLocalDay(date).getTime() - startOfLocalDay(new Date()).getTime();
  if (diff > 30 * 86400000) return "未来";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
function isPcNewsItem(item) {
  const sources = item?.sources || [];
  return Boolean(item?.newsTitle || sources.some((source) => ["机核", "游民星空", "游侠网"].includes(source)));
}
function isSteamGameItem(item) {
  return Boolean(item?.appid || item?.sources?.includes("Steam"));
}
function isSteamListedGameItem(item) {
  return isSteamGameItem(item) && Number(item.lastKnownPlayers ?? item.currentPlayers) >= 1000;
}
function isSteamNewGameItem(item) {
  if (!isSteamGameItem(item)) return false;
  if (isSteamListedGameItem(item)) return false;
  const isNewTagged = [item.status, item.eventType, ...(item.steamLabels || [])].some((value) => /新游|预约|即将推出/.test(String(value || ""))) || item.comingSoon;
  const online = Number(item.lastKnownPlayers ?? item.currentPlayers);
  return isNewTagged && (!Number.isFinite(online) || online < 1000);
}
function VendorLines({ vendor = "", operator = "", compact = false }) {
  const parsed = parseVendorInfo(vendor, operator);
  return <div className={compact ? "vendor-lines compact" : "vendor-lines"}>
    <strong>{compact ? "厂商信息" : "厂商信息"}</strong>
    <span>{parsed.vendor || "暂无厂商信息"}</span>
    {parsed.operator ? <><strong>运营单位</strong><span>{parsed.operator}</span></> : null}
  </div>;
}
function parseVendorInfo(vendor = "", operator = "") {
  const raw = String(vendor || "").trim();
  const explicitOperator = String(operator || "").trim();
  const marker = "运营单位：";
  if (raw.includes(marker)) {
    const [vendorPart, operatorPart] = raw.split(marker);
    return {
      vendor: vendorPart.replace(/\s*\/\s*$/, "").trim(),
      operator: explicitOperator || operatorPart.trim(),
    };
  }
  return { vendor: raw, operator: explicitOperator };
}
function StatusCard({ title, value, desc }) { return <article className="status-card"><strong>{title}</strong><b>{value}</b><p>{desc}</p></article>; }


