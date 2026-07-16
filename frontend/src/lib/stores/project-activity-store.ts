import { create } from 'zustand'

interface ProjectActivityState {
  /** Artifact IDs already observed for a project (baseline + seen). */
  knownArtifactIdsByProject: Record<string, string[]>
  /** Artifact IDs that appeared after the baseline and have not been opened. */
  unseenArtifactIdsByProject: Record<string, string[]>
  chatUnreadByProject: Record<string, boolean>
  chatViewingByProject: Record<string, boolean>
  artifactsViewingByProject: Record<string, boolean>

  /**
   * Sync the current artifact ID list for a project.
   * First observation establishes a baseline (no unseen marks).
   * Later new IDs are marked unseen.
   */
  syncArtifactIds: (projectId: string, artifactIds: string[]) => void
  markArtifactSeen: (projectId: string, artifactId: string) => void
  hasUnseenArtifacts: (projectId: string) => boolean
  isArtifactUnseen: (projectId: string, artifactId: string) => boolean

  setChatUnread: (projectId: string, unread: boolean) => void
  clearChatUnread: (projectId: string) => void
  isChatUnread: (projectId: string) => boolean

  setChatViewing: (projectId: string, viewing: boolean) => void
  setArtifactsViewing: (projectId: string, viewing: boolean) => void
  isChatViewing: (projectId: string) => boolean
  isArtifactsViewing: (projectId: string) => boolean

  /** Call when an assistant response finishes; sets unread if chat is not viewing. */
  notifyAssistantResponseComplete: (projectId: string) => void
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)))
}

export const useProjectActivityStore = create<ProjectActivityState>((set, get) => ({
  knownArtifactIdsByProject: {},
  unseenArtifactIdsByProject: {},
  chatUnreadByProject: {},
  chatViewingByProject: {},
  artifactsViewingByProject: {},

  syncArtifactIds: (projectId, artifactIds) => {
    if (!projectId) return
    const ids = uniqueIds(artifactIds)
    const state = get()
    const known = state.knownArtifactIdsByProject[projectId]

    if (known === undefined) {
      set({
        knownArtifactIdsByProject: {
          ...state.knownArtifactIdsByProject,
          [projectId]: ids,
        },
        unseenArtifactIdsByProject: {
          ...state.unseenArtifactIdsByProject,
          [projectId]: [],
        },
      })
      return
    }

    const knownSet = new Set(known)
    const unseenSet = new Set(state.unseenArtifactIdsByProject[projectId] ?? [])
    const nextKnown = uniqueIds([...known, ...ids])
    let changed = nextKnown.length !== known.length

    for (const id of ids) {
      if (!knownSet.has(id)) {
        unseenSet.add(id)
        changed = true
      }
    }

    if (!changed) return

    set({
      knownArtifactIdsByProject: {
        ...state.knownArtifactIdsByProject,
        [projectId]: nextKnown,
      },
      unseenArtifactIdsByProject: {
        ...state.unseenArtifactIdsByProject,
        [projectId]: Array.from(unseenSet),
      },
    })
  },

  markArtifactSeen: (projectId, artifactId) => {
    if (!projectId || !artifactId) return
    set((state) => {
      const unseen = state.unseenArtifactIdsByProject[projectId] ?? []
      if (!unseen.includes(artifactId)) return state
      return {
        unseenArtifactIdsByProject: {
          ...state.unseenArtifactIdsByProject,
          [projectId]: unseen.filter((id) => id !== artifactId),
        },
      }
    })
  },

  hasUnseenArtifacts: (projectId) => {
    const unseen = get().unseenArtifactIdsByProject[projectId]
    return Boolean(unseen && unseen.length > 0)
  },

  isArtifactUnseen: (projectId, artifactId) => {
    const unseen = get().unseenArtifactIdsByProject[projectId]
    return Boolean(unseen?.includes(artifactId))
  },

  setChatUnread: (projectId, unread) => {
    if (!projectId) return
    set((state) => ({
      chatUnreadByProject: {
        ...state.chatUnreadByProject,
        [projectId]: unread,
      },
    }))
  },

  clearChatUnread: (projectId) => {
    if (!projectId) return
    set((state) => {
      if (!state.chatUnreadByProject[projectId]) return state
      return {
        chatUnreadByProject: {
          ...state.chatUnreadByProject,
          [projectId]: false,
        },
      }
    })
  },

  isChatUnread: (projectId) => Boolean(get().chatUnreadByProject[projectId]),

  setChatViewing: (projectId, viewing) => {
    if (!projectId) return
    set((state) => {
      const next: Partial<ProjectActivityState> = {
        chatViewingByProject: {
          ...state.chatViewingByProject,
          [projectId]: viewing,
        },
      }
      if (viewing && state.chatUnreadByProject[projectId]) {
        next.chatUnreadByProject = {
          ...state.chatUnreadByProject,
          [projectId]: false,
        }
      }
      return next
    })
  },

  setArtifactsViewing: (projectId, viewing) => {
    if (!projectId) return
    set((state) => ({
      artifactsViewingByProject: {
        ...state.artifactsViewingByProject,
        [projectId]: viewing,
      },
    }))
  },

  isChatViewing: (projectId) => Boolean(get().chatViewingByProject[projectId]),

  isArtifactsViewing: (projectId) =>
    Boolean(get().artifactsViewingByProject[projectId]),

  notifyAssistantResponseComplete: (projectId) => {
    if (!projectId) return
    if (get().isChatViewing(projectId)) return
    get().setChatUnread(projectId, true)
  },
}))
