import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PosLoading() {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <div className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>

      <Card className="hidden w-full shrink-0 lg:block lg:w-80">
        <CardHeader>
          <Skeleton className="h-5 w-16" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
          <Skeleton className="mt-2 h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
