#!/usr/bin/env node
/**
 * Capture browser Web Vitals from a running Construction OS instance.
 *
 * Prerequisites:
 *   npm install -D playwright
 *   npx playwright install chromium
 *   Frontend running (npm run start) with API reachable; auth disabled or session cookie set
 *
 * Usage (from frontend/):
 *   npm run measure:runtime
 *   npm run measure:runtime -- --url http://localhost:3000 --routes /projects,/sources
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const outputDir = path.join(repoRoot, 'docs', 'optimization', 'runtime')

function parseArgs(argv) {
  const args = {
    url: 'http://localhost:3000',
    routes: ['/projects', '/sources'],
    timeoutMs: 20_000,
    label: 'runtime',
  }

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--url' && argv[i + 1]) {
      args.url = argv[++i]
    } else if (arg === '--routes' && argv[i + 1]) {
      args.routes = argv[++i].split(',').map((route) => route.trim()).filter(Boolean)
    } else if (arg === '--timeout' && argv[i + 1]) {
      args.timeoutMs = Number(argv[++i])
    } else if (arg === '--label' && argv[i + 1]) {
      args.label = argv[++i]
    }
  }

  return args
}

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    console.error(
      'Playwright is required.\n' +
        '  npm install -D playwright\n' +
        '  npx playwright install chromium'
    )
    process.exit(1)
  }
}

async function waitForVitals(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const vitals = await page.evaluate(() => window.__construction_os_WEB_VITALS__ ?? null)
    const latest = vitals?.latest
    if (latest && (latest.LCP || latest.INP || latest.CLS || latest.FCP || latest.TTFB)) {
      return vitals
    }
    await page.waitForTimeout(500)
  }

  return page.evaluate(() => window.__construction_os_WEB_VITALS__ ?? null)
}

async function main() {
  const args = parseArgs(process.argv)
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()

  const results = {
    capturedAt: new Date().toISOString(),
    baseUrl: args.url,
    routes: {},
  }

  for (const route of args.routes) {
    const page = await context.newPage()
    const url = `${args.url.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`

    console.log(`Navigating ${url}...`)

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs })
      const vitals = await waitForVitals(page, args.timeoutMs)
      results.routes[route] = { url, vitals }

      const latest = vitals?.latest ?? {}
      for (const [name, metric] of Object.entries(latest)) {
        const value = typeof metric.value === 'number' ? metric.value.toFixed(1) : metric.value
        console.log(`  ${route} ${name}: ${value}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.routes[route] = { url, error: message }
      console.error(`  Failed: ${message}`)
    }

    await page.close()
  }

  await browser.close()

  fs.mkdirSync(outputDir, { recursive: true })
  const outfile = path.join(outputDir, `${args.label}-${Date.now()}.json`)
  fs.writeFileSync(outfile, `${JSON.stringify(results, null, 2)}\n`)
  console.log(`\nWrote ${outfile}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
