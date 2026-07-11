#!/usr/bin/env node
/**
 * Compare two baseline snapshots or manifest reference vs latest.
 *
 * Usage (from frontend/):
 *   npm run measure:perf:compare
 *   node scripts/compare-baselines.mjs pre-optimization-17ffe87 current-abc1234
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  compareSnapshots,
  getPaths,
  loadManifest,
  loadSnapshot,
  printComparison,
} from './perf-baseline-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { baselinesDir } = getPaths(__dirname)

const [refArg, candArg] = process.argv.slice(2)
const manifest = loadManifest(baselinesDir)

const referenceId = refArg ?? manifest.referenceId
const candidateId = candArg ?? manifest.latestId

if (!referenceId || !candidateId) {
  console.error('Usage: compare-baselines.mjs [referenceId] [candidateId]')
  console.error('Or set referenceId/latestId in baselines/manifest.json')
  process.exit(1)
}

const reference = loadSnapshot(baselinesDir, referenceId)
const candidate = loadSnapshot(baselinesDir, candidateId)
printComparison(reference, candidate, compareSnapshots(reference, candidate))
