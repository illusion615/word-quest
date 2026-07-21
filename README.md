# 图图是卷王 · 暴打单词怪

「图图是卷王 · 暴打单词怪」是一个本地优先的英语背单词闯关游戏（静态站点）。FSRS 根据每个单词的难度、稳定性、到期时间和作答质量安排复习；每轮先处理到期词，再引入最多 8 个新词，未到期词不会为了凑题而重复出现。配置 AI 后，模型只围绕本轮调度出的词生成阅读理解。学习记录和间隔复习完全在浏览器中运行，不需要后端。

## 开发设计

- [游戏化战斗垂直切片开发计划](docs/gameplay-vertical-slice.md)：当前核心循环、领域架构、学习调度、验收门槛和后续边界。

## 词库范围

考试词库从 MIT 许可的 ECDICT 固定版本生成，应用按用户选择加载，不会全部打进主包。

| 词库 | 词数 | 收录边界 |
| --- | ---: | --- |
| 高考 | 3,677 | ECDICT `gk` 高考大纲标签全部词条 |
| CET-4 | 3,849 | ECDICT `cet4` 标签全部词条 |
| CET-6 | 5,805 | CET-4 基础与 `cet6` 增量合集 |
| IELTS | 5,040 | ECDICT `ielts` 备考标签全部词条 |
| TOEFL | 6,974 | ECDICT `toefl` 备考标签全部词条 |

高考与 CET 标签是大纲索引汇编，并非考试机构发布的官方电子词表。IELTS 和 TOEFL 官方没有固定词汇全集，因此应用明确标为备考词表。数据源 commit、生成日期、缺失字段统计和许可证保存在 `public/data/exam-banks/manifest.json`。

学习进度按规范化单词 ID 全局记录，不按词库重复保存。首次练习后立即提升相关词库的“学习覆盖”；只有 FSRS 卡片进入 Review 状态且记忆稳定性达到 21 天，才计入“稳定掌握”。历史正确率仅用于反馈，不决定调度或掌握。跨库成员关系由同一固定数据源生成，并保存在 `public/data/exam-banks/coverage-index.json`。

## 本地运行

```bash
npm ci
npm run dev
```

听音训练使用浏览器提供的英语系统音色。用户可以在页头的发音设置中选择、试听并保存音色；设置仅保存在当前浏览器。部分 Electron 内置预览会暴露音色列表但不输出声音，此时应用会提示改用 Safari 或 Chrome。

提交前运行完整门禁：

```bash
npm run check
```

## GitHub Pages

工作流 `.github/workflows/deploy-pages.yml` 会在 `main` 分支推送后测试、构建并发布 `dist`。首次使用时，在仓库 Settings → Pages 中将 Source 设为 **GitHub Actions**。

Vite 使用相对资源路径，因此用户站点和项目子路径都可部署。

## 可选 AI 连接

核心学习不依赖 AI。用户可以在页面中配置兼容 OpenAI Chat Completions 的接口，也可以粘贴带查询参数的完整 Azure OpenAI 请求地址。

- 开始本轮时，调度先选出到期词，并在没有复习积压时加入最多 8 个新词；每段保留至少 1 个必练种子词。AI 据此写出阅读理解并回报实际用到的词。
- 应用以段落中实际出现的词为准统计覆盖，只做轻量核对（必练词是否出现、是否为本库词），不再逐个虚词强制过滤；AI 不可用时自动退回“必练词 + 离线目标词序”。
- 题型由 FSRS 状态决定：Learning/Relearning 侧重音形，低稳定性 Review 进入语境，稳定性达到 7 天后进入主动提取。答错、慢答、正常答对和快速主动回忆分别映射到 Again、Hard、Good、Easy；选择题不会获得 Easy。

- 接口、模型、鉴权方式和输出语言保存在 localStorage。
- API key 只保存在当前 sessionStorage，不会进入源码、构建产物或 GitHub Actions。
- 静态页面直接请求用户配置的服务，因此该服务必须允许当前站点来源的 CORS 请求。

### 从 GitHub Pages 连接本地模型

本地开发（`http://localhost`）可直接连本机模型。但**已发布的 GitHub Pages 是公网 HTTPS 页面**，浏览器要求“公网页面访问本机 `127.0.0.1`”先通过 Private Network Access 预检，本地模型服务通常不会返回所需的放行头，请求会被浏览器拦下——这是浏览器安全策略，不是应用缺陷。

仓库内置一个零依赖的本地代理来补齐 CORS 与 PNA 放行头：

```bash
# 先启动本地模型，再启动代理（默认监听 8788，转发到 127.0.0.1:8191）
npm run ai:proxy
# 模型端口不同时覆盖：
TARGET_PORT=8080 npm run ai:proxy
```

随后在「AI 连接」里把接口地址填为 `http://127.0.0.1:8788/v1`。代理只监听本机回环地址，不对外暴露。也可改用 HTTPS 隧道（如 Cloudflare Tunnel、ngrok）把模型暴露成 `https://` 地址并开启 CORS。

- 成功的 AI 讲解按需加载 Markdown 渲染器，支持标题、列表、强调、引用、代码、表格和链接。
- 原始 HTML 与图片不会渲染；危险 URL 会被过滤，外部链接使用隔离的新标签页打开。
