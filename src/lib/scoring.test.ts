import { describe, expect, it } from 'vitest'
import {
  classifyCategory,
  confidenceFromHits,
  countKeywordHits,
  estimateTokens,
  matchesQuery,
  scoreContext,
  scoreFreshness,
  scorePlugin,
  scoreReadme,
  sortPlugins,
  type PluginRaw,
  type ScoredPlugin,
} from './scoring'

function makePlugin(overrides: Partial<PluginRaw> = {}): PluginRaw {
  return {
    id: 'owner/repo',
    fullName: 'owner/repo',
    name: 'repo',
    owner: 'owner',
    repo: 'repo',
    type: 'cordis-plugin',
    stars: 10,
    forks: 1,
    language: 'TypeScript',
    description: null,
    descriptionZh: null,
    tags: [],
    topics: [],
    license: 'MIT',
    homepage: null,
    pushedAt: '2026-11-15T00:00:00Z',
    createdAt: '2026-08-13T00:00:00Z',
    updatedAt: '2026-11-15T00:00:00Z',
    installCommand: null,
    readmeChars: 3000,
    readmeHeadings: 4,
    readmeFetched: true,
    skillChars: null,
    skillFetched: false,
    contextFile: 'README.md',
    contextChars: 3000,
    ...overrides,
  }
}

const NOW = new Date('2026-11-16T12:00:00Z')

describe('countKeywordHits', () => {
  it('matches English keywords on word boundaries only', () => {
    // "rapid" and "capital" contain the letters "api" but are not the word api.
    expect(countKeywordHits('rapid capital growth tool', ['api'])).toBe(0)
    expect(countKeywordHits('call the api once', ['api'])).toBe(1)
    expect(countKeywordHits('API-first design', ['api'])).toBe(1)
  })

  it('matches Chinese keywords by substring', () => {
    expect(countKeywordHits('高效的待办清单工具', ['待办', '清单', '视频'])).toBe(2)
  })

  it('counts each distinct keyword once', () => {
    expect(countKeywordHits('code code code review', ['code', 'review'])).toBe(2)
  })
})

describe('classifyCategory', () => {
  it('classifies a code review plugin as coding', () => {
    const p = makePlugin({
      name: 'dsh-code-review',
      description: 'AI code review agent for GitHub pull requests, checks diff and comments.',
      tags: ['code-review'],
    })
    const r = classifyCategory(p)
    expect(r.category).toBe('coding')
    expect(r.hits).toBeGreaterThanOrEqual(2)
  })

  it('classifies a dark theme plugin as theme', () => {
    const p = makePlugin({
      name: 'dark-theme-pro',
      description: 'A dark theme for DSH with custom colors and fonts.',
    })
    expect(classifyCategory(p).category).toBe('theme')
  })

  it('classifies by Chinese description', () => {
    const p = makePlugin({
      name: 'todo-pro',
      descriptionZh: '高效的待办清单与日程提醒工具',
    })
    expect(classifyCategory(p).category).toBe('productivity')
  })

  it('breaks ties by priority order (coding before agent)', () => {
    const p = makePlugin({ name: 'x', description: 'code agent' })
    expect(classifyCategory(p).category).toBe('coding')
  })

  it('puts unclassifiable plugins in other with confidence 0', () => {
    const p = makePlugin({ name: 'xqz', description: 'zzzz qqq www' })
    const r = classifyCategory(p)
    expect(r.category).toBe('other')
    expect(r.confidence).toBe(0)
  })

  it('ignores generic tags like ai-agent and dsh-plugin', () => {
    const p = makePlugin({
      name: 'xqz',
      description: 'zzzz qqq www',
      tags: ['ai-agent', 'dsh-plugin'],
      topics: ['deepseek-harness'],
    })
    expect(classifyCategory(p).category).toBe('other')
  })
})

describe('confidenceFromHits', () => {
  it('maps hits to confidence tiers', () => {
    expect(confidenceFromHits(0)).toBe(0)
    expect(confidenceFromHits(1)).toBe(40)
    expect(confidenceFromHits(2)).toBe(60)
    expect(confidenceFromHits(3)).toBe(80)
    expect(confidenceFromHits(4)).toBe(100)
    expect(confidenceFromHits(9)).toBe(100)
  })
})

describe('scoreFreshness', () => {
  it('tiers by days since push', () => {
    expect(scoreFreshness('2026-11-15T00:00:00Z', NOW)).toBe(100) // 1 day
    expect(scoreFreshness('2026-10-20T00:00:00Z', NOW)).toBe(85) // 27 days
    expect(scoreFreshness('2026-08-20T00:00:00Z', NOW)).toBe(65) // 88 days
    expect(scoreFreshness('2026-06-01T00:00:00Z', NOW)).toBe(40) // 168 days
    expect(scoreFreshness('2025-01-01T00:00:00Z', NOW)).toBe(20)
  })

  it('returns 0 for missing or invalid dates', () => {
    expect(scoreFreshness(null, NOW)).toBe(0)
    expect(scoreFreshness('not-a-date', NOW)).toBe(0)
  })

  it('treats a slightly future date as today', () => {
    expect(scoreFreshness('2026-11-16T18:00:00Z', NOW)).toBe(100)
  })
})

describe('scoreReadme', () => {
  it('returns 0 when the README was not fetched', () => {
    expect(scoreReadme(null, null, false)).toBe(0)
    expect(scoreReadme(5000, 6, false)).toBe(0)
  })

  it('adds presence + length + headings', () => {
    expect(scoreReadme(300, 0, true)).toBe(40) // 30 + 10 + 0
    expect(scoreReadme(3000, 4, true)).toBe(80) // 30 + 30 + 20
    expect(scoreReadme(6000, 6, true)).toBe(100) // 30 + 40 + 30
    expect(scoreReadme(600, 2, true)).toBe(60) // 30 + 20 + 10
  })
})

describe('estimateTokens and scoreContext', () => {
  it('estimates 4 chars as 1 token, rounded up', () => {
    expect(estimateTokens(4000)).toBe(1000)
    expect(estimateTokens(4001)).toBe(1001)
    expect(estimateTokens(0)).toBe(0)
  })

  it('tiers by estimated tokens', () => {
    expect(scoreContext(4000)).toBe(100) // 1000 tokens
    expect(scoreContext(4004)).toBe(80) // 1001 tokens
    expect(scoreContext(16000)).toBe(80) // 4000 tokens
    expect(scoreContext(40000)).toBe(60) // 10000 tokens
    expect(scoreContext(100000)).toBe(40) // 25000 tokens
    expect(scoreContext(200000)).toBe(20)
  })

  it('returns 0 when no instruction file was fetched', () => {
    expect(scoreContext(null)).toBe(0)
  })
})

describe('scorePlugin', () => {
  it('computes the weighted total', () => {
    // confidence 80, context 100, freshness 85, readme 80
    // 80*0.15 + 100*0.30 + 85*0.30 + 80*0.25 = 12 + 30 + 25.5 + 20 = 87.5
    const p = makePlugin({
      name: 'code-review',
      description: 'code review test tool',
      pushedAt: '2026-10-20T00:00:00Z',
      readmeChars: 3000,
      readmeHeadings: 4,
      readmeFetched: true,
      contextChars: 4000,
    })
    const s = scorePlugin(p, NOW)
    expect(s.category).toBe('coding')
    expect(s.categoryConfidence).toBe(80)
    expect(s.context).toBe(100)
    expect(s.freshness).toBe(85)
    expect(s.readme).toBe(80)
    expect(s.total).toBe(87.5)
    expect(s.contextTokens).toBe(1000)
  })

  it('is deterministic', () => {
    const p = makePlugin({ description: 'A dark theme with custom colors.' })
    expect(scorePlugin(p, NOW)).toEqual(scorePlugin(p, NOW))
  })

  it('prefers SKILL.md chars for context when present', () => {
    const p = makePlugin({
      contextFile: 'SKILL.md',
      contextChars: 8000,
      skillChars: 8000,
      skillFetched: true,
      readmeChars: 30000,
    })
    const s = scorePlugin(p, NOW)
    expect(s.contextTokens).toBe(2000)
    expect(s.context).toBe(80)
  })
})

describe('matchesQuery', () => {
  it('matches across name, descriptions and tags, case-insensitive', () => {
    const p = makePlugin({
      name: 'todo-pro',
      descriptionZh: '待办清单工具',
      tags: ['productivity'],
    })
    expect(matchesQuery(p, '待办')).toBe(true)
    expect(matchesQuery(p, 'TODO')).toBe(true)
    expect(matchesQuery(p, 'todo pro')).toBe(true)
    expect(matchesQuery(p, 'video')).toBe(false)
    expect(matchesQuery(p, '')).toBe(true)
  })
})

describe('sortPlugins', () => {
  it('sorts by total desc with deterministic tie-breaks', () => {
    const a: ScoredPlugin = { raw: makePlugin({ fullName: 'a/a' }), score: scorePlugin(makePlugin({ fullName: 'a/a' }), NOW) }
    const b: ScoredPlugin = { raw: makePlugin({ fullName: 'b/b', pushedAt: '2025-01-01T00:00:00Z' }), score: scorePlugin(makePlugin({ pushedAt: '2025-01-01T00:00:00Z' }), NOW) }
    const sorted = sortPlugins([b, a], 'total')
    expect(sorted[0].raw.fullName).toBe('a/a')
    expect(sorted[1].raw.fullName).toBe('b/b')
  })
})
