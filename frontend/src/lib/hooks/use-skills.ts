import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { skillsApi } from '@/lib/api/skills'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import {
  CreateSkillRequest,
  ImportConfirmRequest,
  SkillFileMoveRequest,
  SkillFileUpsertRequest,
  SkillReplaceFilesRequest,
  UpdateSkillRequest,
} from '@/lib/types/skills'

export function useSkills(archived = false) {
  return useQuery({
    queryKey: [...QUERY_KEYS.skills, { archived }] as const,
    queryFn: () => skillsApi.list(archived),
  })
}

export function useSkill(id?: string, options?: { enabled?: boolean }) {
  const skillId = id ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.skill(skillId),
    queryFn: () => skillsApi.get(skillId),
    enabled: !!skillId && (options?.enabled ?? true),
  })
}

export function useSkillsCatalog(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QUERY_KEYS.skillsCatalog,
    queryFn: () => skillsApi.catalog(),
    enabled: options?.enabled ?? true,
  })
}

export function useCreateSkill() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateSkillRequest) => skillsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skills })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skillsCatalog })
      toast({
        title: t('common.success'),
        description: t('skills.createSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateSkill() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSkillRequest }) =>
      skillsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skills })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skill(id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skillsCatalog })
      toast({
        title: t('common.success'),
        description: t('skills.updateSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteSkill() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => skillsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skills })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skillsCatalog })
      toast({
        title: t('common.success'),
        description: t('skills.deleteSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useArchiveSkill() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived?: boolean }) =>
      skillsApi.archive(id, archived ?? true),
    onSuccess: (_, { id, archived }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skills })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skill(id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skillsCatalog })
      toast({
        title: t('common.success'),
        description: archived === false ? t('skills.unarchiveSuccess') : t('skills.archiveSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useImportSkillPreview() {
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (file: File) => skillsApi.importPreview(file),
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useImportSkillConfirm() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: ImportConfirmRequest) => skillsApi.importConfirm(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skills })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skillsCatalog })
      toast({
        title: t('common.success'),
        description: t('skills.importSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useUpsertSkillFile() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SkillFileUpsertRequest }) =>
      skillsApi.upsertFile(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skill(id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skills })
      toast({
        title: t('common.success'),
        description: t('skills.fileSaved'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useMoveSkillFile() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SkillFileMoveRequest }) =>
      skillsApi.moveFile(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skill(id) })
      toast({
        title: t('common.success'),
        description: t('skills.fileMoved'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteSkillFile() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, path }: { id: string; path: string }) =>
      skillsApi.deleteFile(id, path),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skill(id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skills })
      toast({
        title: t('common.success'),
        description: t('skills.fileDeleted'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useReplaceSkillFiles() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SkillReplaceFilesRequest }) =>
      skillsApi.replaceFiles(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skill(id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skills })
      toast({
        title: t('common.success'),
        description: t('skills.filesReplaced'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useValidateSkill() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => skillsApi.validate(id),
    onSuccess: (result, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.skill(id) })
      toast({
        title: result.valid ? t('common.success') : t('skills.validationFailed'),
        description: result.valid
          ? t('skills.validationPassed')
          : t('skills.validationIssues').replace('{count}', result.issues.length.toString()),
        variant: result.valid ? 'default' : 'destructive',
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useExportSkill() {
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => skillsApi.export(id),
    onSuccess: () => {
      toast({
        title: t('common.success'),
        description: t('skills.exportSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}
