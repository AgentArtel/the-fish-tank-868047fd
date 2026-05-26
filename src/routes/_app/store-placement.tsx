import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/store-placement")({ component: StorePlacementPage });

function StorePlacementPage() {
  return (
    <ComingSoon
      title="Store Placement"
      description="Plan where products live in the store and what they still need before going live."
      bullets={[
        "Tank location",
        "Shelf / display placement",
        "Signage needs",
        "Photo / content needs",
        "Website readiness",
      ]}
    />
  );
}
