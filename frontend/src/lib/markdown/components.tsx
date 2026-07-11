import type { Components } from 'react-markdown'
import { cn } from '@/lib/utils'

export type MarkdownSize = 'sm' | 'base' | 'lg'

const sizeStyles: Record<
  MarkdownSize,
  {
    h1: string
    h2: string
    h3: string
    h4: string
    h5: string
    h6: string
    p: string
    ul: string
    ol: string
    li: string
    tableWrap: string
    th: string
    td: string
    blockquote: string
  }
> = {
  sm: {
    h1: 'mb-2 mt-3 text-lg first:mt-0',
    h2: 'mb-2 mt-3 text-base first:mt-0',
    h3: 'mb-1.5 mt-2.5 text-sm first:mt-0',
    h4: 'mb-1.5 mt-2 text-sm first:mt-0',
    h5: 'mb-1 mt-2 text-sm first:mt-0',
    h6: 'mb-1 mt-2 text-xs first:mt-0',
    p: 'mb-2 last:mb-0',
    ul: 'mb-2 list-disc space-y-0.5 pl-5 last:mb-0',
    ol: 'mb-2 list-decimal space-y-0.5 pl-5 last:mb-0',
    li: 'mb-0.5',
    tableWrap: 'my-2',
    th: 'px-2 py-1',
    td: 'px-2 py-1',
    blockquote: 'my-2 py-0.5 pl-3',
  },
  base: {
    h1: 'mb-3 mt-5 text-2xl first:mt-0',
    h2: 'mb-2 mt-4 text-xl first:mt-0',
    h3: 'mb-2 mt-3 text-lg first:mt-0',
    h4: 'mb-2 mt-3 text-base first:mt-0',
    h5: 'mb-1.5 mt-2 text-sm first:mt-0',
    h6: 'mb-1.5 mt-2 text-sm first:mt-0',
    p: 'mb-3 last:mb-0',
    ul: 'mb-3 list-disc space-y-1 pl-6 last:mb-0',
    ol: 'mb-3 list-decimal space-y-1 pl-6 last:mb-0',
    li: 'mb-0.5',
    tableWrap: 'my-3',
    th: 'px-3 py-2',
    td: 'px-3 py-2',
    blockquote: 'my-3 py-1 pl-4',
  },
  lg: {
    h1: 'mb-4 mt-6 text-3xl first:mt-0',
    h2: 'mb-3 mt-5 text-2xl first:mt-0',
    h3: 'mb-2 mt-4 text-xl first:mt-0',
    h4: 'mb-2 mt-4 text-lg first:mt-0',
    h5: 'mb-2 mt-3 text-base first:mt-0',
    h6: 'mb-2 mt-3 text-sm first:mt-0',
    p: 'mb-4 last:mb-0',
    ul: 'mb-4 list-disc space-y-1 pl-6 last:mb-0',
    ol: 'mb-4 list-decimal space-y-1 pl-6 last:mb-0',
    li: 'mb-1',
    tableWrap: 'my-4',
    th: 'px-3 py-2',
    td: 'px-3 py-2',
    blockquote: 'my-4 py-1 pl-4',
  },
}

export function createMarkdownComponents(
  size: MarkdownSize = 'base',
  overrides?: Components
): Components {
  const styles = sizeStyles[size]

  const base: Components = {
    h1: ({ children }) => (
      <h1 className={cn('markdown-h1 font-bold tracking-tight', styles.h1)}>{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className={cn('markdown-h2 font-semibold tracking-tight', styles.h2)}>{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className={cn('markdown-h3 font-semibold', styles.h3)}>{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className={cn('markdown-h4 font-semibold', styles.h4)}>{children}</h4>
    ),
    h5: ({ children }) => (
      <h5 className={cn('markdown-h5 font-medium', styles.h5)}>{children}</h5>
    ),
    h6: ({ children }) => (
      <h6 className={cn('markdown-h6 font-medium', styles.h6)}>{children}</h6>
    ),
    p: ({ children }) => <p className={cn('markdown-text leading-relaxed', styles.p)}>{children}</p>,
    ul: ({ children }) => <ul className={styles.ul}>{children}</ul>,
    ol: ({ children }) => <ol className={styles.ol}>{children}</ol>,
    li: ({ children }) => <li className={cn('markdown-text', styles.li)}>{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className={cn('markdown-blockquote border-l-4 italic', styles.blockquote)}>
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-4 border-border" />,
    strong: ({ children }) => <strong className="markdown-text-emphasis font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => (
      <del className="markdown-text opacity-75 line-through">{children}</del>
    ),
    a: ({ href, children, ...props }) => (
      <a
        href={href}
        className="font-medium text-primary underline underline-offset-2 hover:text-primary/80 break-all"
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        {...props}
      >
        {children}
      </a>
    ),
    img: ({ alt, ...props }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={alt ?? ''}
        className="my-3 max-w-full rounded-md border border-border"
        loading="lazy"
        {...props}
      />
    ),
    input: ({ checked, ...props }) => (
      <input
        type="checkbox"
        checked={checked ?? false}
        readOnly
        disabled
        className="mr-2 accent-primary"
        {...props}
      />
    ),
    table: ({ children }) => (
      <div className={cn('overflow-x-auto rounded-md border border-border', styles.tableWrap)}>
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-muted/80">{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
    th: ({ children }) => (
      <th className={cn('markdown-table-heading border-b border-border text-left text-xs font-semibold uppercase tracking-wide', styles.th)}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className={cn('markdown-text align-top', styles.td)}>{children}</td>
    ),
    pre: ({ node, children, ...props }) => {
      let language: string | null = null
      const firstChild = node?.children?.[0]
      if (firstChild?.type === 'element' && firstChild.tagName === 'code') {
        const classNames = firstChild.properties?.className
        if (Array.isArray(classNames)) {
          const langClass = classNames.find(
            (value) => typeof value === 'string' && value.startsWith('language-')
          )
          if (typeof langClass === 'string') {
            language = langClass.replace('language-', '')
          }
        }
      }

      return (
        <div className="markdown-code-block group relative my-3">
          {language ? (
            <span className="absolute right-2 top-2 z-10 rounded border border-border/60 bg-background/90 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {language}
            </span>
          ) : null}
          <pre
            className="hljs overflow-x-auto rounded-md border border-border bg-muted/50 p-3 pt-7 text-[0.8125rem] leading-relaxed"
            {...props}
          >
            {children}
          </pre>
        </div>
      )
    },
    code: ({ className, children, ...props }) => {
      const isBlock = className?.includes('language-') || className?.includes('hljs')

      if (!isBlock) {
        return (
          <code
            className="markdown-code-inline rounded px-1.5 py-0.5 font-mono text-[0.85em]"
            {...props}
          >
            {children}
          </code>
        )
      }

      return (
        <code className={cn('block font-mono', className)} {...props}>
          {children}
        </code>
      )
    },
  }

  return { ...base, ...overrides }
}
