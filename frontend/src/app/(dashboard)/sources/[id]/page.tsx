'use client'

import { useRouter, useParams } from 'next/navigation'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { useNavigation } from '@/lib/hooks/use-navigation'
import { SourceDetailContent } from '@/components/source/SourceDetailContent'

export default function SourceDetailPage() {
  const router = useRouter()
  const params = useParams()
  const sourceId = params?.id ? decodeURIComponent(params.id as string) : ''
  const navigation = useNavigation()

  const handleBack = useCallback(() => {
    const returnPath = navigation.getReturnPath()
    router.push(returnPath)
    navigation.clearReturnTo()
  }, [navigation, router])

  return (
    <div className="flex flex-col h-screen">
      <div className="p-6 pb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {navigation.getReturnLabel()}
        </Button>
      </div>

      <div className="flex-1 overflow-hidden px-6">
        <div className="h-full overflow-y-auto px-4 pb-6">
          <SourceDetailContent
            sourceId={sourceId}
            onClose={handleBack}
          />
        </div>
      </div>
    </div>
  )
}
