#!/usr/bin/env node

/**

 * Capture a pre-optimization baseline from a clean git commit using a temporary worktree.

 * Does not touch your working tree changes.

 *

 * Usage (from frontend/):

 *   npm run measure:perf:reference

 *   npm run measure:perf:reference -- 17ffe87

 */

import { execSync } from 'node:child_process'

import fs from 'node:fs'

import path from 'node:path'

import { fileURLToPath } from 'node:url'



import {

  collectMetrics,

  getPaths,

  gitInfo,

  localeBundleFromGit,

  runProductionBuild,

  snapshotId,

  writeSnapshot,

} from './perf-baseline-lib.mjs'



const __dirname = path.dirname(fileURLToPath(import.meta.url))

const { frontendRoot, repoRoot, baselinesDir } = getPaths(__dirname)



const commit = process.argv[2] ?? 'HEAD'

const worktreePath = path.join(repoRoot, '.perf-worktree-reference')

const shortCommit = execSync(`git rev-parse --short ${commit}`, {

  cwd: repoRoot,

  encoding: 'utf8',

}).trim()



function run(cmd, cwd = repoRoot) {

  execSync(cmd, { cwd, stdio: 'inherit', shell: true })

}



function cleanup() {

  if (fs.existsSync(worktreePath)) {

    run(`git worktree remove "${worktreePath}" --force`)

  }

}



try {

  cleanup()

  console.log(`Creating worktree at ${commit} (${shortCommit})...`)

  run(`git worktree add "${worktreePath}" ${commit}`)



  const worktreeFrontend = path.join(worktreePath, 'frontend')

  const scriptsDir = path.join(worktreeFrontend, 'scripts')

  fs.mkdirSync(scriptsDir, { recursive: true })



  for (const file of ['perf-baseline-lib.mjs', 'measure-perf.mjs', 'enrich-reference-baseline.mjs']) {

    fs.copyFileSync(path.join(__dirname, file), path.join(scriptsDir, file))

  }



  console.log('Installing dependencies in reference worktree...')

  run('npm install', worktreeFrontend)



  console.log('Running production build in reference worktree...')

  const buildResult = runProductionBuild(worktreeFrontend)



  const metrics = collectMetrics(worktreeFrontend, {

    buildDurationMs: buildResult.buildDurationMs,

    compileDurationMs: buildResult.compileDurationMs,

    typecheckDurationMs: buildResult.typecheckDurationMs,

  })

  const git = gitInfo(worktreePath)

  const id = snapshotId('pre-optimization', shortCommit)



  const snapshot = {

    id,

    label: 'pre-optimization',

    source: 'measure:perf',

    capturedAt: new Date().toISOString(),

    description: `Clean capture at git ${shortCommit} before local perf optimization changes`,

    git,

    buildSamples: 1,

    ...metrics,

    localeBundle: localeBundleFromGit(repoRoot, commit),

    notes: [

      'Captured via npm run measure:perf:reference (git worktree)',

      'Authoritative pre-optimization baseline for automated comparison',

      'Primary metrics: compileDurationMs, jsChunks.top10Bytes, jsChunks.largestBytes',

    ],

  }



  const { filePath } = writeSnapshot(baselinesDir, snapshot, {

    setReference: true,

    setLatest: false,

  })



  console.log('\nReference baseline written to', filePath)

  console.log('Snapshot id:', id)

  console.log('Next: npm run measure:perf  then  npm run measure:perf:compare')

} finally {

  cleanup()

}

