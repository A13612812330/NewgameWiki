import { ExternalLink, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { sortByTodayFuturePast, startOfLocalDay as scheduleStartOfLocalDay } from "../utils/timeSort.js";

export function PageTitle({ kicker, title, desc, actions }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const info = normalizePageInfo(desc, title);
  return (
    <section className="page-title">
      <div className="page-title-main">
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h1>{title}</h1>
      </div>
      <div className="title-actions">
        {desc ? <button className="info-button" type="button" title="查看页面说明" aria-label="查看页面说明" onClick={() => setInfoOpen(true)}><Info size={14} /></button> : null}
        {actions}
      </div>
      {infoOpen ? <PageInfoModal info={info} onClose={() => setInfoOpen(false)} /> : null}
    </section>
  );
}

function normalizePageInfo(value, fallbackTitle = "页面说明") {
  if (value && typeof value === "object") return { title: value.title || fallbackTitle, summary: value.summary || "", sections: value.sections || [] };
  return { title: fallbackTitle, summary: String(value || ""), sections: [] };
}

function PageInfoModal({ info, onClose }) {
  return (
    <div className="modal-backdrop page-info-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="page-info-modal" role="dialog" aria-modal="true" aria-label={info.title}>
        <div className="page-info-head">
          <div>
            <p className="kicker">Info</p>
            <h3>{info.title}</h3>
          </div>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
        {info.summary ? <p className="page-info-summary">{info.summary}</p> : null}
        {info.sections?.length ? <div className="page-info-sections">
          {info.sections.map((section) => (
            <article key={section.title}>
              <strong>{section.title}</strong>
              <ul>{(section.items || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          ))}
        </div> : null}
      </section>
    </div>
  );
}

export function SectionHead({ kicker, title, note, compact = false, action }) {
  return (
    <div className={"section-head " + (compact ? "compact" : "")}>
      <div>
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h2>{title}</h2>
      </div>
      {action || (note ? <span>{note}</span> : null)}
    </div>
  );
}

export function MetricCard({ label, value, detail, icon }) {
  return (
    <article className="metric-card">
      <span className="metric-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </article>
  );
}

export function GameIcon({ item, small = false }) {
  const iconUrl = item.iconUrl || "";
  return (
    <span className={"game-icon " + (small ? "small" : "")} aria-hidden="true">
      {iconUrl ? <img src={proxiedImage(iconUrl)} alt="" loading={small ? "lazy" : "eager"} decoding="async" onError={hideBrokenImage} /> : <b>{item.icon || cleanLabel(item.gameName).slice(0, 1)}</b>}
    </span>
  );
}

export function PcCover({ item, small = false }) {
  const iconUrl = item.iconUrl || "";
  return (
    <span className={"pc-news-cover " + (small ? "small" : "")} aria-hidden="true">
      {iconUrl ? <img src={proxiedImage(iconUrl)} alt="" loading="lazy" decoding="async" onError={hideBrokenImage} /> : <b>{cleanLabel(item.relatedGame || item.gameName || item.newsTitle).slice(0, 1)}</b>}
    </span>
  );
}

export function FocusCard({ item }) {
  const { gameTags, statusTags } = splitTags(item);
  const content = buildFocusContent(item);
  return (
    <a className="focus-card" href={sourceHref(item)} target="_blank" rel="noreferrer">
      <div className="focus-card-body">
        <div className="focus-card-hero">
          <GameIcon item={item} />
          <div className="focus-card-title">
            <div className="focus-card-top">
              <h3>{item.gameName}</h3>
              <StatusPills tags={statusTags} />
            </div>
            <TagList tags={gameTags.slice(0, 5)} tone="game" />
          </div>
        </div>
        <p>{content}</p>
      </div>
    </a>
  );
}

function buildFocusContent(item) {
  const content = buildContentPreview(item)[0] || item.summary || "暂无整理内容";
  return formatFocusContent(content);
}

function formatFocusContent(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.includes("\n")) return text;
  if (text.length <= 34) return text;

  const structured = formatFocusBulletContent(text);
  if (structured) return structured;

  const split = findKeywordSentenceEnd(text, 6, 56) ||
    findSplitPoint(text, /[。！？；;]/g, 6, 52, "keep") ||
    findSplitPoint(text, /[，,]/g, 16, 46, "drop");
  if (!split) return text;

  return text.slice(0, split.headEnd).trim() + "\n" + text.slice(split.tailStart).trim();
}

function formatFocusBulletContent(text) {
  const commaIndex = text.search(/[，,]/);
  if (commaIndex < 12) return "";

  const first = cleanFocusLine(text.slice(0, commaIndex));
  const rest = text.slice(commaIndex + 1);
  if (!isFocusLeadLine(first)) return "";

  const bullets = rest
    .split(/[，,]/)
    .map(cleanFocusLine)
    .filter((line) => line && line.length >= 4)
    .slice(0, 5);

  if (!bullets.length) return "";
  return [first, ...bullets.map((line) => "-" + line)].join("\n");
}

function cleanFocusLine(value) {
  return String(value || "")
    .replace(/^[\s，,、。！？；;\-]+/, "")
    .replace(/[\s，,、。！？；;]+$/, "")
    .replace(/\s*第[一二三四五六七八九十百千万\d]+赛季.*$/, "")
    .trim();
}

function isFocusLeadLine(value) {
  return /(更新|开启|上线|首发|开测|测试|招募|预约|联动|活动|版本)/.test(value);
}

function findSplitPoint(text, pattern, min, max, mode = "keep") {
  for (const match of text.matchAll(pattern)) {
    const index = match.index + match[0].length;
    if (index >= min && index <= max) {
      return {
        headEnd: mode === "drop" ? match.index : index,
        tailStart: index,
      };
    }
  }
  return null;
}

function findKeywordSentenceEnd(text, min, max) {
  const pattern = /(开启|上线|首发|开测|测试|更新|招募|预约|联动|活动)(?=$|[，,、。！？；;\s])/g;
  for (const match of text.matchAll(pattern)) {
    const index = match.index + match[0].length;
    if (index >= min && index <= max) {
      const tailStart = text.slice(index).match(/^[，,、。！？；;\s]+/)?.[0]?.length || 0;
      return { headEnd: index, tailStart: index + tailStart };
    }
  }
  return null;
}

export function GameCard({ item, compact = false, gameTagLimit = 3 }) {
  const { gameTags, statusTags, sourceTags } = splitTags(item);
  const content = buildContentPreview(item);
  const primaryContent = formatCardContent(content[0] || item.summary || "暂无整理内容");
  const titleParts = splitDisplayTitle(item);
  const isWelfareCard = isWelfareItem(item);
  return (
    <article className={"game-card " + (compact ? "compact " : "") + (isWelfareCard ? "welfare-card" : "")}>
      <div className="game-card-head">
        <GameIcon item={item} />
        <div className="game-title-stack">
          <div className="game-title-line">
            <h3>{titleParts.title}</h3>
            {titleParts.subtitle ? <em>{titleParts.subtitle}</em> : null}
          </div>
          <div className="game-meta-line">
            <TagList tags={gameTags.slice(0, gameTagLimit)} tone="game" />
            <time>{formatMonthDay(item.eventAt)}</time>
          </div>
        </div>
        <StatusPills tags={statusTags} />
      </div>
      <div className="content-box">
        <p>{primaryContent}</p>
        {!compact && content[1] ? <p>{content[1]}</p> : null}
      </div>
      <div className="card-footer">
        <TagList tags={sourceTags} tone="source" />
        {item.detailUrl ? <a className="source-link" href={item.detailUrl} target="_blank" rel="noreferrer">原文 <ExternalLink size={12} /></a> : <span className="source-link disabled">待详情</span>}
      </div>
    </article>
  );
}

function formatCardContent(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.includes("\n")) return text;
  const parts = splitCardContent(text);
  if (parts.length <= 1) return text;
  return parts.slice(0, 2).join("\n");
}

function splitCardContent(text) {
  const parts = [];
  let start = 0;
  const separators = [...text.matchAll(/[；;，,]/g)];
  for (const match of separators) {
    const sep = match[0];
    const index = match.index;
    const chunk = cleanFocusLine(text.slice(start, index));
    const isSemicolon = sep === "；" || sep === ";";
    const canSplit = (isSemicolon && chunk.length > 10) || (!isSemicolon && chunk.length >= 15) || /资格|测试|招募|上线|开启|活动|更新/.test(chunk);
    if (!canSplit) continue;
    if (chunk) parts.push(chunk);
    start = index + sep.length;
  }
  const tail = cleanFocusLine(text.slice(start));
  if (tail) parts.push(tail);
  return parts.filter(Boolean);
}

export function SlimGameRow({ item }) {
  const { gameTags } = splitTags(item);
  return (
    <a className="slim-game-row" href={sourceHref(item)} target="_blank" rel="noreferrer">
      <GameIcon item={item} small />
      <div>
        <strong>{item.gameName}</strong>
        <TagList tags={gameTags.slice(0, 2)} tone="game" />
      </div>
      <time>{formatMonthDay(item.eventAt)}</time>
    </a>
  );
}

export function NewsRow({ item }) {
  if (isPcItem(item)) return <PcNewsRow item={item} />;
  return (
    <a className="news-row" href={sourceHref(item)} target="_blank" rel="noreferrer">
      <GameIcon item={item} small />
      <div>
        <strong>{item.gameName}</strong>
        <p>{buildContentPreview(item)[0] || item.summary || item.status}</p>
      </div>
      <time>{formatMonthDay(item.eventAt)}</time>
    </a>
  );
}

export function PcNewsRow({ item }) {
  const isSteam = asList(item.sources).includes("Steam") || item.appid;
  const onlineValue = Number(item.lastKnownPlayers ?? item.currentPlayers);
  const isSteamNew = isSteam && (([item.status, item.eventType, ...asList(item.steamLabels)].some((value) => /新游|预约|即将推出/.test(String(value || ""))) || item.comingSoon) && (item.comingSoon || !Number.isFinite(onlineValue) || onlineValue < 1000));
  const title = item.newsTitle || item.gameName || "未命名资讯";
  const relatedGame = cleanLabel(item.relatedGame || (item.newsTitle ? item.gameName : ""));
  const summary = item.summary || item.updateContent || (isSteam ? "暂无 Steam 简介" : "暂无资讯摘要");
  const source = asList(item.sources)[0] || item.platform || (isSteam ? "Steam" : "资讯");
  const online = Number.isFinite(onlineValue) ? onlineValue.toLocaleString("zh-CN") : "";
  const labels = [...new Set([item.status, item.eventType, ...asList(item.steamLabels)].map(normalizePcLabel).filter((label) => label && label !== "常规观察"))];
  const sideValue = isSteamNew ? (item.releaseText || formatMonthDay(item.eventAt)) : isSteam ? (online || "待获取") : formatPcPublishTime(item);
  const sideLabel = isSteamNew ? "发售" : isSteam ? "在线" : "发布";
  const rowType = isSteamNew ? "is-steam-new" : isSteam ? "is-steam-hot" : "is-pc-news";
  const sideTags = buildPcSideTags({ isSteam, source, labels, item, relatedGame, title });
  const showSummary = rowType !== "is-pc-news";
  return (
    <a className={"news-row pc-news-row " + rowType} href={sourceHref(item)} target="_blank" rel="noreferrer">
      <PcCover item={item} small />
      <div className="pc-news-main">
        <div className="pc-news-title"><strong>{title}</strong></div>
        {showSummary ? <p>{summary}</p> : null}
      </div>
      <div className="pc-news-side">
        <div className="pc-news-side-tags">{sideTags.map((tag) => <span className={"pc-side-tag " + tag.tone} key={tag.label}>{tag.label}</span>)}</div>
        <time><b>{sideLabel}</b>{sideValue}</time>
      </div>
    </a>
  );
}

function buildPcSideTags({ isSteam, source, labels, item, relatedGame, title }) {
  const status = labels.find((label) => label === "爆火") || labels.find((label) => label === "热门") || labels.find((label) => label === "新游") || labels[0] || item.status || (isSteam ? "Steam" : "资讯");
  const price = cleanLabel(item.price);
  const related = cleanPcRelatedGame(relatedGame, title, item);
  const tags = isSteam
    ? [
        status ? { label: status, tone: pcTagTone(status) } : null,
        price ? { label: price, tone: pcTagTone(price) } : null,
        { label: source || "Steam", tone: "platform" },
      ]
    : [
        related ? { label: related, tone: "related" } : null,
        status ? { label: normalizePcNewsStatusTag(status), tone: pcTagTone(normalizePcNewsStatusTag(status)) } : null,
        { label: source || "资讯", tone: "platform" },
      ];
  const seen = new Set();
  return tags.filter(Boolean).filter((tag) => {
    const key = tag.label;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanPcRelatedGame(relatedGame, title, item) {
  const related = cleanLabel(relatedGame && relatedGame !== title ? relatedGame : "");
  if (!related || related === "其他") return "";
  const authorLike = cleanLabel(item?.author || item?.vendor || "");
  if (authorLike && related.toLowerCase() === authorLike.toLowerCase()) return "";
  if (/^[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(related)) return "";
  return related;
}

function normalizePcNewsStatusTag(value) {
  const text = cleanLabel(value);
  if (/行业/.test(text)) return "行业";
  if (/热门|爆火/.test(text)) return "热门";
  if (/更新/.test(text)) return "更新";
  return "资讯";
}

function pcTagTone(value) {
  const text = cleanLabel(value);
  if (/爆火/.test(text)) return "hot";
  if (/热门/.test(text)) return "popular";
  if (/新游/.test(text)) return "new";
  if (/^资讯$/.test(text)) return "info";
  if (/免费|free/i.test(text)) return "free";
  if (/[¥￥$€£]|\d/.test(text)) return "paid";
  return "default";
}

function formatPcPublishTime(item) {
  const date = new Date(item?.publishedAt || item?.eventAt || "");
  if (Number.isNaN(date.getTime())) return cleanLabel(item?.publishText) || "--/--";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function normalizePcLabel(value) {
  const label = cleanLabel(value);
  if (/热门候选|热门|热游/.test(label)) return "热门";
  if (/增长候选|增长|爆火/.test(label)) return "爆火";
  if (/新游候选|新游|预约|即将推出/.test(label)) return "新游";
  return label;
}

function isPcItem(item) {
  const sources = asList(item.sources);
  return Boolean(item?.newsTitle || item?.appid || sources.includes("Steam") || sources.some((source) => ["机核", "游民星空", "游侠网"].includes(source)));
}

export function CalendarList({ items, groups, limit = 20, title = "游戏日历", kicker = "Calendar", showCounts = true }) {
  const calendarGroups = useMemo(() => {
    const validGroups = (groups || []).filter((group) => group && Array.isArray(group.items));
    return validGroups.length ? validGroups : [{ key: "all", label: "全部", count: items?.length || 0, items: items || [] }];
  }, [groups, items]);
  const [activeKey, setActiveKey] = useState(calendarGroups[0]?.key || "all");
  const activeGroup = calendarGroups.find((group) => group.key === activeKey) || calendarGroups[0] || { items: [] };
  const sortItems = (group) => group.sortItems
    ? [...(group.items || [])].sort(group.sortItems).slice(0, group.limit || limit)
    : selectScheduleWindow(group.items || [], group);
  const visibleItems = sortItems(activeGroup);
  const renderItems = sortItems;
  return (
    <section className="panel calendar-panel">
      <SectionHead kicker={kicker} title={title} compact />
      {calendarGroups.length > 1 ? (
        <div className="calendar-accordion">
          {calendarGroups.map((group) => (
            <div className={"calendar-group " + (group.key === activeKey ? "active" : "")} key={group.key}>
              <button type="button" onClick={() => setActiveKey(group.key === activeKey ? null : group.key)}>
                <span>{group.label}</span>
                {showCounts ? <b>{group.count ?? group.items.length}</b> : null}
                <i aria-hidden="true" />
              </button>
              <div className="calendar-collapse"><CalendarItems items={renderItems(group)} variant={group.variant} /></div>
            </div>
          ))}
        </div>
      ) : <CalendarItems items={visibleItems} variant={activeGroup.variant} />}
    </section>
  );
}

function selectScheduleWindow(items = [], group = {}) {
  const today = startOfLocalDay(new Date());
  const pastLimit = Number(group.pastLimit) || 15;
  const futureLimit = Number(group.futureLimit) || 5;
  const withTime = items
    .map((item) => ({ item, time: eventDayTime(item) }))
    .filter((entry) => entry.time > 0);
  const todayItems = withTime
    .filter((entry) => entry.time === today)
    .sort((a, b) => sortByTodayFuturePast(a.item, b.item));
  const future = withTime
    .filter((entry) => entry.time > today)
    .sort((a, b) => a.time - b.time)
    .slice(0, futureLimit);
  if (group.todayFutureOnly) return [...todayItems, ...future].map((entry) => entry.item);
  if (group.todayOnly) return todayItems.map((entry) => entry.item);
  const past = withTime
    .filter((entry) => entry.time < today)
    .sort((a, b) => b.time - a.time)
    .slice(0, pastLimit);
  const selectedIds = new Set([...todayItems, ...future, ...past].map((entry) => entry.item.id));
  const undated = items.filter((item) => !selectedIds.has(item.id) && !eventDayTime(item)).slice(0, Math.max(0, (group.limit || 20) - selectedIds.size));
  return [...todayItems, ...future, ...past].map((entry) => entry.item).concat(undated);
}

function eventDayTime(item) {
  const date = new Date(item?.eventAt || item?.publishedAt || "");
  if (Number.isNaN(date.getTime())) return 0;
  return startOfLocalDay(date);
}

function startOfLocalDay(date) {
  return scheduleStartOfLocalDay(date).getTime();
}

function CalendarItems({ items, variant = "" }) {
  return (
    <div className="calendar-list">
      {items.map((item) => {
        const isWelfareCalendarItem = isWelfareItem(item);
        const isMobileCalendarItem = isMobileItem(item);
        const isSteamCalendarItem = variant === "steamPlayers" || isSteamCalendarGame(item);
        return (
          <a className={"calendar-item " + (isWelfareCalendarItem ? "welfare-calendar-item " : "") + (isMobileCalendarItem ? "mobile-calendar-item " : "") + (isSteamCalendarItem ? "steam-calendar-item" : "")} href={sourceHref(item)} target="_blank" rel="noreferrer" key={item.id}>
            {!isSteamCalendarItem ? <time>{formatMonthDay(item.eventAt)}</time> : null}
            <GameIcon item={item} small />
            <strong>{item.gameName}</strong>
            {isWelfareCalendarItem && item.subtitle ? <span className="calendar-subtitle-pill">{item.subtitle}</span> : null}
            {isMobileCalendarItem ? <span className={"calendar-status " + statusClass(item.status)}>{normalizeStatus(item.status)}</span> : null}
            {isSteamCalendarItem ? <span className="calendar-player-count">{formatPlayerCount(item.lastKnownPlayers ?? item.currentPlayers)}</span> : <em>{platformAbbr(item)}</em>}
          </a>
        );
      })}
    </div>
  );
}

export function TimeTree({ items, limit = 10 }) {
  return (
    <div className="time-tree">
      {[...items].sort(sortByTodayFuturePast).slice(0, limit).map((item) => {
        const { gameTags, sourceTags } = splitTags(item);
        return (
          <a className="time-tree-row" href={sourceHref(item)} target="_blank" rel="noreferrer" key={item.id}>
            <time>{formatMonthDay(item.eventAt)}</time>
            <div className="time-tree-box">
              <GameIcon item={item} small />
              <div className="time-tree-main">
                <strong>{item.gameName}</strong>
                <TagList tags={gameTags.slice(0, 3)} tone="game" />
              </div>
              <div className="time-tree-side">
                <span className={"calendar-status " + statusClass(item.status)}>{normalizeStatus(item.status)}</span>
                <em>{sourceTags.join(" / ") || platformAbbr(item)}</em>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

export function TagList({ tags, tone = "default" }) {
  const unique = [...new Set(asList(tags).map(cleanLabel).filter(Boolean))].slice(0, 6);
  return <div className={"tag-list " + tone}>{unique.map((tag) => <span key={tag}>{cleanLabel(tag)}</span>)}</div>;
}

function StatusPills({ tags }) {
  return <div className="status-pills">{tags.map((tag) => <b className={statusClass(tag)} key={tag}>{normalizeStatus(tag)}</b>)}</div>;
}

export function buildContentPreview(item) {
  if (isWelfareItem(item)) {
    const ordered = formatWelfareContent(item.summary || item.updateContent || "");
    if (ordered) return [ordered];
  }
  const parts = [item.summary, item.updateContent]
    .flatMap((value) => String(value || "").split(/\n+/))
    .map((value) => normalizeSentence(value))
    .filter(Boolean);
  const unique = [];
  for (const part of parts) {
    if (!unique.some((existing) => similar(existing, part))) unique.push(part);
  }
  const prioritized = unique.sort((a, b) => sentenceScore(b) - sentenceScore(a));
  return [mergePreviewText(prioritized)];
}

function mergePreviewText(parts) {
  return parts.filter(Boolean).slice(0, 2).join(" ");
}

function isWelfareItem(item) {
  return item?.pool === "小七福利新游池" || (item?.sources || []).includes("小七手游");
}

function isMobileItem(item) {
  return !isWelfareItem(item) && !isPcItem(item) && (item?.pool === "公共手游池" || item?.platform === "手游" || asList(item?.sources).some((source) => ["TapTap", "好游快爆", "九游"].includes(source)));
}

function isSteamCalendarGame(item) {
  const sources = asList(item?.sources);
  const onlineValue = Number(item?.lastKnownPlayers ?? item?.currentPlayers);
  const isSteam = Boolean(item?.appid || sources.includes("Steam"));
  const isNew = [item?.status, item?.eventType, ...asList(item?.steamLabels)].some((value) => /新游|预约|即将推出/.test(String(value || ""))) || item?.comingSoon;
  return isSteam && !isNew && Number.isFinite(onlineValue);
}

function formatPlayerCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("zh-CN") : "待获取";
}

function formatWelfareContent(value = "") {
  const text = String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\s*(?=\d+[、．])/g, "\n")
    .trim();
  if (!text) return "";
  const lines = text.split(/\n+/).map(cleanWelfareLine).filter(Boolean);
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
  if (!blocks.length) return lines.slice(0, 3).join("\n");
  const first = blocks.sort((left, right) => left.index - right.index)[0];
  return cleanWelfarePrimaryBenefit(first?.lines?.[0] || "");
}

function cleanWelfarePrimaryBenefit(value = "") {
  return cleanWelfareLine(value)
    .replace(/[（(][^（）()]*[）)]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanWelfareLine(value = "") {
  return String(value || "")
    .replace(/\?+/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[，,。；;\s]+/, "")
    .trim();
}

function splitTags(item) {
  const sourceTags = [...new Set(asList(item.sources).map(cleanLabel).filter(Boolean))];
  const statusTags = [normalizeStatus(item.status || item.eventType)].filter(Boolean);
  const raw = asList(item.gameplayTags?.length ? item.gameplayTags : item.tags);
  const blocked = new Set([...sourceTags, ...statusTags, "福利", "上线/测试", "更新", "活动/联动", "新游", "预约", "首发", "开测", "上线", "热游", "新品", "热门资讯"]);
  const gameTags = [...new Set(raw.map(cleanLabel).filter(Boolean))].filter((tag) => !blocked.has(tag) && !isStatusLike(tag));
  return { gameTags, statusTags, sourceTags };
}

function splitDisplayTitle(item) {
  return { title: cleanLabel(item.gameName), subtitle: cleanLabel(item.subtitle) };
}

function normalizeSentence(value) {
  return cleanLabel(value)
    .replace(/好游快爆APP提供/g, "")
    .replace(/九游APP/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[，,。；;\s]+/, "")
    .trim();
}

function sentenceScore(value) {
  let score = Math.min(value.length, 120);
  if (/(版本|赛季|上线|更新|联动|活动|开启|招募|资格|首发|公测|内测)/.test(value)) score += 40;
  if (/^(预约|首发|上线|开测)$/.test(value)) score -= 80;
  return score;
}

function similar(left, right) {
  const a = cleanCompare(left);
  const b = cleanCompare(right);
  return a === b || (a.length > 10 && b.includes(a)) || (b.length > 10 && a.includes(b));
}

function cleanCompare(value) {
  return String(value || "").replace(/[\s，。！？、,.!?:：；;《》“”'"（）()]/g, "").toLowerCase();
}

function normalizeStatus(value) {
  const text = cleanLabel(value);
  if (!text) return "待整理";
  if (/活动|联动/.test(text)) return "活动/联动";
  if (/更新|版本|赛季|补丁|DLC/.test(text)) return "更新";
  if (/热游|新品|热门资讯/.test(text)) return text;
  return "上线/测试";
}

function statusClass(value) {
  const text = normalizeStatus(value);
  if (/活动|联动/.test(text)) return "status-hot";
  if (/更新/.test(text)) return "status-live";
  if (/预约/.test(cleanLabel(value))) return "status-reserve";
  if (/热游|新品/.test(text)) return "status-pc";
  return "status-test";
}

function isStatusLike(value) {
  return /(上线|测试|开测|首发|新游|预约|公测|内测|更新|版本|活动|联动|热游|新品|热门)/.test(cleanLabel(value));
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/[|/、,，\s]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function cleanLabel(value) {
  return String(value || "").replace(/\?+/g, "").replace(/\s+/g, " ").trim();
}

function proxiedImage(url) {
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

function hideBrokenImage(event) {
  event.currentTarget.style.display = "none";
}

function sourceHref(item) {
  return item.detailUrl || item.originalUrl || "#";
}

export function platformAbbr(item) {
  const source = cleanLabel(asList(item.sources)[0] || item.platform || "");
  const map = { TapTap: "Tap", 好游快爆: "快爆", 九游: "九游", 小七手游: "小七", Steam: "Steam", 综合资讯: "资讯" };
  return map[source] || source || "来源";
}

function formatMonthDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--/--";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
