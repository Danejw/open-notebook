export interface CollectionItem {
  item_id: string
  type: string
  title: string
  url?: string | null
  description?: string | null
  tags: string[]
  topics: string[]
  authority?: string | null
  enabled: boolean
  priority?: number | null
  metadata?: Record<string, unknown> | null
  sort_order: number
}

export interface Collection {
  id: string
  name: string
  slug: string
  description: string
  version?: string | null
  tags: string[]
  use_when: string[]
  owner?: string | null
  visibility: string
  status: string
  archived: boolean
  selection?: Record<string, unknown> | null
  manifest_extra?: Record<string, unknown> | null
  validation_results?: Record<string, unknown> | null
  item_count: number
  created?: string | null
  updated?: string | null
}

export interface CollectionDetail extends Collection {
  items: CollectionItem[]
}

export interface CollectionCatalogItem {
  id: string
  name: string
  description: string
  slug: string
  tags: string[]
  status: string
  archived: boolean
  item_count: number
}

export interface CreateCollectionRequest {
  name: string
  slug?: string
  description?: string
  version?: string | null
  tags?: string[]
  use_when?: string[]
  owner?: string | null
  visibility?: string
  status?: string
  selection?: Record<string, unknown> | null
  manifest_extra?: Record<string, unknown> | null
  items?: CollectionItem[]
}

export interface UpdateCollectionRequest {
  name?: string
  slug?: string
  description?: string
  version?: string | null
  tags?: string[]
  use_when?: string[]
  owner?: string | null
  visibility?: string
  status?: string
  archived?: boolean
  selection?: Record<string, unknown> | null
  manifest_extra?: Record<string, unknown> | null
}

export interface ReplaceCollectionItemsRequest {
  items: CollectionItem[]
}

export interface CollectionImportPreview {
  root_name: string
  name?: string | null
  slug?: string | null
  description?: string | null
  items: CollectionItem[]
  errors: string[]
  warnings: string[]
  source_filename?: string | null
}

export interface CollectionImportConfirmRequest {
  name: string
  slug?: string | null
  description?: string
  version?: string | null
  tags?: string[]
  use_when?: string[]
  visibility?: string
  status?: string
  selection?: Record<string, unknown> | null
  manifest_extra?: Record<string, unknown> | null
  manifest_raw?: string
  items: CollectionItem[]
}

export interface ValidationIssue {
  severity: string
  message: string
  path?: string | null
  fix?: string | null
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}
