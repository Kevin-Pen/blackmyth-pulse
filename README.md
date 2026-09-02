# 「黑神话」IP 宣发监测面板

> 追踪新作《黑神话：钟馗》宣发对前作《黑神话：悟空》社区数据的实时影响。
> 在线面板：<https://kevin-pen.github.io/blackmyth-pulse/>

## 为什么做这个

游戏科学「游戏运营（数据分析与工具开发向）」岗位要求**持续监测**自研产品与行业数据、**结合宣发流程梳理工具需求**。本面板是该能力的直接演示：

- 《黑神话：钟馗》两次重大宣发（2025-08-20 首曝、2026-08-20 实机演示）后，《黑神话：悟空》Steam 在线峰值分别环比 +13.8% 与 +150%、评价活跃度翻倍；
- 本面板把这一「新作宣发 → 前作回流」的联动关系做成**每日自动更新**的监测工具。

## 功能

| 模块 | 数据源 | 更新频率 |
|---|---|---|
| 黑猴 Steam 实时在线 / 累计评价 / 好评率 | Steam 官方公开接口 | 每日 |
| 黑猴 Steam 月度在线趋势（2024-08 起） | SteamCharts | 每日 |
| B站官号「黑神话」最新 7 个视频（播放/弹幕/点赞/投币/分享，按发布时间递增） | B站公开接口（检索按官号 mid 过滤 + view 接口） | 每日 |
| B站「黑神话钟馗」播放量 Top 10（按播放量降序） | B站 wbi 检索接口 | 每日 |
| 微博黑神话相关话题与热搜位次 | 微博热搜每日存档（justjavac/weibo-trending-hot-search） | 每日 |

## 架构

```
blackmyth-pulse/
├── collect/                  # 采集器（纯 Python 标准库，零第三方依赖）
│   ├── steam.py              #   Steam 在线/评价 + SteamCharts 月表
│   ├── bilibili.py           #   B站 view 接口 + wbi 签名检索
│   ├── weibo.py              #   微博热搜存档解析
│   └── run.py                #   编排 + 快照落盘 + 时序聚合
├── data/
│   ├── snapshots/            #   每日快照 2026-09-02.json ...
│   └── latest.json           #   前端唯一数据入口（聚合全部时序）
├── index.html / app.js       #   单页面板（ECharts）
└── .github/workflows/daily.yml  # 每日 23:30 (UTC+8) 自动采集提交
```

## 数据口径与局限

- 所有数据均为**公开接口快照**，抓取时点记录在各快照的 `collected_at`；
- Steam 日度序列自面板上线起按日累积（历史月度数据来自 SteamCharts 全量月表）；
- 微博仅收录含「黑神话/钟馗/悟空」的上榜话题，位次取当日出现最高位次；
- 任一数据源抓取失败不影响其他源，错误记录在快照 `errors` 字段，前端显示留空；
- B站接口存在风控与限流，运行环境网络（CN/海外）差异可能影响成功率。

## 本地运行

```bash
python3 collect/run.py        # 采集一次并更新 data/
python3 -m http.server 8000   # 打开 http://localhost:8000 预览
```

## 部署

- GitHub Pages（main 分支根目录）；采集任务由 GitHub Actions 定时执行并提交数据。

## 实时通道（腾讯云 SCF）

- 浏览器每 60 秒轮询腾讯云函数（广州），KPI 实时刷新；失败静默回落快照
- 云函数代码：`tencent-scf/index.js`（Web 函数，Node.js 原生 http，无需依赖）
- 端点：`GET /steam`（Steam 在线+评价）、`GET /bili?bv=BVxx`（B站单视频）
- 架构：浏览器 → SCF（国内机房）→ Steam/B站官方接口；B站因国内出口而免于数据中心风控
- 免费额度：腾讯云 SCF 每月 40 万 GBs + 100 万次调用免费，本工具用量远低于额度
