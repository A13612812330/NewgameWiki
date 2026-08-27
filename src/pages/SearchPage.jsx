import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { CalendarList, GameCard, PageTitle, SectionHead, TimeTree } from "./shared.jsx";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const { allCalendarItems, mobileGames, welfareGames, steamNewGames, pcNews } = useGameData();
  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return allCalendarItems.filter((item) => [item.gameName, item.status, item.eventType, item.sources.join(" "), item.tags.join(" "), item.summary].join(" ").toLowerCase().includes(keyword));
  }, [query, allCalendarItems]);

  return (
    <main className="page-grid search-page">
      <PageTitle kicker="Search" title="搜索" desc="搜索当前真实抓取数据。" />
      <label className="search-page-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入游戏、来源、标签" autoFocus /><button type="button">搜索</button></label>
      {query.trim() ? <><section className="panel section-block search-results-panel"><SectionHead kicker="Timeline" title="时间树结果" note={`${results.length} 条结果`} compact /><TimeTree items={results} limit={12} /></section><section className="panel section-block search-results-panel"><SectionHead kicker="Cards" title="详细结果" compact /><div className="game-grid">{results.map((item) => <GameCard item={item} key={item.id} />)}</div></section></> : <div className="search-calendar-grid"><CalendarList title="手机游戏" kicker="Mobile" groups={[{ key: "mobile", label: "手游", count: mobileGames.length, items: mobileGames, todayFutureOnly: true, futureLimit: 5 }]} items={mobileGames} limit={20} /><CalendarList title="福利游戏" kicker="Welfare" groups={[{ key: "welfare", label: "福利", count: welfareGames.length, items: welfareGames, todayFutureOnly: true, futureLimit: 5 }]} items={welfareGames} limit={20} /><CalendarList title="端游" kicker="PC" groups={[{ key: "pc", label: "Steam新游", count: steamNewGames.length, items: steamNewGames, todayFutureOnly: true, futureLimit: 5 }]} items={steamNewGames} limit={20} /><CalendarList title="资讯" kicker="News" groups={[{ key: "news", label: "资讯", count: pcNews.length, items: pcNews }]} items={pcNews} limit={10} /></div>}
    </main>
  );
}
