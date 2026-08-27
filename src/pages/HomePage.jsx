import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Database, Gamepad2, Gift, Monitor, MoreHorizontal, X } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { CalendarList, FocusCard, GameCard, GameIcon, MetricCard, NewsRow, PageTitle, SectionHead } from "./shared.jsx";
import { recordDayTime, sortByTodayFuturePast, startOfLocalDay } from "../utils/timeSort.js";

export default function HomePage() {
  const { allCalendarItems, metrics, mobileGames, welfareGames, steamGames, steamNewGames, pcNews, loading, error } = useGameData();
  const [focusOpen, setFocusOpen] = useState(false);
  const totalPool = mobileGames.length + welfareGames.length + steamGames.length + steamNewGames.length + pcNews.length;
  const pcPoolTotal = steamGames.length + steamNewGames.length + pcNews.length;
  const focusAll = useMemo(() => recentFocusGames(mobileGames), [mobileGames]);
  const focus = focusAll.slice(0, 8);
  const importantMobile = importantGames(mobileGames).slice(0, 4);
  const importantWelfare = importantGames(welfareGames).slice(0, 4);
  const importantSteam = [...steamGames].sort(sortByPlayers).slice(0, 5);
  const importantSteamNew = [...steamNewGames].sort(sortBySteamNew).slice(0, 5);
  const pcNewsGroups = buildPcNewsGroups(pcNews);

  return (
    <main className="page-grid home-page">
      <PageTitle kicker="Home" title="首页" desc={HOME_INFO} />
      {loading ? <section className="panel empty-search">正在读取数据...</section> : null}
      {error ? <section className="panel empty-search">数据读取失败：{error}</section> : null}
      <section className="metrics-strip">
        <MetricCard label="全部数据池" value={totalPool || metrics.totalGames} detail="手机 / 福利 / 端游 / 资讯" icon={<Database size={16} />} />
        <MetricCard label="手机游戏" value={mobileGames.length || metrics.mobilePool} detail="TapTap / 快爆 / 九游" icon={<Gamepad2 size={16} />} />
        <MetricCard label="福利游戏" value={welfareGames.length || metrics.welfarePool} detail="小七手游" icon={<Gift size={16} />} />
        <MetricCard label="端游 / 资讯" value={pcPoolTotal || metrics.pcPool} detail={`Steam ${steamGames.length} / 新游 ${steamNewGames.length} / 资讯 ${pcNews.length}`} icon={<Monitor size={16} />} />
      </section>
      <div className="home-board">
        <div className="home-main-column">
          <section className="panel focus-panel">
            <SectionHead title="近期重点" action={<button className="section-more-button" type="button" onClick={() => setFocusOpen(true)}><MoreHorizontal size={15} />更多</button>} />
            <FocusCarousel items={focus} />
          </section>
          <section className="panel important-panel">
            <SectionHead title="重要游戏" compact />
            <div className="important-groups">
              <div className="important-group">
                <div className="important-group-head"><span>手机游戏</span></div>
                <div className="important-grid">{importantMobile.map((item) => <GameCard item={item} compact gameTagLimit={5} key={item.id} />)}</div>
              </div>
              <div className="important-group">
                <div className="important-group-head"><span>福利游戏</span></div>
                <div className="important-grid">{importantWelfare.map((item) => <GameCard item={item} compact gameTagLimit={5} key={item.id} />)}</div>
              </div>
            </div>
          </section>
          <section className="panel pc-home-panel">
            <SectionHead title="重要端游" compact />
            <div className="pc-home-groups">
              <PcHomeGroup title="Steam游戏" items={importantSteam} />
              <PcHomeGroup title="Steam新游" items={importantSteamNew} />
              <PcNewsHomeGroups groups={pcNewsGroups} />
            </div>
          </section>
        </div>
        <aside className="home-side-column">
          <CalendarList groups={[
            { key: "mobile", label: "手机游戏", count: mobileGames.length, items: mobileGames, todayFutureOnly: true, futureLimit: 5 },
            { key: "welfare", label: "福利游戏", count: welfareGames.length, items: welfareGames, todayFutureOnly: true, futureLimit: 5 },
            { key: "steam", label: "Steam游戏", count: steamGames.length, items: steamGames, sortItems: sortByPlayers, variant: "steamPlayers" },
            { key: "steam-new", label: "Steam新游", count: steamNewGames.length, items: steamNewGames, todayFutureOnly: true, futureLimit: 5 },
          ]} items={allCalendarItems} limit={20} showCounts={false} />
        </aside>
      </div>
      {focusOpen ? <FocusMoreModal items={focusAll} onClose={() => setFocusOpen(false)} /> : null}
    </main>
  );
}

const HOME_INFO = {
  title: "首页内容说明",
  summary: "首页是当前 SQLite 主数据的聚合视图，用来快速查看手游、福利、Steam、Steam 新游和资讯的重点内容。",
  sections: [
    { title: "展示内容", items: ["顶部指标来自 /api/data 的各数据池数量。", "近期重点优先展示内容较完整的手游记录。", "重要游戏分为手机游戏、福利游戏、Steam 游戏、Steam 新游和端游资讯。"] },
    { title: "右侧日历", items: ["手机、福利、Steam 新游按今日 + 未来展示。", "Steam 游戏按在线人数展示，不按日期。", "资讯不进入首页右侧游戏日历，只在端游资讯区域展示。"] },
  ],
};

function PcNewsHomeGroups({ groups }) {
  return (
    <div className="pc-home-group pc-news-platform-group">
      <div className="pc-home-group-head"><span>端游资讯</span></div>
      <div className="pc-news-platforms">
        {groups.map((group) => (
          <div className="pc-news-platform" key={group.source}>
            <div className="pc-news-platform-head"><span>{group.source}</span></div>
            <div className="pc-mini-grid">{group.items.map((item) => <NewsRow item={item} key={item.id} />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildPcNewsGroups(items) {
  return ["机核", "游民星空", "游侠网"].map((source) => ({
    source,
    items: items.filter((item) => (item.sources || []).includes(source)).sort(sortByPublishDate).slice(0, 3),
  })).filter((group) => group.items.length);
}

function PcHomeGroup({ title, items }) {
  return (
    <div className="pc-home-group">
      <div className="pc-home-group-head"><span>{title}</span></div>
      <div className="pc-mini-grid">{items.map((item) => <NewsRow item={item} key={item.id} />)}</div>
    </div>
  );
}

function FocusCarousel({ items }) {
  const ref = useRef(null);
  const scroll = (direction) => {
    const node = ref.current;
    if (!node) return;
    const distance = Math.max(320, node.clientWidth - 44);
    const maxLeft = node.scrollWidth - node.clientWidth;
    const nextLeft = node.scrollLeft + direction * distance;
    const target = nextLeft < 8 ? maxLeft : nextLeft > maxLeft - 8 ? 0 : nextLeft;
    node.scrollTo({ left: target, behavior: "smooth" });
  };

  return (
    <div className="focus-carousel">
      <button className="focus-nav prev" type="button" aria-label="上一组重点游戏" onClick={() => scroll(-1)}><ChevronLeft size={20} /></button>
      <div className="focus-grid" ref={ref}>{items.map((item) => <FocusCard item={item} key={item.id} />)}</div>
      <button className="focus-nav next" type="button" aria-label="下一组重点游戏" onClick={() => scroll(1)}><ChevronRight size={20} /></button>
    </div>
  );
}

function FocusMoreModal({ items, onClose }) {
  const pageSize = 10;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = items.slice(safePage * pageSize, safePage * pageSize + pageSize);
  return (
    <div className="modal-backdrop focus-more-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="focus-more-modal" role="dialog" aria-modal="true" aria-label="近期重点游戏">
        <div className="focus-more-head">
          <div>
            <p className="kicker">Focus</p>
            <h3>近期重点游戏</h3>
            <span>共 {items.length} 个，一页 10 个</span>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose}><X size={16} />关闭</button>
        </div>
        <div className="focus-more-list">
          {pageItems.length ? pageItems.map((item, index) => <FocusMoreRow item={item} rank={safePage * pageSize + index + 1} key={item.id} />) : <div className="empty-search inline">暂无重点游戏。</div>}
        </div>
        <div className="focus-more-pagination">
          <span>第 {safePage + 1} / {pageCount} 页</span>
          <div>
            <button type="button" disabled={safePage <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>上一页</button>
            <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>下一页</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FocusMoreRow({ item, rank }) {
  const tags = uniqueText([...(item.gameplayTags || []), item.status].filter(Boolean)).slice(0, 4);
  const sources = uniqueText(item.sources || []).slice(0, 2);
  const content = String(item.summary || item.updateContent || item.status || "暂无整理内容").replace(/\s+/g, " ").trim();
  const href = item.detailUrl || item.originalUrl || "#";
  return (
    <a className="focus-more-row" href={href} target="_blank" rel="noreferrer">
      <b>{String(rank).padStart(2, "0")}</b>
      <span className="focus-more-icon"><GameIcon item={item} small /></span>
      <div className="focus-more-main">
        <div className="focus-more-title"><strong>{item.gameName}</strong><time>{formatMonthDay(item.eventAt)}</time></div>
        <p>{content}</p>
        <div className="focus-more-tags">
          {tags.map((tag) => <em className="game" key={tag}>{tag}</em>)}
          {sources.map((tag) => <em className="source" key={tag}>{tag}</em>)}
        </div>
      </div>
    </a>
  );
}

function uniqueText(items = []) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function formatMonthDay(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "待定";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function recentFocusGames(items) {
  const today = startOfLocalDay(new Date()).getTime();
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
  const min = today - twoWeeksMs;
  const max = today + twoWeeksMs;
  return importantGames(items)
    .filter(isFocusPriorityGame)
    .filter((item) => {
      const time = recordDayTime(item);
      return time >= min && time <= max;
    });
}

function importantGames(items) {
  return [...items]
    .filter(isImportantGame)
    .sort((a, b) => sortByTodayFuturePast(a, b) || score(b) - score(a));
}

function sortByPlayers(a, b) {
  return (Number(b.lastKnownPlayers ?? b.currentPlayers) || 0) - (Number(a.lastKnownPlayers ?? a.currentPlayers) || 0);
}

function sortBySteamNew(a, b) {
  const aKnown = hasKnownSteamRelease(a);
  const bKnown = hasKnownSteamRelease(b);
  if (aKnown !== bKnown) return aKnown ? -1 : 1;
  if (aKnown && bKnown) return new Date(a.eventAt || 0) - new Date(b.eventAt || 0);
  const reserveDiff = (Number(b.recommendationCount) || 0) - (Number(a.recommendationCount) || 0);
  if (reserveDiff) return reserveDiff;
  return new Date(b.eventAt || 0) - new Date(a.eventAt || 0);
}

function hasKnownSteamRelease(item) {
  const text = String(item?.releaseText || "");
  if (!text || /即将|待定|宣布|coming soon/i.test(text)) return false;
  const date = new Date(item?.eventAt || "");
  return !Number.isNaN(date.getTime());
}

function sortByPublishDate(a, b) {
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

function isImportantGame(item = {}) {
  const statusText = [item.status, item.eventType, item.rawStatus, item.rawEventType, ...(item.tags || [])].join(" ");
  const contentText = [item.summary, item.updateContent, item.subtitle].join(" ").trim();
  const hasEventSignal = /(今日|上线|测试|开测|首发|预约|更新|活动|联动|福利|发售|即将)/.test(statusText + " " + contentText);
  if (!hasEventSignal) return false;
  if (!contentText && !/(更新|活动|联动|上线|测试|预约|首发)/.test(statusText)) return false;
  if (/无内容|暂无内容|无活动|暂无活动|无联动|暂无联动/.test(statusText + " " + contentText)) return false;
  return true;
}

function isFocusPriorityGame(item = {}) {
  const text = [item.status, item.eventType, item.rawStatus, item.rawEventType, item.summary, item.updateContent, ...(item.tags || [])].join(" ");
  return /(更新|活动|联动)/.test(text);
}

function score(item) {
  return String(item.summary || "").length + String(item.updateContent || "").length + (item.iconUrl ? 30 : 0) + ((item.sources || []).length * 8);
}
