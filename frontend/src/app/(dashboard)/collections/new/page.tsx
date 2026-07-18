'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  PageHeader,
  pageContentClassName,
  pageSectionGapClassName,
} from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCreateCollection } from '@/lib/hooks/use-collections'
import { useTranslation } from '@/lib/hooks/use-translation'
import { collectionItemsFromBulkInput } from '@/lib/utils/collection-entries'
import { cn } from '@/lib/utils'

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
  const [entriesInput, setEntriesInput] = useState('')

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(value))
    }
  }

  const handleCreate = async () => {
    const created = await createCollection.mutateAsync({
      name: name.trim(),
      slug: slug.trim() || undefined,
      description: description.trim(),
      items: collectionItemsFromBulkInput(entriesInput),
    })
    router.push(`/collections/${created.id}`)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={pageContentClassName}>
        <div className={cn('max-w-3xl', pageSectionGapClassName)}>
          <PageHeader
            title={t('collections.create')}
            actions={
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                <Link href="/collections">
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  {t('common.back')}
                </Link>
              </Button>
            }
          />

          <Card>
            <CardHeader>
              <CardTitle>{t('collections.metadata')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="space-y-0.5">
                <Label htmlFor="collection-name">{t('common.name')}</Label>
                <Input
                  id="collection-name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
              </div>
              <div className="space-y-0.5">
                <Label htmlFor="collection-slug">{t('collections.slug')}</Label>
                <Input
                  id="collection-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </div>
              <div className="space-y-0.5">
                <Label htmlFor="collection-description">{t('common.description')}</Label>
                <Textarea
                  id="collection-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-0.5">
                <Label htmlFor="collection-entries">{t('collections.urlsLabel')}</Label>
                <Textarea
                  id="collection-entries"
                  value={entriesInput}
                  onChange={(e) => setEntriesInput(e.target.value)}
                  placeholder={t('collections.urlsPlaceholder')}
                  rows={8}
                />
              </div>
              <Button
                size="sm"
                className="h-7"
                onClick={handleCreate}
                disabled={!name.trim() || !description.trim() || createCollection.isPending}
              >
                {t('collections.create')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
