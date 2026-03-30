import { Skeleton } from "@/shared/ui/skeleton";

const CARD_COUNT = 6;

const PageSkeleton = () => (
  <div className="min-h-screen bg-background">
    <div className="border-b border-border">
      <div className="bg-foreground/90 text-background">
        <div className="container mx-auto flex flex-col items-center justify-center gap-2 px-4 py-2 sm:flex-row">
          <Skeleton className="h-3 w-44 rounded-full bg-background/15" />
          <Skeleton className="h-3 w-32 rounded-full bg-background/15" />
        </div>
      </div>
      <div className="container mx-auto flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <Skeleton className="h-7 w-40 rounded-full" />
        <div className="hidden items-center gap-4 md:flex">
          <Skeleton className="h-3 w-12 rounded-full" />
          <Skeleton className="h-3 w-12 rounded-full" />
          <Skeleton className="h-3 w-12 rounded-full" />
          <Skeleton className="h-3 w-12 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>
    </div>

    <main className="pt-24 sm:pt-28">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div className="space-y-4">
            <Skeleton className="h-3 w-28 rounded-full" />
            <Skeleton className="h-10 w-72 rounded-full" />
            <Skeleton className="h-4 w-60 rounded-full" />
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-10 w-36 rounded-full" />
              <Skeleton className="h-10 w-28 rounded-full" />
            </div>
          </div>
          <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: CARD_COUNT }).map((_, index) => (
            <div key={`skeleton-card-${index}`} className="space-y-3">
              <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
              <Skeleton className="h-4 w-3/4 rounded-full" />
              <Skeleton className="h-4 w-1/2 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </main>
  </div>
);

export default PageSkeleton;
