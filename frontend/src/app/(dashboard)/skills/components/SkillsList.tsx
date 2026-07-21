'use client'

import { useState } from 'react'
import { Archive, Trash2, Upload, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { BulkDeleteConfirmDialog } from '@/components/common/BulkDeleteConfirmDialog'
import { ResourceList } from '@/components/common/ResourceList'
import { reportBulkResults, settleBulkActions } from '@/components/common/bulk-settle'
import { Skill } from '@/lib/types/skills'
import { SkillCard } from './SkillCard'
import { SkillImportDialog } from './SkillImportDialog'
import { skillsApi } from '@/lib/api/skills'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@/lib/hooks/use-translation'

interface SkillsListProps {
  skills: Skill[] | undefined
  isLoading: boolean
}

export function SkillsList({ skills, isLoading }: SkillsListProps) {
  const { t } = useTranslation()
  const [importOpen, setImportOpen] = useState(false)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const queryClient = useQueryClient()

  const items = skills ?? []

  const invalidateSkills = async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skills })
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skillsCatalog })
  }

  const handleBulkArchive = async (selectedIds: string[], exitSelection: () => void) => {
    setBulkBusy(true)
    try {
      const { succeeded, failed } = await settleBulkActions(selectedIds, (id) =>
        skillsApi.archive(id, true)
      )
      reportBulkResults(t, succeeded, failed)
      await invalidateSkills()
      exitSelection()
    } finally {
      setBulkBusy(false)
    }
  }

  const handleBulkDeleteConfirm = async () => {
    if (!bulkDeleteIds?.length) return
    setBulkBusy(true)
    try {
      const { succeeded, failed } = await settleBulkActions(bulkDeleteIds, (id) =>
        skillsApi.delete(id)
      )
      reportBulkResults(t, succeeded, failed)
      await invalidateSkills()
      setBulkDeleteIds(null)
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <>
      <ResourceList
        title={t('skills.listTitle')}
        items={items}
        getItemId={(skill) => skill.id}
        isLoading={isLoading}
        emptyIcon={Sparkles}
        emptyTitle={t('skills.empty')}
        emptyDescription={t('skills.emptyDesc')}
        empty={
          <EmptyState
            icon={Sparkles}
            title={t('skills.empty')}
            description={t('skills.emptyDesc')}
            action={
              <Button size="sm" className="h-7 text-xs" onClick={() => setImportOpen(true)}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {t('skills.uploadZip')}
              </Button>
            }
          />
        }
        headerActions={
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {t('skills.uploadZip')}
          </Button>
        }
        formatSelectedCount={(count) =>
          t('common.selectedItems').replace('{count}', count.toString())
        }
        bulkActions={({ selectedIds, exitSelection }) => (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={bulkBusy || selectedIds.length === 0}
              onClick={() => void handleBulkArchive(selectedIds, exitSelection)}
            >
              <Archive className="mr-1 h-3.5 w-3.5" />
              {t('common.bulkArchive')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-destructive hover:text-destructive"
              disabled={bulkBusy || selectedIds.length === 0}
              onClick={() => setBulkDeleteIds(selectedIds)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t('common.bulkDelete')}
            </Button>
          </>
        )}
        renderItem={(skill, ctx) => (
          <SkillCard
            skill={skill}
            selectionMode={ctx.selectionMode}
            onSelectToggle={() => ctx.onToggle(!ctx.selected)}
          />
        )}
      />

      <SkillImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <BulkDeleteConfirmDialog
        ids={bulkDeleteIds}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteIds(null)
        }}
        onConfirm={() => void handleBulkDeleteConfirm()}
        isLoading={bulkBusy}
      />
    </>
  )
}
