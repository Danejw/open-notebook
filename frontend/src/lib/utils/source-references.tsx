import React from 'react'
import { FileText, FileEdit } from 'lucide-react'

export type ReferenceType = 'source' | 'note'

interface ParsedReference {
  type: ReferenceType
  id: string
  originalText: string
  startIndex: number
  endIndex: number
}

interface ReferenceData {
  number: number
  type: ReferenceType
  id: string
}

function isReferenceType(value: string): value is ReferenceType {
  return value === 'source' || value === 'note'
}

/**
 * Parse source references from text
 *
 * Handles various formats:
 * - [source:abc123] → single reference
 * - [note:a], [note:b] → multiple references
 * - [note:a, note:b] → comma-separated references (edge case from LLM)
 * - Mixed: [source:x, note:y]
 *
 * @param text - Text containing references
 * @returns Array of parsed references
 */
function parseSourceReferences(text: string): ParsedReference[] {
  const pattern = /(note|source):([a-zA-Z0-9_]+)/g
  const matches: ParsedReference[] = []

  let match
  while ((match = pattern.exec(text)) !== null) {
    const rawType = match[1]
    if (!isReferenceType(rawType)) continue

    matches.push({
      type: rawType,
      id: match[2],
      originalText: match[0],
      startIndex: match.index,
      endIndex: pattern.lastIndex
    })
  }

  return matches
}

/**
 * Convert references in text to markdown links
 * Use this BEFORE passing text to MarkdownRenderer
 *
 * Handles complex patterns including:
 * - Plain references: source:abc → [source:abc](#ref-source-abc)
 * - Bracketed: [source:abc] → [[source:abc]](#ref-source-abc)
 * - Double brackets: [[source:abc]] → [[[source:abc]]](#ref-source-abc)
 * - With bold: [**source:abc**] → [**source:abc**](#ref-source-abc)
 * - After commas: [source:a, note:b] → each converted separately
 *
 * @param text - Original text with references
 * @returns Text with references converted to markdown links
 */
export function convertReferencesToMarkdownLinks(text: string): string {
  const refPattern = /(note|source):([a-zA-Z0-9_]+)/g
  const references: Array<{ type: ReferenceType; id: string; index: number; length: number }> = []

  let match
  while ((match = refPattern.exec(text)) !== null) {
    const rawType = match[1]
    const id = match[2]

    if (!isReferenceType(rawType) || !id || id.length === 0 || id.length > 100) {
      continue
    }

    references.push({
      type: rawType,
      id,
      index: match.index,
      length: match[0].length
    })
  }

  if (references.length === 0) return text

  let result = text
  for (let i = references.length - 1; i >= 0; i--) {
    const ref = references[i]
    const refStart = ref.index
    const refEnd = refStart + ref.length
    const refText = `${ref.type}:${ref.id}`

    const contextBefore = result.substring(Math.max(0, refStart - 50), refStart)
    const contextAfter = result.substring(refEnd, Math.min(result.length, refEnd + 50))

    let displayText = refText
    let replaceStart = refStart
    let replaceEnd = refEnd

    if (contextBefore.endsWith('[[') && contextAfter.startsWith(']]')) {
      displayText = `[[${refText}]]`
      replaceStart = refStart - 2
      replaceEnd = refEnd + 2
    } else if (contextBefore.endsWith('[') && contextAfter.startsWith(']')) {
      displayText = `[${refText}]`
      replaceStart = refStart - 1
      replaceEnd = refEnd + 1
    } else if (contextBefore.endsWith('[**') && contextAfter.startsWith('**]')) {
      displayText = `[**${refText}**]`
      replaceStart = refStart - 3
      replaceEnd = refEnd + 3
    } else if (contextBefore.endsWith('**') && contextAfter.startsWith('**')) {
      displayText = `**${refText}**`
      replaceStart = refStart - 2
      replaceEnd = refEnd + 2
    } else {
      displayText = refText
    }

    const href = `#ref-${ref.type}-${ref.id}`
    const markdownLink = `[${displayText}](${href})`

    result = result.substring(0, replaceStart) + markdownLink + result.substring(replaceEnd)
  }

  return result
}

/**
 * Create a custom link component for MarkdownRenderer that handles reference links
 *
 * @param onReferenceClick - Callback for when a reference link is clicked
 * @returns React component for rendering links
 */
export function createReferenceLinkComponent(
  onReferenceClick: (type: ReferenceType, id: string) => void
) {
  const ReferenceLinkComponent = ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href?: string
    children?: React.ReactNode
  }) => {
    if (href?.startsWith('#ref-')) {
      const rest = href.substring(5)
      const dash = rest.indexOf('-')
      const type = rest.slice(0, dash)
      const id = rest.slice(dash + 1)

      if (!isReferenceType(type)) {
        return <span>{children}</span>
      }

      const IconComponent = type === 'source' ? FileText : FileEdit

      return (
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onReferenceClick(type, id)
          }}
          className="text-primary hover:underline cursor-pointer inline font-medium"
          type="button"
        >
          <IconComponent className="h-3 w-3 inline mr-1" aria-hidden="true" />
          {children}
        </button>
      )
    }

    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props} className="text-primary hover:underline">
        {children}
      </a>
    )
  }

  ReferenceLinkComponent.displayName = 'ReferenceLinkComponent'
  return ReferenceLinkComponent
}

/**
 * Convert references in text to compact numbered format with reference list
 */
export function convertReferencesToCompactMarkdown(
  text: string,
  referencesLabel: string = 'References',
  typeLabels?: Partial<Record<ReferenceType, string>>
): string {
  const labels: Record<ReferenceType, string> = {
    source: typeLabels?.source ?? 'Source',
    note: typeLabels?.note ?? 'Note',
  }

  const references = parseSourceReferences(text)

  if (references.length === 0) {
    return text
  }

  const referenceMap = new Map<string, ReferenceData>()
  let nextNumber = 1

  for (const reference of references) {
    const key = `${reference.type}:${reference.id}`
    if (!referenceMap.has(key)) {
      referenceMap.set(key, {
        number: nextNumber++,
        type: reference.type,
        id: reference.id
      })
    }
  }

  let result = text
  for (let i = references.length - 1; i >= 0; i--) {
    const reference = references[i]
    const key = `${reference.type}:${reference.id}`
    const refData = referenceMap.get(key)!
    const number = refData.number

    const refStart = reference.startIndex
    const refEnd = reference.endIndex
    const contextBefore = result.substring(Math.max(0, refStart - 2), refStart)
    const contextAfter = result.substring(refEnd, Math.min(result.length, refEnd + 2))

    let replaceStart = refStart
    let replaceEnd = refEnd

    if (contextBefore === '[[' && contextAfter.startsWith(']]')) {
      replaceStart = refStart - 2
      replaceEnd = refEnd + 2
    } else if (contextBefore.endsWith('[') && contextAfter.startsWith(']')) {
      replaceStart = refStart - 1
      replaceEnd = refEnd + 1
    }

    const citationLink = `[${number}](#ref-${reference.type}-${reference.id})`

    result = result.substring(0, replaceStart) + citationLink + result.substring(replaceEnd)
  }

  const refListLines: string[] = [`\n\n${referencesLabel}:`]

  for (const [, refData] of referenceMap) {
    const label = labels[refData.type]
    const refListItem = `[${refData.number} · ${label}](#ref-${refData.type}-${refData.id})`
    refListLines.push(refListItem)
  }

  result = result + refListLines.join('\n')

  return result
}

/**
 * Create a custom link component for MarkdownRenderer that handles compact reference links
 */
export function createCompactReferenceLinkComponent(
  onReferenceClick: (type: ReferenceType, id: string) => void
) {
  const CompactReferenceLinkComponent = ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href?: string
    children?: React.ReactNode
  }) => {
    if (href?.startsWith('#ref-')) {
      const rest = href.substring(5)
      const dash = rest.indexOf('-')
      const type = rest.slice(0, dash)
      const id = rest.slice(dash + 1)

      if (!isReferenceType(type)) {
        return <span>{children}</span>
      }

      const IconComponent = type === 'source' ? FileText : FileEdit

      const labelText =
        typeof children === 'string'
          ? children
          : Array.isArray(children)
            ? children.map(String).join('')
            : ''
      const isNumberOnly = /^\d+$/.test(labelText.trim())

      return (
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onReferenceClick(type, id)
          }}
          className="text-primary hover:underline cursor-pointer inline-flex items-center gap-1 align-baseline text-[0.8125rem] font-medium"
          type="button"
          title={type}
        >
          {!isNumberOnly ? (
            <IconComponent className="h-3 w-3 shrink-0 opacity-80" aria-hidden="true" />
          ) : null}
          {children}
        </button>
      )
    }

    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props} className="text-primary hover:underline">
        {children}
      </a>
    )
  }

  CompactReferenceLinkComponent.displayName = 'CompactReferenceLinkComponent'
  return CompactReferenceLinkComponent
}
