import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { sortByTodayFuturePast } from "../utils/timeSort.js";

const emptyData = {
  generatedAt: "",
  date: "",
  mobileGames: [],
  welfareGames: [],
  pcGames: [],
  steamGames: [],
  steamNewGames: [],
  pcNews: [],
  cleanupIssues: [],
  updateLogs: [],
  reviewQueue: [],
  schedulerJobs: [],
  sourceGroups: [],
  rawMobileRecords: [],
  metrics: { totalGames: 0, mobilePool: 0, welfarePool: 0, pcPool: 0, todayUpdates: 0, cleanupIssues: 0, rawMobileRecords: 0 },
};

let rawDataCache = null;
let rawDataRequest = null;
let rawDataMetaKey = "";

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/[|/?,?\s]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeItem(item) {
  const normalized = {
    ...item,
    sources: asList(item.sources),
    tags: asList(item.tags),
    gameplayTags: asList(item.gameplayTags),
    sourceRecords: asList(item.sourceRecords).map((record) => (typeof record === 'object' ? record : { source: String(record || '') })),
  };
  if (normalized.newsTitle) return normalizeNewsItem(normalized);
  return normalized;
}

function normalizeNewsItem(item) {
  const mapNewsStatus = (value) => value === '新游' ? '资讯' : value;
  return {
    ...item,
    status: mapNewsStatus(item.status),
    eventType: mapNewsStatus(item.eventType),
    category: mapNewsStatus(item.category),
    tags: item.tags.map(mapNewsStatus).filter((tag, index, list) => tag && list.indexOf(tag) === index),
    sourceRecords: item.sourceRecords.map((record) => ({
      ...record,
      status: mapNewsStatus(record.status),
      eventType: mapNewsStatus(record.eventType),
      category: mapNewsStatus(record.category),
      tags: asList(record.tags).map(mapNewsStatus).filter((tag, index, list) => tag && list.indexOf(tag) === index),
    })),
  };
}

function visibleItems(items, includeHidden) {
  return includeHidden ? items : items.filter((item) => item.visible !== false);
}

function normalizeData(data, { includeHidden = false } = {}) {
  const mobileGames = visibleItems(asList(data.mobileGames).map(normalizeItem), includeHidden);
  const welfareGames = visibleItems(asList(data.welfareGames).map(normalizeItem), includeHidden);
  const pcGames = visibleItems(asList(data.pcGames).map(normalizeItem), includeHidden);
  const steamGames = visibleItems((asList(data.steamGames).length ? asList(data.steamGames) : pcGames.filter(isSteamListedGame)).map(normalizeItem), includeHidden).sort(sortByPlayers);
  const steamNewGames = visibleItems((asList(data.steamNewGames).length ? asList(data.steamNewGames) : pcGames.filter(isSteamNewGame)).map(normalizeItem), includeHidden).sort(sortBySteamRelease);
  const pcNews = visibleItems((asList(data.pcNews).length ? asList(data.pcNews) : pcGames.filter(isPcNews)).map(normalizeItem), includeHidden).sort(sortByNewsDate);
  const rawMobileRecords = asList(data.rawMobileRecords).map(normalizeItem);
  return {
    ...data,
    mobileGames,
    welfareGames,
    pcGames,
    steamGames,
    steamNewGames,
    pcNews,
    rawMobileRecords,
    cleanupIssues: asList(data.cleanupIssues),
    updateLogs: asList(data.updateLogs),
    reviewQueue: asList(data.reviewQueue),
    schedulerJobs: asList(data.schedulerJobs),
    sourceGroups: asList(data.sourceGroups),
  };
}

function isSteamGame(item) {
  return Boolean(item?.appid || asList(item?.sources).includes('Steam'));
}

function isSteamListedGame(item) {
  return isSteamGame(item) && Number(item.lastKnownPlayers ?? item.currentPlayers) >= 1000;
}

function isSteamNewGame(item) {
  if (!isSteamGame(item)) return false;
  if (isSteamListedGame(item)) return false;
  const online = Number(item.lastKnownPlayers ?? item.currentPlayers);
  const tagged = [item.status, item.eventType, ...asList(item.steamLabels)].some((value) => /新游|预约|即将推出/.test(String(value || ''))) || item.comingSoon;
  return tagged && (!Number.isFinite(online) || online < 1000);
}

function isPcNews(item) {
  const sources = asList(item?.sources);
  return Boolean(item?.newsTitle || sources.some((source) => ['机核', '游民星空', '游侠网'].includes(source)));
}

function sortByPlayers(left, right) {
  return (Number(right.lastKnownPlayers ?? right.currentPlayers) || 0) - (Number(left.lastKnownPlayers ?? left.currentPlayers) || 0);
}

function sortBySteamRelease(left, right) {
  return new Date(left.eventAt || 0).getTime() - new Date(right.eventAt || 0).getTime();
}

function sortByNewsDate(left, right) {
  const leftDate = new Date(left?.eventAt || left?.publishedAt || 0);
  const rightDate = new Date(right?.eventAt || right?.publishedAt || 0);
  const dateDiff = (Number.isNaN(rightDate.getTime()) ? 0 : rightDate.getTime()) - (Number.isNaN(leftDate.getTime()) ? 0 : leftDate.getTime());
  if (dateDiff) return dateDiff;
  return (Number(right.heat) || 0) - (Number(left.heat) || 0);
}

export function useGameData(options = {}) {
  const location = useLocation();
  const checkedPathRef = useRef("");
  const [data, setData] = useState(() => rawDataCache ? normalizeData({ ...emptyData, ...rawDataCache }, options) : emptyData);
  const [loading, setLoading] = useState(!rawDataCache);
  const [error, setError] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const loadData = async ({ force = false } = {}) => {
    if (!force && rawDataCache) {
      setData(normalizeData({ ...emptyData, ...rawDataCache }, options));
      setLoading(false);
      return rawDataCache;
    }
    setLoading(!rawDataCache);
    setError("");
    try {
      if (!rawDataRequest || force) {
        rawDataRequest = fetch("/api/data", { cache: "no-store" }).then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        }).finally(() => {
          rawDataRequest = null;
        });
      }
      rawDataCache = await rawDataRequest;
      rawDataMetaKey = dataMetaKey(rawDataCache);
      setData(normalizeData({ ...emptyData, ...rawDataCache }, options));
      setUpdateAvailable(false);
      window.dispatchEvent(new CustomEvent("newgamewiki:data-refreshed"));
      return rawDataCache;
    } catch (err) {
      setError(err?.message || "读取数据失败");
      if (!rawDataCache) setData(emptyData);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const reload = async () => loadData({ force: true });
  const refreshUpdatedData = async () => {
    const result = await loadData({ force: true });
    setUpdateAvailable(false);
    return result;
  };

  useEffect(() => { loadData({ force: false }).catch(() => {}); }, []);
  useEffect(() => {
    const markAvailable = () => setUpdateAvailable(true);
    const markRefreshed = () => setUpdateAvailable(false);
    window.addEventListener("newgamewiki:data-update-available", markAvailable);
    window.addEventListener("newgamewiki:data-refreshed", markRefreshed);
    return () => {
      window.removeEventListener("newgamewiki:data-update-available", markAvailable);
      window.removeEventListener("newgamewiki:data-refreshed", markRefreshed);
    };
  }, []);
  useEffect(() => {
    if (!rawDataCache) return;
    if (checkedPathRef.current === location.pathname) return;
    checkedPathRef.current = location.pathname;
    checkDataMeta().then((changed) => {
      if (changed) {
        setUpdateAvailable(true);
        window.dispatchEvent(new CustomEvent("newgamewiki:data-update-available"));
      }
      return null;
    }).catch(() => {});
  }, [location.pathname]);

  const allCalendarItems = useMemo(() => [...data.mobileGames, ...data.welfareGames, ...data.steamGames, ...data.steamNewGames, ...data.pcNews]
    .sort(sortByTodayFuturePast), [data]);

  return { ...data, allCalendarItems, loading, error, reload, updateAvailable, refreshUpdatedData };
}

async function checkDataMeta() {
  const response = await fetch("/api/data/meta", { cache: "no-store" });
  if (!response.ok) return false;
  const meta = await response.json();
  const nextKey = meta.generatedAt || meta.snapshotUpdatedAt || "";
  if (!nextKey || !rawDataMetaKey) {
    rawDataMetaKey = nextKey || rawDataMetaKey;
    return false;
  }
  if (nextKey === rawDataMetaKey) return false;
  rawDataMetaKey = nextKey;
  return true;
}

function dataMetaKey(data = {}) {
  return data.generatedAt || data.date || "";
}
