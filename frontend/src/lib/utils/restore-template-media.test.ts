import { describe, expect, it } from 'vitest'
import { restoreTemplateMedia } from '@/lib/utils/restore-template-media'

describe('restoreTemplateMedia', () => {
  it('restores relative logo src from the template by img index', () => {
    const template =
      '<html><body><img src="/api/media/media_asset:m1/file" alt="Logo" data-media-slug="company-logo" /><span>Title</span></body></html>'
    const filled =
      '<html><body><img src="logo.png" alt="Logo" /><span>Filled</span></body></html>'

    const result = restoreTemplateMedia(filled, template)
    expect(result).toContain('/api/media/media_asset:m1/file')
    expect(result).toContain('data-media-slug="company-logo"')
    expect(result).toContain('<span>Filled</span>')
    expect(result).not.toContain('logo.png')
  })

  it('keeps already-resolvable library media srcs', () => {
    const template =
      '<img src="/api/media/media_asset:m1/file" data-media-slug="a" />'
    const filled =
      '<img src="/api/media/media_asset:m1/file" data-media-slug="a" />'

    expect(restoreTemplateMedia(filled, template)).toBe(filled)
  })

  it('restores empty src logos', () => {
    const template = '<img src="/api/media/media_asset:m1/file" alt="L" />'
    const filled = '<img src="" alt="L" />'
    expect(restoreTemplateMedia(filled, template)).toContain(
      '/api/media/media_asset:m1/file'
    )
  })
})
