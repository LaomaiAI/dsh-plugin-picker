// Scoring rules for dsh-plugin-picker.
//
// All four metrics are computed by code from fetched raw fields. Zero LLM.
// Same input -> same output. The formula is also written in README.md.
//
// Metrics:
//   1. category confidence  - how clearly the plugin's purpose can be told
//      from its name / description / tags, by deterministic keyword rules.
//      Unclassifiable plugins go to "other" with confidence 0 (never made up).
//   2. context usage        - estimated tokens of the instruction file
//      (SKILL.md if present at repo root, else README.md), chars / 4.
//      Smaller is better. The token number is an estimate, labeled as such.
//   3. freshness            - tiered by days since last push (pushedAt).
//   4. README completeness  - README presence + length + heading count.
//
// Total = 0.15 * category + 0.30 * context + 0.30 * freshness + 0.25 * readme.

export interface PluginRaw {
  id: string
  fullName: string
  name: string
  owner: string
  repo: string
  type: string
  stars: number
  forks: number
  language: string | null
  description: string | null
  descriptionZh: string | null
  tags: string[]
  topics: string[]
  license: string | null
  homepage: string | null
  pushedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  installCommand: string | null
  readmeChars: number | null
  readmeHeadings: number | null
  readmeFetched: boolean
  skillChars: number | null
  skillFetched: boolean
  contextFile: 'SKILL.md' | 'README.md' | null
  contextChars: number | null
}

export type CategoryId =
  | 'coding'
  | 'agent'
  | 'model'
  | 'media'
  | 'docs'
  | 'productivity'
  | 'data'
  | 'theme'
  | 'ops'
  | 'game'
  | 'other'

export interface CategoryDef {
  id: CategoryId
  zh: string
  en: string
  keywords: string[]
}

// Priority order doubles as the tie-break order: when two categories tie on
// keyword hits, the earlier one wins.
export const CATEGORIES: CategoryDef[] = [
  {
    id: 'coding',
    zh: '编程开发',
    en: 'Coding & Dev',
    keywords: [
      'code', 'coding', 'developer', 'development', 'debug', 'debugger',
      'testing', 'test', 'git', 'review', 'refactor', 'lint', 'build',
      'compiler', 'compile', 'terminal', 'cli', 'sdk', 'api', 'snippet',
      'repo', 'repository', 'commit', 'diff', 'merge', 'ci', 'devops',
      'programmer', 'programming', 'software', 'ide', 'editor', 'vscode',
      'function', 'script',
      '编程', '代码', '开发', '调试', '测试', '重构', '编译', '构建',
      '终端', '命令行', '提交', '合并', '审查', '程序', '软件', '编辑器', '脚本',
    ],
  },
  {
    id: 'agent',
    zh: '智能体',
    en: 'Agent',
    keywords: [
      'agent', 'multi-agent', 'swarm', 'orchestration', 'orchestrator',
      'planner', 'planning', 'task', 'workflow', 'autonomous', 'session',
      'memory', 'handoff', 'collaboration', 'coordination', 'schedule',
      'scheduler', 'context',
      '智能体', '多智能体', '编排', '规划', '任务', '工作流', '自主',
      '会话', '记忆', '协同', '调度', '上下文',
    ],
  },
  {
    id: 'model',
    zh: '模型推理',
    en: 'Model',
    keywords: [
      'model', 'llm', 'inference', 'prompt', 'chat', 'chatbot', 'persona',
      'character', 'roleplay', 'embedding', 'vector', 'rag', 'fine-tune',
      'tokenizer', 'token', 'reasoning',
      '模型', '推理', '提示词', '对话', '聊天', '角色', '扮演',
      '向量', '知识库', '微调',
    ],
  },
  {
    id: 'media',
    zh: '媒体创作',
    en: 'Media',
    keywords: [
      'image', 'images', 'video', 'audio', 'music', 'picture', 'photo',
      'draw', 'drawing', 'design', 'designer', 'edit', 'clip', 'generate',
      'generation', 'icon', 'cover', 'poster', 'art', 'painting',
      'animation', 'voice', 'speech', 'tts', 'subtitle', 'camera',
      '图片', '视频', '音频', '音乐', '画图', '绘图', '设计', '剪辑',
      '生成', '图标', '封面', '海报', '绘画', '动画', '语音', '字幕', '照片',
    ],
  },
  {
    id: 'docs',
    zh: '文档知识',
    en: 'Docs & Knowledge',
    keywords: [
      'doc', 'docs', 'document', 'note', 'notes', 'knowledge', 'search',
      'read', 'reading', 'writing', 'writer', 'translate', 'translation',
      'summary', 'summarize', 'pdf', 'markdown', 'book', 'novel',
      'article', 'blog', 'rss', 'wiki', 'bookmark',
      '文档', '笔记', '知识', '搜索', '阅读', '写作', '翻译', '总结',
      '摘要', '书籍', '小说', '文章', '博客', '资料', '收藏',
    ],
  },
  {
    id: 'productivity',
    zh: '效率工具',
    en: 'Productivity',
    keywords: [
      'todo', 'calendar', 'reminder', 'productivity', 'shortcut',
      'clipboard', 'timer', 'pomodoro', 'habit', 'focus', 'kanban',
      'checklist', 'journal', 'diary', 'expense', 'budget', 'finance',
      'health', 'fitness',
      '待办', '日程', '日历', '提醒', '效率', '快捷', '剪贴板', '计时',
      '番茄', '习惯', '专注', '看板', '清单', '日记', '记账', '预算', '健康',
    ],
  },
  {
    id: 'data',
    zh: '数据集成',
    en: 'Data & Integration',
    keywords: [
      'data', 'database', 'sql', 'excel', 'csv', 'json', 'crawler',
      'crawl', 'scrape', 'scraping', 'integration', 'sync',
      'synchronization', 'webhook', 'mcp', 'fetch', 'query', 'table',
      'spreadsheet', 'analytics', 'api', 'automation',
      '数据', '数据库', '表格', '爬虫', '抓取', '集成', '同步', '查询',
      '统计', '分析', '接口', '自动化',
    ],
  },
  {
    id: 'theme',
    zh: '主题界面',
    en: 'Theme & UI',
    keywords: [
      'theme', 'ui', 'interface', 'skin', 'style', 'dark', 'color',
      'colour', 'font', 'layout', 'css', 'component', 'button', 'menu',
      'sidebar', 'dashboard', 'widget', 'icon',
      '主题', '界面', '皮肤', '样式', '暗色', '配色', '颜色', '字体',
      '布局', '组件', '按钮', '菜单', '仪表盘',
    ],
  },
  {
    id: 'ops',
    zh: '安全运维',
    en: 'Security & Ops',
    keywords: [
      'security', 'secure', 'deploy', 'deployment', 'server', 'docker',
      'monitor', 'monitoring', 'backup', 'permission', 'audit', 'auth',
      'firewall', 'proxy', 'vpn', 'ssh', 'cloud', 'hosting', 'ops',
      'log', 'logging', 'network', 'test',
      '安全', '部署', '运维', '服务器', '监控', '备份', '权限', '审计',
      '认证', '登录', '防火墙', '代理', '云', '日志', '网络',
    ],
  },
  {
    id: 'game',
    zh: '游戏娱乐',
    en: 'Game & Fun',
    keywords: [
      'game', 'gaming', 'fun', 'play', 'story', 'lottery', 'fortune',
      'tarot', 'horoscope', 'joke', 'meme', 'emoji', 'adventure', 'rpg',
      'chess', 'puzzle', 'music',
      '游戏', '娱乐', '玩', '故事', '小说', '抽奖', '占卜', '塔罗',
      '星座', '笑话', '表情', '冒险',
    ],
  },
]

// Generic tags/topics that say nothing about a plugin's purpose. They are
// removed from the classification haystack so that e.g. the ubiquitous
// "ai-agent" tag does not push every plugin into the agent category.
export const TAG_STOPLIST = new Set([
  'dsh', 'dsh-plugin', 'dsh-plugins', 'dsh-skill', 'dsh-skills',
  'dsh-bundle', 'dsh-web', 'dsh-market', 'deepseek-harness', 'deepseek',
  'deepseek-ai', 'ai-agent', 'ai-agents', 'agent', 'agents', 'plugin',
  'plugins', 'cordis', 'skill', 'skills', 'harness', 'marketplace',
])

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function isCjkKeyword(keyword: string): boolean {
  return /[\u4e00-\u9fff]/.test(keyword)
}

/** Count distinct keywords of one category that match the haystack. */
export function countKeywordHits(haystack: string, keywords: string[]): number {
  const text = haystack.toLowerCase()
  let hits = 0
  for (const keyword of keywords) {
    if (isCjkKeyword(keyword)) {
      if (text.includes(keyword)) hits += 1
    } else {
      const re = new RegExp(`\\b${escapeRegExp(keyword)}\\b`)
      if (re.test(text)) hits += 1
    }
  }
  return hits
}

export function buildHaystack(p: PluginRaw): string {
  const tags = [...(p.tags ?? []), ...(p.topics ?? [])]
    .map((t) => t.toLowerCase())
    .filter((t) => !TAG_STOPLIST.has(t))
  return [
    p.name ?? '',
    p.description ?? '',
    p.descriptionZh ?? '',
    tags.join(' '),
  ]
    .join(' ')
    .toLowerCase()
}

export interface CategoryResult {
  category: CategoryId
  hits: number
  confidence: number
}

export function confidenceFromHits(hits: number): number {
  if (hits <= 0) return 0
  if (hits === 1) return 40
  if (hits === 2) return 60
  if (hits === 3) return 80
  return 100
}

export function classifyCategory(p: PluginRaw): CategoryResult {
  const haystack = buildHaystack(p)
  let best: CategoryResult = { category: 'other', hits: 0, confidence: 0 }
  for (const def of CATEGORIES) {
    const hits = countKeywordHits(haystack, def.keywords)
    if (hits > best.hits) {
      best = { category: def.id, hits, confidence: confidenceFromHits(hits) }
    }
  }
  return best
}

export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const days = Math.floor((now.getTime() - t) / 86400000)
  return days < 0 ? 0 : days
}

/** Freshness: the DSH ecosystem iterates fast, so the tiers are tight. */
export function scoreFreshness(pushedAt: string | null, now: Date = new Date()): number {
  const days = daysSince(pushedAt, now)
  if (days === null) return 0
  if (days <= 7) return 100
  if (days <= 30) return 85
  if (days <= 90) return 65
  if (days <= 180) return 40
  return 20
}

/** README completeness: presence (30) + length (<=40) + headings (<=30). */
export function scoreReadme(
  readmeChars: number | null,
  readmeHeadings: number | null,
  fetched: boolean,
): number {
  if (!fetched || readmeChars === null) return 0
  let score = 30
  if (readmeChars >= 5000) score += 40
  else if (readmeChars >= 2000) score += 30
  else if (readmeChars >= 500) score += 20
  else score += 10
  const headings = readmeHeadings ?? 0
  if (headings >= 5) score += 30
  else if (headings >= 3) score += 20
  else if (headings >= 1) score += 10
  return score
}

/** Token estimate: 4 characters ~= 1 token. Always labeled as an estimate. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4)
}

/** Context usage: smaller is better. Missing file scores 0. */
export function scoreContext(contextChars: number | null): number {
  if (contextChars === null) return 0
  const tokens = estimateTokens(contextChars)
  if (tokens <= 1000) return 100
  if (tokens <= 4000) return 80
  if (tokens <= 10000) return 60
  if (tokens <= 25000) return 40
  return 20
}

export const WEIGHTS = {
  category: 0.15,
  context: 0.3,
  freshness: 0.3,
  readme: 0.25,
} as const

export interface PluginScore {
  category: CategoryId
  categoryHits: number
  categoryConfidence: number
  freshness: number
  readme: number
  context: number
  contextTokens: number | null
  total: number
}

export function scorePlugin(p: PluginRaw, now: Date = new Date()): PluginScore {
  const cat = classifyCategory(p)
  const freshness = scoreFreshness(p.pushedAt, now)
  const readme = scoreReadme(p.readmeChars, p.readmeHeadings, p.readmeFetched)
  const context = scoreContext(p.contextChars)
  const total =
    Math.round(
      (cat.confidence * WEIGHTS.category +
        context * WEIGHTS.context +
        freshness * WEIGHTS.freshness +
        readme * WEIGHTS.readme) *
        10,
    ) / 10
  return {
    category: cat.category,
    categoryHits: cat.hits,
    categoryConfidence: cat.confidence,
    freshness,
    readme,
    context,
    contextTokens: p.contextChars === null ? null : estimateTokens(p.contextChars),
    total,
  }
}

export type SortKey = 'total' | 'context' | 'freshness' | 'readme' | 'updated'

export interface ScoredPlugin {
  raw: PluginRaw
  score: PluginScore
}

export function sortPlugins(items: ScoredPlugin[], sortKey: SortKey): ScoredPlugin[] {
  const keyOf = (s: ScoredPlugin): number => {
    switch (sortKey) {
      case 'total':
        return s.score.total
      case 'context':
        return s.score.context
      case 'freshness':
        return s.score.freshness
      case 'readme':
        return s.score.readme
      case 'updated': {
        const t = s.raw.pushedAt ? Date.parse(s.raw.pushedAt) : 0
        return Number.isNaN(t) ? 0 : t
      }
    }
  }
  return [...items].sort((a, b) => {
    const diff = keyOf(b) - keyOf(a)
    if (diff !== 0) return diff
    const totalDiff = b.score.total - a.score.total
    if (totalDiff !== 0) return totalDiff
    return a.raw.fullName.localeCompare(b.raw.fullName)
  })
}

export function matchesQuery(p: PluginRaw, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    p.name ?? '',
    p.fullName ?? '',
    p.description ?? '',
    p.descriptionZh ?? '',
    ...(p.tags ?? []),
    ...(p.topics ?? []),
  ]
    .join(' ')
    .toLowerCase()
  return q.split(/\s+/).every((word) => haystack.includes(word))
}

export function categoryLabel(id: CategoryId): { zh: string; en: string } {
  if (id === 'other') return { zh: '其他', en: 'Other' }
  const def = CATEGORIES.find((c) => c.id === id)
  return def ? { zh: def.zh, en: def.en } : { zh: '其他', en: 'Other' }
}
