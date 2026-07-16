'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export type ModalType = 'source' | 'note' | 'artifact'

function normalizeModalType(raw: string | null): ModalType | null {
  if (raw === 'source') return 'source'
  if (raw === 'note' || raw === 'artifact') return raw
  return null
}

export function isArtifactModalType(type: ModalType | null): boolean {
  return type === 'note' || type === 'artifact'
}

export function useModalManager() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const modalType = normalizeModalType(searchParams?.get('modal') ?? null)
  const modalId = searchParams?.get('id')

  /**
   * Open a modal by updating URL params without navigation
   * @param type - Type of modal to open (source, note, artifact)
   * @param id - ID of the content to display
   */
  const openModal = (type: ModalType, id: string) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('modal', type)
    params.set('id', id)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  /**
   * Close the currently open modal by removing modal params from URL
   */
  const closeModal = () => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.delete('modal')
    params.delete('id')
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return {
    modalType,
    modalId,
    openModal,
    closeModal,
    isOpen: !!modalType && !!modalId,
  }
}
