'use client'

import { Image as ImageIcon } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { PickerDialogSkeleton } from '@/components/common/LoadingSkeletons'
import { MediaThumbnail } from '@/components/media/MediaThumbnail'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMediaAssets } from '@/lib/hooks/use-media'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { MediaAsset } from '@/lib/types/media'

type ImageLibraryPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (asset: MediaAsset) => void
  title?: string
}

/**
 * Modal grid for choosing a global media library image to insert or replace in HTML.
 */
export function ImageLibraryPicker({
  open,
  onOpenChange,
  onSelect,
  title,
}: ImageLibraryPickerProps) {
  const { t } = useTranslation()
  const { data: assets = [], isLoading } = useMediaAssets({ enabled: open })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? t('images.pickerTitle')}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-1 py-1">
          {isLoading ? (
            <PickerDialogSkeleton rows={4} />
          ) : assets.length === 0 ? (
            <EmptyState icon={ImageIcon} title={t('images.pickerEmpty')} />
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col overflow-hidden rounded-md border text-left transition-colors hover:border-primary"
                    onClick={() => {
                      onSelect(asset)
                      onOpenChange(false)
                    }}
                  >
                    <div className="flex h-24 items-center justify-center bg-muted/40 p-2">
                      <MediaThumbnail
                        mediaId={asset.id}
                        alt={asset.name}
                        className="max-h-full max-w-full"
                      />
                    </div>
                    <div className="border-t px-2 py-1.5">
                      <p className="truncate text-sm">{asset.name}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {asset.slug}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
