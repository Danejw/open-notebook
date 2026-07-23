import { parseAndValidateUrls } from '@/components/sources/steps/SourceTypeStep'
import {
  CreateSourceFormData,
  MAX_BATCH_SIZE,
} from '@/components/sources/add-source/schema'

export interface BatchModeInfo {
  isBatchMode: boolean
  itemCount: number
  parsedUrls: string[]
  parsedFiles: File[]
}

export function resolveBatchMode(
  selectedType: CreateSourceFormData['type'] | undefined,
  watchedUrl: string | undefined,
  watchedFile: unknown
): BatchModeInfo {
  let urlCount = 0
  let fileCount = 0
  let parsedUrls: string[] = []
  let parsedFiles: File[] = []

  if (selectedType === 'link' && watchedUrl) {
    const { valid } = parseAndValidateUrls(watchedUrl)
    parsedUrls = valid
    urlCount = valid.length
  }

  if (selectedType === 'upload' && watchedFile) {
    const fileList = watchedFile as FileList
    if (fileList?.length) {
      parsedFiles = Array.from(fileList)
      fileCount = parsedFiles.length
    }
  }

  const isBatchMode = urlCount > 1 || fileCount > 1
  const itemCount = selectedType === 'link' ? urlCount : fileCount

  return { isBatchMode, itemCount, parsedUrls, parsedFiles }
}

export function isAddSourceStepValid(params: {
  step: number
  selectedType: CreateSourceFormData['type'] | undefined
  watchedUrl: string | undefined
  watchedContent: string | undefined
  watchedFile: unknown
  watchedTitle: string | undefined
  isBatchMode: boolean
  isOverLimit: boolean
  urlValidationErrors: { url: string; line: number }[]
  parsedUrls: string[]
}): boolean {
  const {
    step,
    selectedType,
    watchedUrl,
    watchedContent,
    watchedFile,
    watchedTitle,
    isBatchMode,
    isOverLimit,
    urlValidationErrors,
    parsedUrls,
  } = params

  switch (step) {
    case 1:
      if (!selectedType) return false
      if (isOverLimit) return false
      if (urlValidationErrors.length > 0) return false

      if (selectedType === 'link') {
        if (isBatchMode) {
          return parsedUrls.length > 0
        }
        return !!watchedUrl && watchedUrl.trim() !== ''
      }
      if (selectedType === 'text') {
        return (
          !!watchedContent &&
          watchedContent.trim() !== '' &&
          !!watchedTitle &&
          watchedTitle.trim() !== ''
        )
      }
      if (selectedType === 'upload') {
        if (watchedFile instanceof FileList) {
          return watchedFile.length > 0 && watchedFile.length <= MAX_BATCH_SIZE
        }
        return !!watchedFile
      }
      return true
    case 2:
    case 3:
      return true
    default:
      return false
  }
}
