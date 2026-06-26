# NewgameWiki

## Project Agent

Read [AGENTS.md](./AGENTS.md) before doing any new task in this project.

游戏资讯站第一阶段原型。

## 当前阶段

- 使用模拟数据。
- 前台包含首页、手游、端游/PC/主机/Steam。
- 后台是全站控制台，按钮只做模拟反馈，不触发真实爬虫。

## 启动

```powershell
npm install
npm run dev
```

前端地址：`http://127.0.0.1:64110/`

## 下一阶段

等爬虫相关 skill 安装完成后，再接入真实来源、SQLite 数据库、定时任务和清洗流程。
