import { useEffect, useMemo, useState } from "react";

const emptyData = {
  generatedAt: "",
  date: "",
  mobileGames: [],
  welfareGames: [],
  pcGames: [],
  cleanupIssues: [],
  updateLogs: [],
  reviewQueue: [],
  schedulerJobs: [],
  sourceGroups: [],
  rawMobileRecords: [],
  metrics: { totalGames: 0, mobilePool: 0, welfarePool: 0, pcPool: 0, todayUpdates: 0, cleanupIssues: 0, rawMobileRecords: 0 },
};

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/[|/?,?\s]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeItem(item) {
  return {
    ...item,
    sources: asList(item.sources),
    tags: asList(item.tags),
    gameplayTags: asList(item.gameplayTags),
    sourceRecords: asList(item.sourceRecords).map((record) => (typeof record === 'object' ? record : { source: String(record || '') })),
  };
}

function normalizeData(data) {
  const mobileGames = asList(data.mobileGames).map(normalizeItem);
  const welfareGames = asList(data.welfareGames).map(normalizeItem);
  const pcGames = asList(data.pcGames).map(normalizeItem);
  const rawMobileRecords = asList(data.rawMobileRecords).map(normalizeItem);
  return {
    ...data,
    mobileGames,
    welfareGames,
    pcGames,
    rawMobileRecords,
    cleanupIssues: asList(data.cleanupIssues),
    updateLogs: asList(data.updateLogs),
    reviewQueue: asList(data.reviewQueue),
    schedulerJobs: asList(data.schedulerJobs),
    sourceGroups: asList(data.sourceGroups),
  };
}

export function useGameData() {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const nextData = await response.json();
      setData(normalizeData({ ...emptyData, ...nextData }));
    } catch (err) {
      setError(err?.message || "读取数据失败");
      setData(emptyData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const allCalendarItems = useMemo(() => [...data.mobileGames, ...data.welfareGames, ...data.pcGames]
    .sort((left, right) => new Date(left.eventAt) - new Date(right.eventAt)), [data]);

  return { ...data, allCalendarItems, loading, error, reload };
}
