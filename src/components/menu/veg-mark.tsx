import { cn } from "@/lib/utils";

/** FSSAI-style veg/non-veg mark: green square+dot = veg, red = non-veg. */
export function VegMark({ isVeg, className }: { isVeg: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
      title={isVeg ? "Vegetarian" : "Non-vegetarian"}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border-2",
        isVeg ? "border-success" : "border-destructive",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", isVeg ? "bg-success" : "bg-destructive")} />
    </span>
  );
}
