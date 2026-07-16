/** @deprecated Import from @/lib/utils/project-artifact-query-cache instead */
export {
  patchAllProjectArtifactListQueries as patchAllNoteListQueries,
  removeProjectArtifactFromAllQueries as removeNoteFromAllQueries,
  prependProjectArtifactToProjectQuery as prependNoteToProjectQuery,
  snapshotProjectArtifactListQueries as snapshotNoteListQueries,
  restoreProjectArtifactListQueries as restoreNoteListQueries,
  buildOptimisticProjectArtifact as buildOptimisticNote,
} from '@/lib/utils/project-artifact-query-cache'
