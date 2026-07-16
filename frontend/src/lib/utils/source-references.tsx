import React from 'react'
import { FileText, FileEdit } from 'lucide-react'

export type ReferenceType = 'source' | 'note'

export interface ParsedReference {
  type: ReferenceType
  id: string
  originalText: string
  startIndex: number
  endIndex: number
}

// ExtractedReference and ExtractedReferences are kept for backward compatibility
// but not currently used in the codebase
export interface ExtractedReference {
  type: ReferenceType
  id: string
  originalText: string
  placeholder: string
}

export interface ExtractedReferences {
  processedText: string
  references: ExtractedReference[]
}

export interface ReferenceData {
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
 * Legacy insight references are ignored (left as plain text).
 *
 * @param text - Text containing references
 * @returns Array of parsed references
 */
export function parseSourceReferences(text: string): ParsedReference[] {
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
 * Convert source references in text to clickable React elements
 *
 * @param text - Text containing references
 * @param onReferenceClick - Callback when reference is clicked (type, id)
 * @returns React nodes with clickable reference buttons
 */
export function convertSourceReferences(
  text: string,
  onReferenceClick: (type: ReferenceType, id: string) => void
): React.ReactNode {
  const matches = parseSourceReferences(text)

  if (matches.length === 0) return text

  const parts: React.ReactNode[] = []
  let lastIndex = 0

  matches.forEach((match, idx) => {
    // Check if there are brackets before the match
    const beforeMatch = text.substring(Math.max(0, match.startIndex - 2), match.startIndex)
    const hasDoubleBracketBefore = beforeMatch === '[['
    const hasSingleBracketBefore = beforeMatch.endsWith('[') && !hasDoubleBracketBefore

    // Determine where to start including text
    let textStartIndex = lastIndex
    if (hasDoubleBracketBefore && lastIndex === match.startIndex - 2) {
      textStartIndex = match.startIndex - 2
    } else if (hasSingleBracketBefore && lastIndex === match.startIndex - 1) {
      textStartIndex = match.startIndex - 1
    }

    // Add text before match (excluding brackets we'll include in the button)
    if (textStartIndex < match.startIndex && lastIndex < textStartIndex) {
      parts.push(text.substring(lastIndex, textStartIndex))
    } else if (lastIndex < match.startIndex && !hasSingleBracketBefore && !hasDoubleBracketBefore) {
      parts.push(text.substring(lastIndex, match.startIndex))
    }

    // Check if there are brackets after the match
    const afterMatch = text.substring(match.endIndex, Math.min(text.length, match.endIndex + 2))
    const hasDoubleBracketAfter = afterMatch === ']]'
    const hasSingleBracketAfter = afterMatch.startsWith(']') && !hasDoubleBracketAfter

    // Determine the display text with appropriate brackets
    let displayText = match.originalText
    if (hasDoubleBracketBefore && hasDoubleBracketAfter) {
      displayText = `[[${match.originalText}]]`
    } else if (hasSingleBracketBefore && hasSingleBracketAfter) {
      displayText = `[${match.originalText}]`
    } else {
      displayText = match.originalText
    }

    // Add clickable reference button
    parts.push(
      <button
        key={`ref-${idx}-${match.type}-${match.id}`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onReferenceClick(match.type, match.id)
        }}
        className="text-primary hover:underline cursor-pointer inline font-medium"
        type="button"
      >
        {displayText}
      </button>
    )

    // Update lastIndex to skip the closing brackets
    if (hasDoubleBracketAfter) {
      lastIndex = match.endIndex + 2
    } else if (hasSingleBracketAfter) {
      lastIndex = match.endIndex + 1
    } else {
      lastIndex = match.endIndex
    }
  })

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return <>{parts}</>
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
 * Legacy insight references are left unchanged.
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

/**
 * Legacy function for backward compatibility
 * Converts old Link-based references to new click handler approach
 *
 * @deprecated Use extractReferences + replacePlaceholdersWithButtons instead
 */
export function convertSourceReferencesLegacy(text: string): React.ReactNode {
  return text
}
