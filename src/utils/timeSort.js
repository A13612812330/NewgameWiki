export function sortByTodayFuturePast(left, right) {
  const leftRank = scheduleRank(left);
  const rightRank = scheduleRank(right);
  if (leftRank.group !== rightRank.group) return leftRank.group - rightRank.group;
  if (leftRank.time !== rightRank.time) {
    if (leftRank.group === 2) return rightRank.time - leftRank.time;
    return leftRank.time - rightRank.time;
  }
  const importanceDiff = importanceWeight(right) - importanceWeight(left);
  if (importanceDiff) return importanceDiff;
  return String(left?.gameName || left?.newsTitle || "").localeCompare(String(right?.gameName || right?.newsTitle || ""), "zh-CN");
}

export function normalizeImportanceLevel(value) {
  const level = String(value || "").trim().toUpperCase();
  return ["S", "A", "B", "C"].includes(level) ? level : "C";
}

export function importanceWeight(item) {
  const level = typeof item === "string" ? normalizeImportanceLevel(item) : normalizeImportanceLevel(item?.importanceLevel || item?.importance || item?.priority);
  return { S: 4, A: 3, B: 2, C: 1 }[level] || 1;
}

export function scheduleRank(item) {
  const time = recordDayTime(item);
  if (!time) return { group: 3, time: Number.MAX_SAFE_INTEGER };
  const today = startOfLocalDay(new Date()).getTime();
  if (time === today) return { group: 0, time };
  if (time > today) return { group: 1, time };
  return { group: 2, time };
}

export function recordDayTime(item) {
  const value = item?.eventAt || item?.publishedAt || item?.releaseDate || item?.sampledAt || item?.updatedAt || "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return startOfLocalDay(date).getTime();
}

export function startOfLocalDay(value) {
  const date = value instanceof Date ? value : new Date(value || "");
  if (Number.isNaN(date.getTime())) return new Date(0);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
