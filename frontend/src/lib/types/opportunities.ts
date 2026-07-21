export type OpportunitySourceStage =
  | 'early_research'
  | 'pre_solicitation'
  | 'active_solicitation'

export type OpportunityStatus =
  | 'none'
  | 'watching'
  | 'pursuing'
  | 'submitted'
  | 'won'
  | 'lost'
  | 'no_bid'
  | 'ignored'

export type OpportunitySourceStatus =
  | 'active'
  | 'inactive'
  | 'archived'
  | 'cancelled'
  | 'awarded'
  | 'unknown'

export type OpportunityMonitoringHealth =
  | 'inactive'
  | 'pending'
  | 'healthy'
  | 'delayed'
  | 'failing'
  | 'authentication_required'
  | 'source_unavailable'

export type OpportunityChangeSeverity = 'informational' | 'important' | 'critical'
export type OpportunityRefreshTrigger = 'initial' | 'scheduled' | 'manual'

export type ProcurementType = 'IFB' | 'RFP' | 'RFQ' | 'RFI' | 'ITB' | 'NOI' | 'OTHER'

export type HawaiiIsland =
  | 'Oahu'
  | 'Hawaii'
  | 'Maui'
  | 'Kauai'
  | 'Molokai'
  | 'Lanai'
  | 'Statewide'
  | 'Pacific'
  | 'Unknown'

export type FitRecommendation = 'pursue' | 'review' | 'no_bid'

export interface OpportunityScoreCategory {
  label: string
  score: number
  max_score: number
  detail: string
}

export interface OpportunityAddendumImpact {
  classification: 'none' | 'favorable' | 'neutral' | 'review' | 'high_risk'
  score_delta: number
  summary: string
  items: Array<{
    kind: string
    points: number
    summary: string
  }>
}

export type OpportunityDocumentIngestStatus =
  | 'pending'
  | 'queued'
  | 'failed'
  | 'skipped'

export interface OpportunityDocument {
  url: string
  name?: string
  source_id?: string
  ingest_status?: OpportunityDocumentIngestStatus
  error?: string
}

export interface Opportunity {
  id: string
  source_key: string
  external_id: string
  fingerprint: string
  title: string
  agency: string
  solicitation_number: string | null
  procurement_type: ProcurementType
  source_stage: OpportunitySourceStage
  status: OpportunityStatus
  source_status: OpportunitySourceStatus
  source_status_reason: string | null
  island: HawaiiIsland
  location: string
  scope_summary: string
  description: string
  description_url?: string | null
  trades: string[]
  license_requirements: string[]
  published_at: string | null
  questions_due_at: string | null
  prebid_at: string | null
  bid_due_at: string | null
  source_updated_at: string | null
  last_seen_at: string | null
  estimated_value_min: number | null
  estimated_value_max: number | null
  bid_bond_required: boolean | null
  bid_bond_percent: number | null
  prevailing_wage_required: boolean | null
  mandatory_site_visit: boolean | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_title?: string | null
  source_url: string
  office_address?: string | null
  documents: OpportunityDocument[]
  addenda: Array<Record<string, unknown>>
  fit_score: number | null
  fit_reasons: string[]
  risk_flags: string[]
  fit_recommendation: FitRecommendation
  fit_breakdown: Record<string, OpportunityScoreCategory>
  addendum_impact: OpportunityAddendumImpact
  score_version: string
  score_updated_at: string | null
  extraction_confidence: number | null
  monitoring_enabled: boolean
  monitoring_health: OpportunityMonitoringHealth
  monitoring_last_checked_at: string | null
  monitoring_last_success_at: string | null
  monitoring_last_changed_at: string | null
  monitoring_next_check_at: string | null
  monitoring_last_error: string | null
  monitoring_consecutive_failures: number
  monitoring_lease_until: string | null
  monitoring_snapshot_hash: string | null
  monitoring_unread_changes: number
  project_id: string | null
  archived: boolean
  created: string | null
  updated: string | null
}

export interface OpportunityChange {
  id: string
  opportunity_id: string
  detected_at: string
  trigger: OpportunityRefreshTrigger
  severity: OpportunityChangeSeverity
  summary: string
  source_updated_at: string | null
  changed_fields: Record<string, { previous: unknown; current: unknown }>
  new_documents: OpportunityDocument[]
  removed_documents: OpportunityDocument[]
  snapshot_hash: string
  acknowledged: boolean
}

export interface OpportunityRefreshResponse {
  opportunity: Opportunity
  changed: boolean
  change: OpportunityChange | null
}

export interface OpportunityMonitoringHealthSummary {
  monitored: number
  healthy: number
  failing: number
  overdue: number
  oldest_overdue_at: string | null
}

export interface OpportunityListResponse {
  items: Opportunity[]
  total: number
  offset: number
  limit: number
}

export type FitScoreBand = 'high' | 'medium' | 'low' | 'unscored'

export type OpportunitySort = 'due' | 'fit_score_desc' | 'fit_score_asc'

export interface OpportunityFilters {
  q?: string
  status?: OpportunityStatus | 'all'
  source_stage?: OpportunitySourceStage | 'all'
  island?: HawaiiIsland | 'all'
  trade?: string
  source_key?: string
  min_fit_score?: number
  fit_score_band?: FitScoreBand
  sort?: OpportunitySort
  due_before?: string
}

export interface OpportunityDashboard {
  total: number
  new: number
  watching: number
  pursuing: number
  submitted: number
  high_fit: number
  due_soon: number
  overdue: number
  pipeline_value_min: number
  pipeline_value_max: number
  by_status: Record<string, number>
  by_source_stage?: Record<string, number>
}

export type OpportunityScoringProfileSource = 'database' | 'env' | 'default'

export interface OpportunityScoringProfile {
  name: string
  licenses: string[]
  preferred_trades: string[]
  supported_islands: string[]
  min_project_value: number
  max_project_value: number | null
  minimum_bid_days: number
  max_bond_percent: number
  preferred_keywords: string[]
  excluded_keywords: string[]
  profile_ready: boolean
  score_version: string
  source: OpportunityScoringProfileSource
  weights: Record<string, number>
  rescored?: number | null
  failed?: number | null
  errors?: Array<{ id: string; error: string }> | null
}

export type OpportunityScoringProfileUpdate = {
  name: string
  licenses: string[]
  preferred_trades: string[]
  supported_islands: string[]
  min_project_value: number
  max_project_value: number | null
  minimum_bid_days: number
  max_bond_percent: number
  preferred_keywords: string[]
  excluded_keywords: string[]
}

export interface OpportunitySource {
  id: string
  key: string
  name: string
  category: string
  coverage: string
  portal_url: string
  access_method:
    | 'public_page'
    | 'public_api'
    | 'authenticated_portal'
    | 'email_notification'
    | 'manual_import'
  check_frequency: 'daily' | 'weekly' | 'manual'
  enabled: boolean
  description: string
  registration_notes: string
  last_synced_at: string | null
  last_sync_status: 'success' | 'partial' | 'failed' | null
  last_error: string | null
  sync_collection_id?: string | null
}

export interface PursueOpportunityResponse {
  opportunity: Opportunity
  project_id: string
  project_name: string
  project_created: boolean
}
