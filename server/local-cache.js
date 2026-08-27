import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const poolMap = [
  ["mobile", "mobileGames"],
  ["welfare", "welfareGames"],
  ["steam", "steamGames"],
  ["steam_new", "steamNewGames"],
  ["pc_news", "pcNews"],
];
const maxDailySnapshots = Number(process.env.NEWWIKI_MAX_DAILY_SNAPSHOTS || 30);
const maxRecordHistory = Number(process.env.NEWWIKI_MAX_RECORD_HISTORY || 2000);

export async function syncLocalCache(data, dbFile) {
  await fs.mkdir(path.dirname(dbFile), { recursive: true });
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const now = new Date().toISOString();
    const date = data.date || now.slice(0, 10);
    const snapshotId = `daily-${date}`;
    const counts = Object.fromEntries(poolMap.map(([pool, key]) => [pool, data[key]?.length || 0]));
    db.prepare(`
      INSERT INTO app_state (key, payload_json, updated_at)
      VALUES ('current', ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `).run(JSON.stringify(data), now);
    db.prepare(`
      INSERT INTO daily_snapshots (id, date, generated_at, counts_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        generated_at = excluded.generated_at,
        counts_json = excluded.counts_json
    `)
      .run(snapshotId, date, data.generatedAt || now, JSON.stringify(counts));
    const existingPayload = db.prepare("SELECT payload_json FROM game_records WHERE pool = ? AND item_id = ?");
    const upsert = db.prepare(`
      INSERT INTO game_records (pool, item_id, game_name, source_key, event_at, platform_ids_json, payload_json, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(pool, item_id) DO UPDATE SET
        game_name = excluded.game_name,
        source_key = excluded.source_key,
        event_at = excluded.event_at,
        platform_ids_json = excluded.platform_ids_json,
        payload_json = excluded.payload_json,
        last_seen_at = excluded.last_seen_at
    `);
    const insertHistory = db.prepare("INSERT INTO game_record_history (snapshot_id, pool, item_id, payload_json) VALUES (?, ?, ?, ?)");
    db.exec("BEGIN");
    try {
      for (const [pool, key] of poolMap) {
        for (const item of data[key] || []) {
          const id = String(item.id || item.appid || item.detailUrl || item.newsTitle || item.gameName || "");
          if (!id) continue;
          const source = Array.isArray(item.sources) ? item.sources.join("/") : String(item.platform || "");
          const platformIds = JSON.stringify(item.platformIds || {});
          const payload = JSON.stringify(item);
          const previous = existingPayload.get(pool, id)?.payload_json || "";
          upsert.run(pool, id, item.gameName || item.newsTitle || "未命名", source, item.eventAt || item.publishedAt || "", platformIds, payload, now, now);
          if (previous && previous !== payload) insertHistory.run(`${snapshotId}-${Date.now()}`, pool, id, previous);
        }
      }
      pruneCacheTablesInDb(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return getLocalCacheStatus(dbFile);
  } finally {
    db.close();
  }
}

export async function readDataFromLocalCache(dbFile) {
  try {
    await fs.access(dbFile);
  } catch {
    return null;
  }
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const row = db.prepare("SELECT payload_json FROM app_state WHERE key = 'current'").get();
    let snapshot = null;
    if (row?.payload_json) {
      try {
        snapshot = JSON.parse(row.payload_json);
        if (snapshotMatchesRecordCounts(db, snapshot)) return snapshot;
      } catch {
        // Fall through and rebuild from record rows.
      }
    }
    const rebuilt = readDataFromRecordsInDb(db);
    if (rebuilt) {
      // Pool rows are authoritative during a rebuild, but keep audit metadata
      // from the snapshot so cleanup issues and logs are not silently lost.
      const merged = {
        ...(snapshot || {}),
        ...rebuilt,
        cleanupIssues: snapshot?.cleanupIssues || [],
        updateLogs: snapshot?.updateLogs || [],
        sourceGroups: snapshot?.sourceGroups || [],
        schedulerJobs: snapshot?.schedulerJobs || [],
        crawlDiagnostics: snapshot?.crawlDiagnostics || {},
        generatedAt: new Date().toISOString(),
      };
      db.prepare(`
        INSERT INTO app_state (key, payload_json, updated_at)
        VALUES ('current', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
      `).run(JSON.stringify(merged), merged.generatedAt);
      return merged;
    }
    return null;
  } finally {
    db.close();
  }
}

export async function findRecordInLocalCache(dbFile, gameId) {
  const lookup = String(gameId || "").trim();
  if (!lookup) return null;
  try {
    await fs.access(dbFile);
  } catch {
    return null;
  }
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const records = db.prepare("SELECT pool, item_id, payload_json FROM game_records").all();
    for (const record of records) {
      const payload = parseJson(record.payload_json, null);
      if (!payload) continue;
      if (!recordMatches(payload, record.item_id, lookup)) continue;
      const key = poolMap.find(([pool]) => pool === record.pool)?.[1] || "";
      return { pool: record.pool, key, itemId: record.item_id, item: payload };
    }
    return null;
  } finally {
    db.close();
  }
}

export async function upsertGameRecord(dbFile, pool, item) {
  const poolName = String(pool || "").trim();
  if (!poolMap.some(([name]) => name === poolName)) throw new Error("不支持的数据池：" + poolName);
  const itemId = recordItemId(item);
  if (!itemId) throw new Error("缺少记录ID");
  await fs.mkdir(path.dirname(dbFile), { recursive: true });
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    upsertGameRecordInDb(db, poolName, itemId, item, new Date().toISOString());
    return { pool: poolName, itemId, item };
  } finally {
    db.close();
  }
}

export async function updateGameRecordPayload(dbFile, gameId, updater) {
  if (typeof updater !== "function") throw new Error("缺少记录更新函数");
  const found = await findRecordInLocalCache(dbFile, gameId);
  if (!found) return null;
  const before = structuredCloneSafe(found.item);
  const next = updater(structuredCloneSafe(found.item), found);
  const item = next && typeof next === "object" ? next : found.item;
  await upsertGameRecord(dbFile, found.pool, item);
  return { ...found, before, item };
}

export async function deleteGameRecord(dbFile, gameId, { softDelete = true } = {}) {
  const found = await findRecordInLocalCache(dbFile, gameId);
  if (!found) return null;
  const before = structuredCloneSafe(found.item);
  if (softDelete) {
    const deletedAt = new Date().toISOString();
    const item = { ...found.item, visible: false, deletedAt };
    await upsertGameRecord(dbFile, found.pool, item);
    return { ...found, before, item, softDeleted: true };
  }
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    db.prepare("DELETE FROM game_records WHERE pool = ? AND item_id = ?").run(found.pool, found.itemId);
    return { ...found, before, deleted: true };
  } finally {
    db.close();
  }
}

export async function rebuildCurrentDataFromRecords(dbFile, baseState = {}) {
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const data = structuredCloneSafe(baseState || {});
    Object.assign(data, readDataFromRecordsInDb(db) || {});
    data.pcGames = [...(data.steamGames || []), ...(data.steamNewGames || []), ...(data.pcNews || [])];
    data.generatedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO app_state (key, payload_json, updated_at)
      VALUES ('current', ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `).run(JSON.stringify(data), data.generatedAt);
    return data;
  } finally {
    db.close();
  }
}

export async function getSchedulerJobDetail(dbFile, sourceKey) {
  const key = String(sourceKey || "").trim();
  if (!key) throw new Error("缺少任务来源");
  const jobs = await getSchedulerJobs(dbFile);
  const job = jobs.find((item) => item.sourceKey === key);
  if (!job) return null;
  const runs = await getSchedulerRuns(dbFile, { sourceKey: key, limit: 10 });
  return { job, runs, lastRun: runs[0] || null, lastFailure: runs.find((run) => run.status === "failed") || null };
}

export async function initializeLocalCache(data, dbFile) {
  return syncLocalCache(data, dbFile);
}

export async function getLocalCacheStatus(dbFile) {
  try {
    await fs.access(dbFile);
  } catch {
    return { enabled: true, exists: false, file: dbFile, pools: [], snapshots: 0, records: 0, latestSnapshot: "" };
  }
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const pools = db.prepare("SELECT pool, COUNT(*) AS count FROM game_records GROUP BY pool ORDER BY pool").all();
    const snapshot = db.prepare("SELECT generated_at FROM daily_snapshots ORDER BY generated_at DESC LIMIT 1").get();
    const snapshots = db.prepare("SELECT COUNT(*) AS count FROM daily_snapshots").get()?.count || 0;
    const records = db.prepare("SELECT COUNT(*) AS count FROM game_records").get()?.count || 0;
    return { enabled: true, exists: true, file: dbFile, pools, snapshots, records, latestSnapshot: snapshot?.generated_at || "" };
  } finally {
    db.close();
  }
}

export async function getDatabaseOverview(dbFile) {
  try {
    await fs.access(dbFile);
  } catch {
    return { exists: false, file: dbFile, tables: [] };
  }
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const tables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    return {
      exists: true,
      file: dbFile,
      tables: tables.map((table) => {
        const name = table.name;
        const count = db.prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`).get()?.count || 0;
        const columns = db.prepare(`PRAGMA table_info("${name.replaceAll('"', '""')}")`).all().map((column) => ({
          name: column.name,
          type: column.type || "",
          primaryKey: Boolean(column.pk),
          notNull: Boolean(column.notnull),
        }));
        return { name, count, columns };
      }),
    };
  } finally {
    db.close();
  }
}

export async function ensureDefaultSchedulerJobs(dbFile, defaults = []) {
  await fs.mkdir(path.dirname(dbFile), { recursive: true });
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO scheduler_jobs (id, source_key, module, name, sources_json, enabled, cron_text, interval_minutes, run_times_json, next_run_at, last_run_at, last_status, last_message, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO NOTHING
    `);
    const existingState = db.prepare("SELECT enabled, run_times_json FROM scheduler_jobs WHERE source_key = ?");
    const patchEmptyRunTimes = db.prepare(`
      UPDATE scheduler_jobs
      SET run_times_json = ?, cron_text = ?, next_run_at = ?, updated_at = ?
      WHERE source_key = ? AND (run_times_json IS NULL OR run_times_json = '' OR run_times_json = '[]')
    `);
    const patchLegacyRunTimes = db.prepare(`
      UPDATE scheduler_jobs
      SET run_times_json = ?, cron_text = ?, next_run_at = ?, updated_at = ?
      WHERE source_key = ?
    `);
    db.exec("BEGIN");
    try {
      for (const job of defaults) {
        const runTimes = normalizeRunTimes(job.runTimes || []);
        insert.run(
          job.id || `job-${job.sourceKey}`,
          job.sourceKey,
          job.module || "",
          job.name || job.sourceKey,
          JSON.stringify(job.sources || [job.sourceKey]),
          job.enabled ? 1 : 0,
          job.cronText || "",
          Number(job.intervalMinutes) || 0,
          JSON.stringify(runTimes),
          job.nextRunAt || computeNextRunAt(job.enabled ? 1 : 0, runTimes, Number(job.intervalMinutes) || 0),
          job.lastRunAt || "",
          job.lastStatus || "待配置",
          job.lastMessage || "",
          now,
        );
        const current = existingState.get(job.sourceKey);
        patchEmptyRunTimes.run(
          JSON.stringify(runTimes),
          formatRunTimesText(runTimes) || job.cronText || "",
          computeNextRunAt(current?.enabled ?? (job.enabled ? 1 : 0), runTimes, Number(job.intervalMinutes) || 0),
          now,
          job.sourceKey,
        );
        if (current && shouldPatchLegacyRunTimes(current.run_times_json, job.legacyRunTimes || [])) {
          patchLegacyRunTimes.run(
            JSON.stringify(runTimes),
            formatRunTimesText(runTimes) || job.cronText || "",
            computeNextRunAt(current.enabled ?? (job.enabled ? 1 : 0), runTimes, Number(job.intervalMinutes) || 0),
            now,
            job.sourceKey,
          );
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return getSchedulerJobs(dbFile);
  } finally {
    db.close();
  }
}

export async function getSchedulerJobs(dbFile) {
  try {
    await fs.access(dbFile);
  } catch {
    return [];
  }
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    return db.prepare("SELECT * FROM scheduler_jobs ORDER BY module, name").all().map(formatSchedulerJob);
  } finally {
    db.close();
  }
}

export async function upsertSchedulerJob(dbFile, patch = {}) {
  const sourceKey = String(patch.sourceKey || "").trim();
  if (!sourceKey) throw new Error("缺少任务来源");
  await fs.mkdir(path.dirname(dbFile), { recursive: true });
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const current = db.prepare("SELECT * FROM scheduler_jobs WHERE source_key = ?").get(sourceKey);
    const now = new Date().toISOString();
    const sources = patch.sources || (current?.sources_json ? JSON.parse(current.sources_json) : [sourceKey]);
    const intervalMinutes = Number(patch.intervalMinutes ?? current?.interval_minutes ?? 0) || 0;
    const runTimes = normalizeRunTimes(patch.runTimes ?? parseJson(current?.run_times_json, []));
    const enabled = patch.enabled === undefined ? (current?.enabled || 0) : (patch.enabled ? 1 : 0);
    const nextRunAt = patch.nextRunAt !== undefined ? patch.nextRunAt : computeNextRunAt(enabled, runTimes, intervalMinutes);
    db.prepare(`
      INSERT INTO scheduler_jobs (id, source_key, module, name, sources_json, enabled, cron_text, interval_minutes, run_times_json, next_run_at, last_run_at, last_status, last_message, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        module = excluded.module,
        name = excluded.name,
        sources_json = excluded.sources_json,
        enabled = excluded.enabled,
        cron_text = excluded.cron_text,
        interval_minutes = excluded.interval_minutes,
        run_times_json = excluded.run_times_json,
        next_run_at = excluded.next_run_at,
        last_run_at = excluded.last_run_at,
        last_status = excluded.last_status,
        last_message = excluded.last_message,
        updated_at = excluded.updated_at
    `).run(
      current?.id || patch.id || `job-${sourceKey}`,
      sourceKey,
      patch.module ?? current?.module ?? "",
      patch.name ?? current?.name ?? sourceKey,
      JSON.stringify(sources),
      enabled,
      patch.cronText ?? formatRunTimesText(runTimes) ?? current?.cron_text ?? "",
      intervalMinutes,
      JSON.stringify(runTimes),
      nextRunAt || "",
      patch.lastRunAt ?? current?.last_run_at ?? "",
      patch.lastStatus ?? current?.last_status ?? "待配置",
      patch.lastMessage ?? current?.last_message ?? "",
      now,
    );
    return formatSchedulerJob(db.prepare("SELECT * FROM scheduler_jobs WHERE source_key = ?").get(sourceKey));
  } finally {
    db.close();
  }
}

export async function recordSchedulerRun(dbFile, run = {}) {
  await fs.mkdir(path.dirname(dbFile), { recursive: true });
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const id = run.id || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO scheduler_runs (id, job_id, source_key, started_at, finished_at, status, message, counts_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      run.jobId || "",
      run.sourceKey || "",
      run.startedAt || new Date().toISOString(),
      run.finishedAt || "",
      run.status || "running",
      run.message || "",
      JSON.stringify(run.counts || {}),
    );
    return id;
  } finally {
    db.close();
  }
}

export async function updateSchedulerRun(dbFile, runId, patch = {}) {
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const current = db.prepare("SELECT * FROM scheduler_runs WHERE id = ?").get(runId);
    if (!current) return null;
    db.prepare(`
      UPDATE scheduler_runs
      SET finished_at = ?, status = ?, message = ?, counts_json = ?
      WHERE id = ?
    `).run(
      patch.finishedAt ?? current.finished_at ?? "",
      patch.status ?? current.status,
      patch.message ?? current.message ?? "",
      JSON.stringify(patch.counts ?? (current.counts_json ? JSON.parse(current.counts_json) : {})),
      runId,
    );
    return runId;
  } finally {
    db.close();
  }
}

export async function getSchedulerRuns(dbFile, { limit = 30, sourceKey = "" } = {}) {
  try {
    await fs.access(dbFile);
  } catch {
    return [];
  }
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
    const rows = sourceKey
      ? db.prepare("SELECT * FROM scheduler_runs WHERE source_key = ? ORDER BY started_at DESC LIMIT ?").all(sourceKey, safeLimit)
      : db.prepare("SELECT * FROM scheduler_runs ORDER BY started_at DESC LIMIT ?").all(safeLimit);
    return rows.map(formatSchedulerRun);
  } finally {
    db.close();
  }
}

export async function cleanupHistoricalSchedulerFailures(dbFile) {
  try {
    await fs.access(dbFile);
  } catch {
    return { deleted: 0, preservedCurrentFailures: 0 };
  }
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const before = db.prepare("SELECT COUNT(*) AS count FROM scheduler_runs WHERE status IN ('failed', 'running')").get()?.count || 0;
    db.prepare("DELETE FROM scheduler_runs WHERE status IN ('failed', 'running') AND message LIKE ?").run("%服务重启后自动释放旧运行状态%");
    const latestRows = [];
    const rows = db.prepare("SELECT source_key, id, status FROM scheduler_runs ORDER BY started_at DESC").all();
    const seenSources = new Set();
    for (const row of rows) {
      if (!row.source_key || seenSources.has(row.source_key)) continue;
      seenSources.add(row.source_key);
      latestRows.push(row);
    }
    const preserveIds = latestRows
      .filter((row) => ["failed", "running"].includes(String(row.status || "")))
      .map((row) => row.id);
    if (preserveIds.length) {
      const placeholders = preserveIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM scheduler_runs WHERE status IN ('failed', 'running') AND id NOT IN (${placeholders})`).run(...preserveIds);
    } else {
      db.prepare("DELETE FROM scheduler_runs WHERE status IN ('failed', 'running')").run();
    }
    const after = db.prepare("SELECT COUNT(*) AS count FROM scheduler_runs WHERE status IN ('failed', 'running')").get()?.count || 0;
    return { deleted: Math.max(0, before - after), preservedCurrentFailures: after };
  } finally {
    db.close();
  }
}

export async function getDueSchedulerJobs(dbFile, now = new Date()) {
  const jobs = await getSchedulerJobs(dbFile);
  const nowTime = now.getTime();
  return jobs.filter((job) => job.enabled && job.nextRunAt && new Date(job.nextRunAt).getTime() <= nowTime);
}

export async function appendOperationLog(dbFile, log = {}) {
  await fs.mkdir(path.dirname(dbFile), { recursive: true });
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const id = log.id || `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO operation_logs (id, type, target_type, target_id, title, detail, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      log.type || "操作",
      log.targetType || "",
      log.targetId || "",
      log.title || "",
      log.detail || "",
      JSON.stringify(log.payload || {}),
      log.createdAt || new Date().toISOString(),
    );
    return id;
  } finally {
    db.close();
  }
}

export async function getOperationLogs(dbFile, { limit = 80, type = "" } = {}) {
  try {
    await fs.access(dbFile);
  } catch {
    return [];
  }
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 80));
    const rows = type
      ? db.prepare("SELECT * FROM operation_logs WHERE type = ? ORDER BY created_at DESC LIMIT ?").all(type, safeLimit)
      : db.prepare("SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ?").all(safeLimit);
    return rows.map(formatOperationLog);
  } finally {
    db.close();
  }
}

export async function getWelfareReferenceStatus(dbFile) {
  try {
    await fs.access(dbFile);
  } catch {
    return { exists: false, activeImport: null, recordCount: 0 };
  }
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const activeImport = db.prepare(`
      SELECT id, file_name, source_path, file_sha256, file_size, sheet_name, row_count, imported_at, is_active
      FROM welfare_compare_reference_imports
      WHERE is_active = 1
      ORDER BY imported_at DESC
      LIMIT 1
    `).get();
    const recordCount = activeImport
      ? db.prepare("SELECT COUNT(*) AS count FROM welfare_compare_reference_records WHERE import_id = ?").get(activeImport.id)?.count || 0
      : 0;
    return {
      exists: Boolean(activeImport),
      activeImport: activeImport ? formatWelfareReferenceImport(activeImport) : null,
      recordCount,
    };
  } finally {
    db.close();
  }
}

export async function getWelfareReferenceRecords(dbFile) {
  try {
    await fs.access(dbFile);
  } catch {
    return [];
  }
  const db = openDatabase(dbFile);
  try {
    ensureSchema(db);
    const activeImport = db.prepare(`
      SELECT id
      FROM welfare_compare_reference_imports
      WHERE is_active = 1
      ORDER BY imported_at DESC
      LIMIT 1
    `).get();
    if (!activeImport?.id) return [];
    return db.prepare(`
      SELECT game_name, subtitle, category, row_number
      FROM welfare_compare_reference_records
      WHERE import_id = ?
      ORDER BY row_number
    `).all(activeImport.id).map((row) => ({
      gameName: row.game_name || "",
      subtitle: row.subtitle || "",
      category: row.category || "",
      rowNumber: row.row_number || 0,
    }));
  } finally {
    db.close();
  }
}

function openDatabase(dbFile) {
  return new DatabaseSync(dbFile);
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_snapshots (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      counts_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_records (
      pool TEXT NOT NULL,
      item_id TEXT NOT NULL,
      game_name TEXT NOT NULL,
      source_key TEXT,
      event_at TEXT,
      platform_ids_json TEXT DEFAULT '{}',
      payload_json TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (pool, item_id)
    );
    CREATE TABLE IF NOT EXISTS game_record_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id TEXT NOT NULL,
      pool TEXT NOT NULL,
      item_id TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scheduler_jobs (
      id TEXT PRIMARY KEY,
      source_key TEXT NOT NULL UNIQUE,
      module TEXT NOT NULL,
      name TEXT NOT NULL,
      sources_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      cron_text TEXT NOT NULL DEFAULT '',
      interval_minutes INTEGER NOT NULL DEFAULT 0,
      run_times_json TEXT NOT NULL DEFAULT '[]',
      next_run_at TEXT,
      last_run_at TEXT,
      last_status TEXT,
      last_message TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scheduler_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      source_key TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      message TEXT,
      counts_json TEXT DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS operation_logs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      title TEXT,
      detail TEXT,
      payload_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_game_reference_imports (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      source_path TEXT,
      file_sha256 TEXT NOT NULL UNIQUE,
      file_size INTEGER NOT NULL DEFAULT 0,
      sheet_name TEXT,
      row_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      file_blob BLOB
    );
    CREATE TABLE IF NOT EXISTS platform_game_reference_records (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      platform_game_id TEXT,
      game_name TEXT NOT NULL,
      subtitle TEXT,
      category TEXT,
      downloads_7d INTEGER NOT NULL DEFAULT 0,
      normal_downloads_7d INTEGER NOT NULL DEFAULT 0,
      cloud_downloads_7d INTEGER NOT NULL DEFAULT 0,
      download_status TEXT,
      name_key TEXT NOT NULL,
      subtitle_key TEXT NOT NULL DEFAULT '',
      match_key TEXT NOT NULL,
      raw_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(import_id) REFERENCES platform_game_reference_imports(id)
    );
    CREATE TABLE IF NOT EXISTS welfare_compare_reference_imports (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      source_path TEXT,
      file_sha256 TEXT NOT NULL UNIQUE,
      file_size INTEGER NOT NULL DEFAULT 0,
      sheet_name TEXT,
      row_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      file_blob BLOB
    );
    CREATE TABLE IF NOT EXISTS welfare_compare_reference_records (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      game_name TEXT NOT NULL,
      subtitle TEXT,
      category TEXT,
      name_key TEXT NOT NULL,
      subtitle_key TEXT NOT NULL DEFAULT '',
      match_key TEXT NOT NULL,
      raw_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(import_id) REFERENCES welfare_compare_reference_imports(id)
    );
    CREATE INDEX IF NOT EXISTS idx_game_records_pool ON game_records(pool);
    CREATE INDEX IF NOT EXISTS idx_game_history_snapshot ON game_record_history(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_next_run ON scheduler_jobs(enabled, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_scheduler_runs_source ON scheduler_runs(source_key, started_at);
    CREATE INDEX IF NOT EXISTS idx_operation_logs_created ON operation_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_game_reference_active ON platform_game_reference_imports(is_active, imported_at);
    CREATE INDEX IF NOT EXISTS idx_platform_game_reference_match ON platform_game_reference_records(match_key);
    CREATE INDEX IF NOT EXISTS idx_platform_game_reference_name ON platform_game_reference_records(name_key);
    CREATE INDEX IF NOT EXISTS idx_welfare_compare_reference_active ON welfare_compare_reference_imports(is_active, imported_at);
    CREATE INDEX IF NOT EXISTS idx_welfare_compare_reference_match ON welfare_compare_reference_records(match_key);
    CREATE INDEX IF NOT EXISTS idx_welfare_compare_reference_name ON welfare_compare_reference_records(name_key);
  `);
  ensureColumn(db, "game_records", "platform_ids_json", "TEXT DEFAULT '{}'");
  ensureColumn(db, "scheduler_jobs", "run_times_json", "TEXT NOT NULL DEFAULT '[]'");
}

function formatWelfareReferenceImport(row = {}) {
  return {
    id: row.id,
    fileName: row.file_name || "",
    sourcePath: row.source_path || "",
    fileSha256: row.file_sha256 || "",
    fileSize: Number(row.file_size) || 0,
    sheetName: row.sheet_name || "",
    rowCount: Number(row.row_count) || 0,
    importedAt: row.imported_at || "",
    isActive: Boolean(row.is_active),
  };
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function pruneCacheTablesInDb(db) {
  if (maxDailySnapshots > 0) {
    db.prepare(`
      DELETE FROM daily_snapshots
      WHERE id NOT IN (
        SELECT id FROM daily_snapshots
        ORDER BY generated_at DESC
        LIMIT ?
      )
    `).run(maxDailySnapshots);
  }
  if (maxRecordHistory > 0) {
    db.prepare(`
      DELETE FROM game_record_history
      WHERE id NOT IN (
        SELECT id FROM game_record_history
        ORDER BY id DESC
        LIMIT ?
      )
    `).run(maxRecordHistory);
  }
}

function upsertGameRecordInDb(db, pool, itemId, item, now) {
  const source = Array.isArray(item.sources) ? item.sources.join("/") : String(item.platform || "");
  const platformIds = JSON.stringify(item.platformIds || {});
  const payload = JSON.stringify(item);
  const previous = db.prepare("SELECT payload_json FROM game_records WHERE pool = ? AND item_id = ?").get(pool, itemId)?.payload_json || "";
  db.prepare(`
    INSERT INTO game_records (pool, item_id, game_name, source_key, event_at, platform_ids_json, payload_json, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pool, item_id) DO UPDATE SET
      game_name = excluded.game_name,
      source_key = excluded.source_key,
      event_at = excluded.event_at,
      platform_ids_json = excluded.platform_ids_json,
      payload_json = excluded.payload_json,
      last_seen_at = excluded.last_seen_at
  `).run(pool, itemId, item.gameName || item.newsTitle || "未命名", source, item.eventAt || item.publishedAt || "", platformIds, payload, now, now);
  if (previous && previous !== payload) {
    db.prepare("INSERT INTO game_record_history (snapshot_id, pool, item_id, payload_json) VALUES (?, ?, ?, ?)")
      .run(`record-${now}-${pool}-${itemId}`, pool, itemId, previous);
    pruneCacheTablesInDb(db);
  }
}

function readDataFromRecordsInDb(db) {
  const records = db.prepare("SELECT pool, payload_json FROM game_records ORDER BY last_seen_at DESC").all();
  if (!records.length) return null;
  const data = {};
  for (const [, key] of poolMap) data[key] = [];
  for (const record of records) {
    const key = poolMap.find(([pool]) => pool === record.pool)?.[1];
    if (!key) continue;
    const item = parseJson(record.payload_json, null);
    if (item) data[key].push(item);
  }
  data.pcGames = [...(data.steamGames || []), ...(data.steamNewGames || []), ...(data.pcNews || [])];
  return data;
}

function snapshotMatchesRecordCounts(db, data = {}) {
  const rows = db.prepare("SELECT pool, COUNT(*) AS count FROM game_records GROUP BY pool").all();
  if (!rows.length) return true;
  const counts = Object.fromEntries(rows.map((row) => [row.pool, Number(row.count) || 0]));
  for (const [pool, key] of poolMap) {
    const recordCount = counts[pool] || 0;
    const snapshotCount = Array.isArray(data[key]) ? data[key].length : 0;
    if (recordCount > snapshotCount) return false;
  }
  return true;
}

function recordItemId(item = {}) {
  return String(item.id || item.appid || item.detailUrl || item.originalUrl || item.newsTitle || item.gameName || "").trim();
}

function recordMatches(item = {}, itemId = "", lookup = "") {
  const sourceRecordValues = (Array.isArray(item.sourceRecords) ? item.sourceRecords : []).flatMap((record) => [
    record.id,
    record.sourceId,
    record.platformId,
    record.detailUrl,
    record.originalUrl,
    record.url,
    ...Object.values(record.platformIds || {}),
  ]);
  const candidates = [
    itemId,
    item.id,
    item.appid,
    item.steamAppId,
    item.detailUrl,
    item.originalUrl,
    item.url,
    item.gameName,
    item.newsTitle,
    item.sourceId,
    item.platformId,
    item.gid,
    ...Object.values(item.platformIds || {}),
    ...sourceRecordValues,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return candidates.includes(lookup);
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function formatSchedulerJob(row = {}) {
  const runTimes = normalizeRunTimes(parseJson(row.run_times_json, []));
  return {
    id: row.id,
    sourceKey: row.source_key,
    module: row.module,
    name: row.name,
    sources: parseJson(row.sources_json, []),
    enabled: Boolean(row.enabled),
    cronText: row.cron_text || formatRunTimesText(runTimes),
    intervalMinutes: Number(row.interval_minutes) || 0,
    runTimes,
    nextRunAt: row.next_run_at || "",
    lastRunAt: row.last_run_at || "",
    lastStatus: row.last_status || "",
    lastMessage: row.last_message || "",
    updatedAt: row.updated_at || "",
  };
}

function formatSchedulerRun(row = {}) {
  const started = new Date(row.started_at || "");
  const finished = new Date(row.finished_at || "");
  const durationMs = Number.isNaN(started.getTime()) || Number.isNaN(finished.getTime()) ? 0 : Math.max(0, finished.getTime() - started.getTime());
  return {
    id: row.id,
    jobId: row.job_id,
    sourceKey: row.source_key,
    startedAt: row.started_at || "",
    finishedAt: row.finished_at || "",
    durationMs,
    status: row.status || "",
    message: row.message || "",
    counts: parseJson(row.counts_json, {}),
  };
}

function formatOperationLog(row = {}) {
  return {
    id: row.id,
    type: row.type,
    targetType: row.target_type || "",
    targetId: row.target_id || "",
    title: row.title || "",
    detail: row.detail || "",
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at || "",
  };
}

function computeNextRunAt(enabled, runTimes = [], intervalMinutes = 0) {
  if (!enabled) return "";
  const times = normalizeRunTimes(runTimes);
  if (times.length) {
    const now = new Date();
    const candidates = times
      .map((time) => nextScheduledLocalTime(time, now))
      .filter(Boolean)
      .sort((left, right) => left.getTime() - right.getTime());
    for (const candidate of candidates) {
      if (candidate.getTime() > now.getTime()) return candidate.toISOString();
    }
  }
  if (!intervalMinutes) return "";
  return new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
}

function normalizeRunTimes(value = []) {
  const list = Array.isArray(value) ? value : tokenizeRunTimes(value);
  return [...new Set(list.map((item) => {
    const parsed = parseRunTimeToken(item);
    if (!parsed) return "";
    const time = `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;
    return parsed.weekday ? `周${WEEKDAY_LABELS[parsed.weekday]}${time}` : time;
  }).filter(Boolean))].sort();
}

function tokenizeRunTimes(value = "") {
  return String(value || "").replace(/周([一二三四五六日天])\s+/g, "周$1").split(/[,，、/|]+|\s+(?!\d{1,2}:?\d{2})/).map((item) => item.trim()).filter(Boolean);
}

const WEEKDAY_LABELS = ["", "一", "二", "三", "四", "五", "六", "日"];

function parseRunTimeToken(value = "") {
  const text = String(value || "").trim().replace(/\s+/g, "");
  const weekly = text.match(/^(?:周|星期)([一二三四五六日天])(\d{1,2}):?(\d{2})$/);
  const daily = text.match(/^(\d{1,2}):?(\d{2})$/);
  const match = weekly || daily;
  if (!match) return "";
  const hourIndex = weekly ? 2 : 1;
  const minuteIndex = weekly ? 3 : 2;
  const weekday = weekly ? weekdayNumber(weekly[1]) : 0;
  const hour = Math.max(0, Math.min(23, Number(match[hourIndex]) || 0));
  const minute = Math.max(0, Math.min(59, Number(match[minuteIndex]) || 0));
  return { weekday, hour, minute };
}

function formatRunTimesText(runTimes = []) {
  const times = normalizeRunTimes(runTimes);
  return times.length ? times.join("、") : "";
}

function shouldPatchLegacyRunTimes(currentJson = "", legacyRunTimes = []) {
  if (!legacyRunTimes.length) return false;
  const current = normalizeRunTimes(parseJson(currentJson, []));
  if (!current.length) return false;
  return legacyRunTimes.some((legacy) => {
    const normalized = normalizeRunTimes(legacy);
    return normalized.length === current.length && normalized.every((time, index) => time === current[index]);
  });
}

function localTimeToday(time = "00:00", base = new Date()) {
  const [hour, minute] = String(time).split(":").map((value) => Number(value) || 0);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
}

function nextScheduledLocalTime(token = "", base = new Date()) {
  const parsed = parseRunTimeToken(token);
  if (!parsed) return null;
  const candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), parsed.hour, parsed.minute, 0, 0);
  if (!parsed.weekday) {
    if (candidate.getTime() <= base.getTime()) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }
  const today = base.getDay() || 7;
  let offset = parsed.weekday - today;
  if (offset < 0 || (offset === 0 && candidate.getTime() <= base.getTime())) offset += 7;
  candidate.setDate(candidate.getDate() + offset);
  return candidate;
}

function weekdayNumber(value = "") {
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  return map[value] || 0;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}
