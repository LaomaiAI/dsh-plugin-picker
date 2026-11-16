#!/usr/bin/env python3
"""Fetch DSH plugin metadata + README/SKILL.md measurements.

Source (primary): dsh-market plugins.json (2BingLing/dsh-market, public data,
regenerated daily at 06:00 UTC, 21808 entries at 2026-11-16T00:33:26Z).
Cross-check (backup, not used for v1 data): dsh-plugin-catalog index.json
(jsdelivr / awesome-dsh-plugin.com / dshmarket.com mirrors, 5643 entries).

v1 subset rule (documented, deterministic): sort all source entries by
pushedAt desc, stars desc, fullName asc; take the first N (default 500).
Recency-first matches the product's freshness emphasis; it is NOT a star
ranking. The page states the coverage honestly.

For each selected repo, fetch (raw.githubusercontent.com, /HEAD/ ref):
  1. SKILL.md at repo root (instruction file for skill-type plugins)
  2. README.md at repo root, fallback readme.md (lowercase)
Only measurements are recorded (char counts, heading counts). No scores are
computed here: scoring lives in src/lib/scoring.ts (single source of truth,
covered by Vitest).

Outputs:
  public/data/plugins.json      - the file the site loads (meta + plugins)
  scripts/data/fetch-report.json - run report: counts, failures, timings

No LLM. No login. Read-only public HTTP. Python 3 stdlib only.
"""

import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

SOURCE_URL = (
    "https://raw.githubusercontent.com/2BingLing/dsh-market/master/data/plugins.json"
)
RAW_URL = "https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{path}"
LIMIT_DEFAULT = 500
WORKERS_DEFAULT = 10
TIMEOUT = 20
RETRIES = 2
USER_AGENT = {
    "User-Agent": "dsh-plugin-picker-fetch/1.0 (research; github.com/LaomaiAI/dsh-plugin-picker)"
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(ROOT, "scripts", "data", "cache")
OUT_PATH = os.path.join(ROOT, "public", "data", "plugins.json")
REPORT_PATH = os.path.join(ROOT, "scripts", "data", "fetch-report.json")
SOURCE_SNAPSHOT = os.path.join(ROOT, "scripts", "data", ".source-plugins.json")

HEADING_RE = re.compile(r"^#{1,6}[ \t]+", re.MULTILINE)


def http_get(url, timeout=TIMEOUT):
    """GET with retries. Returns (status, body_bytes) or (None, b'') on failure."""
    last_status = None
    for attempt in range(RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers=USER_AGENT)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            last_status = e.code
            if e.code == 404:
                return 404, b""
            if e.code == 429 and attempt < RETRIES:
                time.sleep(2 * (attempt + 1))
                continue
            return e.code, b""
        except Exception:
            last_status = None
            if attempt < RETRIES:
                time.sleep(1 * (attempt + 1))
                continue
            return None, b""
    return last_status, b""


def measure_text(text):
    """Return (chars, headings) for a text file."""
    chars = len(text)
    headings = len(HEADING_RE.findall(text))
    return chars, headings


def cached_fetch(owner, repo, path):
    """Fetch one raw file, using the disk cache for successes."""
    cache_name = "%s__%s__%s" % (owner, repo, path.replace("/", "_"))
    cache_path = os.path.join(CACHE_DIR, cache_name)
    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return 200, f.read()
    url = RAW_URL.format(owner=owner, repo=repo, path=path)
    status, body = http_get(url)
    if status == 200 and body:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(cache_path, "wb") as f:
            f.write(body)
    return status, body


def fetch_repo_files(owner, repo):
    """Fetch SKILL.md then README.md (fallback readme.md) for one repo.

    Returns dict with measurement fields + failure notes.
    """
    result = {
        "readmeChars": None,
        "readmeHeadings": None,
        "readmeFetched": False,
        "skillChars": None,
        "skillFetched": False,
        "contextFile": None,
        "contextChars": None,
        "failures": [],
    }
    # 1. SKILL.md at root (skill-type plugins; cordis plugins usually lack it)
    status, body = cached_fetch(owner, repo, "SKILL.md")
    if status == 200 and body:
        text = body.decode("utf-8", errors="replace")
        chars, _ = measure_text(text)
        result["skillChars"] = chars
        result["skillFetched"] = True
    elif status != 404:
        result["failures"].append("SKILL.md:%s" % status)
    # 2. README.md, fallback readme.md
    readme_text = None
    for candidate in ("README.md", "readme.md"):
        status, body = cached_fetch(owner, repo, candidate)
        if status == 200 and body:
            readme_text = body.decode("utf-8", errors="replace")
            break
        if status != 404:
            result["failures"].append("%s:%s" % (candidate, status))
    if readme_text is not None:
        chars, headings = measure_text(readme_text)
        result["readmeChars"] = chars
        result["readmeHeadings"] = headings
        result["readmeFetched"] = True
    # 3. context source: SKILL.md wins, else README.md, else none
    if result["skillFetched"]:
        result["contextFile"] = "SKILL.md"
        result["contextChars"] = result["skillChars"]
    elif result["readmeFetched"]:
        result["contextFile"] = "README.md"
        result["contextChars"] = result["readmeChars"]
    return result


def select_entries(all_plugins, limit):
    """Recency-first selection: pushedAt desc, stars desc, fullName asc."""
    def key(p):
        return (
            p.get("pushedAt") or "",
            p.get("stars") or 0,
            p.get("fullName") or "",
        )
    ordered = sorted(all_plugins, key=key, reverse=True)
    # sorted(reverse=True) reverses fullName too; re-sort stably instead:
    ordered = sorted(all_plugins, key=lambda p: p.get("fullName") or "")
    ordered = sorted(ordered, key=lambda p: p.get("stars") or 0, reverse=True)
    ordered = sorted(ordered, key=lambda p: p.get("pushedAt") or "", reverse=True)
    return ordered[:limit]


def main():
    ap = argparse.ArgumentParser(description="Fetch DSH plugin data for v1.")
    ap.add_argument("--limit", type=int, default=LIMIT_DEFAULT)
    ap.add_argument("--source-file", default=None,
                    help="Use a local plugins.json instead of downloading.")
    ap.add_argument("--workers", type=int, default=WORKERS_DEFAULT)
    ap.add_argument("--skip-remote", action="store_true",
                    help="Skip per-repo README/SKILL.md fetching (metadata-only "
                    "snapshot, e.g. when the network is down). Measurements stay "
                    "null; a later normal run fills them in via the cache.")
    args = ap.parse_args()

    t0 = time.time()
    # 1. source data
    if args.source_file:
        with open(args.source_file, "rb") as f:
            source_bytes = f.read()
        print("source: local file %s (%d bytes)" % (args.source_file, len(source_bytes)))
    else:
        print("source: downloading %s ..." % SOURCE_URL)
        status, source_bytes = http_get(SOURCE_URL, timeout=120)
        if status != 200 or not source_bytes:
            print("ERROR: source download failed (status=%s)" % status, file=sys.stderr)
            return 1
        os.makedirs(os.path.dirname(SOURCE_SNAPSHOT), exist_ok=True)
        with open(SOURCE_SNAPSHOT, "wb") as f:
            f.write(source_bytes)
        print("source: downloaded %d bytes" % len(source_bytes))
    source_sha = hashlib.sha256(source_bytes).hexdigest()
    source = json.loads(source_bytes.decode("utf-8"))
    all_plugins = source["plugins"]
    source_generated = source.get("generatedAt")
    print("source: %d entries, generatedAt=%s, sha256=%s..."
          % (len(all_plugins), source_generated, source_sha[:16]))

    # 2. select v1 subset
    selected = select_entries(all_plugins, args.limit)
    print("selected: %d entries (pushedAt desc, stars desc)" % len(selected))
    print("  newest pushedAt in subset: %s" % selected[0].get("pushedAt"))
    print("  oldest pushedAt in subset: %s" % selected[-1].get("pushedAt"))

    # 3. fetch README/SKILL.md measurements concurrently
    measured = {}
    failures = []
    done = 0

    if args.skip_remote:
        print("skip-remote: measurements left null (re-run without it to fill them in)")
        for entry in selected:
            measured[entry.get("fullName")] = {
                "readmeChars": None,
                "readmeHeadings": None,
                "readmeFetched": False,
                "skillChars": None,
                "skillFetched": False,
                "contextFile": None,
                "contextChars": None,
                "failures": [],
            }
        done = len(selected)
    else:
        def work(entry):
            owner = entry.get("owner")
            repo = entry.get("repo")
            return entry.get("fullName"), fetch_repo_files(owner, repo)

        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
            futs = {ex.submit(work, e): e for e in selected}
            for fut in concurrent.futures.as_completed(futs):
                full_name, m = fut.result()
                measured[full_name] = m
                done += 1
                if m["failures"]:
                    failures.append({"fullName": full_name, "failures": m["failures"]})
                if done % 100 == 0:
                    print("  fetched %d/%d ..." % (done, len(selected)))

    # 4. build output (keep selected order)
    out_plugins = []
    readme_ok = 0
    skill_ok = 0
    for entry in selected:
        m = measured.get(entry.get("fullName"), {})
        install = entry.get("install") or {}
        commands = install.get("commands") or []
        out_plugins.append({
            "id": entry.get("id"),
            "fullName": entry.get("fullName"),
            "name": entry.get("name"),
            "owner": entry.get("owner"),
            "repo": entry.get("repo"),
            "type": entry.get("type"),
            "stars": entry.get("stars"),
            "forks": entry.get("forks"),
            "language": entry.get("language"),
            "description": entry.get("description"),
            "descriptionZh": entry.get("descriptionZh"),
            "tags": entry.get("tags") or [],
            "topics": entry.get("topics") or [],
            "license": entry.get("license"),
            "homepage": entry.get("homepage"),
            "pushedAt": entry.get("pushedAt"),
            "createdAt": entry.get("createdAt"),
            "updatedAt": entry.get("updatedAt"),
            "installCommand": commands[0] if commands else None,
            "readmeChars": m.get("readmeChars"),
            "readmeHeadings": m.get("readmeHeadings"),
            "readmeFetched": bool(m.get("readmeFetched")),
            "skillChars": m.get("skillChars"),
            "skillFetched": bool(m.get("skillFetched")),
            "contextFile": m.get("contextFile"),
            "contextChars": m.get("contextChars"),
        })
        if m.get("readmeFetched"):
            readme_ok += 1
        if m.get("skillFetched"):
            skill_ok += 1

    fetched_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    output = {
        "meta": {
            "source": "dsh-market plugins.json (2BingLing/dsh-market)",
            "sourceUrl": SOURCE_URL,
            "sourceGeneratedAt": source_generated,
            "sourceSha256": source_sha,
            "sourceTotal": len(all_plugins),
            "fetchedAt": fetched_at,
            "selectionRule": "pushedAt desc, stars desc, fullName asc; first %d" % args.limit,
            "includedCount": len(out_plugins),
            "readmeFetched": readme_ok,
            "skillFetched": skill_ok,
            "measurementsPending": bool(args.skip_remote),
        },
        "plugins": out_plugins,
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=1)
        f.write("\n")

    report = {
        "sourceUrl": SOURCE_URL,
        "sourceGeneratedAt": source_generated,
        "sourceSha256": source_sha,
        "sourceTotal": len(all_plugins),
        "limit": args.limit,
        "includedCount": len(out_plugins),
        "readmeFetched": readme_ok,
        "skillFetched": skill_ok,
        "nonHttpFailures": failures,
        "skipRemote": bool(args.skip_remote),
        "durationSeconds": round(time.time() - t0, 1),
        "fetchedAt": fetched_at,
        "outputPath": OUT_PATH,
        "outputBytes": os.path.getsize(OUT_PATH),
    }
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print("done: %d plugins, readme %d/%d, skill %d/%d, failures %d, %.1fs"
          % (len(out_plugins), readme_ok, len(out_plugins),
             skill_ok, len(out_plugins), len(failures), time.time() - t0))
    print("output: %s (%d bytes)" % (OUT_PATH, os.path.getsize(OUT_PATH)))
    print("report: %s" % REPORT_PATH)
    return 0


if __name__ == "__main__":
    main()
