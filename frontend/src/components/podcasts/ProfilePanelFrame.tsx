'use client'

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { PodcastPanelHeader } from '@/components/podcasts/PodcastPanelHeader'

export interface ProfilePanelCardActions {
  onEdit: () => void
  onDuplicate: () => void
  onRequestDelete: () => void
  isDuplicating: boolean
}

export interface ProfilePanelFrameProps<TProfile extends { id: string; name: string }> {
  profiles: TProfile[]
  header: {
    title: string
    description: string
    buttonLabel: string
    disabled?: boolean
  }
  emptyState: {
    icon: LucideIcon
    title: string
    className?: string
  }
  banner?: ReactNode
  deleteDialog: {
    title: string
    getDescription: (profile: TProfile) => string
    confirmText: string
    confirmVariant?: 'default' | 'destructive'
  }
  onDelete: (profile: TProfile) => void
  isDeletePending: boolean
  onDuplicate: (profile: TProfile) => void
  isDuplicatePending: boolean
  renderCard: (profile: TProfile, actions: ProfilePanelCardActions) => ReactNode
  renderCreateDialog: (props: {
    open: boolean
    onOpenChange: (open: boolean) => void
  }) => ReactNode
  renderEditDialog: (props: {
    profile: TProfile | null
    onOpenChange: (open: boolean) => void
  }) => ReactNode
}

export function ProfilePanelFrame<TProfile extends { id: string; name: string }>({
  profiles,
  header,
  emptyState,
  banner,
  deleteDialog,
  onDelete,
  isDeletePending,
  onDuplicate,
  isDuplicatePending,
  renderCard,
  renderCreateDialog,
  renderEditDialog,
}: ProfilePanelFrameProps<TProfile>) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editProfile, setEditProfile] = useState<TProfile | null>(null)
  const [profileToDelete, setProfileToDelete] = useState<TProfile | null>(null)

  const sortedProfiles = useMemo(
    () => [...profiles].sort((a, b) => a.name.localeCompare(b.name, 'en')),
    [profiles]
  )

  const cardActionsFor = (profile: TProfile): ProfilePanelCardActions => ({
    onEdit: () => setEditProfile(profile),
    onDuplicate: () => onDuplicate(profile),
    onRequestDelete: () => setProfileToDelete(profile),
    isDuplicating: isDuplicatePending,
  })

  return (
    <div className="space-y-3">
      <PodcastPanelHeader
        title={header.title}
        description={header.description}
        buttonLabel={header.buttonLabel}
        onCreate={() => setCreateOpen(true)}
        disabled={header.disabled}
      />

      {banner}

      {sortedProfiles.length === 0 ? (
        <EmptyState
          icon={emptyState.icon}
          title={emptyState.title}
          className={emptyState.className}
        />
      ) : (
        <div className="space-y-4">
          {sortedProfiles.map((profile) => (
            <Fragment key={profile.id}>
              {renderCard(profile, cardActionsFor(profile))}
            </Fragment>
          ))}
        </div>
      )}

      {renderCreateDialog({ open: createOpen, onOpenChange: setCreateOpen })}

      {renderEditDialog({
        profile: editProfile,
        onOpenChange: (open) => {
          if (!open) {
            setEditProfile(null)
          }
        },
      })}

      <ConfirmDialog
        open={!!profileToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setProfileToDelete(null)
          }
        }}
        title={deleteDialog.title}
        description={
          profileToDelete ? deleteDialog.getDescription(profileToDelete) : ''
        }
        confirmText={deleteDialog.confirmText}
        confirmVariant={deleteDialog.confirmVariant}
        isLoading={isDeletePending}
        onConfirm={() => {
          if (profileToDelete) {
            onDelete(profileToDelete)
          }
        }}
      />
    </div>
  )
}
