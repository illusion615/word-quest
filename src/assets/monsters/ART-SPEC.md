# 单词怪美术素材规格 (Monster Art Spec)

战斗采用回合制交战：一波 6–8 只单词怪，每只怪的**难度分级**由它对应单词的
**生僻度（词频位次）+ 字母长度**共同决定，视觉上要一眼看出强弱。

## 通用规格（所有怪通用）

- **画布**：1024 × 1024 像素，正方形。
- **格式**：PNG-32（RGBA），**背景透明**，不要白底/纯色底。
- **角色一致性**：四态必须是同一个体，脸、体型、伤疤、断角、服饰、武器、纹样与
  配色保持一致；一致的是角色身份，不是动作骨架。
- **构图差异**：四态必须使用不同的动作线、镜头角度、重心、肢体安排、武器位置、
  尾部节奏与轮廓。叫阵可以更宽、败阵可以更低、得胜可以更高，禁止四张只换表情。
- **朝向**：与现有 `grunt/` 一致——**面向左侧**（玩家/卷王在左）。
- **风格**：以现有 `grunt/`、`boss/` 的细腻度为最低基准；使用有粗细变化的深色描边、
  精细赛璐珞绘制、丰富中间调与受控反光。羽毛、皮革、旧金属、布料、角、爪和晶体
  必须有清楚的材质差异，在约 120–180px 显示尺寸下仍能辨认关键设计。
- **战斗感**：可爱来自头身比例和表情，不得做成温顺宠物或软萌吉祥物。待阵也必须有
  掠食者警觉和傲慢；叫阵要侵入玩家空间；败阵要愤怒不甘；得胜要具体而有侮辱性。
- **身份细节**：每个角色至少有两项可跨姿态识别的专属细节，例如断角、疤痕、首饰、
  战利品、磨损盔甲或专属武器，避免只有颜色不同的通用怪物。

## 每只普通怪需要 4 张姿态图（文件名固定）

| 文件名 | 触发时机 |
| --- | --- |
| `aloof.webp` | 在队列里待阵，或叫阵结束后聚焦答题 |
| `challenge.webp` | 转到前排时短暂播放的嚣张叫阵动作 |
| `vanquished.webp` | 玩家答对后，沮丧、愤怒且不甘地败退 |
| `triumphant.webp` | 玩家答错后，得意、挑衅且张狂地胜出 |

普通怪没有持续血量。`hurt` 是短暂战斗特效，不再占用独立美术帧；答错后的怪物也不应
永久停在旧的攻击动作上，而应展示完整的胜利姿态。

## 2x2 母版切分

每只普通怪只需生成一张透明背景的正方形母版，四格布局固定为：

```text
aloof       | challenge
vanquished  | triumphant
```

优先让四格保留透明间隔。为了保证动作表现，武器、尾羽等可以越过几何中线，但四个主体
必须保持不相连，确保可以按透明像素边界分离。标准四格切分与 WebP 压缩使用：

```bash
npm run assets:slice-monster -- \
  src/assets/monsters/cloudtail-common-sheet.png \
  src/assets/monsters/common/cloudtail-coral
```

脚本固定输出 512x512 的四张 WebP，并保留母版中的相对缩放、悬浮高度和动作位移。

复杂母版不得强行四等分。先检查透明像素包围盒，为每个姿态建立独立裁区：

```json
{
  "aloof": { "x": 60, "y": 0, "width": 370, "height": 512 },
  "challenge": { "x": 430, "y": 0, "width": 594, "height": 512 },
  "vanquished": { "x": 0, "y": 512, "width": 512, "height": 512 },
  "triumphant": { "x": 512, "y": 512, "width": 512, "height": 512 }
}
```

然后使用：

```bash
npm run assets:slice-monster -- \
  --crop-spec src/assets/monsters/common/razorplume-marauder/crop-spec.json \
  "src/assets/monsters/Designer (17).png" \
  src/assets/monsters/common/razorplume-marauder
```

自定义裁区会等比缩放进透明 512x512 画布，不压扁角色、不裁武器，也不要求四态强行同高。

如果四个姿态虽然互不相连，但武器、触腕或飘带互相穿插，无法用任何矩形裁区完整分开，
则使用连通域蒙版。配置只需给出四个主体附近的锚点：

```json
{
  "alphaThreshold": 4,
  "padding": 12,
  "anchors": {
    "aloof": { "x": 234, "y": 274 },
    "challenge": { "x": 734, "y": 237 },
    "vanquished": { "x": 268, "y": 790 },
    "triumphant": { "x": 765, "y": 734 }
  }
}
```

```bash
npm run assets:slice-monster -- \
  --mask-spec src/assets/monsters/common/inkveil-duelist/mask-spec.json \
  src/assets/monsters/inkveil-common-sheet.png \
  src/assets/monsters/common/inkveil-duelist
```

蒙版模式以四个最大透明连通域作为主体，用曲线边界完整保留交错的武器和触腕；独立墨滴、
阴影和小挂饰按最近主体自动归属。它不会用横竖直线切图，也不会把邻近姿态的像素混进来。

正式输出前必须逐张检查方向、越格污染、透明边缘、武器完整性和 180px 可读性。

## 难度分级 → 目录 → 视觉建议

四档常规怪 + 一档波次首领。每个普通怪变体使用独立子目录，例如
`common/cloudtail-coral/`。现有 `grunt/` 是旧版兼容素材。

| 档位 | 目录 | 对应单词 | 体型/配色建议 |
| --- | --- | --- | --- |
| T1 幼卒 common | `common/<variant>/` | 高频短词 | 小、敏捷、可爱但有明确战斗性 |
| T2 游兵 uncommon | `uncommon/shardback-knuckler/` | 中频/中长词 | 更厚重，晶体拳与矿石背甲 |
| T3 悍将 rare | `rare/crownmaw-reliquary/` | 低频或较长词 | 王匣结构、链条与巨钥，压迫感更强 |
| T4 妖将 elite | `elite/` ← 待生成 | 生僻长词/学术词 | 最大、狰狞、暗红/黑金、发光眼 |
| BOSS 词魔王 | `boss/`（已存在） | 每波最难词/首领 | 巨型，另用 `phase-1/2/3 + defeated` |

同档角色也必须有不同轮廓、身份细节和动作语言。配色只能扩大变化，不能替代独立造型。

当前普通怪目录：

```text
common/cloudtail-coral/       云尾兽（v2 重制）
common/razorplume-marauder/   刃翎掠夺者
common/inkveil-duelist/       墨幕决斗灵
uncommon/shardback-knuckler/  碎晶拳兽
rare/crownmaw-reliquary/      冠匣吞金兽
```

## 放置位置汇总（相对本文件）

```text
common/<variant>/{aloof,challenge,vanquished,triumphant}.webp
uncommon/<variant>/{aloof,challenge,vanquished,triumphant}.webp
rare/<variant>/{aloof,challenge,vanquished,triumphant}.webp
elite/<variant>/{aloof,challenge,vanquished,triumphant}.webp
grunt/  … 旧版兼容素材
boss/   … 首领素材
```

## 优化流程（重要）

源 PNG 只是**本地母版**，`src/assets/**/*.png` 已被 gitignore，不会进仓库、也不会
打进网站包。放好 PNG 后运行：

```bash
npm run assets:optimize            # 全部 PNG → WebP，最长边 512px（一排小怪足够）
npm run assets:optimize -- --max 1024   # 需要大图时（当前单怪模式的 grunt/boss）
```

脚本会在每个 PNG 旁生成同名 `.webp`；**应用只引用 `.webp`，提交的也只是 `.webp`**。
新怪默认压到 512px。高细节角色通常约 60–90KB/张，不得为了追求旧的 30–50KB 指标
牺牲材质、描边或面部细节。
