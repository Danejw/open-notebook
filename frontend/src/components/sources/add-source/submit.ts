import type { CreateSourceRequest } from '@/lib/types/api'
import type {
  BatchProgress,
  CreateSourceFormData,
} from '@/components/sources/add-source/schema'

interface CreateSourceMutation {
  mutateAsync: (data: CreateSourceRequest) => Promise<unknown>
}

export async function submitSingleSource(params: {
  data: CreateSourceFormData
  selectedProjectIds: string[]
  createSource: CreateSourceMutation
}): Promise<void> {
  const { data, selectedProjectIds, createSource } = params

  const createRequest: CreateSourceRequest = {
    type: data.type,
    projects: selectedProjectIds,
    url: data.type === 'link' ? data.url : undefined,
    content: data.type === 'text' ? data.content : undefined,
    title: data.title,
    embed: true,
    delete_source: false,
    async_processing: true,
  }

  if (data.type === 'upload' && data.file) {
    const file = data.file instanceof FileList ? data.file[0] : data.file
    const requestWithFile = createRequest as CreateSourceRequest & { file?: File }
    requestWithFile.file = file
  }

  await createSource.mutateAsync(createRequest)
}

export async function submitBatchSources(params: {
  data: CreateSourceFormData
  selectedProjectIds: string[]
  parsedUrls: string[]
  parsedFiles: File[]
  createSource: CreateSourceMutation
  setBatchProgress: (
    value: BatchProgress | null | ((prev: BatchProgress | null) => BatchProgress | null)
  ) => void
}): Promise<{ success: number; failed: number }> {
  const {
    data,
    selectedProjectIds,
    parsedUrls,
    parsedFiles,
    createSource,
    setBatchProgress,
  } = params

  const results = { success: 0, failed: 0 }
  const items: { type: 'url' | 'file'; value: string | File }[] = []

  if (data.type === 'link' && parsedUrls.length > 0) {
    parsedUrls.forEach((url) => items.push({ type: 'url', value: url }))
  } else if (data.type === 'upload' && parsedFiles.length > 0) {
    parsedFiles.forEach((file) => items.push({ type: 'file', value: file }))
  }

  setBatchProgress({
    total: items.length,
    completed: 0,
    failed: 0,
  })

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const itemLabel =
      item.type === 'url'
        ? (item.value as string).substring(0, 50) + '...'
        : (item.value as File).name

    setBatchProgress((prev) =>
      prev
        ? {
            ...prev,
            currentItem: itemLabel,
          }
        : null
    )

    try {
      const createRequest: CreateSourceRequest = {
        type: item.type === 'url' ? 'link' : 'upload',
        projects: selectedProjectIds,
        url: item.type === 'url' ? (item.value as string) : undefined,
        embed: true,
        delete_source: false,
        async_processing: true,
      }

      if (item.type === 'file') {
        const requestWithFile = createRequest as CreateSourceRequest & {
          file?: File
        }
        requestWithFile.file = item.value as File
      }

      await createSource.mutateAsync(createRequest)
      results.success++
    } catch (error) {
      console.error(`Error creating source for ${itemLabel}:`, error)
      results.failed++
    }

    setBatchProgress((prev) =>
      prev
        ? {
            ...prev,
            completed: results.success,
            failed: results.failed,
          }
        : null
    )
  }

  return results
}
