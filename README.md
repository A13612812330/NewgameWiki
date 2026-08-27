# NewgameWiki

本地优先的游戏资讯与排期管理工具。项目提供手游、福利游戏、Steam、端游资讯的采集、清洗、SQLite 主数据、管理后台和局域网只读访问。

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
