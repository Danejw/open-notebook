'use client'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { markdownRemarkPlugins, markdownRehypePlugins } from '@/lib/markdown/plugins'
import { createMarkdownComponents, type MarkdownSize } from '@/lib/markdown/components'

const markdownVariants = cva('markdown-body max-w-none break-words', {
  variants: {
    size: {
      sm: '',
      base: '',
      lg: '',
    },
  },
  defaultVariants: {
    size: 'base',
  },
})

export interface MarkdownRendererProps extends VariantProps<typeof markdownVariants> {
  children: string
  className?: string
  components?: Components
  size?: MarkdownSize
}

/**
 * Full-featured Markdown renderer with GFM, math (KaTeX), and syntax highlighting.
 * Use `components` to override elements (e.g. custom link handlers for citations).
 */
export function MarkdownRenderer({
  children,
  className,
  components: componentOverrides,
  size = 'base',
}: MarkdownRendererProps) {
  const mergedComponents = useMemo(
    () => createMarkdownComponents(size, componentOverrides),
    [size, componentOverrides]
  )

  return (
    <div className={cn(markdownVariants({ size }), className)}>
      <ReactMarkdown
        remarkPlugins={markdownRemarkPlugins}
        rehypePlugins={markdownRehypePlugins}
        components={mergedComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
