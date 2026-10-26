# NewgameWiki

> **交给 AI Agent 复刻/运行：**把仓库链接和 [`AI_AGENT_SETUP.md`](./AI_AGENT_SETUP.md) 中的整段提示词一起发给 Agent。Agent 应自行克隆、安装、构建、启动并验证，不要只给你一份操作建议。架构和接手细节见 [`PROJECT_HANDOFF.md`](./PROJECT_HANDOFF.md)，项目规则见 [`AGENTS.md`](./AGENTS.md)。

仓库地址：<https://github.com/A13612812330/GH-NewGameWIki>

## 项目简介

NewgameWiki 是一个面向游戏运营与内容团队的本地优先游戏资讯、活动和排期管理工具。它把分散在 TapTap、好游快爆、九游、小七手游、Steam、机核、游民星空和游侠网等平台的信息，采集、清洗、合并到一套可管理的数据中，再以网站形式提供展示和后台维护。

它适合用于跟踪手游新游与预约、福利游戏、Steam 游戏与新游，以及端游资讯；也可作为后续“我方游戏库对比、未收录提醒、周报统计”的本地数据底座。项目默认单机运行，运营数据始终留在本机。

## 数据流

`平台列表/详情页 -> 字段清洗与去重 -> SQLite 主数据库 -> current.json 前端快照 -> 前台与管理后台`

- SQLite 保存主记录、历史、任务、运行记录和操作日志。
- `data/current.json` 是前端读取的快照，在抓取、编辑、隐藏、删除或重抓后自动更新。
- 平台采集按增量合并执行：已有记录复用并补字段，新增记录才写入，不会用一次抓取直接清空整个数据池。
- 访客服务只读，不提供采集、编辑、删除、任务管理等写入能力。

## 功能

- 五个数据池：手游、福利游戏、Steam 游戏、Steam 新游、端游资讯。
- SQLite 为主数据源，`data/current.json` 为前端快照。
- 平台级采集、单条重抓、来源记录和清洗问题管理。
- 本地定时任务、运行记录、失败原因和操作日志。
- 管理服务与局域网只读访客服务分离。

## 环境要求

- Windows 10/11
- Node.js 22 或更新版本（项目使用 Node 内置 `node:sqlite`）
- npm
- 可选：Microsoft Edge 或 Chrome，用于 TapTap 等需要浏览器兜底的来源

## 安装与启动

```powershell
git clone <your-repository-url>
cd NewgameWiki
npm install
Copy-Item .env.example .env
```

启动本地管理站：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-newgamewiki.ps1
```

管理地址：`http://127.0.0.1:64111/`

也可以直接运行：

```powershell
$env:SERVE_WEB = "1"
$env:PORT = "64111"
npm run start
```

首次启动时会自动创建本地 `data/`、SQLite 数据库和空快照；这些运行数据不会进入 Git。

## 在其他电脑安装

1. 安装 Node.js 22 或更新版本与 Git。
2. 克隆仓库并执行上述 `npm install`。
3. 复制 `.env.example` 为 `.env`，根据本机端口和缓存目录调整配置。
4. 运行 `start-newgamewiki.ps1`，首次启动后系统会创建空的 `data/` 目录与 SQLite 数据库。
5. 通过后台手动采集，或导入你自己的运营数据。原电脑的 `data/` 不会随 GitHub 自动迁移；如确有迁移需求，应单独、受控地备份和导入数据目录。

## 局域网只读访客服务

```powershell
powershell -ExecutionPolicy Bypass -File .\start-newgamewiki-readonly.ps1 -OpenBrowser
```

默认监听 `64112`。该服务启用 `NEWWIKI_READONLY=1`，用于访客查看，不允许后台编辑和采集操作。

## 配置

将 `.env.example` 复制为 `.env` 后按需调整。默认配置可直接运行；不要提交 `.env`、Cookie、平台账号或 API Key。

常用项：

- `PORT`：管理服务端口，默认 `64111`。
- `NEWWIKI_BROWSER_CACHE_DIR`：浏览器采集缓存目录，建议设为项目所在磁盘。
- `SCHEDULER_CHECK_MS`、`SCHEDULER_TIMEOUT_MS`：定时任务检查频率和超时。
- `NEWWIKI_TAPTAP_DETAIL_LIMIT`：每轮 TapTap 详情补全上限。
- `NEWWIKI_PRUNE_BACKUPS`：设为 `1` 才会裁剪本机历史撤销与数据备份；默认不裁剪。
- `NEWWIKI_MAX_UNDO_SNAPSHOTS`、`NEWWIKI_MAX_BACKUP_PAIRS`：开启裁剪后保留的撤销快照与备份数量。

## GitHub 代码留档

仓库可使用 `scripts/git-backup.ps1` 做每日代码留档。该脚本只提交未被 Git 忽略的源代码、文档和配置示例；`data/`、SQLite、缓存、日志与 `.env` 不会上传。

手动执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\git-backup.ps1
```

建议通过 Windows 任务计划程序每天运行一次。项目配置的任务名为 `NewgameWiki-GitHub-Backup`，默认在每天 21:00 执行。任务遇到远程分支领先或 Git 冲突时会停止并写入 `tmp/git-backup/` 日志，不会强推或覆盖远程内容。

## 数据与开源边界

仓库只公开代码、启动脚本和示例配置，不包含：

- `data/` 内的 SQLite、JSON 快照、Excel、备份、日志和撤销记录。
- `runtime-cache/`、`tmp/`、浏览器临时目录。
- `.env`、Cookie、密钥及任何内部平台数据。

新部署默认为空数据。导入或采集的内容仅保存在本机 `data/`。

## 开发验证

```powershell
node --check server/index.js
node --check server/crawler/mobile.js
npm run build
```

## 许可证

本项目使用 [MIT License](./LICENSE)。第三方站点内容、商标、图片及平台数据仍受各自权利方和站点规则约束。
