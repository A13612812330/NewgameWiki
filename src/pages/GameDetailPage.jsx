import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { allCalendarItems } from "../mock/data.js";
import { GameIcon, PageTitle, SectionHead, TagList } from "./shared.jsx";

export default function GameDetailPage() {
  const { id } = useParams();
  const item = allCalendarItems.find((entry) => entry.id === id);

  if (!item) {
    return (
      <main className="page-grid">
        <PageTitle kicker="Detail" title="未找到游戏" desc="当前详情记录不存在，可能来自旧链接。" />
        <section className="panel empty-search">
          <Link className="source-link" to="/"><ArrowLeft size={13} /> 返回首页</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-grid detail-page">
      <PageTitle
        kicker="Game Detail"
        title={item.gameName}
        desc="详情页会承接聚合后的游戏档案，后续真实数据接入后展示图标、来源记录、更新时间、清洗结果和原文入口。"
        actions={<Link className="source-link detail-back" to="/"><ArrowLeft size={13} /> 返回</Link>}
      />

      <section className="panel detail-hero">
        <GameIcon item={item} />
        <div className="detail-main">
          <div className="detail-status">
            <span>{item.status}</span>
            <span>{item.eventType}</span>
            <time>{new Date(item.eventAt).toLocaleDateString("zh-CN")}</time>
          </div>
          <h2>{item.gameName}</h2>
          <p>{item.summary}</p>
        </div>
        <a className="source-link detail-original" href={item.originalUrl} target="_blank" rel="noreferrer">
          打开来源 <ExternalLink size={12} />
        </a>
      </section>

      <section className="panel detail-section">
        <SectionHead kicker="Content" title="更新内容" compact />
        <div className="detail-content-box">{item.updateContent}</div>
      </section>

      <section className="panel detail-section">
        <SectionHead kicker="Tags" title="标签与来源" compact />
        <div className="detail-tags">
          <div>
            <strong>游戏标签</strong>
            <TagList tags={item.tags} tone="game" />
          </div>
          <div>
            <strong>来源平台</strong>
            <TagList tags={item.sources} tone="source" />
          </div>
        </div>
      </section>
    </main>
  );
}
