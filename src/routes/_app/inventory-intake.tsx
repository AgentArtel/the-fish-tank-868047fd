import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/inventory-intake")({ component: InventoryIntakePage });

function InventoryIntakePage() {
  return (
    <ComingSoon
      title="Inventory Intake"
      description="Receive vendor shipments and turn them into approved inventory records."
      bullets={[
        "Vendor shipments",
        "Invoice batches",
        "Uploaded PDFs",
        "Shipment line items",
        "Approval into inventory records",
      ]}
      footnote="Future Clover integration: approved product and inventory records may later sync to Clover. No Clover API calls, OAuth, tokens, webhooks, or sync logic are active in this version."
    />
  );
}
