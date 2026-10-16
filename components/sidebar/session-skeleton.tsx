import { Skeleton } from "@/components/ui/skeleton";

const ROW_WIDTHS = ["w-[72%]", "w-[54%]", "w-[86%]", "w-[62%]", "w-[46%]", "w-[78%]", "w-[58%]"];

export function SessionSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading chats" className="flex flex-col px-2 pt-3">
      <div className="flex h-7 items-center px-2.5">
        <Skeleton className="h-2.5 w-12 bg-border!" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex h-9 items-center px-2.5 pointer-coarse:h-10">
          <Skeleton className={`h-3 bg-border! ${ROW_WIDTHS[index % ROW_WIDTHS.length]}`} />
        </div>
      ))}
    </div>
  );
}
