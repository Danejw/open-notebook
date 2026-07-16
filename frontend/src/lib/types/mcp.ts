export type McpAuthType = 'none' | 'bearer'

export type McpRiskLevel = 'read' | 'action' | 'unknown'

export interface McpConnection {
  id: string
  name: string
  endpoint_url: string
  transport: string
  auth_type: McpAuthType
  has_auth_config: boolean
  status: string
  server_info?: object | null
  capabilities?: object | null
  last_connected_at?: string | null
  last_synced_at?: string | null
  last_error?: string | null
  available_tool_count?: number | null
  created?: string | null
  updated?: string | null
}

export interface McpTool {
  id: string
  connection_id?: string | null
  connection_name?: string | null
  name: string
  title?: string | null
  description?: string | null
  input_schema?: object | null
  output_schema?: object | null
  annotations?: object | null
  risk_level: McpRiskLevel
  available: boolean
  executable: boolean
  last_discovered_at?: string | null
}

export type ToolSource = 'native' | 'mcp'

export interface ChatToolCall {
  id: string
  session_id: string
  message_id?: string | null
  connection_id?: string | null
  tool_id?: string | null
  tool_name: string
  connection_name?: string | null
  risk_level?: string | null
  runtime_name?: string | null
  arguments?: object | null
  result_text?: string | null
  status: string
  error?: string | null
  tool_source?: ToolSource | null
  performed_write?: boolean
  error_category?: string | null
  started_at?: string | null
  completed_at?: string | null
  duration_ms?: number | null
  created?: string | null
  updated?: string | null
}

export interface CreateMcpConnectionRequest {
  name: string
  endpoint_url: string
  transport?: 'streamable_http'
  auth_type?: McpAuthType
  bearer_token?: string
}

export interface UpdateMcpConnectionAuthRequest {
  auth_type: McpAuthType
  bearer_token?: string
}
