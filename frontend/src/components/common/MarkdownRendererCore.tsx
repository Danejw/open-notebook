'use client'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { cva, type VariantProps } from 'class-variance-authority'
import 'katex/dist/katex.min.css'
import '@/lib/markdown/markdown-hljs.css'
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
 * Loaded dynamically via MarkdownRenderer.tsx to keep KaTeX/hljs out of the initial bundle.
 */
export function MarkdownRendererCore({
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
