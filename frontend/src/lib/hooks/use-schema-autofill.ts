import { useMutation } from '@tanstack/react-query'
import { autofillApi, type AutofillRequest, type AutofillResponse } from '@/lib/api/autofill'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'

export function useSchemaAutofill() {
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (request: AutofillRequest) => autofillApi.fromFiles(request),
    onSuccess: (result: AutofillResponse) => {
      const warningText =
        result.warnings.length > 0 ? ` ${result.warnings.slice(0, 2).join(' ')}` : ''
      toast({
        title: t('autofill.successTitle'),
        description: `${t('autofill.successDescription')}${warningText}`,
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('autofill.errorTitle'),
        description: getApiErrorMessage(error, t),
        variant: 'destructive',
      })
    },
  })
}
