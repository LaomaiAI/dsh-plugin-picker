import { describe, expect, it } from 'vitest'
import rawData from '../../public/data/plugins.json'
import {
  categoryLabel,
  scorePlugin,
  sortPlugins,
  type PluginRaw,
  type ScoredPlugin,
} from './scoring'

// Smoke test over the real v1 dataset. It validates structure and scoring
// sanity, not exact values: the numbers change whenever the data is re-fetched.
const data = rawData as unknown as {
  meta: { fetchedAt: string; includedCount: number; sourceTotal: number }
  plugins: PluginRaw[]
}

describe('v1 dataset (public/data/plugins.json)', () => {
  it('has the expected shape and counts', () => {
    expect(Array.isArray(data.plugins)).toBe(true)
    expect(data.plugins.length).toBe(data.meta.includedCount)
    expect(data.meta.sourceTotal).toBeGreaterThan(data.meta.includedCount)
    for (const p of data.plugins) {
      expect(typeof p.fullName).toBe('string')
      expect(typeof p.stars).toBe('number')
      expect(typeof p.pushedAt).toBe('string')
    }
  })

  it('scores every plugin deterministically within range', () => {
    const now = new Date(data.meta.fetchedAt)
    const seen = new Set<string>()
    for (const p of data.plugins) {
      const a = scorePlugin(p, now)
      const b = scorePlugin(p, now)
      expect(a).toEqual(b)
      expect(a.total).toBeGreaterThanOrEqual(0)
      expect(a.total).toBeLessThanOrEqual(100)
      for (const v of [a.categoryConfidence, a.context, a.freshness, a.readme]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
      seen.add(a.category)
    }
    // classification is not degenerate: more than one category appears
    expect(seen.size).toBeGreaterThan(1)
    expect(categoryLabel('other').zh).toBe('其他')
  })

  it('sorts by total without dropping entries', () => {
    const now = new Date(data.meta.fetchedAt)
    const scored: ScoredPlugin[] = data.plugins.map((raw) => ({
      raw,
      score: scorePlugin(raw, now),
    }))
    const sorted = sortPlugins(scored, 'total')
    expect(sorted.length).toBe(scored.length)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].score.total).toBeGreaterThanOrEqual(sorted[i].score.total)
    }
  })
})
