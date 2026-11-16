# dsh-plugin-picker - 设计决定与核实记录

## 产品定位

给 DeepSeek Harness 插件做选单。痛点：官方插件中心没有分类，3.5 万个插件不知道哪个好用；
教程原话是很难第一眼就知道插件的作用；实测文说别按 star 数装插件，dsh-context 4.3K star
是因为人人都需要看上下文，Agentero 19 star 不是它差，是它本来就窄。本产品按四项代码可算的
指标打分排序，不按 star 排。star 数只在页面上作参考展示，不参与排序。

## 数据源核实（2026-11-16 实测，只读）

候选三个来源，全部真实可达：

1. dsh-market plugins.json（主来源，已采用）
   - 地址：raw.githubusercontent.com/2BingLing/dsh-market/master/data/plugins.json
   - 2026-11-16 00:33:26Z 生成，共 21,808 条，文件 78,622,464 字节。
   - 每条含：id、type（cordis-plugin 21,404 / skill 404）、name、owner、repo、stars、
     forks、language、description、descriptionZh（DeepSeek 机翻中文简介）、tags（中英）、
     topics、license、pushedAt、createdAt、updatedAt、readmeSummary（截断摘要，约 1.2KB 上限）、
     install.commands、score（对方的五维分，本产品不用）。
   - readmeSummary 是截断摘要，不能当 README 全文用；README 长度与标题数、SKILL.md
     体量必须逐仓库另取。
   - 另有 count.json（web/public/count.json），同日 21,808 条，与文件一致。

2. dsh-plugin-catalog index.json（备用，未采用）
   - 地址：cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json
     （awesome-dsh-plugin.com/index.json 与 dshmarket.com/index.json 是同一份镜像）
   - 共 5,643 条，约 4.58MB。字段：name、description（en/zh）、repository.url、
     metadata.category、versions[].publishTimestamp。
   - 条目少、无 star、无 pushedAt、无 README 信息，只作交叉核对备用。

3. GitHub topic dsh-plugin 搜索（未采用）
   - 未认证 API 限流 60 次/小时，且共享出口 IP 易撞限流；dsh-market 的数据本身就是
     从 topic 扫描加人工列表汇总的，没必要重扫。

结论：v1 只用来源 1。来源 1 自身的 score 字段不用，我的四项分全部由 src/lib/scoring.ts
从原始字段重算。

## v1 覆盖规则

来源共 21,808 条，v1 取前 500 条：按 pushedAt 降序、stars 降序、fullName 升序排。
最近更新优先，不是 star 优先，符合产品自身的更新活跃度导向。页面与 README 如实写覆盖数。
其余条目未逐一拉取 README，未列入 v1。

逐仓库拉取（scripts/fetch_data.py，Python 标准库，并发 10）：
- SKILL.md（根目录，instruction 文件，skill 型插件优先）
- README.md（根目录，取不到则试 readme.md 小写）
- 只记测量值（字符数、标题数），不算分。分在 TypeScript 里算。
- 成功结果缓存进 scripts/data/cache/，重跑只补缺失的。
- 注意：只查根目录 SKILL.md，不查 skills/ 子目录；README 只查根目录。这是 v1 的已知局限。

## 四项评分规则（唯一真实来源：src/lib/scoring.ts，Vitest 覆盖）

- 用途分类：按插件名、描述（中英）、tags、topics 的确定性关键词规则归类，10 类加其他。
  通用标签（dsh、dsh-plugin、ai-agent 等）先从匹配文本里去掉，避免所有插件都被推成智能体。
  英文关键词按词边界匹配（rapid 里的 api 不算），中文关键词按子串匹配。
  置信度按命中关键词数：1 个 40、2 个 60、3 个 80、4 个及以上 100；分不出进其他，置信度 0，不硬编。
- 上下文占用：指令文件字符数除以 4 估算 token（SKILL.md 优先，否则 README.md），页面标为估算值。
  分档：1000 tokens 内 100、4000 内 80、10000 内 60、25000 内 40、超过 20；未取到文件 0。
- 更新活跃度：按 pushedAt 距数据日的天数分档：7 天内 100、30 天内 85、90 天内 65、
  180 天内 40、超过 20；缺失 0。DSH 迭代快，分档收得较紧。
- README 完整度：存在 30 分；长度 500 字以下 10、2000 字以下 20、5000 字以下 30、5000 字以上 40；
  标题数 1-2 个 10、3-4 个 20、5 个以上 30；满分 100。未取到 0。
- 综合分 = 分类置信度 x 0.15 + 上下文 x 0.30 + 更新 x 0.30 + README x 0.25，保留一位小数。
  同一输入同一输出，无随机、无大模型。

## 技术栈

React 19 + Vite 8 + Tailwind 4 + TypeScript 7.0.2 + Vitest 5.1.0，与作品集其他产品同一栈。
静态站，无后端；数据由 Python 脚本抓取生成 public/data/plugins.json，站内运行时读入并打分。

工具链备注（2026-11-16）：本机出口中断，npm 注册表一度不通（curl 000），npm install
卡住。node_modules 是从 expiry-manager 的 node_modules 用 cp -a 复制的同版本依赖
（vitest 5.1.0、tsc 7.0.2 均已验证可用），package-lock.json 尚未生成，待网络恢复后补跑
npm install 生成并核对。

## 局限与下一步

- v1 只收录 500 条（来源 21,808 条），且只查根目录 SKILL.md / README.md。
- 分类关键词是人工规则，未用来源 1 的 curated 分类或来源 2 的 metadata.category 做对照验证。
- 数据是快照，插件后续更新不会自动跟进；更新办法是重跑 scripts/fetch_data.py。
- 下一步：等网络恢复后补齐未取到的 README、生成 package-lock.json、跑构建验证。

## 交付状态（2026-11-16 02:36 UTC）

- 抓取：本机出口 09:21 起中断，10:35-10:40 慢速探测（60 秒超时）确认 raw.githubusercontent.com、
  cdn.jsdelivr.net、google.com 全部 000。逐仓库拉取无法跑，已加 --skip-remote 模式：
  `python3 scripts/fetch_data.py --limit 500 --source-file /tmp/dsh-src/dshmarket-plugins.json --skip-remote`
  已生成元数据完整、测量值待补的 v1 数据（public/data/plugins.json，500 条，674,800 字节，
  meta.measurementsPending=true；scripts/data/fetch-report.json 有记录）。
  网络恢复后去掉 --skip-remote 重跑同一命令即可补齐测量值（缓存断点续跑）。
- 实测数据验证（真数据跑 scoring.ts）：分类分布 智能体 158、编程开发 87、模型推理 53、
  数据集成 46、安全运维 36、主题界面 34、媒体创作 33、文档知识 24、效率工具 21、
  游戏娱乐 4、其他 4（仅 4 条进其他，关键词规则在真数据上不退化）。
  500 条全部在 2026-11-15 当天推送过（最新 23:21:06Z，最旧 15:15:30Z），更新分全是 100；
  现阶段总分区间 30-45，排名主要由分类置信度驱动，README 与上下文实测补上后才会拉开差距。
- 测试：Vitest 26/26 通过（scoring.test.ts 23 + data.test.ts 3，真数据冒烟测试）。
- 构建：npm run build 通过（tsc -b + vite build）；vite preview 实测页面与 data JSON 均 200。
- package-lock.json 仍未生成（npm 注册表不通），待网络恢复后补跑 npm install 生成并核对。
- 未做：不建仓库、不推送、不部署，建仓推送部署由主代理复验后亲自做。

## 补测完成（2026-11-16 12:46 CST，主代理）
- 网络 11:56 起恢复（raw.githubusercontent.com 实测 200）。主代理重跑 python3 scripts/fetch_data.py --limit 500 --workers 10（去掉 --skip-remote；源文件 /tmp/dsh-src/dshmarket-plugins.json 不存在，改从源 URL 直下 78,622,464 字节，sha 与子代理版一致）。
- 第一轮：README 472/500、SKILL 10/500、失败 29（全是瞬时连接失败 status None）；第二轮（缓存断点续跑）：README 498/500、SKILL 11/500、失败 0。未取到 README 的 2 条是根目录无 README（404），489 条无 SKILL.md（404），均非拉取失败。
- 上下文与 README 两项分已按实测值算出，不再是全 0；四项分共同决定排名。
- package-lock.json 已生成（npm install，27,092 字节）。Vitest 26/26、构建通过（主代理复跑）。
- README.md 与 README_EN.md 的快照段已按实测数更新。下一步：建仓库、推送、部署演示站，README 回填 demo 链接。
