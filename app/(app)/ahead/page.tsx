import { Suspense } from "react";
import { AheadScreen } from "@/components/ahead/ahead-screen";
import { AheadSkeleton } from "@/components/ahead/ahead-skeleton";

export default function AheadPage() {
  return (
    <Suspense fallback={<AheadSkeleton />}>
      <AheadScreen />
    </Suspense>
  );
}
