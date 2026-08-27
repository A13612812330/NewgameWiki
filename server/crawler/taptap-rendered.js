import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://www.taptap.cn";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const browserCacheRoot = resolve(process.env.NEWWIKI_BROWSER_CACHE_DIR || join(root, "runtime-cache", "browser", "taptap"));
const renderedDetailLimit = Number(process.env.NEWWIKI_TAPTAP_RENDERED_DETAIL_LIMIT || 24);

export async function crawlTapTapRenderedSource({ date, url }) {
  const browser = await openBrowser();
  try {
    const client = browser.client;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.navigate", { url });
    await sleep(3500);
    await expandHidden(client);
    const payload = await client.send("Runtime.evaluate", { expression: extractScript(date), returnByValue: true });
    if (payload?.exceptionDetails) {
      throw new Error(JSON.stringify(payload.exceptionDetails));
    }
    const rows = normalizeRows(payload?.result?.value || [], date).filter((row) => ["focus", "big", "small"].includes(row.style));
    await enrichDetails(rows.slice(0, renderedDetailLimit), client);
    return rows.map((row) => toRecord(row, date, url));
  } finally {
    await browser.close();
  }
}

async function expandHidden(client) {
  const script = `(() => {
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const visible = (node) => {
      const r = node.getBoundingClientRect();
      const s = getComputedStyle(node);
      return r.width > 4 && r.height > 4 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const clickNode = (node) => {
      if (!node) return false;
      node.scrollIntoView?.({ block: 'center', inline: 'center' });
      node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      node.click?.();
      return true;
    };
    const nodes = [...document.querySelectorAll('button,a,div,span,[role="button"],svg')].filter(visible);
    const foldNodes = nodes
      .map((node) => ({ node, text: clean(node.innerText || node.textContent || '') }))
      .filter((item) => /\\u67e5\\u770b\\u6536\\u8d77\\u7684\\s*\\d+\\s*(?:\\u6b3e)?\\s*(?:\\u6e38\\u620f|\\u65b0\\u6e38)/.test(item.text))
      .sort((left, right) => left.text.length - right.text.length);
    if (foldNodes[0]) clickNode(foldNodes[0].node);
    for (const node of nodes) {
      const text = clean(node.innerText || node.textContent || '');
      if (!text.includes('\\u67e5\\u770b\\u6536\\u8d77\\u7684') && /\\u663e\\u793a\\u66f4\\u591a|\\u67e5\\u770b\\u66f4\\u591a|\\u66f4\\u591a\\u6e38\\u620f/.test(text)) clickNode(node);
    }
    const header = document.querySelector('.top-event-grid__header');
    const btn = header?.querySelector('button,svg,[role="button"],.tap-icon,.icon') || header;
    clickNode(btn);
  })()`;
  for (let index = 0; index < 4; index += 1) {
    await client.send("Runtime.evaluate", { expression: script, returnByValue: true });
    await sleep(450);
    await client.send("Runtime.evaluate", { expression: `window.scrollBy(0, Math.max(500, Math.floor(window.innerHeight * 0.75)))`, returnByValue: true });
    await sleep(450);
  }
  await client.send("Runtime.evaluate", { expression: `window.scrollTo(0, 0)`, returnByValue: true });
  await sleep(500);
}

function extractScript(date) {
  return `(() => {
    const today = ${JSON.stringify(date)};
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const url = (value) => { try { return new URL(value, location.origin).toString(); } catch { return ''; } };
    const parseDate = (text) => {
      const value = clean(text);
      const build = (month, day) => today.slice(0,4)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
      const range = value.match(/(\\d{1,2})\\/(\\d{1,2})-(\\d{1,2})\\/(\\d{1,2})/);
      if (range) {
        const start = build(range[1], range[2]);
        const end = build(range[3], range[4]);
        if (start <= today && today <= end) return today;
        return start >= today ? start : end;
      }
      const m = value.match(/(\\d{1,2})[\\/\\u6708](\\d{1,2})/);
      return m ? build(m[1], m[2]) : today;
    };
    const parseTime = (text) => clean(text).match(/(\\d{1,2}:\\d{2})/)?.[1] || '10:00';
    const statusPattern = /\\u4eca\\u65e5\\u4e0a\\u7ebf|\\u5373\\u5c06\\u4e0a\\u7ebf|\\u65b0\\u6e38\\u9884\\u7ea6|\\u65b0\\u54c1\\u9884\\u7ea6|\\u9884\\u7ea6|\\u9996\\u53d1|\\u4e0d\\u9650\\u91cf\\u6d4b\\u8bd5|\\u9650\\u91cf\\u6d4b\\u8bd5|\\u6d4b\\u8bd5\\u62db\\u52df|\\u6d4b\\u8bd5|\\u5f00\\u6d4b|\\u9884\\u4e0b\\u8f7d|\\u4e0b\\u8f7d\\u5df2\\u5f00\\u542f|\\u6298\\u6263|\\u65b0\\u7248\\u672c\\u66f4\\u65b0|\\u7248\\u672c\\u66f4\\u65b0|\\u66f4\\u65b0|\\u6d3b\\u52a8|\\u8054\\u52a8|\\u4e0a\\u7ebf/;
    const statusOf = (root, text) => {
      const direct = clean(root.querySelector('.event-type-label__title,.event-type-label,.daily-event-big-card__type,.top-event-card__bottom')?.innerText);
      return clean([direct,text].join(' ')).match(statusPattern)?.[0] || '\\u65b0\\u6e38';
    };
    const iconOf = (root) => {
      const imgs = [...root.querySelectorAll('img')];
      const img = imgs.find((n)=>/icon|appicon|_tap_appicon/i.test(n.currentSrc||n.src||n.alt||'')) || imgs.find((n)=>n.width<=100&&n.height<=100) || imgs[0];
      return img ? url(img.currentSrc || img.src) : '';
    };
    const linkOf = (root) => {
      const link = root.matches?.('a[href*="/app/"]') ? root : root.closest?.('a[href*="/app/"]') || root.querySelector?.('a[href*="/app/"]');
      const detailUrl = url(link?.href || link?.getAttribute?.('href') || '');
      return /\\/app\\/\\d+(?:[/?#]|$)/.test(detailUrl) && !/\\/topic(?:[/?#]|$)/.test(detailUrl) ? detailUrl : '';
    };
    const wordsOf = (text) => clean(text)
      .replace(/\\d{1,2}\\/\\d{1,2}(?:-\\d{1,2}\\/\\d{1,2})?/g,' ')
      .replace(/\\d{1,2}:\\d{2}\\s*\\u5f00\\u59cb/g,' ')
      .replace(/\\d+(?:\\.\\d+)?/g,' ')
      .split(/\\s+/).map(clean).filter(Boolean);
    const splitTags = (value) => clean(value).split(/[\\s,，、/|]+/).map(clean).filter(Boolean);
    const jsonTagsOf = () => {
      const tags = [];
      for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')]) {
        const raw = clean(script.textContent || '');
        if (!raw) continue;
        let data;
        try { data = JSON.parse(raw); } catch { continue; }
        const walk = (node) => {
          if (!node) return;
          if (Array.isArray(node)) return node.forEach(walk);
          if (typeof node !== 'object') return;
          if (node.genre) tags.push(...splitTags(node.genre));
          if (node.applicationSubCategory) tags.push(...splitTags(node.applicationSubCategory));
          if (node.mainEntity) walk(node.mainEntity);
        };
        walk(data);
      }
      return tags;
    };
    const tagsOf = (root, text, gameName, status) => {
      const explicit = [...root.querySelectorAll('.tap-label-tag,.daily-event-app-info__tag div,.daily-event-app-info__tags div,.tap-router.tap-label-tag,.game-label-tag,.label-tag,.tag-list .tag,.tag-list span,.tag-list a,[class*="tag"],[class*="label"]')].map((n)=>clean(n.innerText)).filter(Boolean);
      const blocked = new Set([gameName,status,'\\u65b0\\u6e38','\\u9996\\u53d1','\\u9884\\u7ea6','\\u4e0a\\u7ebf','\\u5f00\\u6d4b','\\u6d4b\\u8bd5','\\u67e5\\u770b','\\u5f00\\u59cb','\\u6682\\u65e0\\u8bc4\\u5206','\\u529f\\u80fd','\\u7b80\\u4ecb','\\u70ed\\u95e8','\\u8bc4\\u5206']);
      return [...new Set([...jsonTagsOf(), ...explicit])].filter((tag)=>tag&&tag.length>=2&&tag.length<=16&&!blocked.has(tag)&&!statusPattern.test(tag)&&!/^\\d/.test(tag)&&/[\\u4e00-\\u9fa5A-Za-z]/.test(tag)).slice(0,8);
    };
    const nameOf = (root, text) => {
      for (const s of ['.daily-event-app-info__title','.top-event-card__text','.app-card-title','.name em','.name','h3','h2']) {
        const v=clean(root.querySelector(s)?.innerText);
        if(v&&v.length<=40&&!statusPattern.test(v)&&!/\\u67e5\\u770b|\\u4e0b\\u8f7d|\\u8bc4\\u5206/.test(v)) return v;
      }
      return wordsOf(text).find((line)=>line&&line.length<=40&&!statusPattern.test(line)&&!/\\u67e5\\u770b|\\u4e0b\\u8f7d|\\u8bc4\\u5206|\\u5f00\\u59cb|\\u6682\\u65e0/.test(line)) || '';
    };
    const cleanedSummary = (text, gameName, status) => clean(text
      .replace(gameName,' ')
      .replace(status,' ')
      .replace(/\\d+(?:\\.\\d+)?/g,' ')
      .replace(/\\d{1,2}\\/\\d{1,2}(?:-\\d{1,2}\\/\\d{1,2})?/g,' ')
      .replace(/\\d{1,2}:\\d{2}\\s*\\u5f00\\u59cb/g,' ')
      .replace(/\\u67e5\\u770b|\\u9884\\u7ea6|\\u4e0b\\u8f7d|\\u5f00\\u59cb|\\u6682\\u65e0\\u8bc4\\u5206/g,' ')
      .replace(/[\\s\\/\\-:：]+/g,' '));
    const parseCard = (root, style) => {
      const detailUrl = linkOf(root);
      if (!detailUrl) return null;
      const text = clean(root.innerText || root.textContent || '');
      const gameName = nameOf(root, text);
      if (!gameName) return null;
      const status = statusOf(root, text);
      const summary = cleanedSummary(text, gameName, status);
      return { style, gameName, detailUrl, iconUrl: iconOf(root), status, date: parseDate(text), time: parseTime(text), tags: tagsOf(root, text, gameName, status), summary: summary || status };
    };
    const scope = document.querySelector('.app-calendar-content,.app-calendar,.home-page__tab-contents') || document;
    const candidates = [
      ...[...scope.querySelectorAll('.top-event-card')].map((node)=>parseCard(node, 'focus')),
      ...[...scope.querySelectorAll('.daily-event-big-card')].map((node)=>parseCard(node, 'big')),
      ...[...scope.querySelectorAll('.daily-event-small-row-card')].map((node)=>parseCard(node, 'small')),
    ];
    return candidates.filter((row)=>row && row.gameName && row.detailUrl);
  })()`;
}

async function enrichDetails(rows, client) {
  for (const row of rows.slice(0, 80)) {
    try {
      await client.send("Page.navigate", { url: row.detailUrl });
      await sleep(900);
      await client.send("Runtime.evaluate", { expression: `window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.55))`, returnByValue: true });
      await sleep(300);
      await client.send("Runtime.evaluate", { expression: `(() => {
        const header = document.querySelector('.app-whats-new__header') || [...document.querySelectorAll('span,div,a,button')].find((node)=>/活动与公告/.test(node.innerText || node.textContent || ''));
        header?.scrollIntoView?.({ block: 'center' });
        header?.click?.();
      })()`, returnByValue: true });
      await sleep(350);
      const payload = await client.send("Runtime.evaluate", { expression: `(() => {
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const meta = (name) => document.querySelector('meta[property="'+name+'"],meta[name="'+name+'"]')?.content || '';
        const body = clean(document.body.innerText || '');
        const icon = [...document.querySelectorAll('img')].find((img)=>/icon|appicon|_tap_appicon/i.test(img.currentSrc||img.src||img.alt||''));
        const splitTags = (value) => clean(value).split(/[\\s,，、/|]+/).map(clean).filter(Boolean);
        const tagNodes = [...document.querySelectorAll('.app-intro__tag-item')].map((n)=>clean(n.innerText || n.textContent)).filter(Boolean);
        const tags = [...tagNodes];
        const faqAnswers = [];
        for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')]) {
          const raw = clean(script.textContent || '');
          if (!raw) continue;
          let data;
          try { data = JSON.parse(raw); } catch { continue; }
          const walk = (node) => {
            if (!node) return;
            if (Array.isArray(node)) return node.forEach(walk);
            if (typeof node !== 'object') return;
            if (node.genre) tags.push(...splitTags(node.genre));
            if (node.applicationSubCategory) tags.push(...splitTags(node.applicationSubCategory));
            if (node.name && node.acceptedAnswer?.text) faqAnswers.push(clean(node.acceptedAnswer.text));
            if (node.mainEntity) walk(node.mainEntity);
          };
          walk(data);
        }
        if (!tagNodes.length) tags.push(...[...document.querySelectorAll('.tap-label-tag,.label,.tag,[class*=\"tag\"],[class*=\"label\"]')].map((n)=>clean(n.innerText)).filter(Boolean));
        const knownTags = ['Steam\u79fb\u690d','\u81ea\u8d70\u68cb','\u7ade\u6280','Roguelike','Roguelite','\u7b56\u7565','\u5192\u9669','\u5ba0\u7269','3D','\u89d2\u8272\u626e\u6f14','\u5c04\u51fb','\u517b\u6210','\u4e8c\u6b21\u5143','\u5f00\u653e\u4e16\u754c'];
        if (!tagNodes.length) for (const tag of knownTags) if (body.includes(tag)) tags.push(tag);
        const releaseText = [...document.querySelectorAll('.gray-08.tap-ellipsis.caption-m12-w14,.caption-m12-w14')]
          .map((n)=>clean(n.innerText || n.textContent))
          .find((text)=>/(今天|明天|\\d{1,2}[\\/月]\\d{1,2}|首发|上线|测试|招募|预约|折扣|预下载)/.test(text)) || '';
        const activityText = [...document.querySelectorAll('.tap-text__one-line.font-bold,[class*="tap-text__one-line"][class*="font-bold"],[role="dialog"] .font-bold,.modal .font-bold')]
          .map((n)=>clean(n.innerText || n.textContent))
          .find((text)=>text && text.length >= 6 && /(\u300a|\u62db\u52df|\u6d3b\u52a8|\u6d4b\u8bd5|\u8d44\u683c|\u5468\u8fb9|\u5f00\u542f|\u62bd|\u516c\u544a|\u9884\u7ea6|\u66f4\u65b0|\u4e0a\u7ebf|\u9996\u53d1)/.test(text) && !/^活动与公告$/.test(text)) || '';
        const mergeContent = (activity, release) => {
          const items = [clean(activity), clean(release)].filter(Boolean);
          if (!items.length) return '';
          if (items.length === 1) return items[0];
          const compact = (text) => clean(text).replace(/[\\s，。！？、,.!?:：；;《》「」『』（）()\\[\\]【】|]/g, '').toLowerCase();
          const groups = [
            ['\u4e0a\u7ebf','\u9996\u53d1'],
            ['\u6d4b\u8bd5','\u5f00\u6d4b'],
            ['\u62db\u52df'],
            ['\u9884\u7ea6'],
            ['\u6298\u6263'],
            ['\u4e0b\u8f7d','\u9884\u4e0b\u8f7d']
          ];
          const groupIndex = (text) => {
            const indexes = groups.map((words, index)=>words.some((word)=>text.includes(word)) ? index : -1).filter((index)=>index >= 0);
            return indexes.length ? Math.min(...indexes) : 999;
          };
          const normalized = items.map((text, index)=>({ text, index, key: compact(text), group: groupIndex(text) }));
          const selected = [];
          for (const item of normalized) {
            const duplicateAt = selected.findIndex((current)=>current.key.includes(item.key) || item.key.includes(current.key) || (current.group !== 999 && current.group === item.group));
            if (duplicateAt >= 0) {
              if (item.text.length > selected[duplicateAt].text.length) selected[duplicateAt] = item;
              continue;
            }
            selected.push(item);
          }
          selected.sort((left, right)=>left.group === right.group ? left.index - right.index : left.group - right.group);
          return selected.map((item)=>item.text).join('\\n');
        };
        const blockedTags = new Set(['\u9996\u9875','\u6392\u884c\u699c','\u53d1\u73b0','\u4e91\u6e38\u620f','PC','PC\u6e38\u620f','PC \u6e38\u620f','\u52a8\u6001','\u53d1\u5e03','\u8bba\u575b','TapTap','TapTap\u5236\u9020','TapTap \u5236\u9020','\u4e0b\u8f7d','\u67e5\u770b','\u70ed\u95e8','\u5b98\u65b9\u5165\u9a7b','\u5f00\u53d1\u8005\u4e2d\u5fc3','\u521b\u4f5c\u8005\u4e2d\u5fc3','\u5173\u4e8eTapTap','\u5b89\u5353','iOS','PC\u7aef','Steam','\u6682\u65e0\u8bc4\u5206','\u8bc4\u5206','\u8d5e']);
        const uniqTags = [...new Set(tags)].filter((tag)=>tag && tag.length <= 16 && !blockedTags.has(tag) && !/^\\d/.test(tag)).slice(0,12);
        const vendorCandidate = faqAnswers.map((text)=>text.match(/\u7531(.+?)\u5f00\u53d1/)?.[1]).find(Boolean) || body.match(/(?:\u4f9b\u5e94\u5546|\u5f00\u53d1\u8005|\u5382\u5546|\u53d1\u884c|\u53d1\u884c\u5546|\u5f00\u53d1\u56e2\u961f)\\s*([^\\n\u3002]{2,40})/)?.[1] || '';
        const vendor = /(\u4e2d\u5fc3|ICP|\u8425\u4e1a\u6267\u7167|TapTap|\u6caa\u7f51\u6587)/.test(vendorCandidate) ? '' : vendorCandidate;
        return {
          title: clean(document.querySelector('h1,.app-title,.app-detail-title')?.innerText || meta('og:title') || document.title),
          iconUrl: icon?.currentSrc || icon?.src || '',
          vendor,
          tags: uniqTags,
          summary: clean(meta('description') || meta('og:description') || ''),
          updateContent: mergeContent(activityText, releaseText)
        };
      })()`, returnByValue: true });
      const detail = payload?.result?.value || {};
      if (detail.title) row.gameName = cleanTitle(detail.title);
      if (!row.iconUrl && detail.iconUrl) row.iconUrl = normalizeUrl(detail.iconUrl, ORIGIN);
      if (detail.vendor) row.vendor = clean(detail.vendor);
      row.tags = normalizeTags([...(row.tags || []), ...(detail.tags || [])]);
      const fallbackContent = /(\u6d4b\u8bd5|\u9996\u53d1|\u4e0a\u7ebf|\u9884\u7ea6|\u6298\u6263|\u4e0b\u8f7d|\u62db\u52df|\u6d3b\u52a8|\u66f4\u65b0|\d{1,2}\u6708|\d{1,2}\/\d{1,2})/.test(row.summary || "") ? row.summary : "";
      const updateContent = cleanMultiline(detail.updateContent || fallbackContent || "");
      row.summary = updateContent;
      row.updateContent = updateContent;
    } catch {}
  }
}

function normalizeRows(rows, date) {
  const map = new Map();
  for (const row of rows) {
    const detailUrl = normalizeUrl(row.detailUrl, ORIGIN);
    const gameName = clean(row.gameName);
    if (!detailUrl || !gameName) continue;
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(row.date || "") ? row.date : date;
    if (eventDate.localeCompare(date) < 0) continue;
    const summary = cleanSummary(row.summary || row.status || "");
    const next = { ...row, detailUrl, gameName, date: eventDate, time: /^\d{1,2}:\d{2}$/.test(row.time || "") ? row.time : "10:00", tags: normalizeTags(row.tags || []), summary, updateContent: summary, iconUrl: normalizeUrl(row.iconUrl, ORIGIN) };
    const current = map.get(detailUrl);
    if (!current || rowScore(next) > rowScore(current)) map.set(detailUrl, next);
  }
  return [...map.values()].slice(0, 120);
}

function toRecord(row, date, originalUrl) {
  const status = normalizeStatus(row.status, row.summary);
  const eventType = normalizeEventType(status, row.summary);
  return { id: stableId("taptap", row.detailUrl || row.gameName), sourceKey: "taptap", source: "TapTap", crawlStyle: row.style || "", gameName: row.gameName, icon: row.gameName.slice(0, 1), iconUrl: row.iconUrl, platform: "\u624b\u6e38", pool: "\u516c\u5171\u624b\u6e38\u6c60", status, eventType, eventAt: `${row.date || date}T${row.time || "10:00"}:00+08:00`, tags: [...new Set([status, eventType, ...(row.tags || [])])], summary: row.summary, updateContent: row.updateContent, originalUrl, detailUrl: row.detailUrl, vendor: row.vendor || "" };
}

function normalizeStatus(status = "", summary = "") {
  const primary = clean(status);
  const fallback = clean(summary);
  if (/\u7248\u672c\u66f4\u65b0|\u65b0\u7248\u672c\u66f4\u65b0/.test(primary)) return "\u66f4\u65b0";
  if (/\u6d3b\u52a8|\u8054\u52a8/.test(primary)) return "\u6d3b\u52a8";
  if (/\u4eca\u65e5\u4e0a\u7ebf/.test(primary)) return "\u4eca\u65e5\u4e0a\u7ebf";
  if (/\u5373\u5c06\u4e0a\u7ebf/.test(primary)) return "\u5373\u5c06\u4e0a\u7ebf";
  if (/\u9996\u53d1/.test(primary)) return "\u9996\u53d1";
  if (/\u9884\u7ea6/.test(primary)) return "\u9884\u7ea6";
  if (/\u6d4b\u8bd5|\u62db\u52df|\u5f00\u6d4b|\u4e0d\u9650\u91cf|\u9650\u91cf/.test(primary)) return "\u5f00\u6d4b";
  if (/\u4e0a\u7ebf|\u4e0b\u8f7d/.test(primary)) return "\u4e0a\u7ebf";
  if (/\u6298\u6263/.test(primary)) return "\u6298\u6263";
  if (/\u6d3b\u52a8|\u8054\u52a8/.test(fallback)) return "\u6d3b\u52a8";
  if (/\u7248\u672c\u66f4\u65b0|\u65b0\u7248\u672c\u66f4\u65b0/.test(fallback)) return "\u66f4\u65b0";
  return primary || "\u65b0\u6e38";
}

function normalizeEventType(status = "", summary = "") {
  const value = clean([status, summary].join(" "));
  if (/\u66f4\u65b0|\u7248\u672c\u66f4\u65b0|\u6d3b\u52a8|\u8054\u52a8/.test(status)) return "\u7248\u672c\u66f4\u65b0";
  if (/\u6d4b\u8bd5|\u62db\u52df|\u5f00\u6d4b|\u4e0d\u9650\u91cf|\u9650\u91cf/.test(value)) return "\u5f00\u6d4b";
  if (/\u6298\u6263/.test(value)) return "\u6298\u6263";
  return "\u65b0\u6e38";
}

function normalizeTags(values) {
  const blocked = new Set(["TapTap", "PC\u6e38\u620f", "\u7f16\u8f91\u63a8\u8350", "\u4e70\u65ad\u5236", "\u9ad8\u753b\u8d28", "\u6c89\u6d78\u5f0f\u4f53\u9a8c", "\u8d85\u723d\u6253\u51fb", "\u591a\u5e73\u53f0", "\u4e0b\u8f7d", "\u67e5\u770b", "\u6682\u65e0\u8bc4\u5206", "\u5f00\u59cb", "\u529f\u80fd", "\u70ed\u95e8", "\u7b80\u4ecb"]);
  const flat = values.flatMap((value) => clean(value).split(/[\s,，、/|]+/).map(clean));
  return [...new Set(flat.filter((tag) => tag && tag.length <= 12 && !blocked.has(tag) && /\p{Script=Han}|MMO|MOBA|ARPG|RPG|Roguelike|Roguelite|RogueLike|RogueLite|TPS|FPS|3D/u.test(tag) && !/^(\d+(\.\d+)?|\u9884\u7ea6|\u4e0b\u8f7d|\u67e5\u770b|\u9996\u53d1|\u6d4b\u8bd5|\u4e0a\u7ebf|\u66f4\u65b0|\u65b0\u6e38|\u5f00\u6d4b|\u6298\u6263)$/.test(tag)))].slice(0, 8);
}
function cleanSummary(value = "") { const text = clean(value).replace(/^[\s/:：-]+|[\s/:：-]+$/g, ""); return /[\u4e00-\u9fa5A-Za-z]/.test(text) ? text : ""; }
function cleanMultiline(value = "") { return String(value || "").replace(/<[^>]+>/g, " ").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").split(/\n+/).map(clean).filter(Boolean).join("\n"); }
function rowScore(row) { return (row.iconUrl ? 30 : 0) + (row.tags?.length || 0) * 10 + clean(row.summary).length + (/(\u6d4b\u8bd5|\u9996\u53d1|\u4e0a\u7ebf|\u9884\u7ea6|\u66f4\u65b0|\u5f00\u6d4b)/.test(row.status || "") ? 20 : 0); }
function scoreText(value = "") { const text = clean(value); if (!text) return 0; let score = Math.min(text.length, 200); if (/(版本|赛季|上线|更新|联动|返场|开启|新增|开发者的话)/.test(text)) score += 60; if (/^(预约|下载|查看|首发|测试)$/.test(text)) score -= 100; return score; }
function cleanTitle(value = "") { return clean(value).replace(/\s*[-_|].*TapTap.*$/i, "").replace(/\s*\|.*$/, ""); }
function clean(value = "") { return String(value || "").replace(/<[^>]+>/g, " ").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim(); }
function normalizeUrl(url, base) { if (!url) return ""; if (url.startsWith("//")) return `https:${url}`; try { return new URL(url, base).toString(); } catch { return ""; } }
function stableId(prefix, value) { let hash = 0; for (const char of String(value)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0; return `${prefix}-${Math.abs(hash).toString(36)}`; }

async function openBrowser() {
  const path = findBrowserPath();
  if (!path) throw new Error("未找到 Edge/Chrome，无法执行 TapTap 渲染抓取。");
  const port = 9600 + Math.floor(Math.random() * 300);
  await cleanupStaleBrowserCache();
  await mkdir(browserCacheRoot, { recursive: true });
  const userDataDir = join(browserCacheRoot, `run-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const child = spawn(path, [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1400,1200", "about:blank"], { stdio: "ignore" });
  let closed = false;
  const closeBrowser = async () => {
    if (closed) return;
    closed = true;
    try { child.kill(); } catch {}
    await waitForExit(child, 2500);
    await safeRemoveBrowserDir(userDataDir);
  };
  try {
    await waitForCdp(port);
    const pages = await fetchJson(`http://127.0.0.1:${port}/json`);
    const page = pages.find((item) => item.type === "page") || pages[0];
    const client = await connectCdp(page.webSocketDebuggerUrl);
    return { client, userDataDir, async close() { try { client.close(); } catch {} await closeBrowser(); } };
  } catch (error) {
    await closeBrowser();
    throw error;
  }
}

async function cleanupStaleBrowserCache() {
  try {
    await mkdir(browserCacheRoot, { recursive: true });
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    const entries = await readdir(browserCacheRoot, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isDirectory() && /^run-\d+-/.test(entry.name))
      .map(async (entry) => {
        const fullPath = join(browserCacheRoot, entry.name);
        const info = await stat(fullPath).catch(() => null);
        if (info && info.mtimeMs < cutoff) await safeRemoveBrowserDir(fullPath);
      }));
  } catch {
    // Cache cleanup should not block crawling.
  }
}

async function safeRemoveBrowserDir(dir) {
  const resolved = resolve(dir);
  if (!resolved.startsWith(browserCacheRoot)) return;
  await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }).catch(() => {});
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolveDone) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolveDone();
    };
    const timer = setTimeout(finish, timeoutMs);
    child.once?.("exit", finish);
    child.once?.("close", finish);
  });
}

function findBrowserPath() { return ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((item) => existsSync(item)); }
async function waitForCdp(port) { for (let i = 0; i < 40; i += 1) { try { await fetchJson(`http://127.0.0.1:${port}/json/version`); return; } catch { await sleep(250); } } throw new Error("浏览器调试端口启动超时。"); }
async function fetchJson(url) { const response = await fetch(url); if (!response.ok) throw new Error(`${url} HTTP ${response.status}`); return response.json(); }
function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const callbacks = new Map();
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error("CDP WebSocket 连接超时"));
    }, 8000);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const message = { id: ++id, method, params };
            callbacks.set(message.id, { res, rej });
            ws.send(JSON.stringify(message));
          });
        },
        close() { ws.close(); },
      });
    };
    ws.onerror = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !callbacks.has(message.id)) return;
      const callback = callbacks.get(message.id);
      callbacks.delete(message.id);
      if (message.error) callback.rej(new Error(message.error.message));
      else callback.res(message.result);
    };
  });
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

