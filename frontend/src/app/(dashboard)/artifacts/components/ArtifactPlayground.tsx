'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Database, Play } from 'lucide-react'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { Artifact } from '@/lib/types/artifacts'
import { useExecuteArtifact } from '@/lib/hooks/use-artifacts'
import { useProjects } from '@/lib/hooks/use-projects'
import { useIngestAsSource } from '@/lib/hooks/use-sources'
import { ModelSelector } from '@/components/common/ModelSelector'
import { useTranslation } from '@/lib/hooks/use-translation'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'

interface ArtifactPlaygroundProps {
  artifacts: Artifact[] | undefined
  selectedArtifact?: Artifact
}

export function ArtifactPlayground({ artifacts, selectedArtifact }: ArtifactPlaygroundProps) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState(selectedArtifact?.id || '')
  const [inputText, setInputText] = useState('')
  const [modelId, setModelId] = useState('')
  const [output, setOutput] = useState('')
  const [projectId, setProjectId] = useState('')

  const executeArtifact = useExecuteArtifact()
  const ingestAsSource = useIngestAsSource()
  const { data: projects } = useProjects(false)

  const selectedArtifactRecord = useMemo(
    () => artifacts?.find((artifact) => artifact.id === selectedId),
    [artifacts, selectedId]
  )

  useEffect(() => {
    if (selectedArtifact?.id) {
      setSelectedId(selectedArtifact.id)
    }
  }, [selectedArtifact?.id])

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) {
      setProjectId(projects[0].id)
    }
  }, [projectId, projects])

  const handleExecute = async () => {
    if (!selectedId || !modelId || !inputText.trim()) {
      return
    }

    const result = await executeArtifact.mutateAsync({
      artifact_id: selectedId,
      input_text: inputText,
      model_id: modelId,
    })

    setOutput(result.output)
  }

  const handleIngestOutput = async () => {
    if (!output.trim() || !projectId) return

    await ingestAsSource.mutateAsync({
      kind: 'text',
      projectId,
      data: {
        content: output,
        title: selectedArtifactRecord?.title ?? t('artifacts.outputLabel'),
        project_ids: [projectId],
        embed: true,
      },
    })
  }

  const canExecute = selectedId && modelId && inputText.trim() && !executeArtifact.isPending
  const canIngest = Boolean(output.trim() && projectId && !ingestAsSource.isPending)

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold leading-none">{t('artifacts.playground')}</h2>
      </div>

      <div className="space-y-3 p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="artifact" className="text-xs">
              {t('navigation.artifact')}
            </Label>
            <Select name="artifact" value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger id="artifact" className="h-8 text-xs">
                <SelectValue placeholder={t('artifacts.selectToStart')} />
              </SelectTrigger>
              <SelectContent>
                {artifacts?.map((artifact) => (
                  <SelectItem key={artifact.id} value={artifact.id}>
                    {artifact.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <ModelSelector
              label={t('artifacts.model')}
              name="model"
              modelType="language"
              value={modelId}
              onChange={setModelId}
              placeholder={t('artifacts.selectModel')}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="input" className="text-xs">
            {t('artifacts.inputLabel')}
          </Label>
          <Textarea
            id="input"
            name="input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t('artifacts.inputPlaceholder')}
            rows={6}
            className="min-h-[120px] font-mono text-xs"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleExecute} disabled={!canExecute} size="sm" className="h-7 text-xs">
            {executeArtifact.isPending ? (
              <>
                <InlineSkeleton className="mr-1.5 h-3.5 w-3.5" />
                {t('artifacts.running')}
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {t('artifacts.runTest')}
              </>
            )}
          </Button>
        </div>

        {output ? (
          <div className="space-y-1.5 border-t pt-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-xs font-medium leading-none">{t('artifacts.outputLabel')}</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="ingest-project" className="text-[11px] text-muted-foreground">
                    {t('sources.selectProjectToIngest')}
                  </Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger id="ingest-project" className="h-7 w-[180px] text-xs">
                      <SelectValue placeholder={t('sources.selectProjectToIngest')} />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  disabled={!canIngest}
                  onClick={() => void handleIngestOutput()}
                >
                  <Database className="mr-1.5 h-3.5 w-3.5" />
                  {t('sources.ingestAsSource')}
                </Button>
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-2">
              <MarkdownRenderer size="sm">{output}</MarkdownRenderer>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
