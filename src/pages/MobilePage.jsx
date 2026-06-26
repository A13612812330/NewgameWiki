import { useMemo, useState } from "react";
import { CalendarClock, Gamepad2, Tags } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { GameCard, MetricCard, PageTitle, SectionHead, TimeTree } from "./shared.jsx";

const tabs = ["全部", "新游", "版本更新", "开测", "预约"];

export default function MobilePage() {
  const [activeTab, setActiveTab] = useState("全部");
  const { mobileGames, loading, error } = useGameData();
  const items = useMemo(() => {
    const all = [...mobileGames].sort((left, right) => new Date(right.eventAt) - new Date(left.eventAt));
    if (activeTab === "全部") return all;
    return all.filter((item) => item.eventType === activeTab || item.status === activeTab || item.tags.includes(activeTab));
  }, [activeTab, mobileGames]);

  return (
    <main className="page-grid">
      <PageTitle kicker="Mobile" title="手游" desc="公共手游池只展示真实抓取数据；缺少来源详情页的记录进入后台问题队列。" />
      {loading ? <section className="panel empty-search">正在读取今日抓取数据...</section> : null}
      {error ? <section className="panel empty-search">数据读取失败：{error}</section> : null}
      <section className="metrics-grid three">
        <MetricCard label="手游动态" value={mobileGames.length} detail="今日真实抓取" icon={<Gamepad2 size={18} />} />
        <MetricCard label="来源平台" value="3" detail="Tap / 快爆 / 九游" icon={<Tags size={18} />} />
        <MetricCard label="时间范围" value="今天" detail="按日期排序" icon={<CalendarClock size={18} />} />
      </section>
      <div className="tab-bar" role="tablist" aria-label="手游筛选">{tabs.map((tab) => <button className={activeTab === tab ? "active" : ""} type="button" onClick={() => setActiveTab(tab)} key={tab}>{tab}</button>)}</div>
      <section className="panel section-block"><SectionHead kicker="Recent" title="最近动态" />{items.length ? <TimeTree items={items} limit={10} /> : <div className="empty-search inline">暂无手游数据，请在后台手动抓取今日数据。</div>}</section>
      <section className="game-grid">{items.map((item) => <GameCard item={item} key={item.id} />)}</section>
    </main>
  );
}
