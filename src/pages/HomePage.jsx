import { AlertTriangle, CalendarClock, Database, Gamepad2 } from "lucide-react";
import { useGameData } from "../data/useGameData.js";
import { buildContentPreview, CalendarList, GameCard, MetricCard, PageTitle, SectionHead, TimeTree } from "./shared.jsx";

export default function HomePage() {
  const { allCalendarItems, metrics, mobileGames, pcGames, welfareGames, loading, error } = useGameData();
  const latestMobile = sortForUpcoming(mobileGames);
  const latestWelfare = sortForHome(welfareGames);
  const latestPc = sortForHome(pcGames);

  return (
    <main className="page-grid">
      <PageTitle kicker="Dashboard" title="游戏资讯总览" desc="首页展示整理后的手游、福利、端游与 Steam 内容。" />
      {loading ? <section className="panel empty-search">正在读取今日抓取数据...</section> : null}
      {error ? <section className="panel empty-search">数据读取失败：{error}</section> : null}
      <section className="metrics-grid home-metrics">
        <MetricCard label="全站游戏池" value={metrics.totalGames} detail="" icon={<Database size={18} />} />
        <MetricCard label="手游池" value={metrics.mobilePool} detail="" icon={<Gamepad2 size={18} />} />
        <MetricCard label="福利池" value={metrics.welfarePool} detail="" icon={<CalendarClock size={18} />} />
        <MetricCard label="待整理" value={metrics.cleanupIssues} detail="" icon={<AlertTriangle size={18} />} />
      </section>
      <div className="home-layout">
        <div className="content-stack">
          <HomeModule kicker="Mobile" title="手游最新内容" items={latestMobile} featureCount={2} treeLimit={7} />
          <HomeModule kicker="Welfare" title="福利新游" items={latestWelfare} featureCount={2} treeLimit={6} />
          <HomeModule kicker="PC / Steam" title="端游与 Steam 热门资讯" items={latestPc} featureCount={2} treeLimit={6} />
        </div>
        <CalendarList items={allCalendarItems.slice(0, 18)} />
      </div>
    </main>
  );
}

function HomeModule({ kicker, title, items, featureCount, treeLimit }) {
  return (
    <section className="panel section-block">
      <SectionHead kicker={kicker} title={title} />
      {items.length ? (
        <>
          <div className="feature-grid two">
            {items.slice(0, featureCount).map((item) => <GameCard item={item} key={item.id} />)}
          </div>
          <TimeTree items={items.slice(featureCount)} limit={treeLimit} home />
        </>
      ) : (
        <div className="empty-search inline">暂无数据，请在后台手动抓取今日内容。</div>
      )}
    </section>
  );
}

function sortForHome(items) {
  return [...items].sort((left, right) => {
    const score = contentScore(right) - contentScore(left);
    if (score !== 0) return score;
    return new Date(right.eventAt) - new Date(left.eventAt);
  });
}

function sortForUpcoming(items) {
  return [...items].sort((left, right) => {
    const dateDiff = new Date(left.eventAt) - new Date(right.eventAt);
    if (dateDiff !== 0) return dateDiff;
    return contentScore(right) - contentScore(left);
  });
}

function contentScore(item) {
  const text = [item.summary, item.updateContent].filter(Boolean).join(" ");
  const contentLines = buildContentPreview(item);
  const summary = String(item.summary || "").trim();
  const weakWords = ["首发", "预约", "上线", "开测", "活动", "删档", "内测", "公测", "测试", "动态"];

  let score = Math.min(text.length, 160);
  if (item.iconUrl) score += 12;
  if (contentLines.length) score += 30;
  if (contentLines.some((line) => /(版本|赛季|上线|更新|联动|返场|开启|登场)/.test(line))) score += 45;
  if (["抓取", "保留游戏专区", "开测表"].some((word) => text.includes(word))) score -= 80;
  if (weakWords.some((word) => summary === word || summary.startsWith(word + " -"))) score -= 60;
  if (!contentLines.length) score -= 120;
  return score;
}
