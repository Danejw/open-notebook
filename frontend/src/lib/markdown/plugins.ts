import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import type { PluggableList } from 'unified'

/** Shared remark plugins: GFM (tables, strikethrough, task lists) + math */
export const markdownRemarkPlugins: PluggableList = [remarkGfm, remarkMath]

/** Shared rehype plugins: syntax highlighting + KaTeX */
export const markdownRehypePlugins: PluggableList = [
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
  rehypeKatex,
]
