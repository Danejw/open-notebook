export interface MediaAsset {
  id: string
  name: string
  slug: string
  mime_type: string
  byte_size: number
  created: string
  updated: string
  file_url: string
}

export interface UpdateMediaAssetRequest {
  name?: string
  slug?: string
}
