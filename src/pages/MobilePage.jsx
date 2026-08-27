import { useMemo, useState } from "react";
import { CalendarClock, Gamepad2, Tags } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { CalendarList, GameCard, PageTitle, SectionHead } from "./shared.jsx";
import { sortByTodayFuturePast } from "../utils/timeSort.js";

const tabs = ["全部", "上线/测试", "更新", "活动/联动"];

export default function MobilePage() {
  const [activeTab, setActiveTab] = useState("全部");
  const { mobileGames, loading, error } = useGameData();
  const items = useMemo(() => {
    const sorted = [...mobileGames].sort(sortByTodayFuturePast);
    if (activeTab === "全部") return sorted;
    return sorted.filter((item) => item.status === activeTab || item.eventType === activeTab);
  }, [activeTab, mobileGames]);
  const priorityItems = useMemo(() => items.filter(isTodayEventOrActivity), [items]);
  const displayItems = priorityItems.length ? [...priorityItems, ...items.filter((item) => !priorityItems.some((priority) => priority.id === item.id))] : items;
  const mobileStats = useMemo(() => {
    const countByStatus = (status) => mobileGames.filter((item) => item.status === status || item.eventType === status).length;
    const countBySource = (keyword) => mobileGames.filter((item) => (item.sources || []).some((source) => source.includes(keyword))).length;
    return {
      statuses: [
        { label: "上线/测试", value: countByStatus("上线/测试") },
        { label: "更新", value: countByStatus("更新") },
        { label: "活动/联动", value: countByStatus("活动/联动") },
      ],
      sources: [
        { label: "TapTap", value: countBySource("Tap") },
        { label: "快爆", value: countBySource("快爆") },
        { label: "九游", value: countBySource("九游") },
      ],
    };
  }, [mobileGames]);

  return (
    <main className="page-grid mobile-page">
      <PageTitle kicker="Mobile" title="手机游戏" desc={MOBILE_INFO} />
      {loading ? <section className="panel empty-search">正在读取数据...</section> : null}
      {error ? <section className="panel empty-search">数据读取失败：{error}</section> : null}
      <section className="mobile-summary-strip">
        <article className="mobile-summary-total">
          <span className="metric-icon"><Gamepad2 size={16} /></span>
          <div>
            <p>手机游戏</p>
            <strong>{mobileGames.length}</strong>
            <small>当前筛选 {items.length} 条，今日重点 {priorityItems.length} 条</small>
          </div>
        </article>
        <article className="mobile-summary-card">
          <div className="mobile-summary-card-title"><CalendarClock size={15} /><span>状态分布</span></div>
          <div className="mobile-summary-pills">{mobileStats.statuses.map((item) => <b key={item.label}>{item.label}<em>{item.value}</em></b>)}</div>
        </article>
        <article className="mobile-summary-card">
          <div className="mobile-summary-card-title"><Tags size={15} /><span>平台分布</span></div>
          <div className="mobile-summary-pills source">{mobileStats.sources.map((item) => <b key={item.label}>{item.label}<em>{item.value}</em></b>)}</div>
        </article>
      </section>
      <div className="tab-bar">{tabs.map((tab) => <button className={activeTab === tab ? "active" : ""} type="button" onClick={() => setActiveTab(tab)} key={tab}>{tab}</button>)}</div>
      <div className="content-with-sidebar">
        <section className="panel game-pool-panel home-card-panel">
          <SectionHead title="手机游戏" note={`${items.length} 条`} compact />
          <div className="game-card-grid">{displayItems.map((item) => <GameCard item={item} compact gameTagLimit={5} key={item.id} />)}</div>
        </section>
        <aside className="update-sidebar">
          <CalendarList groups={[{ key: "mobile", label: "手机游戏", count: items.length, items, todayFutureOnly: true, futureLimit: 5 }]} items={items} limit={20} />
        </aside>
      </div>
    </main>
  );
}

const MOBILE_INFO = {
  title: "手游页面说明",
  summary: "手游页展示 TapTap、好游快爆、九游聚合后的手机游戏数据，数据来自后台手游池。",
  sections: [
    { title: "筛选方式", items: ["顶部标签可按全部、上线/测试、更新、活动/联动切换。", "列表按当前筛选后的时间顺序展示。"] },
    { title: "右侧日历", items: ["日历同步后台数据池，不使用静态假数据。", "规则为今日 + 未来展示。", "状态胶囊展示上线/测试、更新、活动等状态。"] },
  ],
};

function isTodayEventOrActivity(item = {}) {
  const date = new Date(item.eventAt || "");
  const today = new Date();
  const isToday = !Number.isNaN(date.getTime()) && date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  const text = [item.status, item.eventType, item.rawStatus, item.rawEventType, item.summary, item.updateContent, ...(item.tags || [])].join(" ");
  return isToday && /(活动|联动|更新|上线|测试|开测|首发|预约)/.test(text);
}
