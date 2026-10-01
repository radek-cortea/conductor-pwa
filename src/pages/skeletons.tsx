import { Skeleton } from "@/ui/skeleton";

export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function TranscriptSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-4" aria-busy="true">
      <span className="sr-only">Loading transcript</span>
      <Skeleton className="h-16 w-3/4" />
      <Skeleton className="ml-auto h-12 w-1/2" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
