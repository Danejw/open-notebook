#!/usr/bin/env node
/**
 * Capture frontend performance baselines for docs/optimization/baselines/.
 *
 * Usage (from frontend/):
 *   npm run measure:perf
 *   npm run measure:perf -- --label phase6 --samples 2
 *   npm run measure:perf -- --compare
 *   npm run measure:perf -- --skip-build
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectMetrics,
  compareSnapshots,
  getPaths,
  gitInfo,
  loadManifest,
  loadSnapshot,
  median,
  printComparison,
  runProductionBuild,
  snapshotId,
  writeSnapshot,
} from './perf-baseline-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { frontendRoot, repoRoot, baselinesDir } = getPaths(__dirname)

function parseArgs(argv) {
  const args = {
    label: 'current',
    setReference: false,
    setLatest: true,
    compare: false,
    skipBuild: false,
    samples: 1,
    description: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--label' && argv[i + 1]) args.label = argv[++i]
    else if (arg === '--set-reference') args.setReference = true
    else if (arg === '--no-latest') args.setLatest = false
    else if (arg === '--compare') args.compare = true
    else if (arg === '--skip-build') args.skipBuild = true
    else if (arg === '--samples' && argv[i + 1]) args.samples = Math.max(1, parseInt(argv[++i], 10))
    else if (arg === '--description' && argv[i + 1]) args.description = argv[++i]
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const git = gitInfo(repoRoot)

if (args.compare) {
  const manifest = loadManifest(baselinesDir)
  if (!manifest.referenceId || !manifest.latestId) {
    console.error('Cannot compare: manifest.json needs referenceId and latestId.')
    process.exit(1)
  }
  const reference = loadSnapshot(baselinesDir, manifest.referenceId)
  const candidate = loadSnapshot(baselinesDir, manifest.latestId)
  printComparison(reference, candidate, compareSnapshots(reference, candidate))
  process.exit(0)
}

let buildDurationMs = null
let compileDurationMs = null
let typecheckDurationMs = null

if (!args.skipBuild) {
  const wallSamples = []
  const compileSamples = []
  const typecheckSamples = []

  for (let i = 0; i < args.samples; i++) {
    if (args.samples > 1) {
      console.log(`\nBuild sample ${i + 1}/${args.samples}...`)
    } else {
      console.log('Running production build...')
    }
    const result = runProductionBuild(frontendRoot)
    wallSamples.push(result.buildDurationMs)
    if (result.compileDurationMs != null) compileSamples.push(result.compileDurationMs)
    if (result.typecheckDurationMs != null) typecheckSamples.push(result.typecheckDurationMs)
  }

  buildDurationMs = median(wallSamples)
  compileDurationMs = median(compileSamples)
  typecheckDurationMs = median(typecheckSamples)

  if (args.samples > 1) {
    console.log(`\nMedian build wall time: ${(buildDurationMs / 1000).toFixed(1)}s (${args.samples} samples)`)
  }
} else {
  console.log('Skipping build (--skip-build); reusing existing .next output')
}

const metrics = collectMetrics(frontendRoot, {
  buildDurationMs,
  compileDurationMs,
  typecheckDurationMs,
})
const id = snapshotId(args.label, git.shortCommit)

const snapshot = {
  id,
  label: args.label,
  source: 'measure:perf',
  capturedAt: new Date().toISOString(),
  description: args.description,
  git,
  buildSamples: args.skipBuild ? 0 : args.samples,
  ...metrics,
  notes: [
    'Captured with npm run measure:perf',
    'Primary metrics: compileDurationMs, jsChunks.top10Bytes, jsChunks.largestBytes, localeBundle.eagerLocaleCount',
    'Informational: static.mediaBytes (fonts), jsChunks.totalBytes (includes lazy chunks on disk)',
    'Use npm run measure:perf:compare for scorecard vs manifest referenceId',
  ],
}

const { filePath, manifest } = writeSnapshot(baselinesDir, snapshot, {
  setReference: args.setReference,
  setLatest: args.setLatest,
})

console.log('\nBaseline written to', filePath)
console.log('Snapshot id:', id)
console.log('Reference id:', manifest.referenceId ?? '(none)')
console.log('Latest id    :', manifest.latestId ?? '(none)')
console.log(JSON.stringify(snapshot, null, 2))
