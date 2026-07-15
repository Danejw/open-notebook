'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { ArtifactCard } from './ArtifactCard'
import { EmptyState } from '@/components/common/EmptyState'
import { ListRowsSkeleton } from '@/components/common/LoadingSkeletons'
import { Wand2 } from 'lucide-react'
import { Artifact } from '@/lib/types/artifacts'
import { ArtifactEditorDialog } from './ArtifactEditorDialog'
import { useTranslation } from '@/lib/hooks/use-translation'

interface ArtifactsListProps {
  artifacts: Artifact[] | undefined
  isLoading: boolean
  onPlayground?: (artifact: Artifact) => void
}

export function ArtifactsList({ artifacts, isLoading, onPlayground }: ArtifactsListProps) {
  const { t } = useTranslation()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingArtifact, setEditingArtifact] = useState<Artifact | undefined>()

  const handleOpenEditor = (artifact?: Artifact) => {
    setEditingArtifact(artifact)
    setEditorOpen(true)
  }

  if (isLoading) {
    return <ListRowsSkeleton rows={4} />
  }

  if (!artifacts || artifacts.length === 0) {
    return (
      <EmptyState
        icon={Wand2}
        title={t('artifacts.noArtifacts')}
        description={t('artifacts.createOne')}
        action={
          <Button size="sm" className="h-7 text-xs" onClick={() => handleOpenEditor()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('artifacts.createNew')}
          </Button>
        }
      />
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border">
        <div className="flex items-center justify-between border-b px-3 py-1.5">
          <h2 className="text-sm font-semibold leading-none">{t('artifacts.listTitle')}</h2>
          <Button size="sm" className="h-7 text-xs" onClick={() => handleOpenEditor()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('artifacts.createNew')}
          </Button>
        </div>

        <div className="divide-y">
          {artifacts.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
              artifact={artifact}
              onPlayground={onPlayground ? () => onPlayground(artifact) : undefined}
              onEdit={() => handleOpenEditor(artifact)}
            />
          ))}
        </div>
      </div>

      <ArtifactEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) {
            setEditingArtifact(undefined)
          }
        }}
        artifact={editingArtifact}
      />
    </>
  )
}
