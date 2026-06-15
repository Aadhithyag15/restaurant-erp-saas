import { Skeleton } from "@/components/ui/skeleton";

export default function KotLoading() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }, (_, col) => (
        <div key={col} className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}
