"use client"

import { Control, Controller } from "react-hook-form"
import { useTranslation } from "@/lib/hooks/use-translation"
import { FormSection } from "@/components/ui/form-section"
import { CheckboxList } from "@/components/ui/checkbox-list"
import { Checkbox } from "@/components/ui/checkbox"
import { Artifact } from "@/lib/types/artifacts"
import { SettingsResponse } from "@/lib/types/api"

interface CreateSourceFormData {
  type: 'link' | 'upload' | 'text'
  title?: string
  url?: string
  content?: string
  file?: FileList | File
  projects?: string[]
  artifacts?: string[]
  embed: boolean
  async_processing: boolean
}

interface ProcessingStepProps {
  control: Control<CreateSourceFormData>
  artifacts: Artifact[]
  selectedArtifacts: string[]
  onToggleArtifact: (artifactId: string) => void
  loading?: boolean
  settings?: SettingsResponse
}

export function ProcessingStep({
  control,
  artifacts,
  selectedArtifacts,
  onToggleArtifact,
  loading = false,
  settings
}: ProcessingStepProps) {
  const { t } = useTranslation()
  const artifactItems = artifacts.map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    description: artifact.description
  }))

  return (
    <div className="space-y-[2px]">
      <FormSection
        title={`${t('navigation.artifacts')} (${t('common.optional')})`}
      >
        <CheckboxList
          items={artifactItems}
          selectedIds={selectedArtifacts}
          onToggle={onToggleArtifact}
          loading={loading}
          emptyMessage={t('common.noMatches')}
        />
      </FormSection>

      <FormSection
        title={t('navigation.settings')}
      >
        <div className="space-y-[2px]">
          {settings?.default_embedding_option === 'ask' && (
            <Controller
              control={control}
              name="embed"
              render={({ field }) => (
                <label 
                  htmlFor="enable-embedding"
                  className="flex items-start gap-[2px] cursor-pointer p-[2px] rounded-md hover:bg-muted"
                >
                  <Checkbox
                    id="enable-embedding"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium block">{t('sources.enableEmbedding')}</span>
                    <p className="text-xs text-muted-foreground">
                      {t('sources.embeddingDesc')}
                    </p>
                  </div>
                </label>
              )}
            />
          )}

          {settings?.default_embedding_option === 'always' && (
            <div className="p-[2px] rounded-md bg-primary/10 border border-primary/30">
              <div className="flex items-start gap-[2px]">
                <div className="w-4 h-4 bg-primary rounded-full mt-0.5 flex-shrink-0"></div>
                <div className="flex-1">
                  <span className="text-sm font-medium block text-primary">{t('sources.embeddingAlways')}</span>
                  <p className="text-xs text-primary">
                    {t('sources.embeddingAlwaysDesc')}
                    {t('sources.changeInSettings')} <span className="font-medium">{t('navigation.settings')}</span>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {settings?.default_embedding_option === 'never' && (
            <div className="p-[2px] rounded-md bg-muted border border-border">
              <div className="flex items-start gap-[2px]">
                <div className="w-4 h-4 bg-muted-foreground rounded-full mt-0.5 flex-shrink-0"></div>
                <div className="flex-1">
                  <span className="text-sm font-medium block text-foreground">{t('sources.embeddingNever')}</span>
                  <p className="text-xs text-muted-foreground">
                    {t('sources.embeddingNeverDesc')}
                    {t('sources.changeInSettings')} <span className="font-medium">{t('navigation.settings')}</span>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </FormSection>
    </div>
  )
}
