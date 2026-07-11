/**
 * Shared helpers for frontend performance baseline capture and comparison.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

export function getPaths(scriptDir) {
  const frontendRoot = path.resolve(scriptDir, '..')
  const repoRoot = path.resolve(frontendRoot, '..')
  const baselinesDir = path.join(repoRoot, 'docs', 'optimization', 'baselines')
  return { frontendRoot, repoRoot, baselinesDir }
}

export function dirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += dirSizeBytes(full)
    else total += fs.statSync(full).size
  }
  return total
}

export function localeStartupBytes(frontendRoot) {
  const localesDir = path.join(frontendRoot, 'src', 'lib', 'locales')
  const enPath = path.join(localesDir, 'en-US', 'index.ts')
  const enSize = fs.existsSync(enPath) ? fs.statSync(enPath).size : 0
  let allLocales = 0
  let localeCount = 0
  if (fs.existsSync(localesDir)) {
    for (const name of fs.readdirSync(localesDir)) {
      const indexPath = path.join(localesDir, name, 'index.ts')
      if (fs.existsSync(indexPath)) {
        allLocales += fs.statSync(indexPath).size
        localeCount++
      }
    }
  }
  return { enUSBytes: enSize, allLocalesBytes: allLocales, localeFileCount: localeCount }
}

/** How many locales are eagerly imported in locales/index.ts (bundle impact). */
export function localeBundleStrategy(frontendRoot) {
  const indexPath = path.join(frontendRoot, 'src', 'lib', 'locales', 'index.ts')
  if (!fs.existsSync(indexPath)) {
    return {
      eagerLocaleCount: null,
      strategy: 'unknown',
      hasLoadLocaleModule: false,
    }
  }
  const content = fs.readFileSync(indexPath, 'utf8')
  const resourceEntries = (content.match(/['"][a-z]{2}-[A-Z]{2}['"]\s*:\s*\{/g) ?? []).length
  const importLocales = (content.match(/from\s+['"]\.\/[a-z]{2}-[A-Z]{2}['"]/g) ?? []).length
  const eagerLocaleCount = Math.max(resourceEntries, importLocales)
  const hasLoadLocaleModule = fs.existsSync(
    path.join(frontendRoot, 'src', 'lib', 'locales', 'load-locale.ts')
  )
  let strategy = 'unknown'
  if (eagerLocaleCount <= 1 && hasLoadLocaleModule) strategy = 'lazy-enUS-only'
  else if (eagerLocaleCount > 1) strategy = 'eager-all'
  return { eagerLocaleCount, strategy, hasLoadLocaleModule }
}

/** Locale bundle metrics from git tree (for reference worktree snapshots). */
export function localeBundleFromGit(repoRoot, ref = 'HEAD') {
  const content = execSync(`git show ${ref}:frontend/src/lib/locales/index.ts`, {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const resourceEntries = (content.match(/['"][a-z]{2}-[A-Z]{2}['"]\s*:\s*\{/g) ?? []).length
  const importLocales = (content.match(/from\s+['"]\.\/[a-z]{2}-[A-Z]{2}['"]/g) ?? []).length
  const eagerLocaleCount = Math.max(resourceEntries, importLocales)

  let hasLoadLocale = false
  try {
    execSync(`git cat-file -e ${ref}:frontend/src/lib/locales/load-locale.ts`, {
      cwd: repoRoot,
      stdio: 'ignore',
    })
    hasLoadLocale = true
  } catch {
    hasLoadLocale = false
  }

  let strategy = 'unknown'
  if (eagerLocaleCount <= 1 && hasLoadLocale) strategy = 'lazy-enUS-only'
  else if (eagerLocaleCount > 1) strategy = 'eager-all'

  return { eagerLocaleCount, strategy, hasLoadLocaleModule: hasLoadLocale }
}

export function countLoadingTsx(frontendRoot) {
  const appDir = path.join(frontendRoot, 'src', 'app')
  if (!fs.existsSync(appDir)) return 0
  let count = 0
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'loading.tsx') count++
    }
  }
  walk(appDir)
  return count
}

export function countDynamicImports(frontendRoot) {
  const srcDir = path.join(frontendRoot, 'src')
  if (!fs.existsSync(srcDir)) return 0
  let count = 0
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8')
        if (/dynamic\s*\(/.test(content)) count++
      }
    }
  }
  walk(srcDir)
  return count
}

export function analyzeJsChunks(frontendRoot, topLimit = 10) {
  const chunksDir = path.join(frontendRoot, '.next', 'static', 'chunks')
  if (!fs.existsSync(chunksDir)) {
    return {
      jsChunkFileCount: 0,
      totalAllJsChunksBytes: 0,
      topJsChunks: [],
      largestJsChunkBytes: null,
      totalTop10JsBytes: 0,
    }
  }

  const sizes = fs
    .readdirSync(chunksDir)
    .filter((f) => f.endsWith('.js'))
    .map((name) => ({
      name,
      bytes: fs.statSync(path.join(chunksDir, name)).size,
    }))
    .sort((a, b) => b.bytes - a.bytes)

  const topJsChunks = sizes.slice(0, topLimit)
  return {
    jsChunkFileCount: sizes.length,
    totalAllJsChunksBytes: sizes.reduce((sum, c) => sum + c.bytes, 0),
    topJsChunks,
    largestJsChunkBytes: sizes[0]?.bytes ?? null,
    totalTop10JsBytes: topJsChunks.reduce((sum, c) => sum + c.bytes, 0),
  }
}

export function topChunks(frontendRoot, limit = 10) {
  return analyzeJsChunks(frontendRoot, limit).topJsChunks
}

/** Split static output — total bytes alone is misleading when lazy chunks/fonts grow. */
export function analyzeStaticBreakdown(frontendRoot) {
  const staticDir = path.join(frontendRoot, '.next', 'static')
  if (!fs.existsSync(staticDir)) {
    return {
      totalBytes: 0,
      jsChunksBytes: 0,
      mediaBytes: 0,
      otherBytes: 0,
    }
  }

  const totalBytes = dirSizeBytes(staticDir)
  const jsChunksBytes = dirSizeBytes(path.join(staticDir, 'chunks'))
  const mediaBytes = dirSizeBytes(path.join(staticDir, 'media'))
  const otherBytes = Math.max(0, totalBytes - jsChunksBytes - mediaBytes)

  return { totalBytes, jsChunksBytes, mediaBytes, otherBytes }
}

export function parseBuildTimings(buildOutput) {
  const compileMatch = buildOutput.match(/Compiled successfully in ([\d.]+)s/)
  const typecheckMatch = buildOutput.match(/Finished TypeScript in ([\d.]+)s/)
  return {
    compileDurationMs: compileMatch ? Math.round(parseFloat(compileMatch[1]) * 1000) : null,
    typecheckDurationMs: typecheckMatch ? Math.round(parseFloat(typecheckMatch[1]) * 1000) : null,
  }
}

export function runProductionBuild(frontendRoot) {
  const started = Date.now()
  let output = ''
  try {
    output = execSync('npm run build', {
      cwd: frontendRoot,
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    })
  } catch (error) {
    const err = error
    output = `${err.stdout ?? ''}${err.stderr ?? ''}`
    if (!output.includes('Compiled successfully')) {
      throw error
    }
  }

  const wallMs = Date.now() - started
  const timings = parseBuildTimings(output)
  return {
    buildDurationMs: wallMs,
    ...timings,
    buildOutput: output,
  }
}

export function median(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  if (nums.length === 0) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 === 0 ? Math.round((nums[mid - 1] + nums[mid]) / 2) : nums[mid]
}

export function gitInfo(cwd) {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim()
    const shortCommit = commit.slice(0, 7)
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim()
    const dirty =
      execSync('git status --porcelain', { cwd, encoding: 'utf8' }).trim().length > 0
    return { commit, shortCommit, branch, dirty }
  } catch {
    return { commit: null, shortCommit: null, branch: null, dirty: null }
  }
}

export function collectMetrics(frontendRoot, { buildDurationMs, compileDurationMs, typecheckDurationMs } = {}) {
  const staticBreakdown = analyzeStaticBreakdown(frontendRoot)
  const bundle = analyzeJsChunks(frontendRoot)
  const locales = localeStartupBytes(frontendRoot)
  const localeBundle = localeBundleStrategy(frontendRoot)

  return {
    buildDurationMs: buildDurationMs ?? null,
    compileDurationMs: compileDurationMs ?? null,
    typecheckDurationMs: typecheckDurationMs ?? null,
    static: staticBreakdown,
    jsChunks: {
      fileCount: bundle.jsChunkFileCount,
      totalBytes: bundle.totalAllJsChunksBytes,
      top10Bytes: bundle.totalTop10JsBytes,
      largestBytes: bundle.largestJsChunkBytes,
    },
    // Legacy flat fields (kept for backward compatibility)
    staticAssetsBytes: staticBreakdown.totalBytes,
    staticJsChunksBytes: staticBreakdown.jsChunksBytes,
    staticMediaBytes: staticBreakdown.mediaBytes,
    jsChunkFileCount: bundle.jsChunkFileCount,
    totalAllJsChunksBytes: bundle.totalAllJsChunksBytes,
    localeStartup: locales,
    localeBundle,
    loadingTsxCount: countLoadingTsx(frontendRoot),
    dynamicImportFileCount: countDynamicImports(frontendRoot),
    topJsChunks: bundle.topJsChunks,
    largestJsChunkBytes: bundle.largestJsChunkBytes,
    totalTop10JsBytes: bundle.totalTop10JsBytes,
  }
}

export function loadManifest(baselinesDir) {
  const manifestPath = path.join(baselinesDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    return { version: 1, referenceId: null, latestId: null, snapshots: {} }
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
}

export function saveManifest(baselinesDir, manifest) {
  fs.mkdirSync(baselinesDir, { recursive: true })
  fs.writeFileSync(
    path.join(baselinesDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  )
}

export function snapshotId(label, shortCommit) {
  const slug = label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
  return shortCommit ? `${slug}-${shortCommit}` : slug
}

export function writeSnapshot(baselinesDir, snapshot, { setReference = false, setLatest = true } = {}) {
  const id = snapshot.id
  const fileName = `${id}.json`
  const filePath = path.join(baselinesDir, fileName)

  fs.mkdirSync(baselinesDir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2))

  const manifest = loadManifest(baselinesDir)
  manifest.snapshots[id] = {
    file: fileName,
    label: snapshot.label,
    gitCommit: snapshot.git?.shortCommit ?? null,
    capturedAt: snapshot.capturedAt,
    description: snapshot.description ?? null,
    source: snapshot.source ?? 'measure:perf',
  }
  if (setReference) manifest.referenceId = id
  if (setLatest) manifest.latestId = id
  saveManifest(baselinesDir, manifest)

  return { id, filePath, manifest }
}

export function loadSnapshot(baselinesDir, idOrFile) {
  const manifest = loadManifest(baselinesDir)
  let fileName = idOrFile
  if (!fileName.endsWith('.json')) {
    const entry = manifest.snapshots[idOrFile]
    if (!entry) throw new Error(`Unknown snapshot id: ${idOrFile}`)
    fileName = entry.file
  }
  const filePath = path.join(baselinesDir, fileName)
  if (!fs.existsSync(filePath)) throw new Error(`Snapshot file not found: ${filePath}`)
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function formatMs(ms) {
  if (ms == null) return '—'
  return `${(ms / 1000).toFixed(1)}s`
}

export function pctDelta(before, after) {
  if (before == null || after == null || before === 0) return null
  return ((after - before) / before) * 100
}

/** Primary metrics — use for pass/fail scorecard */
export const LOWER_IS_BETTER = new Set([
  'jsChunks.largestBytes',
  'jsChunks.top10Bytes',
  'largestJsChunkBytes',
  'totalTop10JsBytes',
  'localeBundle.eagerLocaleCount',
])

/** Higher is better for UX instrumentation */
export const HIGHER_IS_BETTER = new Set(['loadingTsxCount'])

/** Informational — do not score as regression */
export const INFORMATIONAL = new Set([
  'buildDurationMs',
  'compileDurationMs',
  'typecheckDurationMs',
  'localeBundle.strategy',
  'staticAssetsBytes',
  'static.totalBytes',
  'staticJsChunksBytes',
  'static.jsChunksBytes',
  'staticMediaBytes',
  'static.mediaBytes',
  'jsChunkFileCount',
  'jsChunks.fileCount',
  'totalAllJsChunksBytes',
  'jsChunks.totalBytes',
  'dynamicImportFileCount',
  'localeStartup.enUSBytes',
  'localeStartup.allLocalesBytes',
  'localeStartup.localeFileCount',
])

export function flattenMetrics(snapshot) {
  const s = snapshot.static ?? {}
  const j = snapshot.jsChunks ?? {}
  return {
    buildDurationMs: snapshot.buildDurationMs,
    compileDurationMs: snapshot.compileDurationMs,
    typecheckDurationMs: snapshot.typecheckDurationMs,
    'static.totalBytes': s.totalBytes ?? snapshot.staticAssetsBytes,
    staticAssetsBytes: snapshot.staticAssetsBytes ?? s.totalBytes,
    'static.jsChunksBytes': s.jsChunksBytes ?? snapshot.staticJsChunksBytes,
    staticJsChunksBytes: snapshot.staticJsChunksBytes ?? s.jsChunksBytes,
    'static.mediaBytes': s.mediaBytes ?? snapshot.staticMediaBytes,
    staticMediaBytes: snapshot.staticMediaBytes ?? s.mediaBytes,
    'jsChunks.fileCount': j.fileCount ?? snapshot.jsChunkFileCount,
    jsChunkFileCount: snapshot.jsChunkFileCount ?? j.fileCount,
    'jsChunks.totalBytes': j.totalBytes ?? snapshot.totalAllJsChunksBytes,
    totalAllJsChunksBytes: snapshot.totalAllJsChunksBytes ?? j.totalBytes,
    'jsChunks.top10Bytes': j.top10Bytes ?? snapshot.totalTop10JsBytes,
    totalTop10JsBytes: snapshot.totalTop10JsBytes ?? j.top10Bytes,
    'jsChunks.largestBytes': j.largestBytes ?? snapshot.largestJsChunkBytes,
    largestJsChunkBytes: snapshot.largestJsChunkBytes ?? j.largestBytes,
    'localeStartup.enUSBytes': snapshot.localeStartup?.enUSBytes,
    'localeStartup.allLocalesBytes': snapshot.localeStartup?.allLocalesBytes,
    'localeStartup.localeFileCount': snapshot.localeStartup?.localeFileCount,
    'localeBundle.eagerLocaleCount': snapshot.localeBundle?.eagerLocaleCount,
    'localeBundle.strategy': snapshot.localeBundle?.strategy,
    loadingTsxCount: snapshot.loadingTsxCount,
    dynamicImportFileCount: snapshot.dynamicImportFileCount,
  }
}

/** Deduplicated keys for comparison display (prefer nested canonical names). */
export const COMPARE_KEYS = [
  'buildDurationMs',
  'compileDurationMs',
  'typecheckDurationMs',
  'static.jsChunksBytes',
  'static.mediaBytes',
  'jsChunks.largestBytes',
  'jsChunks.top10Bytes',
  'jsChunks.fileCount',
  'jsChunks.totalBytes',
  'localeBundle.eagerLocaleCount',
  'localeBundle.strategy',
  'loadingTsxCount',
  'dynamicImportFileCount',
]

export function compareSnapshots(reference, candidate) {
  const ref = flattenMetrics(reference)
  const cur = flattenMetrics(candidate)
  const rows = []

  for (const key of COMPARE_KEYS) {
    const before = ref[key]
    const after = cur[key]
    const delta = after != null && before != null ? after - before : null
    const pct = pctDelta(before, after)
    let improved = null
    if (delta != null && delta !== 0 && !INFORMATIONAL.has(key)) {
      if (LOWER_IS_BETTER.has(key)) improved = delta < 0
      else if (HIGHER_IS_BETTER.has(key)) improved = delta > 0
    }
    rows.push({ key, before, after, delta, pct, improved, informational: INFORMATIONAL.has(key) })
  }

  return rows
}

export function printScorecard(rows) {
  const primary = rows.filter((r) => !r.informational)
  const scored = primary.filter((r) => r.improved != null)
  const unchanged = primary.filter((r) => r.delta === 0 || (r.before != null && r.after != null && r.before === r.after))
  const better = scored.filter((r) => r.improved === true).length
  const worse = scored.filter((r) => r.improved === false).length
  const same = unchanged.length

  console.log('Scorecard (primary metrics only):')
  console.log(`  better: ${better}   worse: ${worse}   same: ${same}`)
  if (worse > 0) {
    const regressions = scored.filter((r) => r.improved === false).map((r) => r.key)
    console.log(`  regressions: ${regressions.join(', ')}`)
  }
  console.log('')
}

export function printComparison(reference, candidate, rows) {
  const refLabel = reference.label ?? reference.id ?? 'reference'
  const curLabel = candidate.label ?? candidate.id ?? 'candidate'

  console.log(`\nPerformance comparison`)
  console.log(`  Reference : ${refLabel} (${reference.capturedAt ?? 'unknown'})`)
  console.log(`  Candidate : ${curLabel} (${candidate.capturedAt ?? 'unknown'})`)
  if (reference.source === 'manual-audit') {
    console.log('  Note      : reference is an audit estimate — build/chunk deltas are indicative only')
  }
  console.log('')

  const col = (s, w) => String(s).padEnd(w)
  console.log(
    `${col('Metric', 34)} ${col('Reference', 14)} ${col('Candidate', 14)} ${col('Delta', 14)} ${col('Change', 10)}`
  )
  console.log('-'.repeat(90))

  for (const row of rows) {
    let change = '—'
    if (row.informational || INFORMATIONAL.has(row.key)) change = 'info'
    else if (row.improved === true) change = 'better'
    else if (row.improved === false) change = 'worse'
    else if (row.delta === 0) change = 'same'

    const fmtVal = (key, val) => {
      if (val == null) return '—'
      if (/Bytes|bytes/.test(key)) return formatBytes(val)
      if (key.endsWith('DurationMs')) return formatMs(val)
      return String(val)
    }

    const deltaStr =
      row.pct != null && Number.isFinite(row.pct)
        ? `${row.pct > 0 ? '+' : ''}${row.pct.toFixed(1)}%`
        : row.delta != null
          ? `${row.delta > 0 ? '+' : ''}${row.delta}`
          : '—'

    console.log(
      `${col(row.key, 34)} ${col(fmtVal(row.key, row.before), 14)} ${col(fmtVal(row.key, row.after), 14)} ${col(deltaStr, 14)} ${col(change, 10)}`
    )
  }

  printScorecard(rows)
}
