export type HtmlTemplateCategory = 'estimate' | 'sow' | 'rfi' | 'other'

export interface HtmlTemplate {
  id: string
  name: string
  category: HtmlTemplateCategory | string
  html_body: string
  created: string
  updated: string
}

export interface CreateHtmlTemplateRequest {
  name: string
  category?: HtmlTemplateCategory | string
  html_body: string
}

export interface UpdateHtmlTemplateRequest {
  name?: string
  category?: HtmlTemplateCategory | string
  html_body?: string
}

export interface BidDocument {
  id: string
  project_id: string
  template_id?: string | null
  title: string
  scenario_label: string
  html_body: string
  parent_document_id?: string | null
  created: string
  updated: string
}

export interface CreateBidDocumentRequest {
  template_id: string
  title?: string
  scenario_label?: string
}

export interface UpdateBidDocumentRequest {
  title?: string
  scenario_label?: string
  html_body?: string
  span_updates?: Record<number, string>
  allow_structure_change?: boolean
}

export interface DuplicateBidDocumentRequest {
  scenario_label: string
  title?: string
}
