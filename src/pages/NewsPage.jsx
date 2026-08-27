import { useEffect, useMemo, useState } from "react";
import { Newspaper, Tags } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { NewsRow, PageTitle, SectionHead } from "./shared.jsx";

const ALL = "全部";
const PAGE_SIZE = 20;

export default function NewsPage() {
  const [activeSource, setActiveSource] = useState(ALL);
  const [activeTag, setActiveTag] = useState(ALL);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { pcNews } = useGameData();
  const items = useMemo(() => [...pcNews].sort(sortNews), [pcNews]);
  const sources = useMemo(() => buildCountOptions(items.flatMap(newsSources)), [items]);
  const tags = useMemo(() => buildCountOptions(items.flatMap(newsTags)).slice(0, 12), [items]);
  const filteredItems = useMemo(() => items.filter((item) => {
    if (activeSource !== ALL && !newsSources(item).includes(activeSource)) return false;
    if (activeTag !== ALL && !newsTags(item).includes(activeTag)) return false;
    return true;
  }), [activeSource, activeTag, items]);
  const visibleItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [activeSource, activeTag]);
  return (
    <main className="page-grid pc-page news-page">
      <PageTitle kicker="News" title="资讯" desc="端游资讯聚合，按来源逐个平台优化。" />
      <section className="news-filter-panel">
        <article className="news-total-card">
          <span className="metric-icon"><Newspaper size={16} /></span>
          <div>
            <p>资讯记录</p>
            <strong>{filteredItems.length}</strong>
            <small>{filteredItems.length === items.length ? "全部记录" : `共 ${items.length} 条`}</small>
          </div>
        </article>
        <article className="news-filter-card">
          <div className="news-filter-head"><Tags size={15} /><span>平台</span></div>
          <div className="news-filter-pills">
            <button className={activeSource === ALL ? "active" : ""} type="button" onClick={() => setActiveSource(ALL)}>全部<b>{items.length}</b></button>
            {sources.map((item) => <button className={activeSource === item.label ? "active" : ""} type="button" onClick={() => setActiveSource(item.label)} key={item.label}>{item.label}<b>{item.count}</b></button>)}
          </div>
        </article>
        <article className="news-filter-card">
          <div className="news-filter-head"><Tags size={15} /><span>标签</span></div>
          <div className="news-filter-pills">
            <button className={activeTag === ALL ? "active" : ""} type="button" onClick={() => setActiveTag(ALL)}>全部<b>{items.length}</b></button>
            {tags.map((item) => <button className={activeTag === item.label ? "active" : ""} type="button" onClick={() => setActiveTag(item.label)} key={item.label}>{item.label}<b>{item.count}</b></button>)}
          </div>
        </article>
      </section>
      <div className="content-with-sidebar pc-layout">
        <section className="panel game-pool-panel">
          <SectionHead title="端游资讯" note={`${filteredItems.length} 条`} compact />
          <div className="pc-vertical-list pc-main-list">{visibleItems.map((item) => <NewsRow item={item} key={item.id} />)}</div>
          {visibleItems.length < filteredItems.length ? <div className="news-load-more"><button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>加载更多 <b>{filteredItems.length - visibleItems.length}</b></button></div> : null}
        </section>
      </div>
    </main>
  );
}

function newsSources(item) {
  return [...new Set([...(item.sources || []), item.platform].filter(Boolean))];
}

function newsTags(item) {
  const candidates = [item.category, item.status, item.eventType, item.newsType, ...(item.tags || [])];
  return [...new Set(candidates.map(normalizeNewsTag).filter(Boolean))];
}

function normalizeNewsTag(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^(资讯|新闻|游戏新闻|综合资讯|端游资讯)$/.test(text)) return "资讯";
  if (/更新|版本|补丁|DLC|赛季|上线|维护|发布/.test(text)) return "更新";
  if (/行业|财报|销量|公司|平台|主机|硬件|索尼|微软|任天堂|Steam|Xbox|PS5|PS\b/i.test(text)) return "行业";
  if (/活动|联动|展会|发布会|直面会|试玩|测试|预约|招募/.test(text)) return "活动";
  if (/评测|测评|体验|试玩报告|前瞻/.test(text)) return "评测";
  if (/攻略|教程|指南|技巧/.test(text)) return "攻略";
  if (/电竞|赛事|比赛|冠军|战队/.test(text)) return "赛事";
  if (/爆料|传闻|泄露|舅舅/.test(text)) return "传闻";
  return "";
}

function buildCountOptions(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
}

function sortNews(a, b) {
  const dayDiff = newsDayTime(b) - newsDayTime(a);
  if (dayDiff) return dayDiff;
  const heatDiff = (Number(b.heat) || 0) - (Number(a.heat) || 0);
  if (heatDiff) return heatDiff;
  return newsExactTime(b) - newsExactTime(a);
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
