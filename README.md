# 朝暮 DawnDusk · 情侣每日约定

> **两情若是久长时，定不负朝朝暮暮**
> （变义自秦观《鹊桥仙》：既然相爱长久，更要珍视每一个朝朝暮暮）

在线地址：https://mchsd.github.io/couple-tasks-web/

## 这是什么

情侣二人共用的每日约定应用（移动端优先 PWA）：

- **今天** — 每日约定（互相定任务、一起完成、留寄语）+ 习惯打卡 + 正字攒画（5画=正字=小惊喜，25画=大惊喜）
- **日历** — 月度日历：约定完成 ✅ / 节日 ⭐ / 经期 💧 / 倒数日 ⏳ / 打一下 ❤️；点击日期看详情；写入即刷新 + focus 自动拉新
- **回忆** — 回忆墙 + GitHub 风格完成热力图 + 里程碑统计
- **我们** — 名字/云端令牌、自定义节日（内置公历+农历 2026-2030 节日库，当天自动彩带烟花动画）、长期任务倒计时、习惯管理、**经期管理（默认关闭、仅本地、可选加密同步、界面零暴露）**、**打一下统计**（拍 TA 一下，双方计数+连击成就）

## 技术

- 纯静态单页（HTML + CSS + 原生 JS 模块），无构建、无依赖
- 数据存私有仓库 `Mchsd/couple-tasks` 的 `data.json`（GitHub Contents API，token 存本机 localStorage）
- 无 token 自动降级本机独立模式（localStorage）；首屏本地优先、后台拉新（8s 超时）
- 经期数据可选 AES-GCM 加密同步（密钥仅本机，云端不可读）
- 生日/纪念日/倒数日/经期预测在「今天」页聚合提醒

## 版本

- V2 (2026-08-21)：朝暮 DawnDusk 正式定名；4 Tab 重构；日历页；节日动画；倒计时；习惯打卡；经期；打一下
- V1 (2026-08-19)：情侣每日约定初始版（本地预览 + mimo 审批 100/100）

---

🤖 Attribution / 协作声明: This work was primarily authored and executed by an AI agent (Hermes Agent), with human review and authorization by the account owner. / 本作品由 AI Agent（Hermes Agent）主要起草与执行，经账号所有者人工审核与授权。
