"use client"

import { FormSection } from "@/components/ui/form-section"
import { useTranslation } from "@/lib/hooks/use-translation"
import { CheckboxList } from "@/components/ui/checkbox-list"
import { ProjectResponse } from "@/lib/types/api"

interface ProjectsStepProps {
  projects: ProjectResponse[]
  selectedProjectIds: string[]
  onToggleProject: (projectId: string) => void
  loading?: boolean
}

export function ProjectsStep({
  projects,
  selectedProjectIds,
  onToggleProject,
  loading = false
}: ProjectsStepProps) {
  const { t } = useTranslation()
  const projectItems = projects.map((project) => ({
    id: project.id,
    title: project.name,
    description: project.description || undefined
  }))

  return (
    <div className="space-y-[2px]">
      <FormSection
        title={`${t('projects.title')} (${t('common.optional')})`}
        description={t('sources.addExistingDesc')}
      >
        <CheckboxList
          items={projectItems}
          selectedIds={selectedProjectIds}
          onToggle={onToggleProject}
          loading={loading}
          emptyMessage={t('sources.noProjectsFound')}
        />
      </FormSection>
    </div>
  )
}
