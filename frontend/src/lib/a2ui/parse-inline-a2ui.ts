import { ALLOWED_COMPONENT_NAMES } from '@/lib/a2ui/policy'
import { A2UI_PROTOCOL_VERSION, COS_CATALOG_ID } from '@/lib/a2ui/constants'
import type { A2uiServerMessage } from '@/lib/a2ui/types'

export type InlineA2uiParseResult = {
  /** Protocol messages ready for MessageProcessor / policy. */
  messages: A2uiServerMessage[] | null
  /** Assistant text with extracted UI JSON removed (markdown fallback). */
  displayText: string
}

type JsonSpan = {
  raw: string
  value: unknown
  start: number
  end: number
}

type ComponentNode = {
  component: string
  id?: string
  props?: Record<string, unknown>
  children?: unknown
  child?: unknown
  [key: string]: unknown
}

const STRUCTURAL_KEYS = new Set([
  'component',
  'id',
  'props',
  'children',
  'child',
  'version',
  'createSurface',
  'updateComponents',
  'updateDataModel',
  'deleteSurface',
])

/**
 * Extract and normalize A2UI from mixed assistant text.
 *
 * Accepts (any combination):
 * - Full v0.9 protocol messages / arrays / `{ messages: [...] }`
 * - Catalog component shorthand: `{ "component": "AskUser", "id": "root", "props": {...} }`
 * - Nested component trees via `children` / `child`
 * - Fenced ```json / ```a2ui blocks or bare JSON objects in prose
 *
 * New Cos/Basic components work automatically once listed in
 * `ALLOWED_COMPONENT_NAMES` — no per-component parse branches.
 */
export function parseInlineA2uiFromText(
  content: string,
  options?: { messageId?: string; surfaceIdPrefix?: string }
): InlineA2uiParseResult {
  const text = content ?? ''
  if (!text.trim()) {
    return { messages: null, displayText: text }
  }

  const spans = extractJsonSpans(text)
  if (spans.length === 0) {
    return { messages: null, displayText: text }
  }

  const allMessages: A2uiServerMessage[] = []
  const removeRanges: Array<{ start: number; end: number }> = []
  let surfaceIndex = 0

  for (const span of spans) {
    const normalized = normalizeExtractedValue(span.value, {
      messageId: options?.messageId,
      surfaceIndex,
      surfaceIdPrefix: options?.surfaceIdPrefix,
      fingerprint: fingerprint(span.raw),
    })
    if (!normalized || normalized.length === 0) {
      continue
    }
    allMessages.push(...normalized)
    removeRanges.push({ start: span.start, end: span.end })
    surfaceIndex += 1
  }

  if (allMessages.length === 0) {
    return { messages: null, displayText: text }
  }

  return {
    messages: allMessages,
    displayText: stripRanges(text, removeRanges).trim(),
  }
}

function normalizeExtractedValue(
  value: unknown,
  ctx: {
    messageId?: string
    surfaceIndex: number
    surfaceIdPrefix?: string
    fingerprint: string
  }
): A2uiServerMessage[] | null {
  if (value == null) {
    return null
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null
    }
    if (value.every(isProtocolMessage)) {
      return value as A2uiServerMessage[]
    }
    if (value.every(isComponentNode)) {
      return buildSurfaceFromComponents(value as ComponentNode[], ctx)
    }
    // Mixed array: take protocol messages and component nodes separately.
    const protocol = value.filter(isProtocolMessage) as A2uiServerMessage[]
    const components = value.filter(isComponentNode) as ComponentNode[]
    const out: A2uiServerMessage[] = [...protocol]
    if (components.length > 0) {
      out.push(...buildSurfaceFromComponents(components, ctx))
    }
    return out.length > 0 ? out : null
  }

  if (typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>

  if (Array.isArray(record.messages)) {
    return normalizeExtractedValue(record.messages, ctx)
  }

  if (isProtocolMessage(record)) {
    return [record as A2uiServerMessage]
  }

  if (isComponentNode(record)) {
    return buildSurfaceFromComponents([record], ctx)
  }

  // `{ surface: { component: ... } }` or `{ ui: [...] }` soft wrappers
  for (const key of ['surface', 'ui', 'a2ui', 'root']) {
    if (key in record) {
      const nested = normalizeExtractedValue(record[key], ctx)
      if (nested) {
        return nested
      }
    }
  }

  return null
}

function buildSurfaceFromComponents(
  roots: ComponentNode[],
  ctx: {
    messageId?: string
    surfaceIndex: number
    surfaceIdPrefix?: string
    fingerprint: string
  }
): A2uiServerMessage[] {
  const surfaceId =
    ctx.surfaceIdPrefix ||
    [
      'inline',
      ctx.messageId ? sanitizeId(ctx.messageId) : 'msg',
      String(ctx.surfaceIndex),
      ctx.fingerprint.slice(0, 10),
    ].join('-')

  const components: Array<Record<string, unknown> & { id: string; component: string }> =
    []
  const dataModel: Record<string, unknown> = {}
  let autoId = 0

  const walk = (node: ComponentNode, fallbackId: string): string => {
    const name = node.component
    if (!ALLOWED_COMPONENT_NAMES.has(name)) {
      throw new Error(`Unregistered component: ${name}`)
    }

    const id =
      typeof node.id === 'string' && node.id.trim()
        ? node.id.trim()
        : fallbackId

    const flatProps: Record<string, unknown> = {
      ...(isPlainObject(node.props) ? node.props : {}),
    }
    for (const [key, val] of Object.entries(node)) {
      if (STRUCTURAL_KEYS.has(key)) {
        continue
      }
      if (!(key in flatProps)) {
        flatProps[key] = val
      }
    }

    const childSource = node.children ?? node.child
    const childIds: string[] = []
    if (Array.isArray(childSource)) {
      childSource.forEach((child, index) => {
        if (typeof child === 'string' && child.trim()) {
          childIds.push(child.trim())
          return
        }
        if (isComponentNode(child)) {
          autoId += 1
          childIds.push(walk(child, `${id}-c${autoId}`))
        }
      })
    } else if (typeof childSource === 'string' && childSource.trim()) {
      childIds.push(childSource.trim())
    } else if (isComponentNode(childSource)) {
      autoId += 1
      childIds.push(walk(childSource, `${id}-c${autoId}`))
    }

    const boundProps: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(flatProps)) {
      if (val === undefined) {
        continue
      }
      if (isPathBinding(val)) {
        boundProps[key] = val
        continue
      }
      // Promote literals into the data model so inputs stay two-way bindable
      // for any catalog component (AskUser, TextField, future Cos types, …).
      const path = `/${id}/${key}`
      setDataModelValue(dataModel, path, val)
      boundProps[key] = { path }
    }

    const record: Record<string, unknown> & { id: string; component: string } = {
      id,
      component: name,
      ...boundProps,
    }
    if (childIds.length === 1) {
      record.child = childIds[0]
      record.children = childIds
    } else if (childIds.length > 1) {
      record.children = childIds
    }
    components.push(record)
    return id
  }

  try {
    if (roots.length === 1) {
      walk(roots[0], 'root')
    } else {
      const childIds = roots.map((root, index) => {
        autoId += 1
        return walk(root, `item-${index + 1}`)
      })
      components.unshift({
        id: 'root',
        component: 'Column',
        children: childIds,
      })
    }
  } catch {
    return []
  }

  // Ensure a mountable root id exists (A2uiSurface looks up "root").
  if (!components.some((c) => c.id === 'root')) {
    const first = components[0]
    if (first) {
      first.id = 'root'
    }
  }

  const messages: A2uiServerMessage[] = [
    {
      version: A2UI_PROTOCOL_VERSION,
      createSurface: {
        surfaceId,
        catalogId: COS_CATALOG_ID,
        sendDataModel: true,
      },
    },
    {
      version: A2UI_PROTOCOL_VERSION,
      updateComponents: {
        surfaceId,
        components,
      },
    },
  ]

  if (Object.keys(dataModel).length > 0) {
    messages.push({
      version: A2UI_PROTOCOL_VERSION,
      updateDataModel: {
        surfaceId,
        path: '/',
        value: dataModel,
      },
    })
  }

  return messages
}

function isProtocolMessage(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.version !== A2UI_PROTOCOL_VERSION) {
    return false
  }
  return Boolean(
    record.createSurface ||
      record.updateComponents ||
      record.updateDataModel ||
      record.deleteSurface
  )
}

function isComponentNode(value: unknown): value is ComponentNode {
  if (!value || typeof value !== 'object') {
    return false
  }
  const name = (value as { component?: unknown }).component
  return typeof name === 'string' && ALLOWED_COMPONENT_NAMES.has(name)
}

function isPathBinding(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    'path' in (value as object) &&
    typeof (value as { path: unknown }).path === 'string'
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function setDataModelValue(
  root: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.replace(/^\//, '').split('/').filter(Boolean)
  if (parts.length === 0) {
    return
  }
  let cursor: Record<string, unknown> = root
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]
    const next = cursor[part]
    if (!isPlainObject(next)) {
      cursor[part] = {}
    }
    cursor = cursor[part] as Record<string, unknown>
  }
  cursor[parts[parts.length - 1]] = value
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'msg'
}

function fingerprint(raw: string): string {
  let hash = 2166136261
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

/**
 * Pull JSON objects/arrays from fenced blocks and bare braces in order.
 */
export function extractJsonSpans(text: string): JsonSpan[] {
  const spans: JsonSpan[] = []
  const occupied: Array<{ start: number; end: number }> = []

  const fenceRe = /```(?:json|a2ui|jsonl)?\s*([\s\S]*?)```/gi
  let fenceMatch: RegExpExecArray | null
  while ((fenceMatch = fenceRe.exec(text)) !== null) {
    const body = fenceMatch[1]?.trim() ?? ''
    const bodyStart =
      (fenceMatch.index ?? 0) + fenceMatch[0].indexOf(fenceMatch[1] ?? '')
    const parsed = tryParseJsonDocument(body)
    if (!parsed) {
      continue
    }
    for (const item of parsed) {
      const absStart = bodyStart + item.localStart
      const absEnd = bodyStart + item.localEnd
      spans.push({
        raw: item.raw,
        value: item.value,
        start: fenceMatch.index,
        end: fenceMatch.index + fenceMatch[0].length,
      })
      occupied.push({ start: fenceMatch.index, end: fenceMatch.index + fenceMatch[0].length })
      void absStart
      void absEnd
    }
  }

  let i = 0
  while (i < text.length) {
    if (rangesContain(occupied, i)) {
      i += 1
      continue
    }
    const ch = text[i]
    if (ch !== '{' && ch !== '[') {
      i += 1
      continue
    }
    const closed = readBalancedJson(text, i)
    if (!closed) {
      i += 1
      continue
    }
    try {
      const value = JSON.parse(closed.raw) as unknown
      if (isLikelyA2uiJson(value)) {
        spans.push({
          raw: closed.raw,
          value,
          start: i,
          end: closed.end,
        })
        occupied.push({ start: i, end: closed.end })
        i = closed.end
        continue
      }
    } catch {
      // not JSON
    }
    i += 1
  }

  return spans.sort((a, b) => a.start - b.start)
}

function tryParseJsonDocument(
  body: string
): Array<{ raw: string; value: unknown; localStart: number; localEnd: number }> | null {
  const trimmed = body.trim()
  if (!trimmed) {
    return null
  }

  // JSONL: one protocol/component object per line
  if (trimmed.includes('\n') && trimmed.split('\n').every((line) => {
    const t = line.trim()
    return !t || t.startsWith('{') || t.startsWith('[')
  })) {
    const items: Array<{
      raw: string
      value: unknown
      localStart: number
      localEnd: number
    }> = []
    let offset = 0
    for (const line of body.split('\n')) {
      const lineTrim = line.trim()
      const lineStart = body.indexOf(line, offset)
      offset = lineStart + line.length
      if (!lineTrim) {
        continue
      }
      try {
        const value = JSON.parse(lineTrim) as unknown
        if (isLikelyA2uiJson(value)) {
          items.push({
            raw: lineTrim,
            value,
            localStart: lineStart,
            localEnd: lineStart + line.length,
          })
        }
      } catch {
        // ignore line
      }
    }
    if (items.length > 0) {
      return items
    }
  }

  try {
    const value = JSON.parse(trimmed) as unknown
    if (!isLikelyA2uiJson(value)) {
      return null
    }
    const localStart = body.indexOf(trimmed)
    return [
      {
        raw: trimmed,
        value,
        localStart: localStart >= 0 ? localStart : 0,
        localEnd: (localStart >= 0 ? localStart : 0) + trimmed.length,
      },
    ]
  } catch {
    return null
  }
}

function isLikelyA2uiJson(value: unknown): boolean {
  if (Array.isArray(value)) {
    return (
      value.length > 0 &&
      (value.some(isProtocolMessage) || value.some(isComponentNode))
    )
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (Array.isArray(record.messages)) {
    return true
  }
  if (isProtocolMessage(record) || isComponentNode(record)) {
    return true
  }
  return ['surface', 'ui', 'a2ui', 'root'].some((key) => {
    const nested = record[key]
    return isComponentNode(nested) || Array.isArray(nested)
  })
}

function readBalancedJson(
  text: string,
  start: number
): { raw: string; end: number } | null {
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
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
        return { raw: text.slice(start, i + 1), end: i + 1 }
      }
    } else if (open === '{' && (ch === '{' || ch === '}')) {
      // handled above
    } else if (open === '[') {
      if (ch === '[') {
        // depth already handled when ch === open
      }
      if (ch === '{') {
        // nested object — brace depth for arrays: track both
      }
    }
  }
  return null
}

function rangesContain(
  ranges: Array<{ start: number; end: number }>,
  index: number
): boolean {
  return ranges.some((range) => index >= range.start && index < range.end)
}

function stripRanges(
  text: string,
  ranges: Array<{ start: number; end: number }>
): string {
  if (ranges.length === 0) {
    return text
  }
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
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}
