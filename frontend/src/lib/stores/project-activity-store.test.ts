import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectActivityStore } from '@/lib/stores/project-activity-store'

describe('useProjectActivityStore', () => {
  beforeEach(() => {
    useProjectActivityStore.setState({
      knownArtifactIdsByProject: {},
      unseenArtifactIdsByProject: {},
      chatUnreadByProject: {},
      chatViewingByProject: {},
      artifactsViewingByProject: {},
    })
  })

  it('baselines artifact ids without marking unseen on first sync', () => {
    const store = useProjectActivityStore.getState()
    store.syncArtifactIds('project:1', ['a', 'b'])

    expect(store.hasUnseenArtifacts('project:1')).toBe(false)
    expect(useProjectActivityStore.getState().knownArtifactIdsByProject['project:1']).toEqual([
      'a',
      'b',
    ])
  })

  it('marks newly appeared artifact ids as unseen', () => {
    const store = useProjectActivityStore.getState()
    store.syncArtifactIds('project:1', ['a'])
    store.syncArtifactIds('project:1', ['a', 'b'])

    expect(useProjectActivityStore.getState().isArtifactUnseen('project:1', 'b')).toBe(true)
    expect(useProjectActivityStore.getState().hasUnseenArtifacts('project:1')).toBe(true)
  })

  it('clears unseen when an artifact is opened', () => {
    const store = useProjectActivityStore.getState()
    store.syncArtifactIds('project:1', [])
    store.syncArtifactIds('project:1', ['new'])
    store.markArtifactSeen('project:1', 'new')

    expect(useProjectActivityStore.getState().hasUnseenArtifacts('project:1')).toBe(false)
  })

  it('sets chat unread only when chat is not viewing', () => {
    const store = useProjectActivityStore.getState()
    store.setChatViewing('project:1', false)
    store.notifyAssistantResponseComplete('project:1')
    expect(useProjectActivityStore.getState().isChatUnread('project:1')).toBe(true)

    store.setChatViewing('project:1', true)
    expect(useProjectActivityStore.getState().isChatUnread('project:1')).toBe(false)

    store.notifyAssistantResponseComplete('project:1')
    expect(useProjectActivityStore.getState().isChatUnread('project:1')).toBe(false)
  })
})
