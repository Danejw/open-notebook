'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  useArchiveSkill,
  useDeleteSkill,
  useDeleteSkillFile,
  useExportSkill,
  useMoveSkillFile,
  useSkill,
  useUpdateSkill,
  useUpsertSkillFile,
  useValidateSkill,
} from '@/lib/hooks/use-skills'
import { ValidationResult } from '@/lib/types/skills'

/**
 * Skill detail page state, dirty tracking, and mutation handlers.
 */
export function useSkillDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const skillId = params.id

  const { data: skill, isLoading } = useSkill(skillId)
  const updateSkill = useUpdateSkill()
  const deleteSkill = useDeleteSkill()
  const archiveSkill = useArchiveSkill()
  const upsertFile = useUpsertSkillFile()
  const moveFile = useMoveSkillFile()
  const deleteFile = useDeleteSkillFile()
  const validateSkill = useValidateSkill()
  const exportSkill = useExportSkill()

  const nameId = useId()
  const descriptionId = useId()
  const tagsId = useId()
  const newFileId = useId()
  const renameFileId = useId()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [metadataDirty, setMetadataDirty] = useState(false)
  const [showDeleteSkill, setShowDeleteSkill] = useState(false)
  const [deleteFilePath, setDeleteFilePath] = useState<string | null>(null)
  const [createFileOpen, setCreateFileOpen] = useState(false)
  const [newFilePath, setNewFilePath] = useState('')
  const [renameFrom, setRenameFrom] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  useEffect(() => {
    if (!skill) return
    setName(skill.name)
    setDescription(skill.description || '')
    setTagsInput(skill.tags.join(', '))
    setMetadataDirty(false)
    setValidation(
      skill.validation_results && typeof skill.validation_results === 'object'
        ? (skill.validation_results as unknown as ValidationResult)
        : null
    )
  }, [skill])

  useEffect(() => {
    if (!skill || selectedPath) return
    if (skill.files.length === 0) return
    const skillMd = skill.files.find((file) => file.path === 'SKILL.md')
    setSelectedPath(skillMd?.path ?? skill.files[0].path)
  }, [skill, selectedPath])

  const selectedFile = useMemo(
    () => skill?.files.find((file) => file.path === selectedPath) ?? null,
    [skill, selectedPath]
  )

  useEffect(() => {
    if (!selectedFile) {
      setEditorContent('')
      setDirty(false)
      return
    }
    setEditorContent(selectedFile.content)
    setDirty(false)
  }, [selectedFile?.path, selectedFile?.content])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || metadataDirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty, metadataDirty])

  const selectFile = useCallback(
    (path: string) => {
      if (path === selectedPath) return
      if (dirty) {
        setPendingFilePath(path)
        setShowUnsavedDialog(true)
        return
      }
      setSelectedPath(path)
    },
    [dirty, selectedPath]
  )

  const handleDiscardUnsaved = () => {
    if (pendingFilePath !== null) {
      setSelectedPath(pendingFilePath)
      setPendingFilePath(null)
    }
    setShowUnsavedDialog(false)
  }

  const handleSaveMetadata = async () => {
    if (!skill) return
    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    await updateSkill.mutateAsync({
      id: skill.id,
      data: {
        name: name.trim(),
        description: description.trim(),
        tags,
      },
    })
    setMetadataDirty(false)
  }

  const handleSaveFile = async () => {
    if (!skill || !selectedPath) return
    await upsertFile.mutateAsync({
      id: skill.id,
      data: {
        path: selectedPath,
        content: editorContent,
        encoding: selectedFile?.encoding || 'utf-8',
        mime_type: selectedFile?.mime_type,
      },
    })
    setDirty(false)
  }

  const handleCreateFile = async () => {
    if (!skill || !newFilePath.trim()) return
    const path = newFilePath.trim().replace(/^\/+/, '')
    await upsertFile.mutateAsync({
      id: skill.id,
      data: {
        path,
        content: '',
        encoding: 'utf-8',
        mime_type: path.toLowerCase().endsWith('.md')
          ? 'text/markdown'
          : 'text/plain',
      },
    })
    setCreateFileOpen(false)
    setNewFilePath('')
    setSelectedPath(path)
  }

  const handleRenameFile = async () => {
    if (!skill || !renameFrom || !renameTo.trim()) return
    const toPath = renameTo.trim().replace(/^\/+/, '')
    await moveFile.mutateAsync({
      id: skill.id,
      data: { from_path: renameFrom, to_path: toPath },
    })
    setRenameFrom(null)
    setRenameTo('')
    setSelectedPath(toPath)
    setDirty(false)
  }

  const handleDeleteFile = async () => {
    if (!skill || !deleteFilePath) return
    await deleteFile.mutateAsync({ id: skill.id, path: deleteFilePath })
    if (selectedPath === deleteFilePath) {
      setSelectedPath(null)
    }
    setDeleteFilePath(null)
  }

  const handleValidate = async () => {
    if (!skill) return
    const result = await validateSkill.mutateAsync(skill.id)
    setValidation(result)
  }

  const handleArchive = async () => {
    if (!skill) return
    await archiveSkill.mutateAsync({ id: skill.id, archived: !skill.archived })
  }

  const handleDeleteSkill = async () => {
    if (!skill) return
    await deleteSkill.mutateAsync(skill.id)
    setShowDeleteSkill(false)
    router.push('/skills')
  }

  return {
    skill,
    isLoading,
    nameId,
    descriptionId,
    tagsId,
    newFileId,
    renameFileId,
    name,
    setName,
    description,
    setDescription,
    tagsInput,
    setTagsInput,
    selectedPath,
    editorContent,
    setEditorContent,
    dirty,
    setDirty,
    metadataDirty,
    setMetadataDirty,
    showDeleteSkill,
    setShowDeleteSkill,
    deleteFilePath,
    setDeleteFilePath,
    createFileOpen,
    setCreateFileOpen,
    newFilePath,
    setNewFilePath,
    renameFrom,
    setRenameFrom,
    renameTo,
    setRenameTo,
    validation,
    pendingFilePath,
    setPendingFilePath,
    showUnsavedDialog,
    setShowUnsavedDialog,
    updateSkill,
    deleteSkill,
    archiveSkill,
    upsertFile,
    moveFile,
    deleteFile,
    validateSkill,
    exportSkill,
    selectFile,
    handleDiscardUnsaved,
    handleSaveMetadata,
    handleSaveFile,
    handleCreateFile,
    handleRenameFile,
    handleDeleteFile,
    handleValidate,
    handleArchive,
    handleDeleteSkill,
  }
}

export type SkillDetailPageState = ReturnType<typeof useSkillDetailPage>
