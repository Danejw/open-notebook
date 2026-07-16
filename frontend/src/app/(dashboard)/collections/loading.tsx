import { pageContentClassName } from '@/components/layout/PageHeader'
import { ListRowsSkeleton } from '@/components/common/LoadingSkeletons'

export default function CollectionsLoading() {
  return (
    <div className={`flex-1 overflow-y-auto ${pageContentClassName}`}>
      <ListRowsSkeleton rows={5} />
    </div>
  )
}
