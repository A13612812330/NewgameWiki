import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { GameCard, PageTitle, SectionHead, TimeTree } from "./shared.jsx";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const { allCalendarItems } = useGameData();
  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return allCalendarItems.filter((item) => [item.gameName, item.status, item.eventType, item.sources.join(" "), item.tags.join(" "), item.summary].join(" ").toLowerCase().includes(keyword));
  }, [query, allCalendarItems]);

  return (
    <main className="page-grid search-page">
      <PageTitle kicker="Search" title="搜索" desc="搜索当前真实抓取数据。" />
      <label className="search-page-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入游戏、来源、标签" autoFocus /><button type="button">搜索</button></label>
      {query.trim() ? <><section className="panel section-block search-results-panel"><SectionHead kicker="Timeline" title="时间树结果" note={`${results.length} 条结果`} compact /><TimeTree items={results} limit={12} /></section><section className="panel section-block search-results-panel"><SectionHead kicker="Cards" title="详细结果" compact /><div className="game-grid">{results.map((item) => <GameCard item={item} key={item.id} />)}</div></section></> : <section className="panel empty-search">输入关键词后显示搜索结果。</section>}
    </main>
  );
}
