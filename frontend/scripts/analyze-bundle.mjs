#!/usr/bin/env node
/** Run production build with @next/bundle-analyzer (opens HTML report in browser). */
import { execSync } from 'node:child_process'

process.env.ANALYZE = 'true'
execSync('npm run build', { stdio: 'inherit', env: process.env })
