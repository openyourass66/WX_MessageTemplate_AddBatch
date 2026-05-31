<div align="center">

# 微信小程序订阅消息模板批量工具

<p align="center">
  <strong>一键导出 · 批量添加 · 可视化管理</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-42.x-47848F?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/platform-Windows-0078D4?logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

</div>

---

## 目录

- [📦 下载安装](#-下载安装)
- [🚀 快速上手](#-快速上手)
- [🖥️ 桌面端功能](#️-桌面端功能)
- [💻 CLI 命令行模式](#-cli-命令行模式)
  - [1. 准备源小程序配置](#1-准备源小程序配置)
  - [2. 导出源小程序模板](#2-导出源小程序模板)
  - [3. 准备目标小程序列表](#3-准备目标小程序列表)
  - [4. Dry-Run 预检查](#4-dry-run-预检查)
  - [5. 正式批量添加](#5-正式批量添加)
- [🔧 开发与构建](#-开发与构建)
- [🔒 密钥安全](#-密钥安全)
- [📄 数据字段说明](#-数据字段说明)

---

## 📦 下载安装

从 [Releases](https://github.com/openyourass66/WX_MessageTemplate_AddBatch/releases) 页面下载最新版本：

| 文件 | 说明 |
|------|------|
| `微信小程序模板批量工具 Setup x.x.x.exe` | **安装包** — 支持自定义安装目录、创建桌面快捷方式 |
| `微信小程序模板批量工具 x.x.x.exe` | **便携版** — 下载后直接运行，无需安装 |

## 🚀 快速上手

### 图形界面模式

1. 下载并运行安装包
2. **导出模板** — 填写源小程序的 AppID 和 Secret，点击导出
3. **目标管理** — 添加需要批量推送的目标小程序
4. **批量添加** — 选择模板，点击 Dry-Run 预检，确认后执行添加

### 命令行模式

```bash
# 导出源小程序模板
npm run export:templates

# Dry-Run 预检查
npm run add:templates -- --templates exports/templates-xxx.json --targets targets.json --dry-run

# 正式批量添加
npm run add:templates -- --templates exports/templates-xxx.json --targets targets.json
```

## 🖥️ 桌面端功能

| 功能 | 说明 |
|------|------|
| **导出模板** | 配置源小程序 AppID / Secret 或已有 Access Token，一键导出所有订阅消息模板 |
| **目标小程序管理** | 可视化增删改目标小程序列表，支持 Secret / Access Token 两种认证方式 |
| **批量添加** | 从已导出模板中选择需要添加的条目（支持勾选），Dry-Run 预检无误后执行 |
| **运行日志** | 实时查看脚本执行过程，方便定位问题 |
| **数据持久化** | 自动保存上次导出的模板和目标列表，关闭后重新打开即可继续操作 |
| **字段详情** | 点击展开模板字段详情（name / valueKey / kid / example） |

## 💻 CLI 命令行模式

如果需要在非 Windows 环境或 CI/CD 中使用，项目保留了完整的命令行接口。

### 1. 准备源小程序配置

```bash
# 复制示例配置
cp .env.example .env
```

编辑 `.env` 文件：

```ini
WECHAT_APPID=源小程序的 AppID
WECHAT_SECRET=源小程序的 Secret
```

如果已有有效的 `access_token`，可替代 AppID + Secret：

```ini
WECHAT_ACCESS_TOKEN=源小程序的 access_token
```

### 2. 导出源小程序模板

```bash
npm run export:templates
```

导出文件位于 `exports/templates-{timestamp}.json`。

### 3. 准备目标小程序列表

```bash
cp targets.example.json targets.json
```

编辑 `targets.json`：

```json
[
  {
    "name": "project-a",
    "appid": "目标小程序的 AppID",
    "secret": "目标小程序的 Secret"
  }
]
```

或使用已有 Token：

```json
[
  {
    "name": "project-a",
    "appid": "目标小程序的 AppID",
    "accessToken": "目标小程序的 access_token"
  }
]
```

### 4. Dry-Run 预检查

```bash
npm run add:templates -- \
  --templates exports/templates-xxx.json \
  --targets targets.json \
  --dry-run
```

Dry-Run 模式会执行完整的认证和比对流程，但**不会**调用微信的 `addtemplate` 接口创建模板，适合在上线前确认预期结果。

### 5. 正式批量添加

```bash
npm run add:templates -- \
  --templates exports/templates-xxx.json \
  --targets targets.json
```

执行结果保存在 `exports/add-template-results-{timestamp}.json`。

## 🔧 开发与构建

### 开发模式

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev
```

### 构建安装包

```bash
# 构建 NSIS 安装包 + 便携版
npm run dist:win
```

构建产物位于 `release/` 目录：

| 文件 | 说明 |
|------|------|
| `微信小程序模板批量工具 Setup x.x.x.exe` | NSIS 安装包 |
| `微信小程序模板批量工具 x.x.x.exe` | 便携版（免安装） |
| `微信小程序模板批量工具 Setup x.x.x.exe.blockmap` | 增量更新映射（自动更新用） |

### 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | [Electron](https://www.electronjs.org/) 42.x |
| 前端 | 原生 HTML5 / CSS3 / JavaScript（ES6） |
| 进程通信 | contextBridge + ipcRenderer/ipcMain |
| 打包 | electron-builder（NSIS + Portable） |
| 运行时 | Node.js 18+ |

## 🔒 密钥安全

> ⚠️ 微信小程序的 `secret` 和 `access_token` 属于敏感凭据，泄露可能导致小程序被恶意操作。

- `.env` 和 `targets.json` 已通过 `.gitignore` 排除，不会提交到 Git
- 导出的模板 JSON 同样被 `.gitignore` 忽略
- 仅提交 `.env.example` 和 `targets.example.json` 作为格式示例
- 如密钥已泄露，请立即前往 [微信公众平台](https://mp.weixin.qq.com/) 轮换凭据

## 📄 数据字段说明

### 模板字段

| 字段 | 说明 |
|------|------|
| `title` | 模板标题 |
| `type` / `typeName` | 订阅类型（一次性 / 长期） |
| `priTmplId` | 小程序私有的模板 ID，不可跨小程序使用 |
| `publicTid` | 公共模板 ID，跨小程序识别同一模板的依据 |
| `kidList` | 字段关键字编号列表 |
| `sceneDesc` | 场景描述 |
| `fields` | 字段详情列表（name / valueKey / kid / example） |

### 添加结果 action 含义

| action | 说明 |
|--------|------|
| `added` | 已成功创建新模板 |
| `skipped_existing` | 目标小程序已存在同标题同字段的模板，自动跳过 |
| `would_add` | Dry-Run 模式下标记为」将会添加「 |
