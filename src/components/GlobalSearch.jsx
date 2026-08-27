import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { GameIcon, PcCover } from "../pages/shared.jsx";
import { useGameData } from "../data/useGameData.js";

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/[|/、,，\s]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function itemTitle(item) {
  return cleanText(item.newsTitle || item.gameName || "未命名");
}

function itemHref(item) {
  return item.detailUrl || item.originalUrl || "#";
}

function itemType(item) {
  const sources = asList(item.sources);
  if (item.newsTitle) return "资讯";
  if (sources.includes("Steam") || item.appid) return item.comingSoon || /新游|预约|即将推出/.test(cleanText(item.status) + cleanText(item.eventType)) ? "Steam新游" : "Steam游戏";
  if (sources.includes("小七手游") || item.pool === "小七福利新游池") return "福利";
  return "手游";
}

function searchableText(item) {
  return [
    item.gameName,
    item.newsTitle,
    item.relatedGame,
    item.status,
    item.eventType,
    item.category,
    item.vendor,
    item.author,
    item.summary,
    item.updateContent,
    item.price,
    item.releaseText,
    asList(item.sources).join(" "),
    asList(item.tags).join(" "),
    asList(item.gameplayTags).join(" "),
  ].map(cleanText).join(" ").toLowerCase();
}

function normalizePcLabel(value) {
  const label = cleanText(value);
  if (/爆火|增长/.test(label)) return "爆火";
  if (/热门|热游/.test(label)) return "热门";
  if (/新游|预约|即将推出/.test(label)) return "新游";
  if (/资讯|新闻/.test(label)) return "资讯";
  return label;
}

function badgeTone(value) {
  const text = cleanText(value);
  if (/爆火/.test(text)) return "hot";
  if (/热门/.test(text)) return "popular";
  if (/新游/.test(text)) return "new";
  if (/资讯/.test(text)) return "info";
  if (/免费|free/i.test(text)) return "free";
  if (/[¥￥$€£]|\d/.test(text)) return "paid";
  if (/上线|测试/.test(text)) return "status-test";
  if (/更新/.test(text)) return "status-live";
  if (/活动|联动/.test(text)) return "status-hot";
  return "platform";
}

function buildBadges(item) {
  const sources = asList(item.sources);
  const source = sources[0] || item.platform || "";
  const type = itemType(item);
  const status = normalizePcLabel(item.status || item.eventType || item.category || type);
  const related = cleanText(item.relatedGame && item.relatedGame !== item.newsTitle ? item.relatedGame : "");
  const price = cleanText(item.price);
  const rawBadges = item.newsTitle
    ? [related && related !== "其他" ? related : null, "资讯", source]
    : sources.includes("Steam") || item.appid
      ? [status, price, source || "Steam"]
      : [type, item.status || item.eventType, source];
  const seen = new Set();
  return rawBadges.map(cleanText).filter(Boolean).filter((label) => {
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  }).slice(0, 3).map((label) => ({
    label,
    tone: item.newsTitle && label === related ? "related" : badgeTone(label),
  }));
}

export default function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const { mobileGames, welfareGames, steamGames, steamNewGames, pcNews } = useGameData();
  const allItems = useMemo(() => [...mobileGames, ...welfareGames, ...steamGames, ...steamNewGames, ...pcNews], [mobileGames, welfareGames, steamGames, steamNewGames, pcNews]);
  const defaultResults = useMemo(() => [
    ...mobileGames.slice(0, 5),
    ...welfareGames.slice(0, 3),
    ...steamNewGames.slice(0, 3),
    ...pcNews.slice(0, 5),
  ], [mobileGames, welfareGames, steamNewGames, pcNews]);
  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return defaultResults;
    return allItems.filter((item) => searchableText(item).includes(keyword)).slice(0, 30);
  }, [allItems, defaultResults, query]);

  useEffect(() => {
    if (!open) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    const handleKeydown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="global-search-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="global-search-modal" role="dialog" aria-modal="true" aria-label="全局搜索" onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
        <div className="global-search-head">
          <label className="global-search-box">
            <Search size={18} />
            <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索游戏、资讯、平台、标签" />
          </label>
          <button className="global-search-close" type="button" onClick={onClose} aria-label="关闭搜索"><X size={18} /></button>
        </div>
        <div className="global-search-results">
          {results.length ? results.map((item, index) => {
            const isPc = item.newsTitle || item.appid || asList(item.sources).includes("Steam");
            return (
              <a className={"global-search-row " + (isPc ? "is-pc" : "is-mobile")} href={itemHref(item)} target="_blank" rel="noreferrer" key={`${itemType(item)}-${item.id || itemHref(item)}-${index}`} onClick={onClose}>
                {isPc ? <PcCover item={item} small /> : <GameIcon item={item} small />}
                <div className="global-search-main">
                  <strong>{itemTitle(item)}</strong>
                  <p>{cleanText(item.summary || item.updateContent || item.relatedGame || item.releaseText || "暂无整理内容")}</p>
                </div>
                <div className="global-search-side">
                  <div className="pc-news-side-tags">{buildBadges(item).map((badge) => <span className={"pc-side-tag " + badge.tone} key={badge.label}>{badge.label}</span>)}</div>
                  <em><ExternalLink size={12} />原文</em>
                </div>
              </a>
            );
          }) : <div className="global-search-empty">没有匹配结果。</div>}
        </div>
      </section>
    </div>
  );
}
