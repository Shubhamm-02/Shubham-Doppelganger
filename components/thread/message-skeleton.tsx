import { Skeleton } from "@/components/ui/skeleton";

function UserBlock({ width }: { width: string }) {
  return (
    <div className="flex justify-end">
      <Skeleton className={`h-10 rounded-lg ${width}`} />
    </div>
  );
}

function AssistantBlock({ lines }: { lines: string[] }) {
  return (
    <div className="flex flex-col gap-3 py-1">
      {lines.map((width, index) => (
        <Skeleton key={index} className={`h-3 ${width}`} />
      ))}
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="flex animate-fade-in flex-col gap-8" aria-busy="true">
      <span className="sr-only">Loading conversation</span>
      <UserBlock width="w-[min(17rem,72%)]" />
      <AssistantBlock lines={["w-[94%]", "w-[86%]", "w-[52%]"]} />
      <UserBlock width="w-[min(11rem,48%)]" />
      <AssistantBlock lines={["w-[90%]", "w-[96%]", "w-[78%]", "w-[34%]"]} />
    </div>
  );
}
