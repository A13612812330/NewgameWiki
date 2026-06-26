import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Database, Play, RefreshCcw, ShieldAlert, SlidersHorizontal, Trash2 } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { MetricCard, PageTitle, SectionHead, TagList } from "./shared.jsx";

const T = { overview: "总览", sources: "来源管理", logs: "更新日志", pools: "游戏管理", all: "全部" };
const FIELD_LABELS = { gameName: "游戏名称", gameplayTags: "玩法标签", vendor: "游戏厂商", summary: "整理内容" };
const panels = [T.overview, T.sources, T.logs, T.pools];

export default function AdminPage() {
  const data = useGameData();
  const [activePanel, setActivePanel] = useState(T.overview);
  const [toast, setToast] = useState("");
  const [running, setRunning] = useState(false);
  const [selectedSources, setSelectedSources] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [poolKeyword, setPoolKeyword] = useState("");
  const [poolStatus, setPoolStatus] = useState(T.all);
  const [poolSource, setPoolSource] = useState(T.all);
  const [activePoolKind, setActivePoolKind] = useState("mobile");
  const [excelInfo, setExcelInfo] = useState(null);

  useEffect(() => {
    if (data.sourceGroups.length && !selectedSources.length) setSelectedSources(data.sourceGroups.filter((item) => ["taptap", "ninegame", "hykb"].includes(item.key)).map((item) => item.key));
  }, [data.sourceGroups, selectedSources.length]);

  const poolRows = useMemo(() => [
    { key: "mobile", name: "手游", count: data.mobileGames.length, desc: "公共手游池", tags: ["TapTap", "好游快爆", "九游"] },
    { key: "welfare", name: "福利", count: data.welfareGames.length, desc: "福利新游池", tags: ["小七手游", "只要新游", "排除新服"] },
    { key: "pc", name: "端游", count: data.pcGames.length, desc: "PC / Steam 池", tags: ["端游", "PC", "Steam"] },
  ], [data.mobileGames.length, data.pcGames.length, data.welfareGames.length]);

  const activePoolGames = useMemo(() => {
    if (activePoolKind === "welfare") return data.welfareGames;
    if (activePoolKind === "pc") return data.pcGames;
    return data.mobileGames;
  }, [activePoolKind, data.mobileGames, data.pcGames, data.welfareGames]);
  const activePoolRow = useMemo(() => poolRows.find((row) => row.key === activePoolKind) || poolRows[0], [activePoolKind, poolRows]);
  const mobileStatuses = useMemo(() => [T.all, ...new Set(activePoolGames.map((item) => item.status).filter(Boolean))], [activePoolGames]);
  const mobileSources = useMemo(() => [T.all, ...new Set(activePoolGames.flatMap((item) => item.sources || []).filter(Boolean))], [activePoolGames]);
  const filteredMobileGames = useMemo(() => activePoolGames.filter((item) => {
    const keyword = poolKeyword.trim().toLowerCase();
    const haystack = [item.gameName, item.summary, item.updateContent, item.rawStatus, item.rawEventType, ...(item.gameplayTags || []), ...(item.tags || []), ...(item.sources || [])].join(" ").toLowerCase();
    if (keyword && !haystack.includes(keyword)) return false;
    if (poolStatus !== T.all && item.status !== poolStatus) return false;
    if (poolSource !== T.all && !(item.sources || []).includes(poolSource)) return false;
    return true;
  }), [activePoolGames, poolKeyword, poolSource, poolStatus]);
  const selectedGame = useMemo(() => filteredMobileGames.find((item) => item.id === selectedGameId) || filteredMobileGames[0] || null, [filteredMobileGames, selectedGameId]);

  useEffect(() => {
    if (!filteredMobileGames.length) { setSelectedGameId(""); return; }
    if (!filteredMobileGames.some((item) => item.id === selectedGameId)) setSelectedGameId(filteredMobileGames[0].id);
  }, [filteredMobileGames, selectedGameId]);

  const showToast = (message) => { setToast(message); window.setTimeout(() => setToast(""), 3600); };
  const toggleSource = (key) => setSelectedSources((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const runCrawl = async () => {
    setRunning(true);
    try {
      const sources = selectedSources.filter((item) => ["taptap", "ninegame", "hykb", "mobile"].includes(item));
      const response = await fetch("/api/crawl/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status));
      await data.reload();
      showToast("今日抓取完成：手游 " + payload.data.mobileGames.length + " 条，问题 " + payload.data.cleanupIssues.length + " 条。");
    } catch (error) { showToast("抓取失败：" + (error?.message || error)); }
    finally { setRunning(false); }
  };
  const clearData = async () => { setRunning(true); try { const response = await fetch("/api/data/clear", { method: "POST" }); const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status)); await data.reload(); showToast("已清空当前数据。"); } catch (error) { showToast("清空失败：" + (error?.message || error)); } finally { setRunning(false); } };
  const exportExcel = async () => { setRunning(true); try { const response = await fetch("/api/cleanup/excel"); const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status)); setExcelInfo(payload); showToast("已生成 Excel 整理表。"); } catch (error) { showToast("生成 Excel 失败：" + (error?.message || error)); } finally { setRunning(false); } };
  const applyExcel = async () => { setRunning(true); try { const response = await fetch("/api/cleanup/excel/apply", { method: "POST" }); const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.message || ("HTTP " + response.status)); await data.reload(); showToast("已应用 Excel 整理内容。"); } catch (error) { showToast("应用 Excel 失败：" + (error?.message || error)); } finally { setRunning(false); } };
  const applyFieldChoice = async ({ field, value, source }) => {
    if (!selectedGame) return;
    const label = FIELD_LABELS[field] || field;
    const preview = Array.isArray(value) ? value.join(" / ") : String(value || "");
    const ok = window.confirm(`确认将「${selectedGame.gameName}」的「${label}」改为：\n${preview}\n\n确认后会同步到数据库和 Excel 整理表。`);
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
      if (payload.excel) setExcelInfo(payload.excel);
      await data.reload();
      showToast("已采用字段，并同步到数据库和 Excel。");
    } catch (error) {
      showToast("字段同步失败：" + (error?.message || error));
    } finally {
      setRunning(false);
    }
  };

  return <main className="page-grid admin-page"><PageTitle kicker="Admin" title="管理后台" desc="后台已接入真实今日抓取。" />{toast ? <div className="toast"><CheckCircle2 size={18} />{toast}</div> : null}<div className="admin-layout"><aside className="admin-menu">{panels.map((panel) => <div className="admin-menu-group" key={panel}><button className={activePanel === panel ? "active" : ""} type="button" onClick={() => setActivePanel(panel)}>{panel}</button>{panel === T.pools && activePanel === T.pools ? <div className="admin-submenu">{poolRows.map((row) => <button className={activePoolKind === row.key ? "active" : ""} type="button" onClick={() => { setActivePoolKind(row.key); setPoolKeyword(""); setPoolStatus(T.all); setPoolSource(T.all); setSelectedGameId(""); }} key={row.key}>{row.name}<span>{row.count}</span></button>)}</div> : null}</div>)}</aside><section className="admin-content">{activePanel === T.overview ? <Overview data={data} /> : null}{activePanel === T.sources ? <SourceManager sourceGroups={data.sourceGroups} games={[...data.mobileGames, ...data.welfareGames, ...data.pcGames]} selectedSources={selectedSources} toggleSource={toggleSource} showToast={showToast} running={running} runCrawl={runCrawl} clearData={clearData} /> : null}{activePanel === T.logs ? <UpdateLogs logs={data.updateLogs} schedulerJobs={data.schedulerJobs} generatedAt={data.generatedAt} reviewQueue={data.reviewQueue} showToast={showToast} /> : null}{activePanel === T.pools ? <PoolManager activePoolKind={activePoolKind} activePoolRow={activePoolRow} mobileGames={filteredMobileGames} totalMobileGames={activePoolGames.length} selectedGame={selectedGame} onSelectGame={setSelectedGameId} keyword={poolKeyword} onKeywordChange={setPoolKeyword} status={poolStatus} onStatusChange={setPoolStatus} source={poolSource} onSourceChange={setPoolSource} statuses={mobileStatuses} sources={mobileSources} cleanupIssues={data.cleanupIssues} rawCount={data.metrics.rawMobileRecords || 0} poolCount={data.metrics.mobilePool || 0} excelInfo={excelInfo} running={running} exportExcel={exportExcel} applyExcel={applyExcel} applyFieldChoice={applyFieldChoice} showToast={showToast} /> : null}</section></div></main>;
}

function Overview({ data }) { return <div className="admin-stack"><section className="metrics-grid"><MetricCard label="全站游戏" value={data.metrics.totalGames} detail="聚合后的游戏数" icon={<Database size={18} />} /><MetricCard label="手游公共池" value={data.metrics.mobilePool} detail={"原始记录 " + (data.metrics.rawMobileRecords || 0) + " 条"} icon={<SlidersHorizontal size={18} />} /><MetricCard label="福利新游池" value={data.metrics.welfarePool} detail="待接入" icon={<ShieldAlert size={18} />} /><MetricCard label="待处理" value={data.metrics.cleanupIssues} detail="清洗与审核问题" icon={<RefreshCcw size={18} />} /></section><section className="panel"><SectionHead kicker="Status" title="后台模块状态" /><div className="status-grid"><StatusCard title="今日数据" value={data.date || "待抓取"} desc={"生成时间：" + (data.generatedAt || "暂无")} /><StatusCard title="真实爬虫" value="已接入手游" desc="TapTap / 九游 / 好游快爆" /><StatusCard title="数据池" value={(data.metrics.rawMobileRecords || 0) + " -> " + (data.metrics.mobilePool || 0)} desc="原始记录 -> 聚合游戏池" /><StatusCard title="来源管理" value="已生效" desc="勾选来源会影响手动爬取" /></div></section></div>; }
function SourceManager({ sourceGroups, games, selectedSources, toggleSource, showToast, running, runCrawl, clearData }) { return <section className="panel"><SectionHead kicker="Sources" title="来源管理" note="表格集中管理来源，手动更新也在这里触发。" /><div className="action-row source-manager-actions"><button className="primary-button" type="button" disabled={running} onClick={runCrawl}><Play size={16} />{running ? "更新中..." : "手动更新"}</button><button type="button" disabled={running} onClick={clearData}><Trash2 size={16} />清空当前数据</button></div><div className="source-table-wrap"><table className="source-table"><thead><tr><th>启用</th><th>来源</th><th>图片样例</th><th>状态</th><th>数据量</th><th>最近运行</th><th>抓取范围</th><th>操作</th></tr></thead><tbody>{sourceGroups.map((group) => { const enabled = selectedSources.includes(group.key); const available = ["taptap", "ninegame", "hykb"].includes(group.key); const samples = sourceSamples(games, group.sources); return <tr className={enabled ? "source-enabled" : ""} key={group.key}><td><label className="table-switch"><input type="checkbox" checked={enabled} disabled={!available} onChange={() => toggleSource(group.key)} /><span /></label></td><td><div className="source-name-cell"><strong>{group.name}</strong><TagList tags={group.sources} tone="source" /></div></td><td><div className="source-images">{samples.length ? samples.map((item) => <img src={proxiedAdminImage(item.iconUrl)} alt="" title={item.gameName} key={item.id} />) : <span>待抓取</span>}</div></td><td><span className={"source-status " + statusTone(group.status)}>{group.status}</span></td><td><strong className="source-count">{group.count}</strong></td><td>{group.lastRun}</td><td>{available ? "手动爬取可选" : group.status}</td><td><button type="button" onClick={() => showToast(group.name + "：当前 " + group.count + " 条记录。")}>查看</button></td></tr>; })}</tbody></table></div></section>; }
function sourceSamples(games = [], sources = []) { return games.filter((item) => item.iconUrl && item.sources?.some((source) => sources.includes(source))).slice(0, 4); }
function proxiedAdminImage(url) { return url ? "/api/image?url=" + encodeURIComponent(url) : ""; }
function statusTone(status = "") { if (status.includes("已抓取")) return "ok"; if (status.includes("规划") || status.includes("待接入") || status.includes("只抓")) return "idle"; if (status.includes("需检查") || status.includes("失败")) return "warn"; return "normal"; }
function UpdateLogs({ logs, schedulerJobs, generatedAt, reviewQueue, showToast }) { return <div className="admin-stack"><section className="panel"><SectionHead kicker="Logs" title="更新日志" note={generatedAt ? "最近更新：" + formatDateTime(generatedAt) : "暂无更新"} /><div className="log-list">{logs?.length ? logs.map((log) => <article className="log-row" key={log.id}><span>{log.type}</span><div><strong>{log.title}</strong><p>{log.detail}</p></div><time>{formatDateTime(log.time)}</time></article>) : <div className="empty-search inline">暂无更新日志。</div>}</div></section><Scheduler schedulerJobs={schedulerJobs || []} showToast={showToast} embedded /><ReviewQueue reviewQueue={reviewQueue} showToast={showToast} embedded /></div>; }
function formatDateTime(value) { if (!value) return "暂无"; return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function Scheduler({ schedulerJobs, showToast, embedded = false }) { return <section className={"panel " + (embedded ? "embedded-panel" : "")}><SectionHead kicker="Scheduler" title="任务计划" note="定时任务已合并到更新日志，便于一起查看运行记录。" /><div className="table-wrap"><table><thead><tr><th>任务</th><th>范围</th><th>频率</th><th>状态</th><th>下次运行</th><th>操作</th></tr></thead><tbody>{schedulerJobs.map((job) => <tr key={job.id}><td>{job.name}</td><td>{job.scope}</td><td>{job.cron}</td><td>{job.status}</td><td>{job.nextRun}</td><td><button type="button" onClick={() => showToast(job.name + " 定时任务稍后接入真实调度。")}>查看</button></td></tr>)}</tbody></table></div></section>; }
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

function PoolGovernance({ selectedGame, mobileGames, onSelectGame, cleanupIssues, rawCount, poolCount, excelInfo, running, exportExcel, applyExcel, applyFieldChoice, showToast }) {
  const sourceRecords = selectedGame?.sourceRecords || [];
  const gameTags = (selectedGame?.gameplayTags?.length ? selectedGame.gameplayTags : selectedGame?.tags || []).filter((tag) => ![selectedGame?.status, selectedGame?.eventType, selectedGame?.rawStatus, selectedGame?.rawEventType, ...(selectedGame?.sources || [])].includes(tag));
  const fieldRows = buildFieldRows(selectedGame, gameTags, sourceRecords);
  const locateIssue = (issue) => {
    const target = findIssueTarget(issue, mobileGames);
    if (!target) return showToast(issue.title + " \u6ca1\u6709\u5173\u8054\u5230\u5177\u4f53\u6e38\u620f\u3002");
    onSelectGame(target.id);
    window.setTimeout(() => document.querySelector(".mobile-pool-layout")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    showToast("\u5df2\u5b9a\u4f4d\u5230\uff1a" + target.gameName);
  };

  return <section className="panel pool-governance"><SectionHead kicker="Governance" title={"\u6574\u5408\u7ba1\u7406"} note={"\u5b57\u6bb5\u5ba1\u6838\u3001Excel\u6574\u7406\u3001\u6e05\u6d17\u95ee\u9898\u96c6\u4e2d\u5728\u6e38\u620f\u7ba1\u7406\u91cc\u3002"} /><div className="governance-grid"><article className="governance-card fields-column"><SectionHead kicker="Fields" title={"\u5b57\u6bb5\u5ba1\u6838"} note={selectedGame ? "\u5f53\u524d\u9009\u4e2d\uff1a" + selectedGame.gameName : "\u8bf7\u9009\u62e9\u4e00\u4e2a\u6e38\u620f"} compact />{selectedGame ? <div className="field-audit-list">{fieldRows.map((row) => <div className="field-audit-row" key={row.field}><strong>{row.label}</strong><div className="field-choice-list">{row.choices.map((choice) => { const current = sameChoiceValue(choice.value, row.current); return <div className={"field-choice " + (current ? "current" : "")} key={choice.source + formatChoiceValue(choice.value)}><div><div className="field-choice-meta"><div className="field-source-chips">{choice.source.split(" / ").map((source) => <em key={source}>{source}</em>)}</div>{current ? <b>{"\u5f53\u524d"}</b> : null}</div><p>{formatChoiceValue(choice.value)}</p></div><button type="button" disabled={running || current} onClick={() => applyFieldChoice({ field: row.field, value: choice.value, source: choice.source })}>{current ? "\u5f53\u524d" : "\u91c7\u7528"}</button></div>; })}</div></div>)}</div> : <div className="empty-search inline">{"\u6682\u65e0\u53ef\u5ba1\u6838\u5b57\u6bb5\u3002"}</div>}</article><div className="governance-row two"><article className="governance-card source-audit-card"><SectionHead kicker="Sources" title={"\u6765\u6e90\u8bb0\u5f55"} note={selectedGame ? sourceRecords.length + " \u6761\u6765\u6e90" : "\u8bf7\u9009\u62e9\u4e00\u4e2a\u6e38\u620f"} compact />{sourceRecords.length ? <div className="source-audit-table compact-source-table"><table><thead><tr><th>{"\u6765\u6e90"}</th><th>{"\u72b6\u6001"}</th><th>{"\u8be6\u60c5\u9875"}</th></tr></thead><tbody>{sourceRecords.map((record, index) => <tr key={record.source + index}><td>{record.source}</td><td>{record.status}</td><td>{record.detailUrl ? <a href={record.detailUrl} target="_blank" rel="noreferrer">{"\u6253\u5f00"}</a> : "-"}</td></tr>)}</tbody></table></div> : <div className="empty-search inline">{"\u6682\u65e0\u6765\u6e90\u8bb0\u5f55\u3002"}</div>}</article><article className="governance-card excel-card"><SectionHead kicker="Excel" title={"Excel \u6574\u7406\u8868"} note={"\u539f\u59cb " + rawCount + " \u6761 / \u5165\u6c60 " + poolCount + " \u6761"} compact /><div className="excel-governance-body"><div className="action-row vertical"><button className="primary-button" type="button" disabled={running} onClick={exportExcel}>{"\u751f\u6210\u6574\u7406\u8868"}</button><button type="button" disabled={running || !excelInfo?.file} onClick={() => window.open(excelInfo.file, "_blank")}>{"\u6253\u5f00 Excel \u4f4d\u7f6e"}</button><button type="button" disabled={running || !excelInfo?.file} onClick={applyExcel}>{"\u5e94\u7528 Excel \u6574\u7406"}</button></div><p className="empty-search">{excelInfo?.file ? "\u5f53\u524d\u6574\u7406\u8868\uff1a" + excelInfo.file : "\u751f\u6210\u540e\u53ef\u5728\u8868\u5185\u5ba1\u6838\u5b57\u6bb5\u3002"}</p></div></article></div><article className="governance-card"><SectionHead kicker="Issues" title={"\u6e05\u6d17\u95ee\u9898"} note={cleanupIssues.length + " \u6761"} compact /><div className="issue-list compact">{cleanupIssues.length ? cleanupIssues.slice(0, 8).map((issue) => { const target = findIssueTarget(issue, mobileGames); return <article className="issue-card" key={issue.id}><span>{issue.severity}</span><div><strong>{issue.type}{"\uff1a"}{issue.title}</strong><p>{issue.detail}</p></div><button type="button" disabled={!target} onClick={() => locateIssue(issue)}>{target ? "\u5b9a\u4f4d" : "\u5df2\u8fc7\u6ee4"}</button></article>; }) : <div className="empty-search inline">{"\u6682\u65e0\u95ee\u9898\u8bb0\u5f55\u3002"}</div>}</div></article></div></section>;
}
function PoolManager({ activePoolKind, activePoolRow, mobileGames, totalMobileGames, selectedGame, onSelectGame, keyword, onKeywordChange, status, onStatusChange, source, onSourceChange, statuses, sources, cleanupIssues, rawCount, poolCount, excelInfo, running, exportExcel, applyExcel, applyFieldChoice, showToast }) { const isMobilePool = activePoolKind === "mobile"; return <div className="admin-stack"><section className="panel"><SectionHead kicker={activePoolRow?.name || "Pool"} title={(activePoolRow?.name || "游戏") + "管理"} note={"当前为" + (activePoolRow?.desc || "游戏池") + "，筛选后 " + mobileGames.length + " / 全部 " + totalMobileGames + " 条"} /><div className="pool-toolbar"><label><span>{"搜索游戏"}</span><input type="text" value={keyword} placeholder="输入游戏名、标签、来源" onChange={(event) => onKeywordChange(event.target.value)} /></label><label><span>{"状态"}</span><select value={status} onChange={(event) => onStatusChange(event.target.value)}>{statuses.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label><span>{"来源"}</span><select value={source} onChange={(event) => onSourceChange(event.target.value)}>{sources.map((item) => <option value={item} key={item}>{item}</option>)}</select></label></div><div className="mobile-pool-layout"><div className="pool-list">{mobileGames.map((item) => <button className={"pool-list-row " + (selectedGame?.id === item.id ? "active" : "")} type="button" onClick={() => onSelectGame(item.id)} key={item.id}><div className="pool-list-icon">{item.iconUrl ? <img src={"/api/image?url=" + encodeURIComponent(item.iconUrl)} alt="" /> : item.icon}</div><div className="pool-list-main"><strong>{item.gameName}</strong></div><div className="pool-list-side"><time>{new Date(item.eventAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</time></div></button>)}</div><div className="pool-detail">{selectedGame ? <GamePoolDetail item={selectedGame} /> : <div className="empty-search inline">{"暂无" + (activePoolRow?.name || "游戏") + "池数据。"}</div>}</div></div></section>{isMobilePool ? <PoolGovernance selectedGame={selectedGame} mobileGames={mobileGames} onSelectGame={onSelectGame} cleanupIssues={cleanupIssues} rawCount={rawCount} poolCount={poolCount} excelInfo={excelInfo} running={running} exportExcel={exportExcel} applyExcel={applyExcel} applyFieldChoice={applyFieldChoice} showToast={showToast} /> : null}</div>; }
function GamePoolDetail({ item }) {
  const gameTags = (item.gameplayTags?.length ? item.gameplayTags : item.tags || []).filter((tag) => ![item.status, item.eventType, item.rawStatus, item.rawEventType, ...(item.sources || [])].includes(tag)).slice(0, 6);
  const sourceRecords = item.sourceRecords || [];
  const contentParts = [item.summary, item.updateContent].map((value) => String(value || "").trim()).filter(Boolean);
  const mergedContent = [...new Set(contentParts)].join("\n");
  const vendorText = item.vendor || item.publisher || item.developer || "\u6682\u65e0\u5382\u5546\u4fe1\u606f";
  return <article className="pool-detail-card">
    <div className="pool-detail-head">
      <div className="pool-detail-icon">{item.iconUrl ? <img src={"/api/image?url=" + encodeURIComponent(item.iconUrl)} alt="" /> : item.icon}</div>
      <div className="pool-detail-main">
        <div className="pool-detail-title-row"><h3>{item.gameName}</h3></div>
        <div className="pool-detail-head-tags"><div className="pool-detail-chip-row"><span className="pool-detail-chip">{item.status || "\u72b6\u6001\u672a\u77e5"}</span><span className="pool-detail-chip subtle">{new Date(item.eventAt).toLocaleDateString("zh-CN")}</span><span className="pool-detail-chip subtle">{(item.sources || []).join(" / ") || "\u6765\u6e90\u672a\u77e5"}</span></div></div>
      </div>
    </div>
    <div className="pool-detail-copy pool-detail-content"><strong>{"\u7b80\u4ecb"}</strong><p>{mergedContent || "\u6682\u65e0\u7b80\u4ecb"}</p></div>
    <div className="pool-detail-copy pool-detail-tags-box"><b>{"\u73a9\u6cd5\u6807\u7b7e"}</b><div className="pool-inline-tags"><TagList tags={gameTags} tone="game" /></div></div>
    <div className="pool-detail-grid info-row">
      <div><strong>{"\u72b6\u6001\u5206\u7c7b"}</strong><span>{item.status}</span></div>
      <div><strong>{"\u65e5\u671f"}</strong><span>{new Date(item.eventAt).toLocaleDateString("zh-CN")}</span></div>
      <div><strong>{"\u5382\u5546"}</strong><span>{vendorText}</span></div>
    </div>
    {item.subtitle ? <div className="pool-detail-copy compact"><b>{"\u526f\u6807\u9898"}</b><p>{item.subtitle}</p></div> : null}
    <div className="pool-detail-sources"><strong>{"\u6765\u6e90\u8bb0\u5f55"}</strong><div className="pool-source-records">{sourceRecords.map((record, index) => <a href={record.detailUrl} target="_blank" rel="noreferrer" key={record.source + "-" + index}><div className="pool-source-record-main"><div className="pool-source-record-top"><b>{record.source}</b><span>{record.status || item.status}</span></div><p>{record.vendor || ""}</p><div className="pool-source-record-tags"><TagList tags={(record.tags || []).filter(Boolean).slice(0, 4)} tone="game" /></div><div className="pool-source-record-note">{record.summary || record.updateContent || "\u6682\u65e0\u8865\u5145\u5185\u5bb9"}</div></div><div className="pool-source-record-side"><em>{new Date(record.eventAt).toLocaleDateString("zh-CN")}</em><span className="source-link">{"\u539f\u6587"}</span></div></a>)}</div></div>
  </article>;
}
function ReviewQueue({ reviewQueue, showToast, embedded = false }) { return <section className={"panel " + (embedded ? "embedded-panel" : "")}><SectionHead kicker="Review" title="记录审核" /><div className="review-list">{reviewQueue.length ? reviewQueue.map((item) => <article className="review-row" key={item.id}><Clock3 size={18} /><div><strong>{item.gameName}</strong><p>{item.action} ? {item.from} ? {item.reason}</p></div><button type="button" onClick={() => showToast(item.gameName + " 已保留")}>保留</button><button type="button" onClick={() => showToast(item.gameName + " 已合并")}>合并</button><button type="button" onClick={() => showToast(item.gameName + " 已忽略")}>忽略</button></article>) : <div className="empty-search inline">暂无审核记录。</div>}</div></section>; }
function StatusCard({ title, value, desc }) { return <article className="status-card"><strong>{title}</strong><b>{value}</b><p>{desc}</p></article>; }

