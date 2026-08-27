import { Flame, Gamepad2, Radio } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { CalendarList, MetricCard, NewsRow, PageTitle, SectionHead } from "./shared.jsx";

export default function PcPage() {
  const { steamGames, steamNewGames } = useGameData();
  const items = [...steamGames, ...steamNewGames];
  return (
    <main className="page-grid pc-page">
      <PageTitle kicker="PC" title="端游" desc={PC_INFO} />
      <section className="metrics-grid three compact-metrics">
        <MetricCard label="Steam游戏" value={steamGames.length} detail="按在线人数" icon={<Flame size={16} />} />
        <MetricCard label="Steam新游" value={steamNewGames.length} detail="按发售日期" icon={<Gamepad2 size={16} />} />
        <MetricCard label="Steam总池" value={items.length} detail="游戏 + 新游" icon={<Radio size={16} />} />
      </section>
      <div className="content-with-sidebar pc-layout">
        <section className="panel game-pool-panel">
          <SectionHead title="Steam 游戏池" note="Steam 游戏与新游合并展示，资讯已移到独立页面。" compact />
          <div className="pc-vertical-list pc-main-list">{items.map((item) => <NewsRow item={item} key={item.id} />)}</div>
        </section>
        <aside className="update-sidebar">
          <CalendarList title="端游动态" kicker="PC" groups={[
            { key: "steam", label: "Steam游戏", count: steamGames.length, items: steamGames, sortItems: (a, b) => (Number(b.lastKnownPlayers ?? b.currentPlayers) || 0) - (Number(a.lastKnownPlayers ?? a.currentPlayers) || 0), variant: "steamPlayers" },
            { key: "steam-new", label: "Steam新游", count: steamNewGames.length, items: steamNewGames, todayFutureOnly: true, futureLimit: 5 },
          ]} items={items} limit={20} />
        </aside>
      </div>
    </main>
  );
}

const PC_INFO = {
  title: "端游页面说明",
  summary: "端游页当前管理 Steam 游戏和 Steam 新游两个池，资讯已拆到独立资讯页。",
  sections: [
    { title: "Steam 游戏", items: ["按最近在线人数排序展示。", "右侧日历显示图标、游戏名和在线人数。", "在线人数缺失时显示待获取。"] },
    { title: "Steam 新游", items: ["只记录新游、预约、即将推出或有发售时间的新游记录。", "右侧日历按今日 + 未来展示。", "发售时间优先使用后端清洗后的 eventAt/releaseText。"] },
  ],
};
