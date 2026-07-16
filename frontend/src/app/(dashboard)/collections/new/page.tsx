'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateCollection } from '@/lib/hooks/use-collections'
import { useTranslation } from '@/lib/hooks/use-translation'
import { CollectionItem } from '@/lib/types/collections'

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function NewCollectionPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const createCollection = useCreateCollection()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [urlInput, setUrlInput] = useState('')

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(value))
    }
  }

  const parseUrls = (): CollectionItem[] => {
    const lines = urlInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    return lines.map((line, index) => {
      let title = line
      let url = line
      const parts = line.split(/\s+/)
      if (parts.length > 1 && /^https?:\/\//i.test(parts[parts.length - 1])) {
        url = parts[parts.length - 1]
        title = parts.slice(0, -1).join(' ')
      }
      const itemId = slugify(title || `item-${index + 1}`) || `item-${index + 1}`
      return {
        item_id: itemId,
        type: 'url',
        title: title || url,
        url,
        description: '',
        tags: [],
        topics: [],
        enabled: true,
        sort_order: index,
      }
    })
  }

  const handleCreate = async () => {
    const created = await createCollection.mutateAsync({
      name: name.trim(),
      slug: slug.trim() || undefined,
      description: description.trim(),
      items: parseUrls(),
    })
    router.push(`/collections/${created.id}`)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <PageHeader
          title={t('collections.create')}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href="/collections">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                {t('common.back')}
              </Link>
            </Button>
          }
        />

        <div className="space-y-4 rounded-md border p-4">
          <div className="space-y-2">
            <Label htmlFor="collection-name">{t('common.name')}</Label>
            <Input
              id="collection-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collection-slug">{t('collections.slug')}</Label>
            <Input
              id="collection-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collection-description">{t('common.description')}</Label>
            <Textarea
              id="collection-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collection-urls">{t('collections.urlsLabel')}</Label>
            <Textarea
              id="collection-urls"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={t('collections.urlsPlaceholder')}
              rows={8}
            />
          </div>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !description.trim() || createCollection.isPending}
          >
            {t('collections.create')}
          </Button>
        </div>
      </div>
    </div>
  )
}
