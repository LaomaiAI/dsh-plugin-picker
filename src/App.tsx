import { useEffect, useMemo, useState } from 'react'
import {
  CATEGORIES,
  categoryLabel,
  matchesQuery,
  scorePlugin,
  sortPlugins,
  type CategoryId,
  type PluginRaw,
  type ScoredPlugin,
  type SortKey,
} from './lib/scoring'

interface DataFile {
  meta: {
    source: string
    sourceUrl: string
    sourceGeneratedAt: string | null
    sourceTotal: number
    fetchedAt: string
    selectionRule: string
    includedCount: number
    readmeFetched: number
    skillFetched: number
  }
  plugins: PluginRaw[]
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'total', label: '综合评分' },
  { key: 'context', label: '上下文最轻' },
  { key: 'freshness', label: '更新最活跃' },
  { key: 'readme', label: 'README 最完整' },
  { key: 'updated', label: '最近更新' },
]

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-amber-500" aria-hidden="true">
      <path d="M12 2l2.9 6.26 6.6.57-4.95 4.4 1.35 6.47L12 16.9 6.1 19.7l1.35-6.47L2.5 8.83l6.6-.57L12 2z" />
    </svg>
  )
}

function ScoreBar({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-stone-500">{label}</span>
        <span className="font-semibold text-stone-800">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-blue-600"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <div className="mt-1 truncate text-[11px] leading-tight text-stone-500" title={hint}>
        {hint}
      </div>
    </div>
  )
}

function PluginRow({ item }: { item: ScoredPlugin }) {
  const { raw, score } = item
  const [copied, setCopied] = useState(false)
  const label = categoryLabel(score.category)
  const desc = raw.descriptionZh || raw.description || '（无简介）'
  const pushedDate = raw.pushedAt ? raw.pushedAt.slice(0, 10) : '未知'
  const contextHint =
    score.contextTokens === null
      ? '未取到指令文件'
      : `约 ${score.contextTokens.toLocaleString()} tokens（估算）· ${raw.contextFile ?? ''}`
  const readmeHint = raw.readmeFetched
    ? `${(raw.readmeChars ?? 0).toLocaleString()} 字符 · ${raw.readmeHeadings ?? 0} 个标题`
    : '未取到 README'
  const categoryHint =
    score.category === 'other'
      ? '关键词未命中，分不出类别'
      : `命中 ${score.categoryHits} 个关键词`

  const copyInstall = async () => {
    if (!raw.installCommand) return
    try {
      await navigator.clipboard.writeText(raw.installCommand)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable; the command is still visible as text.
    }
  }

  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`https://github.com/${raw.fullName}`}
              target="_blank"
              rel="noreferrer"
              className="truncate text-base font-semibold text-blue-700 hover:underline"
            >
              {raw.name}
            </a>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
              {raw.type === 'skill' ? 'Skill' : '插件'}
            </span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
              {label.zh} · {label.en}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-stone-500">
              <StarIcon />
              {raw.stars.toLocaleString()}
            </span>
            <span className="text-xs text-stone-500">更新 {pushedDate}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone-600">{desc}</p>
          <p className="mt-1 truncate text-xs text-stone-400">{raw.fullName}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold leading-none text-stone-900">
            {score.total.toFixed(1)}
          </div>
          <div className="mt-1 text-xs text-stone-500">综合评分 / 100</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ScoreBar label="用途分类" value={score.categoryConfidence} hint={categoryHint} />
        <ScoreBar label="上下文占用" value={score.context} hint={contextHint} />
        <ScoreBar label="更新活跃度" value={score.freshness} hint={`最近推送 ${pushedDate}`} />
        <ScoreBar label="README 完整度" value={score.readme} hint={readmeHint} />
      </div>

      {raw.installCommand && (
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-stone-100 px-2 py-1 text-xs text-stone-700">
            {raw.installCommand}
          </code>
          <button
            type="button"
            onClick={copyInstall}
            className="shrink-0 rounded border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50"
          >
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      )}
    </article>
  )
}

export default function App() {
  const [data, setData] = useState<DataFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | CategoryId>('all')
  const [sortKey, setSortKey] = useState<SortKey>('total')

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}data/plugins.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: DataFile) => {
        if (!cancelled) setData(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载数据失败')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const scored = useMemo<ScoredPlugin[]>(() => {
    if (!data) return []
    const now = data.meta.fetchedAt ? new Date(data.meta.fetchedAt) : new Date()
    return data.plugins.map((raw) => ({ raw, score: scorePlugin(raw, now) }))
  }, [data])

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryId, number>()
    for (const s of scored) counts.set(s.score.category, (counts.get(s.score.category) ?? 0) + 1)
    return counts
  }, [scored])

  const visible = useMemo(() => {
    const filtered = scored.filter(
      (s) =>
        (category === 'all' || s.score.category === category) && matchesQuery(s.raw, query),
    )
    return sortPlugins(filtered, sortKey)
  }, [scored, category, query, sortKey])

  const dataDate = data?.meta.fetchedAt ? data.meta.fetchedAt.slice(0, 10) : ''

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8">
      <header>
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">DSH 插件选单</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-700">
          官方插件中心没有分类，3.5 万个插件不知道哪个好用。这个榜按用途分类、上下文占用、更新活跃度、README
          完整度四项代码可算的指标打分排序，不按 star 排。
        </p>
        {data && (
          <p className="mt-2 text-sm text-stone-500">
            数据来源：dsh-market plugins.json（来源共 {data.meta.sourceTotal.toLocaleString()} 条）
            · v1 收录 {data.meta.includedCount} 条 · 数据截至 {dataDate} · 评分全部由代码算出，无大模型参与
          </p>
        )}
      </header>

      {error && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          数据加载失败：{error}
        </p>
      )}
      {!data && !error && <p className="mt-6 text-sm text-stone-500">正在加载插件数据…</p>}

      {data && (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索插件名、简介、标签，如：待办、code review、theme"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  按{o.label}排序
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`rounded-full px-3 py-1 text-sm ${
                category === 'all'
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50'
              }`}
            >
              全部 {scored.length}
            </button>
            {CATEGORIES.map((c) => {
              const n = categoryCounts.get(c.id) ?? 0
              if (n === 0) return null
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`rounded-full px-3 py-1 text-sm ${
                    category === c.id
                      ? 'bg-stone-900 text-white'
                      : 'bg-white text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50'
                  }`}
                >
                  {c.zh} {n}
                </button>
              )
            })}
            {(categoryCounts.get('other') ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setCategory('other')}
                className={`rounded-full px-3 py-1 text-sm ${
                  category === 'other'
                    ? 'bg-stone-900 text-white'
                    : 'bg-white text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50'
                }`}
              >
                其他 {categoryCounts.get('other')}
              </button>
            )}
          </div>

          <p className="mt-4 text-sm text-stone-500">
            共 {visible.length} 条
            {query || category !== 'all' ? `（已筛选，收录 ${scored.length} 条）` : ''}
            · star 数仅作参考，不参与排序
          </p>

          <div className="mt-3 flex flex-col gap-3">
            {visible.map((item) => (
              <PluginRow key={item.raw.id} item={item} />
            ))}
            {visible.length === 0 && (
              <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
                没有匹配的插件，换个关键词或分类试试。
              </p>
            )}
          </div>

          <footer className="mt-10 border-t border-stone-200 pt-4 text-xs leading-relaxed text-stone-500">
            <p>
              评分公式：综合 = 用途分类置信度 × 0.15 + 上下文占用 × 0.30 + 更新活跃度 × 0.30 +
              README 完整度 × 0.25。上下文 token 数按字符数 ÷ 4 估算。v1
              覆盖范围：来源共 {data.meta.sourceTotal.toLocaleString()} 条，按最近推送取前{' '}
              {data.meta.includedCount} 条逐一拉取 README / SKILL.md 实测；其余条目未逐一拉取，未列入 v1。
            </p>
            <p className="mt-2">
              收录只是发现信号，不是安全背书。插件是第三方代码，安装前请自己核对来源与安装命令，
              不要安装来源不明的插件。本站不提供安装服务，只做选单。
            </p>
          </footer>
        </>
      )}
    </div>
  )
}
