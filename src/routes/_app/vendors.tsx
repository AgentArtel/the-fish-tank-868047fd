import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/vendors")({ component: VendorsPage });

function VendorsPage() {
  return (
    <ComingSoon
      title="Vendors"
      description="Track the wholesalers and suppliers behind every shipment."
      bullets={[
        "Wholesalers",
        "Vendor contacts",
        "Invoice / order history",
        "Shipment records",
      ]}
    />
  );
}
