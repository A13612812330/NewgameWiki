import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { crawlToday, emptyDataset } from "./crawler/mobile.js";

const app = express();
const port = Number(process.env.PORT || 64111);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const dataDir = path.join(root, "data");
const currentDataFile = path.join(dataDir, "current.json");
const excelDir = path.join(dataDir, "excel");
const mobileWorkbookFile = path.join(excelDir, "手游池整理表.xlsx");

app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "newgame-wiki", phase: "excel-admin" });
});

app.get("/api/data", async (_request, response) => {
  response.json(await readCurrentData());
});

app.get("/api/mobile-pool", async (_request, response) => {
  const data = await readCurrentData();
  response.json({
    date: data.date,
    generatedAt: data.generatedAt,
    pool: data.mobileGames || [],
    rawRecords: data.rawMobileRecords || [],
    cleanupIssues: data.cleanupIssues || [],
  });
});

app.get("/api/cleanup/excel", async (_request, response) => {
  try {
    const workbook = await exportWorkbook();
    response.json({
      ok: true,
      file: workbook.file,
      updatedAt: workbook.updatedAt,
    });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "导出 Excel 失败" });
  }
});

app.post("/api/cleanup/excel/apply", async (_request, response) => {
  try {
    const data = await applyWorkbook();
    response.json({ ok: true, data });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "应用 Excel 失败" });
  }
});

app.post("/api/pool/field-choice", async (request, response) => {
  try {
    const { gameId, field, value, source } = request.body || {};
    if (!gameId || !field) return response.status(400).json({ ok: false, message: "缺少游戏ID或字段" });
    const data = await readCurrentData();
    const result = applyFieldChoice(data, { gameId, field, value, source });
    if (!result.ok) return response.status(404).json(result);
    await writeCurrentData(data);
    const excel = await exportWorkbook();
    response.json({ ok: true, data, excel });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "字段写回失败" });
  }
});

app.post("/api/crawl/today", async (request, response) => {
  try {
    const sources = request.body?.sources?.length ? request.body.sources : ["taptap", "ninegame", "hykb"];
    const data = await crawlToday({ sources });
    await writeCurrentData(data);
    response.json({ ok: true, data });
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || "抓取失败" });
  }
});

app.post("/api/data/clear", async (_request, response) => {
  const data = emptyDataset();
  await writeCurrentData(data);
  response.json({ ok: true, data });
});

app.get("/api/image", async (request, response) => {
  const url = String(request.query.url || "");
  if (!/^https?:\/\//.test(url)) return response.status(400).send("bad url");
  try {
    const upstream = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 NewgameWikiImageProxy/0.1",
        "referer": new URL(url).origin,
      },
    });
    if (!upstream.ok) return response.status(upstream.status).send("image fetch failed");
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await upstream.arrayBuffer());
    response.setHeader("Content-Type", contentType);
    response.setHeader("Cache-Control", "public, max-age=86400");
    response.send(buffer);
  } catch (error) {
    response.status(502).send(error?.message || "image proxy failed");
  }
});

if (process.env.SERVE_WEB === "1") {
  app.use(express.static(distDir));
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api")) return next();
    response.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`NewgameWiki API listening on http://127.0.0.1:${port}`);
});

async function readCurrentData() {
  try {
    return JSON.parse(await fs.readFile(currentDataFile, "utf8"));
  } catch {
    const data = emptyDataset();
    await writeCurrentData(data);
    return data;
  }
}

async function writeCurrentData(data) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(currentDataFile, JSON.stringify(data, null, 2), "utf8");
}

async function exportWorkbook() {
  await fs.mkdir(excelDir, { recursive: true });
  await runPython(path.join(root, "server", "excel", "export_excel.py"), [currentDataFile, mobileWorkbookFile]);
  const stat = await fs.stat(mobileWorkbookFile);
  return {
    file: mobileWorkbookFile,
    updatedAt: stat.mtime.toISOString(),
  };
}

async function applyWorkbook() {
  await runPython(path.join(root, "server", "excel", "import_excel.py"), [mobileWorkbookFile, currentDataFile, currentDataFile]);
  return readCurrentData();
}

function applyFieldChoice(data, { gameId, field, value, source }) {
  const game = (data.mobileGames || []).find((item) => item.id === gameId);
  if (!game) return { ok: false, message: "未找到对应游戏" };
  const allowed = new Set(["gameName", "gameplayTags", "vendor", "summary"]);
  if (!allowed.has(field)) return { ok: false, message: "不支持的字段" };
  const cleanedValue = Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : String(value || "").trim();
  if (field === "gameplayTags") {
    const tags = Array.isArray(cleanedValue) ? cleanedValue : String(cleanedValue || "").split(/[\/?,?]/).map((item) => item.trim()).filter(Boolean);
    game.gameplayTags = [...new Set(tags)];
    game.tags = [...new Set([game.status, game.eventType, ...game.gameplayTags].filter(Boolean))];
  } else if (field === "summary") {
    game.summary = String(cleanedValue || "");
    game.updateContent = game.updateContent || "";
  } else {
    game[field] = String(cleanedValue || "");
  }
  game.manualChoices = {
    ...(game.manualChoices || {}),
    [field]: { value: cleanedValue, source: source || "手动审核", updatedAt: new Date().toISOString() },
  };
  const labelMap = { gameName: "游戏名称", gameplayTags: "玩法标签", vendor: "游戏厂商", summary: "整理内容" };
  data.updateLogs = [
    { id: `log-field-${Date.now()}`, time: new Date().toISOString(), type: "审核", title: "字段采用", detail: `${game.gameName}：${labelMap[field]}采用 ${source || "手动值"}。` },
    ...(data.updateLogs || []),
  ].slice(0, 80);
  data.generatedAt = new Date().toISOString();
  return { ok: true };
}

function runPython(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [scriptPath, ...args], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `python exited with code ${code}`));
    });
  });
}

