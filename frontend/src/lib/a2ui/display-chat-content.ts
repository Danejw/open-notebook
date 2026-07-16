import { parseInlineA2uiFromText } from '@/lib/a2ui/parse-inline-a2ui'

const A2UI_TAG_RE = /^\[A2UI:([^\]]+)\]\s*/i
const OPTION_ID_CLAUSE_RE = /\s*Option id:\s*[^\s.]+\.?\s*/gi
const META_PREFIX_RE =
  /^(User answered a clarifying question\.|Context confirmed\.|Please refine the retrieved context\.)\s*/i

/** Protocol ops the model sometimes pastes as fake function calls. */
const A2UI_PROTOCOL_OPS = [
  'createSurface',
  'updateComponents',
  'updateDataModel',
  'deleteSurface',
] as const

/**
 * Client-facing chat text. Keeps wire payloads intact for the agent;
 * strips A2UI tags, protocol call leaks, and embedded catalog/protocol JSON.
 */
export function formatChatContentForDisplay(
  content: string,
  options?: { role?: 'human' | 'ai'; messageId?: string }
): string {
  let text = content ?? ''
  if (!text) {
    return ''
  }

  if (options?.role === 'ai' || looksLikeInlineA2ui(text)) {
    const parsed = parseInlineA2uiFromText(text, {
      messageId: options?.messageId,
    })
    text = parsed.displayText
    // Mid-stream: hide an unfinished component/protocol JSON blob.
    text = stripOpenA2uiJson(text)
  }

  text = stripA2uiProtocolCallLeaks(text)

  if (A2UI_TAG_RE.test(text)) {
    // Wire tags → short client-facing copy (single-line is fine).
    return formatA2uiTaggedMessageForDisplay(text).replace(/\s+/g, ' ').trim()
  }

  // Preserve newlines so Markdown (lists, headings, code) still renders.
  return text.trim()
}

/**
 * Remove leaked protocol “calls” such as `a2ui.createSurface()` or
 * bare `updateComponents(...)` so they never reach the client bubble.
 */
export function stripA2uiProtocolCallLeaks(content: string): string {
  let text = content ?? ''
  if (!text) {
    return ''
  }

  const opGroup = A2UI_PROTOCOL_OPS.join('|')
  // `a2ui.createSurface(...)` / `A2UI.updateDataModel()` / optional backticks
  const namespaced = new RegExp(
    `\`?(?:a2ui|A2UI)\\.(?:${opGroup})\\s*\\([^)]*\\)\`?`,
    'g'
  )

  text = text.replace(namespaced, ' ')

  // Bare `createSurface()` / `createSurface({...})` including nested parens
  const bareCall = new RegExp(`\`?(?:${opGroup})\\s*\\(`, 'g')
  const ranges: Array<{ start: number; end: number }> = []
  let match: RegExpExecArray | null
  bareCall.lastIndex = 0
  while ((match = bareCall.exec(text)) !== null) {
    const openParen = match.index + match[0].length - 1
    const close = findMatchingParen(text, openParen)
    if (close < 0) {
      ranges.push({ start: match.index, end: text.length })
      break
    }
    let end = close + 1
    if (text[end] === '`') {
      end += 1
    }
    ranges.push({ start: match.index, end })
  }

  if (ranges.length > 0) {
    text = stripRanges(text, ranges)
  }

  // Lone op names left as code ticks: `createSurface`
  text = text.replace(new RegExp(`\`(?:${opGroup})\``, 'g'), ' ')

  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Turn a stored/wire `[A2UI:…]` human message into short user-facing copy.
 * Works for current and future action names — tag + technical clauses are removed.
 */
export function formatA2uiTaggedMessageForDisplay(content: string): string {
  let text = (content ?? '').trim()
  if (!text) {
    return ''
  }

  const tagMatch = text.match(A2UI_TAG_RE)
  if (!tagMatch) {
    return text
  }

  const eventName = tagMatch[1]?.trim() || 'action'
  text = text.replace(A2UI_TAG_RE, '').trim()

  // Prefer the user's answer when present.
  const answerMatch = text.match(/\bAnswer:\s*(.+?)(?=\s+Option id:|\s*$)/i)
  if (answerMatch?.[1]?.trim()) {
    return answerMatch[1].trim()
  }

  const noteMatch = text.match(/\b(?:Note|Guidance):\s*(.+)$/i)
  if (noteMatch?.[1]?.trim()) {
    return noteMatch[1].trim()
  }

  if (/^Context confirmed/i.test(text)) {
    return text.replace(META_PREFIX_RE, '').trim() || 'Confirmed'
  }

  text = text
    .replace(OPTION_ID_CLAUSE_RE, ' ')
    .replace(META_PREFIX_RE, '')
    .replace(/\bQuestion:\s*/gi, '')
    .replace(/\bContinue with this clarification in mind\.?/gi, '')
    .replace(/\bPlease continue with the answer using this context\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Generic fallback for unknown `[A2UI:event] {json}` wire forms
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>
        for (const key of ['answer', 'label', 'optionLabel', 'customText', 'text']) {
          const value = record[key]
          if (typeof value === 'string' && value.trim()) {
            return value.trim()
          }
        }
      }
    } catch {
      // keep stripped text
    }
    return eventName.replace(/_/g, ' ')
  }

  return text || eventName.replace(/_/g, ' ')
}

function looksLikeInlineA2ui(text: string): boolean {
  return (
    /"component"\s*:/.test(text) ||
    /"createSurface"\s*:/.test(text) ||
    /```(?:json|a2ui|jsonl)?/i.test(text) ||
    /(?:a2ui|A2UI)\.(?:createSurface|updateComponents|updateDataModel|deleteSurface)/.test(
      text
    )
  )
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0
  let inString: '"' | "'" | '`' | null = null
  let escape = false
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === inString) {
        inString = null
      }
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch
      continue
    }
    if (ch === '(') {
      depth += 1
    } else if (ch === ')') {
      depth -= 1
      if (depth === 0) {
        return i
      }
    }
  }
  return -1
}

function stripRanges(
  text: string,
  ranges: Array<{ start: number; end: number }>
): string {
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  let out = ''
  let cursor = 0
  for (const range of sorted) {
    if (range.start < cursor) {
      continue
    }
    out += text.slice(cursor, range.start)
    cursor = range.end
  }
  out += text.slice(cursor)
  return out
}

/**
 * While the model is still streaming, drop an incomplete leading/trailing
 * JSON object that looks like catalog UI so users never see raw braces.
 */
function stripOpenA2uiJson(text: string): string {
  if (!/"component"\s*:/.test(text) && !/"createSurface"\s*:/.test(text)) {
    return text
  }

  const start = Math.min(
    ...['{', '```'].map((marker) => {
      const idx = text.indexOf(marker)
      return idx >= 0 ? idx : Number.POSITIVE_INFINITY
    })
  )
  if (!Number.isFinite(start)) {
    return text
  }

  const before = text.slice(0, start).trim()
  const afterCandidate = text.slice(start)
  const closed = findBalancedEnd(afterCandidate)
  if (closed >= 0) {
    const after = afterCandidate.slice(closed).replace(/^```\w*\s*/i, '').trim()
    return [before, after].filter(Boolean).join('\n\n').trim()
  }
  return before
}

function findBalancedEnd(text: string): number {
  let body = text
  let offset = 0
  if (body.startsWith('```')) {
    const nl = body.indexOf('\n')
    if (nl < 0) {
      return -1
    }
    offset = nl + 1
    body = body.slice(nl + 1)
  }
  const open = body[0]
  if (open !== '{' && open !== '[') {
    return -1
  }
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escape = false
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === open) {
      depth += 1
    } else if (ch === close) {
      depth -= 1
      if (depth === 0) {
        let end = offset + i + 1
        if (text.slice(end).startsWith('```')) {
          end += 3
        }
        return end
      }
    }
  }
  return -1
}
