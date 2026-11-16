# DSH Plugin Picker (dsh-plugin-picker)

## 1. In one sentence

The official plugin center has no categories, so across 35,000 DeepSeek Harness plugins
it is hard to tell which one is any good. This site ranks plugins by four code-computed
metrics - use-case category, context usage, update activity, and README completeness -
not by stars.

Live demo: not deployed yet; the real link will be added after deployment.

## 2. The problem it solves

- The official plugin center has no categories at all; one tutorial put it plainly,
  it is hard to tell what a plugin does at first glance.
- Star counts mislead: dsh-context has 4.3K stars because everyone needs to see context,
  and Agentero's 19 stars do not mean it is bad, it is simply narrow.
- Existing markets let you search by theme but offer no quality signals such as scores
  or context cost; tutorial articles hand-pick a few plugins, with narrow coverage that
  goes stale.
- This product is a searchable web picker whose four metrics are all computed by code:
  same input, same output.

## 3. Data source and coverage

- Primary source: dsh-market plugins.json (2BingLing/dsh-market, public data,
  refreshed daily at 06:00). The snapshot generated 2026-11-16T00:33:26Z holds 21,808 entries.
- v1 includes 500 entries: the first 500 by pushedAt desc, stars desc, fullName asc.
  Recency first, not stars first. The remaining entries were not fetched per-repo for
  README data and are not in v1.
- Each entry carries the plugin name, descriptions (original English plus a Chinese
  machine translation), tags, stars, last push time, install command, plus measured
  README character and heading counts and SKILL.md or README.md character counts.
- Per-run fetch counts and failures are in scripts/data/fetch-report.json.
- Current snapshot (2026-11-16): README measured for 498/500, SKILL.md for 11/500. The 2 entries without a README have no README file at the repo root (404); the other 489 entries have no SKILL.md file. Neither is a fetch failure; this run had 0 fetch failures. Details in scripts/data/fetch-report.json.
- Backup source (not used): dsh-plugin-catalog index.json, 5,643 entries with fewer
  fields, kept only for cross-checking.

## 4. The four scoring rules

- Use-case category (confidence): deterministic keyword rules over 10 categories plus
  Other. 1 keyword hit scores 40, 2 hits 60, 3 hits 80, 4 or more 100; unclassifiable
  plugins go to Other with 0.
- Context usage: the instruction file (SKILL.md at repo root if present, else README.md)
  character count divided by 4 estimates tokens; the page labels it as an estimate.
  Up to 1,000 tokens scores 100, up to 4,000 scores 80, up to 10,000 scores 60,
  up to 25,000 scores 40, above that 20; no file fetched scores 0.
- Update activity: days since the last push relative to the data date: within 7 days
  100, within 30 days 85, within 90 days 65, within 180 days 40, beyond that 20;
  missing scores 0.
- README completeness: 30 points for existing; length adds 10 (under 500 chars),
  20 (under 2,000), 30 (under 5,000) or 40 (5,000 or more); headings add 10 (1-2),
  20 (3-4) or 30 (5 or more); maximum 100. Not fetched scores 0.
- Total = category confidence x 0.15 + context x 0.30 + freshness x 0.30 + README x 0.25,
  rounded to one decimal.
- All rules live in src/lib/scoring.ts and are covered by Vitest.

## 5. How to use it

- Search box: search by plugin name, description, or tag; Chinese supported.
- Category chips: 10 categories plus Other, each with a count.
- Sort by: total score (default), lightest context, most active updates, most complete
  README, or most recently updated. Star counts are shown for reference only and never
  affect the ranking.
- Each row shows the four sub-scores with the total, the install command (copyable),
  and a link to the GitHub repository.

## 6. Run it locally

- `npm install`; `npm run dev` (develop); `npm run build` (build); `npm run test` (Vitest);
  `npm run fetch-data` (re-fetch data).
- Requires Node 20+ and Python 3.

## 7. Updating the data

- Re-run `python3 scripts/fetch_data.py` (default: first 500 entries). It re-downloads
  the source data and fetches missing README / SKILL.md files; successes are cached in
  scripts/data/cache/, so re-runs only fill the gaps. It writes
  public/data/plugins.json and scripts/data/fetch-report.json.
- The data is a snapshot and does not update itself.

## 8. Determinism

- All four metrics are computed by code, with no LLM involved. Same input, same output.
- The source data's Chinese descriptions are machine-translated by dsh-market with
  DeepSeek; this product only uses them as keyword input for classification, never as
  a scoring input; the source's own five-dimension score field is not used.

## 9. Compliance boundary

- This product involves no stocks, crypto, or custody of funds; it offers no install
  service, only a picker.
- A listing is a discovery signal, not a safety endorsement. Plugins are third-party
  code: verify the source and install command yourself before installing, and do not
  install plugins from unknown sources.
- Plugin data comes from public sources; star counts and descriptions follow the source.

## 10. Limitations and next steps

- v1 includes only 500 entries (from 21,808 in the source); only root SKILL.md and
  README.md are checked, not skills/ subdirectories.
- The category keywords are hand-written rules, not yet validated against the source's
  curated categories.
- The data is a snapshot and needs a manual script re-run to refresh.
- Next steps: grow coverage, probe SKILL.md under skills/ subdirectories, and validate
  the category rules against the source's curated categories.
