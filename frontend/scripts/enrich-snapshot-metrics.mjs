#!/usr/bin/env node
/**
 * Recompute bundle metrics from an existing .next build for legacy snapshots.
 * Usage: node scripts/enrich-snapshot-metrics.mjs [snapshotId]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  analyzeJsChunks,
  analyzeStaticBreakdown,
  collectMetrics,
  getPaths,
  loadManifest,
  localeBundleStrategy,
  countLoadingTsx,
  countDynamicImports,
  localeStartupBytes,
} from './perf-baseline-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { frontendRoot, baselinesDir } = getPaths(__dirname)

const id = process.argv[2]
const manifest = loadManifest(baselinesDir)
const targetId = id ?? manifest.latestId

if (!targetId) {
  console.error('Usage: enrich-snapshot-metrics.mjs [snapshotId]')
  process.exit(1)
}

const filePath = path.join(baselinesDir, `${targetId}.json`)
if (!fs.existsSync(filePath)) {
  console.error('Snapshot not found:', filePath)
  process.exit(1)
}

const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'))
const bundle = analyzeJsChunks(frontendRoot)
const staticBreakdown = analyzeStaticBreakdown(frontendRoot)

const enriched = {
  ...snapshot,
  static: staticBreakdown,
  jsChunks: {
    fileCount: bundle.jsChunkFileCount,
    totalBytes: bundle.totalAllJsChunksBytes,
    top10Bytes: bundle.totalTop10JsBytes,
    largestBytes: bundle.largestJsChunkBytes,
  },
  topJsChunks: bundle.topJsChunks,
  largestJsChunkBytes: bundle.largestJsChunkBytes,
  totalTop10JsBytes: bundle.totalTop10JsBytes,
  localeStartup: localeStartupBytes(frontendRoot),
  localeBundle: localeBundleStrategy(frontendRoot),
  loadingTsxCount: countLoadingTsx(frontendRoot),
  dynamicImportFileCount: countDynamicImports(frontendRoot),
  // Legacy flat fields kept in sync
  staticAssetsBytes: staticBreakdown.totalBytes,
  staticJsChunksBytes: staticBreakdown.jsChunksBytes,
  staticMediaBytes: staticBreakdown.mediaBytes,
  jsChunkFileCount: bundle.jsChunkFileCount,
  totalAllJsChunksBytes: bundle.totalAllJsChunksBytes,
}

fs.writeFileSync(filePath, JSON.stringify(enriched, null, 2))
console.log('Enriched', filePath)
console.log(JSON.stringify(collectMetrics(frontendRoot), null, 2))
