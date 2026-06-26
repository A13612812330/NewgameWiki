import { Flame, Monitor, Store } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { GameCard, MetricCard, PageTitle, SectionHead, TimeTree } from "./shared.jsx";

export default function PcPage() {
  const { pcGames } = useGameData();
  return (
    <main className="page-grid">
      <PageTitle
        kicker="PC / Console / Steam"
        title="端游 / PC / Steam"
        desc="该模块第一阶段只做模拟热游与资讯结构。真实 Steam、端游、主机来源将在爬虫优化阶段单独接入。"
      />
      <section className="metrics-grid three">
        <MetricCard label="热游池" value="3" detail="模拟热门游戏" icon={<Flame size={18} />} />
        <MetricCard label="Steam 来源" value="待接入" detail="后续独立配置" icon={<Store size={18} />} />
        <MetricCard label="主机资讯" value="待接入" detail="不混入手游池" icon={<Monitor size={18} />} />
      </section>
      <section className="panel section-block">
        <SectionHead kicker="Recent" title="最近动态" />
        <TimeTree items={pcGames} limit={10} />
      </section>
      <section className="game-grid">
        {pcGames.map((item) => <GameCard item={item} key={item.id} />)}
      </section>
    </main>
  );
}

