'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Users } from 'lucide-react'

import { EmptyState } from '@/components/common/EmptyState'
import { EpisodeProfile, SpeakerProfile, needsModelSetup } from '@/lib/types/podcasts'
import {
  useDeleteEpisodeProfile,
  useDuplicateEpisodeProfile,
} from '@/lib/hooks/use-podcasts'
import { EpisodeProfileFormDialog } from '@/components/podcasts/forms/EpisodeProfileFormDialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { PodcastPanelHeader } from '@/components/podcasts/PodcastPanelHeader'
import { ProfileCardActions } from '@/components/podcasts/ProfileCardActions'
import { useModelNameMap } from '@/lib/hooks/use-model-name-map'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useTranslation } from '@/lib/hooks/use-translation'

interface EpisodeProfilesPanelProps {
  episodeProfiles: EpisodeProfile[]
  speakerProfiles: SpeakerProfile[]
}

function findSpeakerSummary(
  speakerProfiles: SpeakerProfile[],
  speakerName: string
) {
  return speakerProfiles.find((profile) => profile.name === speakerName)
}

export function EpisodeProfilesPanel({
  episodeProfiles,
  speakerProfiles,
}: EpisodeProfilesPanelProps) {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [editProfile, setEditProfile] = useState<EpisodeProfile | null>(null)
  const [profileToDelete, setProfileToDelete] = useState<EpisodeProfile | null>(null)

  const deleteProfile = useDeleteEpisodeProfile()
  const duplicateProfile = useDuplicateEpisodeProfile()
  const modelNameMap = useModelNameMap()

  const sortedProfiles = useMemo(
    () =>
      [...episodeProfiles].sort((a, b) => a.name.localeCompare(b.name, 'en')),
    [episodeProfiles]
  )

  const disableCreate = speakerProfiles.length === 0

  return (
    <div className="space-y-3">
      <PodcastPanelHeader
        title={t('podcasts.episodeProfilesTitle')}
        description={t('podcasts.episodeProfilesDesc')}
        buttonLabel={t('podcasts.createProfile')}
        onCreate={() => setCreateOpen(true)}
        disabled={disableCreate}
      />

      {disableCreate ? (
        <p className="rounded-lg border border-dashed bg-amber-50 p-4 text-sm text-amber-900">
          {t('podcasts.createSpeakerFirst')}
        </p>
      ) : null}

      {sortedProfiles.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('podcasts.noEpisodeProfiles')}
          className="rounded-lg bg-muted/30 p-10"
        />
      ) : (
        <div className="space-y-4">
          {sortedProfiles.map((profile) => {
            const speakerSummary = findSpeakerSummary(
              speakerProfiles,
              profile.speaker_config
            )
            const unconfigured = needsModelSetup(profile)

            return (
              <Card key={profile.id} className="shadow-sm">
                <CardHeader className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-semibold">
                        {profile.name}
                      </CardTitle>
                      {unconfigured ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {t('podcasts.setupRequired')}
                        </Badge>
                      ) : null}
                    </div>
                    <CardDescription className="text-sm text-muted-foreground">
                      {profile.description || t('podcasts.noDescription')}
                    </CardDescription>
                  </div>
                  <ProfileCardActions
                    onEdit={() => setEditProfile(profile)}
                    onDuplicate={() => duplicateProfile.mutate(profile.id)}
                    onRequestDelete={() => setProfileToDelete(profile)}
                    isDuplicating={duplicateProfile.isPending}
                  />
                </CardHeader>

                <CardContent className="space-y-4 text-sm">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('podcasts.outlineModel')}
                      </p>
                      <p className="text-foreground">
                        {profile.outline_llm
                          ? (modelNameMap[profile.outline_llm] ?? profile.outline_llm)
                          : (profile.outline_provider && profile.outline_model
                            ? `${profile.outline_provider} / ${profile.outline_model}`
                            : t('podcasts.notConfigured'))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('podcasts.transcriptModel')}
                      </p>
                      <p className="text-foreground">
                        {profile.transcript_llm
                          ? (modelNameMap[profile.transcript_llm] ?? profile.transcript_llm)
                          : (profile.transcript_provider && profile.transcript_model
                            ? `${profile.transcript_provider} / ${profile.transcript_model}`
                            : t('podcasts.notConfigured'))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('podcasts.segments')}
                      </p>
                      <p className="text-foreground">{profile.num_segments}</p>
                    </div>
                    {profile.language ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('podcasts.language')}
                        </p>
                        <p className="text-foreground">{profile.language}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('podcasts.speakerProfile')}
                      </p>
                      <div className="flex items-center gap-2 text-foreground">
                        <Users className="h-4 w-4" />
                        <span>{profile.speaker_config}</span>
                        {speakerSummary?.voice_model ? (
                          <Badge variant="outline" className="text-xs">
                            {modelNameMap[speakerSummary.voice_model] ?? speakerSummary.voice_model}
                          </Badge>
                        ) : speakerSummary?.tts_provider ? (
                          <Badge variant="outline" className="text-xs">
                            {speakerSummary.tts_provider} / {speakerSummary.tts_model}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {profile.default_briefing ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('podcasts.defaultBriefingTitle')}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {profile.default_briefing}
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <EpisodeProfileFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        speakerProfiles={speakerProfiles}
      />

      <EpisodeProfileFormDialog
        mode="edit"
        open={Boolean(editProfile)}
        onOpenChange={(open) => {
          if (!open) {
            setEditProfile(null)
          }
        }}
        speakerProfiles={speakerProfiles}
        initialData={editProfile ?? undefined}
      />

      <ConfirmDialog
        open={!!profileToDelete}
        onOpenChange={(open) => { if (!open) setProfileToDelete(null) }}
        title={t('podcasts.deleteProfileTitle')}
        description={profileToDelete ? t('podcasts.deleteProfileDesc').replace('{name}', profileToDelete.name) : ''}
        confirmText={t('podcasts.delete')}
        isLoading={deleteProfile.isPending}
        onConfirm={() => { if (profileToDelete) deleteProfile.mutate(profileToDelete.id) }}
      />
    </div>
  )
}
