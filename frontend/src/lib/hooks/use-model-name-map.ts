import { useMemo } from 'react'
import { useModels } from '@/lib/hooks/use-models'

/**
 * Returns a map from model id → "provider / name" display string.
 * Shared by SpeakerProfilesPanel and EpisodeProfilesPanel.
 */
export function useModelNameMap(): Record<string, string> {
  const { data: models = [] } = useModels()

  return useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of models) {
      map[m.id] = `${m.provider} / ${m.name}`
    }
    return map
  }, [models])
}
