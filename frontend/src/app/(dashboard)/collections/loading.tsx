import { ListRowsSkeleton } from '@/components/common/LoadingSkeletons'

export default function CollectionsLoading() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <ListRowsSkeleton rows={5} />
    </div>
  )
}
