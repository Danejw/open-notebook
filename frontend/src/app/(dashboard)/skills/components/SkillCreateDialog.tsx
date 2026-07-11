'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateSkill } from '@/lib/hooks/use-skills'
import { useTranslation } from '@/lib/hooks/use-translation'

interface SkillCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function buildDefaultSkillMd(name: string, description: string) {
  return `---
name: ${name}
description: ${description || 'Describe what this skill does and when to use it.'}
---

# ${name}

Instructions for the agent go here.
`
}

export function SkillCreateDialog({ open, onOpenChange }: SkillCreateDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const nameId = useId()
  const descriptionId = useId()
  const tagsId = useId()
  const createSkill = useCreateSkill()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')

  useEffect(() => {
    if (!open) {
      setName('')
      setDescription('')
      setTagsInput('')
    }
  }, [open])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    const skill = await createSkill.mutateAsync({
      name: trimmedName,
      description: description.trim(),
      tags,
      status: 'draft',
      files: [
        {
          path: 'SKILL.md',
          filename: 'SKILL.md',
          content: buildDefaultSkillMd(trimmedName, description.trim()),
          encoding: 'utf-8',
          mime_type: 'text/markdown',
          size_bytes: 0,
          required: true,
        },
      ],
    })

    onOpenChange(false)
    router.push(`/skills/${skill.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('skills.create')}</DialogTitle>
          <DialogDescription>{t('skills.createDesc')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={nameId}>{t('common.name')}</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('skills.namePlaceholder')}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={descriptionId}>{t('common.description')}</Label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('skills.descriptionPlaceholder')}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={tagsId}>{t('skills.tags')}</Label>
            <Input
              id={tagsId}
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t('skills.tagsPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || createSkill.isPending}>
              {createSkill.isPending ? t('common.saving') : t('skills.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
