'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { WizardContainer, WizardStep } from '@/components/ui/wizard-container'
import { SourceTypeStep, parseAndValidateUrls } from '@/components/sources/steps/SourceTypeStep'
import { ProjectsStep } from '@/components/sources/steps/ProjectsStep'
import { ProcessingStep } from '@/components/sources/steps/ProcessingStep'
import {
  AddSourceProcessingView,
} from '@/components/sources/add-source/AddSourceProcessingView'
import {
  AddSourceWizardFooter,
} from '@/components/sources/add-source/AddSourceWizardFooter'
import {
  isAddSourceStepValid,
  resolveBatchMode,
} from '@/components/sources/add-source/batch'
import {
  createSourceSchema,
  MAX_BATCH_SIZE,
  type BatchProgress,
  type CreateSourceFormData,
  type ProcessingState,
} from '@/components/sources/add-source/schema'
import {
  submitBatchSources,
  submitSingleSource,
} from '@/components/sources/add-source/submit'
import { useProjects } from '@/lib/hooks/use-projects'
import { useCreateSource } from '@/lib/hooks/use-sources'
import { useSettings } from '@/lib/hooks/use-settings'
import { useTranslation } from '@/lib/hooks/use-translation'

interface AddSourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultprojectId?: string
}

export function AddSourceDialog({
  open,
  onOpenChange,
  defaultprojectId,
}: AddSourceDialogProps) {
  const { t } = useTranslation()

  const WIZARD_STEPS: readonly WizardStep[] = [
    { number: 1, title: t('sources.addSource') },
    { number: 2, title: t('navigation.projects') },
    { number: 3, title: t('navigation.process') },
  ]

  const [currentStep, setCurrentStep] = useState(1)
  const [processing, setProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<ProcessingState | null>(null)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(
    defaultprojectId ? [defaultprojectId] : []
  )
  const [urlValidationErrors, setUrlValidationErrors] = useState<
    { url: string; line: number }[]
  >([])
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const createSource = useCreateSource()
  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  const { data: settings } = useSettings()

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<CreateSourceFormData>({
    resolver: zodResolver(createSourceSchema),
    defaultValues: {
      projects: defaultprojectId ? [defaultprojectId] : [],
      embed: true,
      async_processing: true,
    },
  })

  useEffect(() => {
    if (settings) {
      reset({
        projects: defaultprojectId ? [defaultprojectId] : [],
        embed: true,
        async_processing: true,
      })
    }
  }, [settings, defaultprojectId, reset])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const selectedType = watch('type')
  const watchedUrl = watch('url')
  const watchedContent = watch('content')
  const watchedFile = watch('file')
  const watchedTitle = watch('title')

  const { isBatchMode, itemCount, parsedUrls, parsedFiles } = useMemo(
    () => resolveBatchMode(selectedType, watchedUrl, watchedFile),
    [selectedType, watchedUrl, watchedFile]
  )

  const isOverLimit = itemCount > MAX_BATCH_SIZE

  const isStepValid = (step: number): boolean =>
    isAddSourceStepValid({
      step,
      selectedType,
      watchedUrl,
      watchedContent,
      watchedFile,
      watchedTitle,
      isBatchMode,
      isOverLimit,
      urlValidationErrors,
      parsedUrls,
    })

  const handleNextStep = (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()

    if (currentStep === 1 && selectedType === 'link' && watchedUrl) {
      const { invalid } = parseAndValidateUrls(watchedUrl)
      if (invalid.length > 0) {
        setUrlValidationErrors(invalid)
        return
      }
      setUrlValidationErrors([])
    }

    if (currentStep < 3 && isStepValid(currentStep)) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleClearUrlErrors = () => {
    setUrlValidationErrors([])
  }

  const handlePrevStep = (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleStepClick = (step: number) => {
    if (step <= currentStep || (step === currentStep + 1 && isStepValid(currentStep))) {
      setCurrentStep(step)
    }
  }

  const handleProjectToggle = (projectId: string) => {
    const updated = selectedProjectIds.includes(projectId)
      ? selectedProjectIds.filter((id) => id !== projectId)
      : [...selectedProjectIds, projectId]
    setSelectedProjectIds(updated)
  }

  const handleClose = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    reset()
    setCurrentStep(1)
    setProcessing(false)
    setProcessingStatus(null)
    setSelectedProjectIds(defaultprojectId ? [defaultprojectId] : [])
    setUrlValidationErrors([])
    setBatchProgress(null)

    onOpenChange(false)
  }

  const onSubmit = async (data: CreateSourceFormData) => {
    try {
      setProcessing(true)

      if (isBatchMode) {
        setProcessingStatus({ message: t('sources.processingFiles') })
        const results = await submitBatchSources({
          data,
          selectedProjectIds,
          parsedUrls,
          parsedFiles,
          createSource,
          setBatchProgress,
        })

        if (results.failed === 0) {
          toast.success(
            t('sources.batchSuccess').replace('{count}', results.success.toString())
          )
        } else if (results.success === 0) {
          toast.error(
            t('sources.batchFailed').replace('{count}', results.failed.toString())
          )
        } else {
          toast.warning(
            t('sources.batchPartial')
              .replace('{success}', results.success.toString())
              .replace('{failed}', results.failed.toString())
          )
        }

        handleClose()
      } else {
        setProcessingStatus({ message: t('sources.submittingSource') })
        await submitSingleSource({
          data,
          selectedProjectIds,
          createSource,
        })
        handleClose()
      }
    } catch (error) {
      console.error('Error creating source:', error)
      setProcessingStatus({
        message: t('common.error'),
      })
      timeoutRef.current = setTimeout(() => {
        setProcessing(false)
        setProcessingStatus(null)
        setBatchProgress(null)
      }, 3000)
    }
  }

  if (processing) {
    return (
      <AddSourceProcessingView
        open={open}
        onClose={handleClose}
        processingStatus={processingStatus}
        batchProgress={batchProgress}
      />
    )
  }

  const currentStepValid = isStepValid(currentStep)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[70vh]">
        <DialogHeader>
          <DialogTitle>{t('sources.addNew')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="min-w-0">
          <WizardContainer
            currentStep={currentStep}
            steps={WIZARD_STEPS}
            onStepClick={handleStepClick}
            showSteps={false}
            className="border-0 rounded-none"
          >
            {currentStep === 1 && (
              <SourceTypeStep
                control={control}
                register={register}
                setValue={setValue}
                errors={errors}
                urlValidationErrors={urlValidationErrors}
                onClearUrlErrors={handleClearUrlErrors}
              />
            )}

            {currentStep === 2 && (
              <ProjectsStep
                projects={projects}
                selectedProjectIds={selectedProjectIds}
                onToggleProject={handleProjectToggle}
                loading={projectsLoading}
              />
            )}

            {currentStep === 3 && (
              <ProcessingStep
                control={control}
                settings={settings}
              />
            )}
          </WizardContainer>

          <AddSourceWizardFooter
            currentStep={currentStep}
            currentStepValid={currentStepValid}
            isPending={createSource.isPending}
            onClose={handleClose}
            onPrevStep={handlePrevStep}
            onNextStep={handleNextStep}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
