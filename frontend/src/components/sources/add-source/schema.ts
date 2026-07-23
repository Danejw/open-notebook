import { z } from 'zod'

export const MAX_BATCH_SIZE = 50

export const createSourceSchema = z
  .object({
    type: z.enum(['link', 'upload', 'text']),
    title: z.string().optional(),
    url: z.string().optional(),
    content: z.string().optional(),
    file: z.any().optional(),
    projects: z.array(z.string()).optional(),
    embed: z.boolean(),
    async_processing: z.boolean(),
  })
  .refine(
    (data) => {
      if (data.type === 'link') {
        return !!data.url && data.url.trim() !== ''
      }
      if (data.type === 'text') {
        return !!data.content && data.content.trim() !== ''
      }
      if (data.type === 'upload') {
        if (data.file instanceof FileList) {
          return data.file.length > 0
        }
        return !!data.file
      }
      return true
    },
    {
      message: 'Please provide the required content for the selected source type',
      path: ['type'],
    }
  )
  .refine(
    (data) => {
      if (data.type === 'text') {
        return !!data.title && data.title.trim() !== ''
      }
      return true
    },
    {
      message: 'Title is required for text sources',
      path: ['title'],
    }
  )

export type CreateSourceFormData = z.infer<typeof createSourceSchema>

export interface ProcessingState {
  message: string
  progress?: number
}

export interface BatchProgress {
  total: number
  completed: number
  failed: number
  currentItem?: string
}
