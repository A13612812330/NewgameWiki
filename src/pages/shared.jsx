import { ExternalLink, Info } from "lucide-react";

export function PageTitle({ kicker, title, desc, actions }) {
  return (
    <section className="page-title">
      <div className="page-title-main">
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
      </div>
      <div className="title-actions">
        {desc ? (
          <button className="info-button" type="button" title={desc} aria-label={desc}>
            <Info size={14} />
          </button>
        ) : null}
        {actions}
      </div>
    </section>
  );
}

export function MetricCard({ label, value, detail, icon }) {
  return (
    <article className="metric-card">
      <span className="metric-icon">{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function GameCard({ item, compact = false }) {
  const { gameTags, statusTags, sourceTags } = splitTags(item);
  const titleParts = splitWelfareTitle(item);
  const displayTags = gameTags.slice(0, 3);
  const contentLines = buildContentPreview(item);
  const showMetaRow = displayTags.length > 0 || item.eventAt;

  return (
    <article className={`game-card ${compact ? "compact" : ""}`}>
      <div className="game-card-head">
        <div className="game-card-title">
          <GameIcon item={item} />
          <div className="game-title-stack">
            <div className="game-name-line">
              <h3>{titleParts.title}</h3>
              {titleParts.subtitle ? <span className="welfare-subtitle">{titleParts.subtitle}</span> : null}
            </div>
            {showMetaRow ? (
              <div className={`title-meta-row ${displayTags.length ? "" : "no-tags"}`}>
                <TagList tags={displayTags} tone="game" />
                <time className="inline-date">{formatMonthDay(item.eventAt)}</time>
              </div>
            ) : null}
          </div>
        </div>
        <div className="status-panel">
          <div className="status-row">
            {statusTags.map((tag) => (
              <b className={statusPillClass(tag)} key={tag}>
                {cleanLabel(tag)}
              </b>
            ))}
          </div>
        </div>
      </div>

      <div className="content-box">
        <p>{contentLines[0] || "暂无详细内容"}</p>
        {!compact && contentLines[1] ? <p>{contentLines[1]}</p> : null}
      </div>

      <div className="card-footer">
        <div className="footer-tags">
          <TagList tags={sourceTags} tone="source" />
        </div>
        {item.detailUrl ? (
          <a className="source-link" href={item.detailUrl} target="_blank" rel="noreferrer">
            原文 <ExternalLink size={12} />
          </a>
        ) : (
          <span className="source-link disabled">待详情</span>
        )}
      </div>
    </article>
  );
}

export function CalendarList({ items }) {
  return (
    <section className="panel calendar-panel">
      <SectionHead kicker="Calendar" title="更新时间日历" compact />
      <div className="calendar-list">
        {items.map((item) => {
          const calendarLabel = calendarStatusLabel(item);
          return (
            <a className="calendar-item" href={item.detailUrl || item.originalUrl} target="_blank" rel="noreferrer" key={item.id}>
              <time>{formatMonthDay(item.eventAt)}</time>
              <GameIcon item={item} small />
              <strong>{item.gameName}</strong>
              <span className={`calendar-status ${statusClass(calendarLabel)}`}>{calendarLabel}</span>
              <em>{platformAbbr(item)}</em>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export function TimeTree({ items, limit = 10, home = false }) {
  const rows = [...items]
    .sort((left, right) => {
      if (home) return new Date(left.eventAt) - new Date(right.eventAt);
      return new Date(right.eventAt) - new Date(left.eventAt);
    })
    .slice(0, limit);
  return (
    <div className="time-tree">
      {rows.map((item) => {
        const { gameTags, sourceTags } = splitTags(item);
        return (
          <a className="time-tree-row" href={item.detailUrl || item.originalUrl} target="_blank" rel="noreferrer" key={item.id}>
            <time>{formatMonthDay(item.eventAt)}</time>
            <div className="time-tree-box">
              <GameIcon item={item} small />
              <div className="time-tree-main">
                <strong>{item.gameName}</strong>
                {gameTags.length ? (
                  <div className="time-tree-game-tags">
                    <TagList tags={gameTags.slice(0, 3)} tone="game" />
                  </div>
                ) : (
                  <span>{cleanLabel(item.status)} · {cleanLabel(item.eventType)}</span>
                )}
              </div>
              <div className="time-tree-tags">
                <em>{home ? sourceOnlyAbbr(item) : platformAbbr(item)}</em>
                {!home && sourceTags.length > 1 ? <span className="source-count-chip">{sourceTags.length}源</span> : null}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

export function SectionHead({ kicker, title, note, compact = false, action }) {
  return (
    <div className={`section-head ${compact ? "compact" : ""}`}>
      <div>
        <p className="kicker">{kicker}</p>
        <h2>{title}</h2>
      </div>
      {action || (note ? <span>{note}</span> : null)}
    </div>
  );
}

export function TagList({ tags, tone = "default" }) {
  const unique = [...new Set(asList(tags).map(cleanLabel).filter(Boolean))].slice(0, 6);
  return (
    <div className={`tag-list ${tone}`}>
      {unique.map((tag) => <span key={tag}>{tag}</span>)}
    </div>
  );
}

export function GameIcon({ item, small = false }) {
  return (
    <span className={`game-icon ${small ? "small" : ""}`} aria-hidden="true">
      {item.iconUrl ? <img src={proxiedImage(item.iconUrl)} alt="" loading={small ? "lazy" : "eager"} /> : (item.icon || item.gameName.slice(0, 1))}
    </span>
  );
}

export function platformAbbr(item) {
  const source = cleanLabel(asList(item.sources)[0] || "");
  const map = {
    TapTap: "TapTap",
    好游快爆: "快爆",
    九游: "九游",
    小七手游: "小七",
    果盘游戏: "果盘",
    一元手游: "一元",
    爱趣游戏: "爱趣",
    Steam: "Steam",
    综合资讯: "综合",
  };
  return map[source] || source || "来源";
}

function proxiedImage(url) {
  return `/api/image?url=${encodeURIComponent(url)}`;
}

function sourceOnlyAbbr(item) {
  const list = [...new Set(asList(item.sources).map(cleanLabel).filter(Boolean))];
  return list.join(" / ");
}

function splitWelfareTitle(item) {
  const platform = cleanLabel(item.platform);
  const pool = cleanLabel(item.pool);
  const isWelfare = platform === "福利游戏" || /福利/.test(pool);
  const rawTitle = cleanLabel(item.gameName);
  if (!isWelfare) return { title: rawTitle, subtitle: "" };

  const dashMatch = rawTitle.match(/^(.+?)\s*[--]\s*(.+)$/);
  if (dashMatch) return { title: dashMatch[1].trim(), subtitle: dashMatch[2].trim() };

  const bracketMatch = rawTitle.match(/^(.+?)[（(]([^（）()]+)[）)]$/);
  if (bracketMatch) return { title: bracketMatch[1].trim(), subtitle: bracketMatch[2].trim() };

  return { title: rawTitle, subtitle: "" };
}

function splitTags(item) {
  const sourceTags = [...new Set(asList(item.sources).map(cleanLabel).filter(Boolean))];
  const statusTags = [...new Set([normalizeStatus(item.status)].filter(Boolean))];
  const gameplayTags = asList(item.gameplayTags);
  const rawGameTags = gameplayTags.length ? gameplayTags : asList(item.tags);
  const blockedGameTags = new Set([
    ...statusTags,
    '上线/测试',
    '更新',
    '活动/联动',
    '新游',
    '开测',
    '预约',
    '上线',
    '今日上线',
    '即将上线',
    '首发',
    '版本更新',
    '活动',
    '联动',
    '动态',
  ]);

  const gameTags = [...new Set(rawGameTags.map(cleanLabel).filter(Boolean))]
    .filter((tag) => !sourceTags.includes(tag) && !blockedGameTags.has(tag) && !isStatusLike(tag))
    .slice(0, 6);

  return { gameTags, statusTags, sourceTags };
}

export function buildContentPreview(item) {
  const parts = [item.updateContent, item.summary]
    .flatMap((value) => String(value || '').split('\n'))
    .map((value) => normalizeSentence(value))
    .filter(Boolean);

  const unique = [];
  for (const part of parts) {
    if (!unique.some((existing) => existing.includes(part) || part.includes(existing))) unique.push(part);
  }

  return [...unique].sort((left, right) => sentenceScore(right) - sentenceScore(left)).slice(0, 2);
}

function normalizeSentence(value) {
  return cleanLabel(value)
    .replace(/\s+/g, ' ')
    .replace(/(预约|下载|试玩)\s*$/g, '')
    .replace(/参与全面战场招募赢体验服资格/g, '')
    .replace(/预创角开启[，,]?\s*/g, '')
    .replace(/^(\d{1,2}:\d{2})\s+/g, '$1 ')
    .replace(/([，。；;])\1+/g, '$1')
    .replace(/^[,，。；;\s]+/, '')
    .replace(/\s*([，。；;])\s*/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sentenceScore(value) {
  let score = Math.min(value.length, 120);
  if (/(版本|赛季|上线|更新|联动|返场|开启|登场|开测|首测|公测|新增)/.test(value)) score += 50;
  if (/^\d{1,2}:\d{2}/.test(value)) score += 12;
  if (/预约|下载|试玩/.test(value)) score -= 18;
  if (/^(首发|预约|开测|新游|上线|动态)$/.test(value)) score -= 90;
  return score;
}

function statusClass(status) {
  const value = cleanLabel(status);
  if (/活动|联动/.test(value)) return 'status-hot';
  if (/更新|版本|赛季|返场/.test(value)) return 'status-live';
  if (/预约/.test(value)) return 'status-reserve';
  if (/上线|测试|开测|首发|新游|公测|内测|首测|终测/.test(value)) return 'status-test';
  return 'status-normal';
}

function statusPillClass(status) {
  const value = cleanLabel(status);
  if (/活动|联动/.test(value)) return 'pill-hot';
  if (/更新|版本|赛季|返场/.test(value)) return 'pill-live';
  if (/预约/.test(value)) return 'pill-reserve';
  if (/上线|测试|开测|首发|新游|公测|内测|首测|终测/.test(value)) return 'pill-test';
  return 'pill-normal';
}

function normalizeStatus(value) {
  const text = cleanLabel(value);
  if (!text) return '';
  if (['上线/测试', '更新', '活动/联动'].includes(text)) return text;
  if (/活动|联动/.test(text)) return '活动/联动';
  if (/更新|版本|赛季|返场/.test(text)) return '更新';
  if (/上线|测试|开测|首发|新游|预约|公测|内测|首测|终测/.test(text)) return '上线/测试';
  return text;
}

function normalizeEventType(value) {
  const text = cleanLabel(value);
  if (!text) return '';
  if (['上线/测试', '更新', '活动/联动'].includes(text)) return '';
  if (/活动|联动/.test(text)) return '活动/联动';
  if (/更新|版本|赛季|返场/.test(text)) return '更新';
  if (/上线|测试|开测|首发|新游|预约|公测|内测|首测|终测/.test(text)) return '上线/测试';
  return text;
}

function calendarStatusLabel(item) {
  const status = normalizeStatus(item.status);
  if (['上线/测试', '更新', '活动/联动'].includes(status)) return status;
  const content = buildContentPreview(item).join(' ');
  if (/活动|联动/.test(status) || /活动|联动/.test(cleanLabel(item.status))) return '活动/联动';
  if (/更新|版本|赛季|返场/.test(status) || /更新|版本|赛季|返场/.test(content)) return '更新';
  return status || normalizeEventType(item.eventType) || '上线/测试';
}

function isStatusLike(value) {
  const text = cleanLabel(value);
  return text.includes('上线/测试') || text.includes('活动/联动') || /(更新|新游|开测|预约|上线|今日上线|即将上线|首发|版本更新|活动|联动|动态|公测|内测|首测|终测)/.test(text);
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/[|/、,，s]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function cleanLabel(value) {
  return String(value || "")
    .replace(/\?+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMonthDay(value) {
  return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
