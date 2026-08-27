import { BadgePlus, Gift, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { useGameData } from "../data/useGameData.js";
import { CalendarList, GameCard, MetricCard, PageTitle, SectionHead } from "./shared.jsx";

export default function WelfarePage() {
  const { welfareGames, date } = useGameData();
  const [sortMode, setSortMode] = useState("time");
  const items = useMemo(() => [...welfareGames].sort(sortMode === "heat" ? sortByWelfareHeat : sortNewestFirst), [sortMode, welfareGames]);
  const today = date || new Date().toISOString().slice(0, 10);
  const todayNewCount = items.filter((item) => String(item.eventAt || "").startsWith(today)).length;
  const uncollectedCount = items.filter((item) => {
    const explicit = item.isCollected ?? item.collected ?? item.included ?? item.inPlatform;
    if (typeof explicit === "boolean") return !explicit;
    return /未收录|未入库|待收录/.test([item.collectionStatus, item.platformStatus, item.auditStatus].join(" "));
  }).length;
  return (
    <main className="page-grid welfare-page">
      <PageTitle kicker="Welfare" title="福利游戏" desc={WELFARE_INFO} />
      <section className="metrics-grid three compact-metrics">
        <MetricCard label="福利新游" value={items.length} detail="小七手游" icon={<Gift size={16} />} />
        <MetricCard label="今日上新" value={todayNewCount} detail={today} icon={<BadgePlus size={16} />} />
        <MetricCard label="未收录" value={uncollectedCount} detail="待接平台库对比" icon={<SearchX size={16} />} />
      </section>
      <div className="content-with-sidebar">
        <section className="panel game-pool-panel home-card-panel">
          <div className="section-head-with-actions">
            <SectionHead title="福利游戏" note={`${items.length} 条`} compact />
            <div className="sort-switch">
              <button className={sortMode === "time" ? "active" : ""} type="button" onClick={() => setSortMode("time")}>时间</button>
              <button className={sortMode === "heat" ? "active" : ""} type="button" onClick={() => setSortMode("heat")}>热度</button>
            </div>
          </div>
          <div className="welfare-grid">{items.map((item) => <GameCard item={item} compact gameTagLimit={5} key={item.id} />)}</div>
        </section>
        <aside className="update-sidebar">
          <CalendarList groups={[{ key: "welfare", label: "福利", count: items.length, items, todayFutureOnly: true, futureLimit: 5 }]} items={items} limit={20} />
        </aside>
      </div>
    </main>
  );
}

const WELFARE_INFO = {
  title: "福利页面说明",
  summary: "福利页展示小七手游来源的新游、预约、首发和福利信息，当前不收新服类内容。",
  sections: [
    { title: "指标口径", items: ["福利新游为当前福利池记录数。", "今日上新按当天 eventAt 统计。", "未收录用于后续对比平台库，当前按字段状态识别。"] },
    { title: "展示规则", items: ["列表按越新越靠前展示。", "右侧日历按今日 + 未来展示。", "游戏名后可展示副标题，例如折扣、免费版、福利摘要。"] },
  ],
};

function sortNewestFirst(a, b) {
  return new Date(b.eventAt || 0) - new Date(a.eventAt || 0);
}

function sortByWelfareHeat(a, b) {
  const heatDiff = welfareHeatValue(b) - welfareHeatValue(a);
  if (heatDiff) return heatDiff;
  return sortNewestFirst(a, b);
}

function welfareHeatValue(item = {}) {
  return Math.max(Number(item.playerCount) || 0, Number(item.reservationCount) || 0);
}
