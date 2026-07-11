export interface SkillFile {
  path: string
  filename: string
  content: string
  encoding: string
  mime_type: string
  size_bytes: number
  required: boolean
}

export interface Skill {
  id: string
  name: string
  description: string
  tags: string[]
  owner?: string | null
  visibility: string
  status: string
  archived: boolean
  validation_results?: Record<string, unknown> | null
  version?: string | null
  file_count: number
  created?: string | null
  updated?: string | null
}

export interface SkillDetail extends Skill {
  files: SkillFile[]
}

export interface SkillCatalogItem {
  id: string
  name: string
  description: string
  tags: string[]
  status: string
  archived: boolean
}

export interface CreateSkillRequest {
  name: string
  description?: string
  tags?: string[]
  owner?: string | null
  visibility?: string
  status?: string
  version?: string | null
  files?: SkillFile[]
}

export interface UpdateSkillRequest {
  name?: string
  description?: string
  tags?: string[]
  owner?: string | null
  visibility?: string
  status?: string
  archived?: boolean
  version?: string | null
}

export interface SkillFileUpsertRequest {
  path: string
  content: string
  encoding?: string
  mime_type?: string | null
}

export interface SkillFileMoveRequest {
  from_path: string
  to_path: string
}

export interface SkillReplaceFilesRequest {
  files: SkillFile[]
}

export interface ImportPreview {
  root_name: string
  name?: string | null
  description?: string | null
  files: SkillFile[]
  errors: string[]
  warnings: string[]
  source_filename?: string | null
  selected?: boolean
}

export interface BulkImportPreview {
  items: ImportPreview[]
  errors: string[]
}

export interface ImportConfirmRequest {
  name: string
  description?: string
  tags?: string[]
  owner?: string | null
  files: SkillFile[]
}

export interface BulkImportConfirmRequest {
  items: ImportConfirmRequest[]
}

export interface BulkImportConfirmResult {
  imported: SkillDetail[]
  failed: string[]
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
