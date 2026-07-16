'use client'

import { AlertTriangle, Users } from 'lucide-react'

import { EpisodeProfile, SpeakerProfile, needsModelSetup } from '@/lib/types/podcasts'
import {
  useDeleteEpisodeProfile,
  useDuplicateEpisodeProfile,
} from '@/lib/hooks/use-podcasts'
import { EpisodeProfileFormDialog } from '@/components/podcasts/forms/EpisodeProfileFormDialog'
import { ProfileCardActions } from '@/components/podcasts/ProfileCardActions'
import { ProfilePanelFrame } from '@/components/podcasts/ProfilePanelFrame'
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
  const deleteProfile = useDeleteEpisodeProfile()
  const duplicateProfile = useDuplicateEpisodeProfile()
  const modelNameMap = useModelNameMap()

  const disableCreate = speakerProfiles.length === 0

  return (
    <ProfilePanelFrame
      profiles={episodeProfiles}
      header={{
        title: t('podcasts.episodeProfilesTitle'),
        description: t('podcasts.episodeProfilesDesc'),
        buttonLabel: t('podcasts.createProfile'),
        disabled: disableCreate,
      }}
      banner={
        disableCreate ? (
          <p className="rounded-lg border border-dashed bg-amber-50 p-4 text-sm text-amber-900">
            {t('podcasts.createSpeakerFirst')}
          </p>
        ) : null
      }
      emptyState={{
        icon: Users,
        title: t('podcasts.noEpisodeProfiles'),
        className: 'rounded-lg bg-muted/30 p-10',
      }}
      deleteDialog={{
        title: t('podcasts.deleteProfileTitle'),
        getDescription: (profile) =>
          t('podcasts.deleteProfileDesc').replace('{name}', profile.name),
        confirmText: t('podcasts.delete'),
      }}
      onDelete={(profile) => deleteProfile.mutate(profile.id)}
      isDeletePending={deleteProfile.isPending}
      onDuplicate={(profile) => duplicateProfile.mutate(profile.id)}
      isDuplicatePending={duplicateProfile.isPending}
      renderCard={(profile, actions) => {
        const speakerSummary = findSpeakerSummary(
          speakerProfiles,
          profile.speaker_config
        )
        const unconfigured = needsModelSetup(profile)

        return (
          <Card className="shadow-sm">
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
                onEdit={actions.onEdit}
                onDuplicate={actions.onDuplicate}
                onRequestDelete={actions.onRequestDelete}
                isDuplicating={actions.isDuplicating}
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
      }}
      renderCreateDialog={({ open, onOpenChange }) => (
        <EpisodeProfileFormDialog
          mode="create"
          open={open}
          onOpenChange={onOpenChange}
          speakerProfiles={speakerProfiles}
        />
      )}
      renderEditDialog={({ profile, onOpenChange }) => (
        <EpisodeProfileFormDialog
          mode="edit"
          open={Boolean(profile)}
          onOpenChange={onOpenChange}
          speakerProfiles={speakerProfiles}
          initialData={profile ?? undefined}
        />
      )}
    />
  )
}
