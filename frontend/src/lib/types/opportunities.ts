export type OpportunityStatus =
  | 'new'
  | 'reviewing'
  | 'watching'
  | 'pursuing'
  | 'submitted'
  | 'won'
  | 'lost'
  | 'no_bid'
  | 'ignored'

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

export interface OpportunityDiscoveryMatch {
  collection_id: string
  collection_name: string
  collection_slug: string
  naics_codes: string[]
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
  status: OpportunityStatus
  island: HawaiiIsland
  location: string
  scope_summary: string
  description: string
  trades: string[]
  license_requirements: string[]
  naics_code: string | null
  matched_naics_codes: string[]
  matched_collection_ids: string[]
  discovery_matches: OpportunityDiscoveryMatch[]
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
  source_url: string
  documents: Array<Record<string, unknown>>
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
  project_id: string | null
  archived: boolean
  created: string | null
  updated: string | null
}

export interface OpportunityListResponse {
  items: Opportunity[]
  total: number
  offset: number
  limit: number
}

export interface OpportunityFilters {
  q?: string
  status?: OpportunityStatus | 'all'
  island?: HawaiiIsland | 'all'
  trade?: string
  source_key?: string
  min_fit_score?: number
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
}

export interface OpportunityNaicsCollectionItem {
  code: string
  title: string
  description: string
  priority: number | null
  item_id: string
}

export interface OpportunityNaicsCollection {
  id: string
  name: string
  slug: string
  description: string
  codes: string[]
  items: OpportunityNaicsCollectionItem[]
  is_default: boolean
}

export interface PursueOpportunityResponse {
  opportunity: Opportunity
  project_id: string
  project_name: string
  project_created: boolean
}
