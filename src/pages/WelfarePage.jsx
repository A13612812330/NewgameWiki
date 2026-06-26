import { useMemo, useState } from "react";
import { Gift, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { GameCard, MetricCard, PageTitle, SectionHead, TimeTree } from "./shared.jsx";

const sourceTabs = ["全部", "小七手游", "果盘游戏", "一元手游", "爱趣游戏"];

export default function WelfarePage() {
  const [activeSource, setActiveSource] = useState("全部");
  const [showRule, setShowRule] = useState(false);
  const { welfareGames } = useGameData();
  const items = useMemo(() => {
    const sorted = [...welfareGames].sort((left, right) => new Date(right.eventAt) - new Date(left.eventAt));
    if (activeSource === "全部") return sorted;
    return sorted.filter((item) => item.sources.includes(activeSource));
  }, [activeSource]);

  return (
    <main className="page-grid welfare-page">
      <PageTitle
        kicker="Welfare"
        title="福利"
        desc="福利游戏只收新游、预约、首发、开测，不收新服、开服、合服。来源包含小七手游、果盘游戏、一元手游、爱趣游戏。"
        actions={
          <button className="rule-tip-button" type="button" onClick={() => setShowRule((value) => !value)} title="查看抓取规则">
            <TriangleAlert size={16} />
          </button>
        }
      />

      <section className="metrics-grid three">
        <MetricCard label="福利新游" value={welfareGames.length} detail="模拟候选游戏" icon={<Gift size={18} />} />
        <MetricCard label="来源平台" value="4" detail="小七 / 果盘 / 一元 / 爱趣" icon={<Sparkles size={18} />} />
        <MetricCard label="排除规则" value="新服" detail="开服/合服不入池" icon={<ShieldCheck size={18} />} />
      </section>

      {showRule ? (
        <section className="panel rule-panel">
          <SectionHead kicker="Rule" title="抓取规则" compact />
          <div className="rule-grid">
            <span>保留：新游</span>
            <span>保留：预约</span>
            <span>保留：首发</span>
            <span>保留：开测/内测/公测</span>
            <b>排除：新服 / 开服 / 合服 / 服务器列表</b>
          </div>
        </section>
      ) : null}

      <div className="tab-bar" role="tablist" aria-label="福利游戏来源筛选">
        {sourceTabs.map((tab) => (
          <button className={activeSource === tab ? "active" : ""} type="button" onClick={() => setActiveSource(tab)} key={tab}>{tab}</button>
        ))}
      </div>

      <section className="panel section-block">
        <SectionHead kicker="Timeline" title="福利新游时间树" />
        <TimeTree items={items} limit={12} />
      </section>

      <section className="game-grid">
        {items.map((item) => <GameCard item={item} key={item.id} />)}
      </section>
    </main>
  );
}

