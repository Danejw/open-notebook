#!/usr/bin/env node
/** Patch reference snapshot with localeBundle metrics from git tree (no rebuild). */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPaths, loadManifest, localeBundleFromGit } from './perf-baseline-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { repoRoot, baselinesDir } = getPaths(__dirname)

const manifest = loadManifest(baselinesDir)
const refId = manifest.referenceId
if (!refId) {
  console.error('No referenceId in manifest.json')
  process.exit(1)
}

const filePath = path.join(baselinesDir, `${refId}.json`)
const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'))
const ref = snapshot.git?.commit ?? 'HEAD'
snapshot.localeBundle = localeBundleFromGit(repoRoot, ref)
fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2))
console.log('Enriched', filePath, 'with localeBundle:', snapshot.localeBundle)
