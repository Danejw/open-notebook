'use client'

import { memo } from 'react'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import type { MarkdownSize } from '@/lib/markdown/components'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  convertReferencesToCompactMarkdown,
  createCompactReferenceLinkComponent,
  type ReferenceType,
} from '@/lib/utils/source-references'

export type CitedMarkdownReferenceClick = (
  type: ReferenceType,
  id: string
) => void

export interface CitedMarkdownContentProps {
  content: string
  onReferenceClick: CitedMarkdownReferenceClick
  size?: MarkdownSize
  /** When true, render plain text (chat streaming). Citations become links after stream ends. */
  isStreaming?: boolean
}

/**
 * Renders markdown with `source:` / `note:` tokens as compact clickable citations.
 * Shared by chat AI messages and the project artifact viewer.
 */
export const CitedMarkdownContent = memo(function CitedMarkdownContent({
  content,
  onReferenceClick,
  size = 'base',
  isStreaming = false,
}: CitedMarkdownContentProps) {
  const { t } = useTranslation()

  if (isStreaming) {
    return (
      <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
    )
  }

  const markdownWithCompactRefs = convertReferencesToCompactMarkdown(
    content,
    t('common.references'),
    {
      source: t('common.source'),
      note: t('common.note'),
    }
  )
  const LinkComponent = createCompactReferenceLinkComponent(onReferenceClick)

  return (
    <MarkdownRenderer size={size} components={{ a: LinkComponent }}>
      {markdownWithCompactRefs}
    </MarkdownRenderer>
  )
})
