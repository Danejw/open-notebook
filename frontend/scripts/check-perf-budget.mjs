#!/usr/bin/env node
/**
 * Validate the existing production build against committed performance budgets.
 *
 * Run `npm run build` first. This script intentionally scores only metrics that
 * approximate user-visible loading; build time and total lazy bytes are noisy.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectMetrics, flattenMetrics, formatBytes, getPaths } from './perf-baseline-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { frontendRoot, repoRoot } = getPaths(__dirname)
const budgetPath = path.join(repoRoot, 'docs', 'optimization', 'perf-budget.json')
const buildManifestPath = path.join(frontendRoot, '.next', 'build-manifest.json')

if (!fs.existsSync(buildManifestPath)) {
  console.error('Missing .next production build. Run `npm run build` first.')
  process.exit(1)
}

const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'))
const metrics = flattenMetrics(collectMetrics(frontendRoot))
const failures = []
const rows = []

function displayValue(key, value) {
  return key.toLowerCase().includes('bytes') ? formatBytes(value) : String(value)
}

for (const [key, limit] of Object.entries(budget.maximum ?? {})) {
  const actual = metrics[key]
  const passed = typeof actual === 'number' && actual <= limit
  rows.push({ key, actual, rule: `≤ ${displayValue(key, limit)}`, passed })
  if (!passed) failures.push(`${key}: ${displayValue(key, actual)} exceeds ${displayValue(key, limit)}`)
}

for (const [key, limit] of Object.entries(budget.minimum ?? {})) {
  const actual = metrics[key]
  const passed = typeof actual === 'number' && actual >= limit
  rows.push({ key, actual, rule: `≥ ${displayValue(key, limit)}`, passed })
  if (!passed) failures.push(`${key}: ${displayValue(key, actual)} is below ${displayValue(key, limit)}`)
}

console.log('\nFrontend performance budget')
for (const row of rows) {
  console.log(
    `  ${row.passed ? 'PASS' : 'FAIL'}  ${row.key}: ${displayValue(row.key, row.actual)} (${row.rule})`
  )
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    '## Frontend performance budget',
    '',
    '| Metric | Actual | Budget | Result |',
    '|---|---:|---:|---|',
    ...rows.map(
      (row) =>
        `| \`${row.key}\` | ${displayValue(row.key, row.actual)} | ${row.rule} | ${row.passed ? '✅ Pass' : '❌ Fail'} |`
    ),
    '',
  ].join('\n')
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} performance budget violation(s):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('\nAll user-facing performance budgets passed.')
