'use client'

import { useEffect, useId, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Archive,
  ArrowLeft,
  Download,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DetailPageSkeleton } from '@/components/common/LoadingSkeletons'
import { CollectionItemsEditor } from '../components/CollectionItemsEditor'
import {
  useArchiveCollection,
  useCollection,
  useDeleteCollection,
  useExportCollection,
  useReplaceCollectionItems,
  useUpdateCollection,
  useValidateCollection,
} from '@/lib/hooks/use-collections'
import { useTranslation } from '@/lib/hooks/use-translation'
import { CollectionItem, ValidationResult } from '@/lib/types/collections'

export default function CollectionDetailPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const collectionId = params.id

  const { data: collection, isLoading } = useCollection(collectionId)
  const updateCollection = useUpdateCollection()
  const replaceItems = useReplaceCollectionItems()
  const deleteCollection = useDeleteCollection()
  const archiveCollection = useArchiveCollection()
  const validateCollection = useValidateCollection()
  const exportCollection = useExportCollection()

  const nameId = useId()
  const descriptionId = useId()
  const tagsId = useId()
  const useWhenId = useId()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [useWhenInput, setUseWhenInput] = useState('')
  const [items, setItems] = useState<CollectionItem[]>([])
  const [metadataDirty, setMetadataDirty] = useState(false)
  const [itemsDirty, setItemsDirty] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)

  useEffect(() => {
    if (!collection) return
    setName(collection.name)
    setDescription(collection.description || '')
    setTagsInput((collection.tags ?? []).join(', '))
    setUseWhenInput((collection.use_when ?? []).join('\n'))
    setItems(collection.items ?? [])
    setMetadataDirty(false)
    setItemsDirty(false)
    setValidation(
      collection.validation_results && typeof collection.validation_results === 'object'
        ? (collection.validation_results as unknown as ValidationResult)
        : null
    )
  }, [collection])

  const parseTags = () =>
    tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

  const parseUseWhen = () =>
    useWhenInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

  const handleSaveMetadata = async () => {
    if (!collection) return
    await updateCollection.mutateAsync({
      id: collection.id,
      data: {
        name: name.trim(),
        description: description.trim(),
        tags: parseTags(),
        use_when: parseUseWhen(),
      },
    })
    setMetadataDirty(false)
  }

  const handleSaveItems = async () => {
    if (!collection) return
    await replaceItems.mutateAsync({
      id: collection.id,
      data: {
        items: items.map((item, index) => ({
          ...item,
          sort_order: index,
        })),
      },
    })
    setItemsDirty(false)
  }

  const handleValidate = async () => {
    if (!collection) return
    const result = await validateCollection.mutateAsync(collection.id)
    setValidation(result)
  }

  const handleArchive = async () => {
    if (!collection) return
    await archiveCollection.mutateAsync(collection.id)
  }

  const handleDelete = async () => {
    if (!collection) return
    await deleteCollection.mutateAsync(collection.id)
    setShowDelete(false)
    router.push('/collections')
  }

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <DetailPageSkeleton />
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground">{t('collections.notFound')}</p>
        <Button asChild variant="outline">
          <Link href="/collections">{t('collections.backToList')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-6">
          <PageHeader
            leading={
              <Button asChild variant="ghost" size="sm" className="-ml-1 mb-1 h-7 px-2 text-xs">
                <Link href="/collections">
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  {t('collections.backToList')}
                </Link>
              </Button>
            }
            title={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {collection.name}
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                  {collection.status}
                </Badge>
                {collection.archived ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                    {t('collections.archived')}
                  </Badge>
                ) : null}
              </span>
            }
            description={
              metadataDirty || itemsDirty ? (
                <span className="text-amber-600 dark:text-amber-400">
                  {t('collections.unsavedChanges')}
                </span>
              ) : undefined
            }
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleValidate}
                  disabled={validateCollection.isPending}
                >
                  <ShieldCheck className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('collections.validate')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => exportCollection.mutate(collection.id)}
                  disabled={exportCollection.isPending}
                >
                  <Download className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('collections.export')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleArchive}
                  disabled={archiveCollection.isPending}
                >
                  <Archive className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('collections.archive')}</span>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setShowDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('common.delete')}</span>
                </Button>
              </>
            }
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('collections.metadata')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={nameId}>{t('common.name')}</Label>
                  <Input
                    id={nameId}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setMetadataDirty(true)
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('collections.slug')}</Label>
                  <Input value={collection.slug} disabled />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={descriptionId}>{t('common.description')}</Label>
                <Textarea
                  id={descriptionId}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    setMetadataDirty(true)
                  }}
                  rows={3}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={tagsId}>{t('collections.tags')}</Label>
                  <Input
                    id={tagsId}
                    value={tagsInput}
                    onChange={(e) => {
                      setTagsInput(e.target.value)
                      setMetadataDirty(true)
                    }}
                    placeholder={t('collections.tagsPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={useWhenId}>{t('collections.useWhen')}</Label>
                  <Textarea
                    id={useWhenId}
                    value={useWhenInput}
                    onChange={(e) => {
                      setUseWhenInput(e.target.value)
                      setMetadataDirty(true)
                    }}
                    placeholder={t('collections.useWhenPlaceholder')}
                    rows={3}
                  />
                </div>
              </div>
              <Button
                onClick={handleSaveMetadata}
                disabled={!metadataDirty || updateCollection.isPending}
              >
                {updateCollection.isPending ? t('common.saving') : t('collections.saveMetadata')}
              </Button>
            </CardContent>
          </Card>

          {validation ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {validation.valid
                    ? t('collections.validationPassed')
                    : t('collections.validationFailed')}
                </CardTitle>
              </CardHeader>
              {!validation.valid && validation.issues.length > 0 ? (
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {validation.issues.map((issue, index) => (
                      <li key={`${issue.message}-${index}`} className="rounded-md border p-2">
                        <p className="font-medium">
                          [{issue.severity}] {issue.message}
                        </p>
                        {issue.path ? (
                          <p className="font-mono text-xs text-muted-foreground">{issue.path}</p>
                        ) : null}
                        {issue.fix ? (
                          <p className="mt-1 text-xs text-muted-foreground">{issue.fix}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{t('collections.itemsTitle')}</CardTitle>
              <Button
                size="sm"
                onClick={handleSaveItems}
                disabled={!itemsDirty || replaceItems.isPending}
              >
                {replaceItems.isPending ? t('common.saving') : t('collections.saveItems')}
              </Button>
            </CardHeader>
            <CardContent>
              <CollectionItemsEditor
                items={items}
                disabled={replaceItems.isPending}
                onChange={(nextItems) => {
                  setItems(nextItems)
                  setItemsDirty(true)
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title={t('collections.delete')}
        description={t('collections.deleteConfirm')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteCollection.isPending}
      />
    </>
  )
}
