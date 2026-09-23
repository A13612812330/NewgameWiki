# NewgameWiki 项目交接文档

> 文档日期：2026-09-23
>
> 代码仓库：<https://github.com/A13612812330/NewgameWiki>
>
> 本机项目：`E:\新建文件夹\Codex-GPT\NewgameWiki`
>
> 目标读者：后续接手开发、排查和维护本项目的 Agent

## 1. 项目概览

NewgameWiki 是一个面向游戏运营与内容团队的本地优先数据工作流。它把不同游戏平台的新游、预约、活动、更新、福利游戏、Steam 数据和端游资讯采集到本地，经过清洗、去重和人工维护后，由统一网站向运营人员和只读访客展示。

当前产品包含：

- 首页：近期重点、重要游戏、日历和资讯入口。
- 手游：手游新游、预约、测试、活动与更新。
- 福利：小七手游等福利游戏及我方游戏库对比。
- 端游：Steam 游戏、Steam 新游和发售排期。
- 资讯：机核、游民星空、游侠网资讯。
- 后台：来源采集、任务计划、记录编辑、清洗问题、福利对比、数据库概览、操作日志和撤销。
- 访客入口：局域网只读服务，可查看数据但不能调用写入接口。

项目定位不是云端多用户 SaaS，而是本机运营工具和数据底座。后续计划可继续接入公司后台游戏库、未收录提醒和周报统计。

## 2. 当前成熟度

| 项目 | 当前状态 | 说明 |
| --- | --- | --- |
| 前台页面 | 已实现 | 首页、手游、福利、端游、资讯、全局搜索 |
| 管理后台 | 已实现 | 游戏池、来源、任务、日志、福利对比、数据库查看等 |
| SQLite 主数据 | 已实现 | 主记录、历史、任务、任务运行、操作日志、参考表 |
| `current.json` 快照 | 已实现 | 抓取和编辑后同步，供前端快速读取与恢复 |
| 平台采集 | 已实现但需持续维护 | 外部页面和接口变化会造成字段缺失或失败 |
| 定时任务 | 已实现 | 由 Node 服务内部调度，服务器停止后不会运行 |
| 只读访客模式 | 已实现 | 非 GET API 返回 403，但不是完整账号权限系统 |
| 多用户权限 | 未实现 | 当前没有登录、角色、审计主体或远程安全部署 |
| 自动化测试 | 基本缺失 | 目前以语法检查、构建、API 和人工页面验证为主 |

## 3. 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19、React Router 7、Vite 8、Lucide React、原生 CSS |
| 后端 | Node.js 22、Express 5、ES Module |
| 数据库 | Node 内置 `node:sqlite`，本地 SQLite |
| 采集 | Node `fetch`、HTML/JSON 解析、Steam 官方接口、必要时 Edge/Chrome CDP 渲染 |
| 表格 | Python 脚本处理 Excel 导入、导出、评级和福利对比 |
| 本机启动 | PowerShell、CMD、VBS |
| 代码托管 | GitHub 公共仓库，MIT License |

Node.js 必须使用 22 或更新版本，因为数据库层依赖 `node:sqlite`。

## 4. 目录与关键文件

```text
NewgameWiki/
├─ src/                         React 前端
│  ├─ App.jsx                   路由、导航、更新提示、全局搜索入口
│  ├─ data/useGameData.js       /api/data 缓存、标准化、页面切换更新检查
│  ├─ pages/AdminPage.jsx       管理后台主要实现，当前文件较大
│  ├─ pages/HomePage.jsx        首页
│  ├─ pages/MobilePage.jsx      手游页
│  ├─ pages/WelfarePage.jsx     福利页
│  ├─ pages/PcPage.jsx          端游页
│  ├─ pages/NewsPage.jsx        资讯页
│  ├─ components/GlobalSearch.jsx
│  └─ styles.css                全局样式
├─ server/
│  ├─ index.js                  Express 入口、API、任务调度、读写链路
│  ├─ local-cache.js            SQLite 表结构与数据访问层
│  ├─ data-shape.js             数据结构标准化
│  ├─ env.js                    本地环境变量加载
│  ├─ crawler/
│  │  ├─ mobile.js              手游/福利发现、解析、清洗、合并、重抓
│  │  ├─ taptap-rendered.js     TapTap 浏览器渲染兜底与缓存清理
│  │  ├─ steam-sample.js        Steam 发现、详情、在线人数和分类
│  │  └─ pc-news-sample.js      机核、游民星空、游侠网资讯
│  └─ excel/                    Excel 导入、导出、评级和福利对比脚本
├─ data/                        本地运营数据，Git 忽略，禁止提交
├─ runtime-cache/               浏览器与采集缓存，Git 忽略
├─ tmp/                         启动、任务和 Git 留档日志，Git 忽略
├─ dist/                        Vite 构建产物
├─ AGENTS.md                    项目视觉、数据和清洗规则
├─ README.md                    使用者安装与启动文档
├─ PROJECT_HANDOFF.md           本交接文档
├─ .env.example                可公开的配置示例
└─ scripts/git-backup.ps1       每日源代码 GitHub 留档
```
## 5. 架构与主数据流

```text
平台接口、列表页、详情页
          │
          ▼
discover / fetch / parse
          │
          ▼
字段清洗、名称归一、来源合并、问题记录
          │
          ▼
SQLite game_records 主记录
          │
          ├─ game_record_history 历史
          ├─ scheduler_runs 任务运行
          └─ operation_logs 操作日志
          │
          ▼
重建 app_state + data/current.json
          │
          ▼
/api/data -> React 内存缓存 -> 各前台与后台页面
```

核心原则：

1. SQLite 是主数据源。
2. `data/current.json` 是前端快照和恢复兜底，不应作为唯一主库。
3. 单条编辑、隐藏、软删除和重抓应先更新记录，再重建快照。
4. 批量采集采用增量合并，已有平台 ID 或详情页记录优先复用，不应清空整个池。
5. `pcGames` 是 `steamGames + steamNewGames + pcNews` 的兼容聚合结果。
6. 本地运营数据不随 GitHub 迁移；新电脑克隆后默认是空库。

## 6. 数据池与主要规则

| 数据池 | 字段/分类重点 |
| --- | --- |
| `mobileGames` | 手游名称、副标题、时间、状态、活动/更新内容、玩法标签、来源记录、重要级别 |
| `welfareGames` | 福利游戏名称、副标题、在玩/预约人数、类型、来源、我方收录对比、重要级别 |
| `steamGames` | 最近在线人数大于等于 1000 的 Steam 游戏 |
| `steamNewGames` | 新游、预约、即将推出；不收普通低在线老游戏 |
| `pcNews` | 资讯标题、平台、发布时间、图片、作者、摘要和关联游戏 |

手游多来源内容优先级以完整度为基础，运营偏好为：好游快爆内容优先于 TapTap，TapTap 优先于九游。必须保留来源历史，但前端默认只展示每个平台最新、有效的来源内容。

重要级别目前只用于手游和福利游戏：`S / A / B / C`，默认 `C`。排序需要先考虑时间，再考虑重要级别；具体页面规则应先阅读 `AGENTS.md` 和现有排序函数。

## 7. SQLite 表

数据库默认位置：`data/newgamewiki.db`。

| 表 | 用途 |
| --- | --- |
| `app_state` | `/api/data` 使用的完整数据快照 |
| `game_records` | 各数据池主记录，主键为 `pool + item_id` |
| `game_record_history` | 数据历史快照 |
| `daily_snapshots` | 每日数量汇总 |
| `scheduler_jobs` | 平台任务配置 |
| `scheduler_runs` | 每次任务的开始、结束、状态、原因和数量 |
| `operation_logs` | 编辑、隐藏、删除、重抓、任务和撤销日志 |
| `platform_game_reference_*` | 平台游戏名单与下载量评级参考 |
| `welfare_compare_reference_*` | 我方福利游戏名单导入与对比参考 |

修改表结构前必须先备份 `data/newgamewiki.db` 和 `data/current.json`。不要删除或重建现有数据库来解决普通字段问题。

## 8. 采集方式

### 8.1 手游与福利

- TapTap：优先静态或结构化数据；关键字段缺失时使用 Edge/Chrome CDP 渲染兜底。浏览器目录位于 `runtime-cache/`，任务结束后应清理。
- 好游快爆：列表发现与详情补全，内容通常作为手游活动/更新的高优先级来源。
- 九游：列表和详情解析；内容较短，主要补充新游、开测、时间、标签和厂商。
- 小七手游：新游、预约和详情页采集，重点提取副标题、福利信息、在玩人数和预约人数。
- 单条重抓：应走“匹配平台 ID/详情页 -> 获取详情 -> 合并原记录”，而不是重抓并替换整个池。

### 8.2 Steam

- 使用 Steam Charts/Steam 商店相关接口和页面发现 AppID。
- 详情通过 Steam Store API 获取，在线人数通过 Steam 官方接口获取。
- 已有详情尽量复用，只补新增或关键字段缺失项。
- 分类规则在后端和前端均有实现，修改时要同时检查，避免两端不一致。

### 8.3 端游资讯

- 机核、游民星空、游侠网：列表页拿标题、链接、图片和时间，详情页补摘要、作者等字段。
- 图片需要兼容 `src`、懒加载属性和详情首图。
- 当前外站解析是脆弱边界，页面结构改版后应优先记录字段级失败，而不是静默写入空字段。

## 9. 定时任务

默认任务定义在 `server/index.js`：

| 来源 | 默认时间 |
| --- | --- |
| TapTap | 每日 09:00 |
| 好游快爆 | 每日 09:15 |
| 九游 | 每日 09:30 |
| 小七手游 | 每日 09:45 |
| Steam 游戏 | 周一 07:30、周五 21:30 |
| Steam 新游 | 周一 07:50、周五 21:50 |
| 机核 | 每日 12:10 |
| 游民星空 | 每日 12:25 |
| 游侠网 | 每日 12:40 |

注意：这些是首次初始化的默认值。真实启用状态和用户后来修改的时间保存在本机 SQLite，应以后端 `/api/scheduler/jobs` 返回结果为准。

调度器属于 Node 服务内部逻辑：

- 后端必须持续运行，定时任务才会执行。
- 默认每 60 秒检查一次到期任务。
- 单任务默认 5 分钟超时。
- 支持立即运行、停止、启停、查看最近运行和全部暂停。
- GitHub 每日留档任务与采集任务不是同一个系统。

## 10. API 概览

### 只读数据

- `GET /api/health`
- `GET /api/data`
- `GET /api/data/meta`
- `GET /api/cache/status`
- `GET /api/system/status`
- `GET /api/system/files`
- `GET /api/pools/:pool`
- `GET /api/scheduler/jobs`
- `GET /api/scheduler/runs`
- `GET /api/scheduler/job-detail`
- `GET /api/operation-logs`
- `GET /api/welfare/reference`
- `GET /api/image`

### 数据与记录操作

- `POST /api/pool/field-choice`
- `POST /api/pool/visibility`
- `POST /api/pool/delete`
- `POST /api/crawl/today`
- `POST /api/crawl/record`
- `POST /api/cleanup/issues/status`
- `POST /api/cache/sync`
- `POST /api/backup/create`
- `POST /api/logs/undo-latest`
- `POST /api/logs/undo-operation`

### 任务操作

- `POST /api/scheduler/job`
- `POST /api/scheduler/run`
- `POST /api/scheduler/stop`
- `POST /api/scheduler/pause-all`
- `POST /api/scheduler/runs/cleanup-failures`

### 福利对比与 Excel

- `POST /api/welfare/reference/import`
- `POST /api/welfare/compare`
- `GET /api/cleanup/excel`
- `POST /api/cleanup/excel/apply`

`POST /api/data/clear` 当前仍存在，是高风险接口。下一位 Agent 应优先确认是否彻底移除、限制为开发模式，或增加显式二次保护；不要在真实数据环境调用它。

## 11. 启动、停止与访问

### 安装

```powershell
git clone https://github.com/A13612812330/NewgameWiki.git
cd NewgameWiki
npm install
Copy-Item .env.example .env
```

### 本机管理服务

```powershell
powershell -ExecutionPolicy Bypass -File .\start-newgamewiki.ps1
```

- 管理地址：`http://127.0.0.1:64111/`
- 脚本会按需安装依赖、构建前端、结束旧的 64111 监听进程并启动新服务。
- 日志写入 `tmp/`。

### 开发模式

```powershell
npm run dev
```

- Vite 前端：`http://127.0.0.1:64110/`
- API：`http://127.0.0.1:64111/`
- Vite 将 `/api` 代理到 64111。

### 局域网只读服务

```powershell
powershell -ExecutionPolicy Bypass -File .\start-newgamewiki-readonly.ps1 -OpenBrowser
```

- 默认端口：`64112`
- 监听：`0.0.0.0`
- 环境变量：`NEWWIKI_READONLY=1`
- 写 API 会被拒绝，但该模式不等同于互联网安全部署。

### 停止服务

当前没有独立的正式停止脚本。可根据端口找到本项目进程后停止，执行前必须确认 PID 属于 NewgameWiki：

```powershell
Get-NetTCPConnection -LocalPort 64111 | Select-Object OwningProcess
Stop-Process -Id <确认后的PID>
```

## 12. 配置与敏感边界

公开配置模板为 `.env.example`。真实 `.env` 不允许提交，也不应在未获授权时读取或打印。

主要配置：

- `SERVE_WEB`、`PORT`、`HOST`
- `SCHEDULER_CHECK_MS`、`SCHEDULER_TIMEOUT_MS`、`SCHEDULER_INITIAL_DELAY_MS`
- `NEWWIKI_BROWSER_CACHE_DIR`
- 各采集器超时和详情数量限制
- SQLite 历史与本地备份保留数量
- 可选 Firecrawl 配置

Git 忽略范围：

- `data/`
- `runtime-cache/`
- `tmp/`
- `archive/`
- `node_modules/`
- `.env` 与机器专用配置

任何 Git 提交前都要确认上述目录没有被跟踪。

## 13. 前端数据刷新机制

`src/data/useGameData.js` 在浏览器内维护 `/api/data` 内存缓存：

1. 首次进入读取完整数据。
2. 页面切换时请求 `/api/data/meta` 检查快照是否更新。
3. 检测到变化后显示“数据已更新，点击刷新”。
4. 用户确认后重新读取完整 `/api/data`。

这样做是为了避免每次切页都下载完整快照。若页面出现旧数据，应先检查 `current.json` 是否已重建、`generatedAt` 是否变化，以及前端是否触发刷新，而不是直接关闭缓存。

## 14. GitHub 与代码留档

- 公共仓库：<https://github.com/A13612812330/NewgameWiki>
- 主分支：`main`
- 本机存在 Windows 任务：`NewgameWiki-GitHub-Backup`
- 默认每天 21:00 执行 `scripts/git-backup.ps1`
- 脚本只提交 Git 可跟踪的源代码、文档和示例配置。
- 远程领先时仅允许 `pull --ff-only`；冲突或异常时停止，不强推。
- 日志位置：`tmp/git-backup/`

该任务不是数据库备份。`data/`、SQLite、运营 Excel、缓存和 `.env` 不会上传 GitHub。

## 15. 已知风险和优先检查项

### 高优先级

1. **危险清空接口**：`POST /api/data/clear` 仍在代码中，应限制或移除。
2. **没有账号权限**：只读模式基于服务启动方式和 HTTP 方法限制，不适合直接暴露到公网。
3. **运营数据未进入 Git**：转移 Agent 不等于迁移本地数据库；不得误以为克隆仓库会带回数据。
4. **外部采集不稳定**：平台改版、网络限制、懒加载和反爬都会影响结果，需要字段级诊断和低频增量策略。
5. **SQLite 修改风险**：数据层修改后必须验证 SQLite、`/api/data` 和 `current.json` 三者一致。

### 中优先级

1. `src/pages/AdminPage.jsx` 体积较大，后续功能扩展前建议按任务、来源、游戏池、日志、福利对比拆分组件。
2. 前后端都有 Steam 分类和排序逻辑，存在规则漂移风险，建议逐步收敛到共享契约或后端结果。
3. 缺少自动化测试，采集清洗回归主要靠真实记录人工检查。
4. `package.json` 描述仍带 `prototype`，发布前可更新为正式产品说明。
5. README 与运行时功能可能随迭代漂移，每次修改启动方式、端口、任务和数据结构时应同步文档。

## 16. 当前验证状态

本交接前已确认：

- Git 工作区在编写文档前为干净状态，并跟踪 `origin/main`。
- GitHub 仓库存在，当前为公开仓库，默认分支是 `main`。
- GitHub CLI 当前已登录。
- Windows 任务 `NewgameWiki-GitHub-Backup` 存在且处于 Ready。

本次交接不会启动采集任务，也不会读取或修改本机运营数据库。服务运行、真实采集结果和页面视觉需在具体开发任务中重新验证。

## 17. 接手 Agent 的第一轮操作

```powershell
cd E:\新建文件夹\Codex-GPT\NewgameWiki
Get-Content -Raw .\AGENTS.md
Get-Content -Raw .\PROJECT_HANDOFF.md
git status --short --branch
git pull --ff-only
npm install
node --check server\index.js
node --check server\local-cache.js
node --check server\crawler\mobile.js
npm run build
```

然后按任务范围执行：

1. 页面任务：先读对应 `src/pages/*`、`src/styles.css` 和已有相似组件。
2. 采集任务：先检查最近任务运行日志、目标平台 HTML/接口和字段诊断，再改解析规则。
3. 数据任务：先备份本地数据库，检查 `server/local-cache.js` 和快照重建路径。
4. 定时任务：以后端 SQLite 中实际任务配置为准，不只看代码默认值。
5. Git 操作：不要提交 `data/`、缓存、日志、`.env` 或任何 Cookie/密钥。

## 18. 建议的后续路线

1. 移除或保护 `/api/data/clear`，补充最小权限边界。
2. 为数据层增加自动化测试：单条 upsert、软删除、撤销、快照重建、跨来源合并。
3. 为各采集器建立固定样本回归，检查时间、内容、图片、标签、厂商和平台 ID。
4. 拆分 `AdminPage.jsx`，降低后台继续迭代的回归风险。
5. 将公司福利游戏库导入流程稳定为“默认参考表 + 可更新导入 + 未收录提醒”。
6. 从 SQLite 输出日新增、未收录、失败率、重点游戏和资讯统计，形成周报数据出口。
7. 如果需要多人远程使用，再单独设计登录、角色、部署、备份和网络安全，不能直接把本机管理端口暴露公网。

## 19. 交接提示词

可将下面内容直接交给下一位 Agent：

```text
请接手 NewgameWiki 项目。
仓库：https://github.com/A13612812330/NewgameWiki
本机目录：E:\新建文件夹\Codex-GPT\NewgameWiki

开始前必须阅读 AGENTS.md、README.md 和 PROJECT_HANDOFF.md，以当前代码和运行结果为准，不要把历史需求直接当作已实现事实。

重要边界：
1. SQLite 是主数据源，current.json 是前端快照。
2. 禁止提交或清空 data/、SQLite、缓存、日志、.env 和运营文件。
3. 修改数据库前先备份；写入后验证 SQLite、/api/data、current.json 一致。
4. 采集采用低频、增量、可恢复策略，静态数据优先，浏览器仅兜底。
5. 不要直接暴露管理服务到公网；当前没有完整多用户权限。
6. 修改后至少运行 node --check 和 npm run build，并报告真实验证结果。
```
