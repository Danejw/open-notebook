'use client'

import { ListRowsSkeleton } from '@/components/common/LoadingSkeletons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { EpisodeProfile } from '@/lib/types/podcasts'

export interface EpisodeSettingsPanelProps {
  isLoading: boolean
  episodeProfiles: EpisodeProfile[]
  episodeProfileId: string
  onEpisodeProfileIdChange: (value: string) => void
  selectedEpisodeProfile?: EpisodeProfile
  episodeName: string
  onEpisodeNameChange: (value: string) => void
  instructions: string
  onInstructionsChange: (value: string) => void
}

export function EpisodeSettingsPanel({
  isLoading,
  episodeProfiles,
  episodeProfileId,
  onEpisodeProfileIdChange,
  selectedEpisodeProfile,
  episodeName,
  onEpisodeNameChange,
  instructions,
  onInstructionsChange,
}: EpisodeSettingsPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t('podcasts.episodeSettings')}
      </h3>
      {isLoading ? (
        <ListRowsSkeleton rows={3} withHeader={false} />
      ) : episodeProfiles.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          {t('podcasts.noProfilesFound')}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="episode_profile">{t('podcasts.episodeProfile')}</Label>
            <Select
              value={episodeProfileId}
              onValueChange={onEpisodeProfileIdChange}
              disabled={episodeProfiles.length === 0}
            >
              <SelectTrigger id="episode_profile">
                <SelectValue
                  placeholder={t('podcasts.episodeProfilePlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {episodeProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedEpisodeProfile && (
              <p className="text-xs text-muted-foreground">
                {t('podcasts.usesSpeakerProfile')}{' '}
                <strong>{selectedEpisodeProfile.speaker_config}</strong>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="episode_name">{t('podcasts.episodeName')}</Label>
            <Input
              id="episode_name"
              name="episode_name"
              value={episodeName}
              onChange={(event) => onEpisodeNameChange(event.target.value)}
              placeholder={t('podcasts.episodeNamePlaceholder')}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">
              {t('podcasts.additionalInstructions')}
            </Label>
            <Textarea
              id="instructions"
              name="instructions"
              placeholder={t('podcasts.instructionsPlaceholder')}
              value={instructions}
              onChange={(event) => onInstructionsChange(event.target.value)}
              className="min-h-[100px] text-xs"
              autoComplete="off"
            />
          </div>
        </div>
      )}
    </div>
  )
}
