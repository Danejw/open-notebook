import apiClient from '@/lib/api/client'

export interface AutofillFileMeta {
  filename: string
  chars: number
}

export interface AutofillResponse {
  data: Record<string, unknown>
  extracted_chars: number
  files: AutofillFileMeta[]
  warnings: string[]
}

export interface AutofillRequest {
  files: File[]
  schema: Record<string, unknown>
  instructions?: string
  modelId?: string
}

export const autofillApi = {
  fromFiles: async ({
    files,
    schema,
    instructions,
    modelId,
  }: AutofillRequest): Promise<AutofillResponse> => {
    const formData = new FormData()
    for (const file of files) {
      formData.append('files', file)
    }
    formData.append('output_schema', JSON.stringify(schema))
    if (instructions?.trim()) {
      formData.append('instructions', instructions.trim())
    }
    if (modelId?.trim()) {
      formData.append('model_id', modelId.trim())
    }
    const response = await apiClient.post<AutofillResponse>('/tools/autofill', formData)
    return response.data
  },
}
