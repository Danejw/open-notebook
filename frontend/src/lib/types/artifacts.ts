export interface Artifact {
  id: string
  name: string
  title: string
  description: string
  prompt: string
  apply_default: boolean
  created: string
  updated: string
}

export interface CreateArtifactRequest {
  name: string
  title: string
  description: string
  prompt: string
  apply_default?: boolean
}

export interface UpdateArtifactRequest {
  name?: string
  title?: string
  description?: string
  prompt?: string
  apply_default?: boolean
}

export interface ExecuteArtifactRequest {
  artifact_id: string
  input_text: string
  model_id: string
}

export interface ExecuteArtifactResponse {
  output: string
  artifact_id: string
  model_id: string
}

export interface DefaultPrompt {
  artifact_instructions: string
}