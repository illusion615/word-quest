# 我是卷王 · 暴打单词怪

「我是卷王 · 暴打单词怪」是一个本地优先的英语背单词闯关游戏（静态站点）。FSRS 根据每个单词的难度、稳定性、到期时间和作答质量安排复习；每轮先处理到期词，再引入最多 8 个新词，未到期词不会为了凑题而重复出现。配置 AI 后，模型只围绕本轮调度出的词生成阅读理解。学习记录和间隔复习完全在浏览器中运行，不需要后端。

## 开发设计

- [游戏化战斗垂直切片开发计划](docs/gameplay-vertical-slice.md)：当前核心循环、领域架构、学习调度、验收门槛和后续边界。
- [更新日志](CHANGELOG.md)：版本变化、兼容说明与发布内容。

## 词库范围

考试成员与词典事实分开管理：教育部和全国大学英语四、六级考试委员会的官方文件决定高中/CET 成员，macOS 自带的《牛津英汉汉英词典》决定词性、中文义项、音标、标签、搭配和例句。`public/data/lexicon/words.json` 是 11,846 个词条、53,488 个独立义项及稳定 `senseId` 的权威主数据；`public/data/exam-banks/bank-index.json` 只保存各词库的有序词条 ID。

| 词库 | 词数 | 收录边界 |
| --- | ---: | --- |
| 高中课标 | 3,000 | 教育部《普通高中英语课程标准（2017年版2020年修订）》附录 2 |
| CET-4 | 4,039 | 2016 年官方词表未标 `★` 的 4,114 个词族行，按可学习词条去重 |
| CET-6 | 5,295 | 官方词表全部 5,377 个物理词族行；3 个本版 Oxford 缺项暂不进入练习 |
| IELTS | 5,015 | 沿用固定 curated 成员范围；25 个本版 Oxford 缺项暂不进入练习 |
| TOEFL | 6,805 | 沿用固定 curated 成员范围；169 个本版 Oxford 缺项暂不进入练习 |

官方 CET 文件声明 5,418 个“词目”，版面实际提取为 5,377 个词族行、8,013 个归一化词形；两种计数和每一行的 `★`、页码、派生词关系都保存在 `scripts/data/official-membership/cet.json`，不强行混成一个数字。高中附录的说明写明 `1500 / 500 / 1000`，实际印刷标记为 `1500 / 499 / 1001`；构建器保留印刷事实并记录这处源文档异常。

IELTS 和 TOEFL 官方没有固定词汇全集，因此应用继续明确标为备考词表。固定 ECDICT commit 只用于冻结这两个 curated 成员范围，以及在官方词表替换后尽量保持旧旅程顺序；ECDICT 的音标、词性和释义不再进入 canonical 词典。

每个 Oxford 义项独立保存，包含来源 record/sense ID；同一编号下的多个翻译组也会拆成不同 `senseId`。LLM 不参与词典事实判断，也不再审查释义：它只在这些稳定 ID 上补齐助记技巧、用法指南，以及 Oxford 没有例句时的学习例句。凡是 Oxford 已有例句的义项，一律原样复用（记为 `exampleSource: "dictionary"`），生成内容不得改写。每个义项独立验收并保存检查点，失败或人工重生成时只请求该义项；Oxford 来源变化会更新 `lexicalSourceHash`，使对应旧 coach 自动失效。

学习进度按稳定单词 ID 全局记录，不按词库重复保存。旧规范化 ID 在同一词形上继续沿用；`May/may`、`China/china` 等大小写异义词获得独立 ID，避免进度互相污染。新旅程顺序受校验哈希保护，后续数据重建不能静默改变关卡与 Boss 题池。

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

### 用户功能发布

每次准备提交用户可见的新功能时，必须同步完成以下三项：

1. 更新 `package.json` / `package-lock.json` 版本；
2. 在 `src/data/release-notes.json` 中写入面向用户的“更新内容”，说明用户能做什么、体验有什么改善，不描述内部实现；
3. 在 `CHANGELOG.md` 中记录对应版本。

`npm run release:verify` 会核对当前版本是否同时存在于用户更新数据和变更日志中；它也是 `npm run check` 的必过步骤。应用用当前版本和浏览器已读版本比较，只有版本变化时才自动弹出更新内容；用户仍可从帮助中心随时回看。

### 词库与静态讲解

词典源构建需要 macOS 已安装《牛津英汉汉英词典》。官方成员表和 Oxford 结构化词典更新后，依次执行：

```bash
npm run data:oxford:build
npm run data:build
npm run data:verify
```

静态词汇讲解通过 Lexicon Forge 生成：

```bash
npm run data:coach:dashboard
```

打开 `http://127.0.0.1:4175/`，在「模型设置」中测试并保存连接后即可按词库生成。Forge 只把已完整通过的词条写入 `public/data/word-coach/`；逐义检查点、失败记录和本地 API Key 保存在 gitignored 的 `.word-coach/` 中。

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
