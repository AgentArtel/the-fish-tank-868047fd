import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtMoney, ITEM_TYPE_LABELS } from "@/lib/ops";
import {
  getUnlinkedCloverItems,
  linkCloverItem,
  createInventoryFromCloverLink,
  getCloverReviewSales,
  resolveReviewSaleEvent,
  getInStoreNotInClover,
} from "@/lib/clover.functions";
import {
  ArrowRight,
  Check,
  Link2,
  Loader2,
  Plus,
  AlertTriangle,
  RefreshCcw,
  Settings,
} from "lucide-react";

export const Route = createFileRoute("/_app/inventory/clover-reconcile")({
  component: CloverReconcilePage,
});

const centsToMoney = (c: number | null | undefined) =>
  c == null ? "—" : fmtMoney(Number(c) / 100);

function CloverReconcilePage() {
  const qc = useQueryClient();
  const unlinkedFn = useServerFn(getUnlinkedCloverItems);
  const salesFn = useServerFn(getCloverReviewSales);
  const gapsFn = useServerFn(getInStoreNotInClover);

  const links = useQuery({ queryKey: ["clover-unlinked"], queryFn: () => unlinkedFn() });
  const sales = useQuery({ queryKey: ["clover-review-sales"], queryFn: () => salesFn() });
  const gaps = useQuery({ queryKey: ["clover-gaps"], queryFn: () => gapsFn() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["clover-unlinked"] });
    qc.invalidateQueries({ queryKey: ["clover-review-sales"] });
    qc.invalidateQueries({ queryKey: ["clover-gaps"] });
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <PageHeader
        title="Clover reconcile"
        description="Keep the POS and your stock in sync: link Clover products to inventory so sales decrement, clear sales stuck in review, and spot in-store items Clover doesn't know about."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/clover">
              <Settings className="w-4 h-4 mr-1" /> Clover settings
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="link">
        <TabsList className="mb-4">
          <TabsTrigger value="link">
            Link products
            {links.data?.total ? <Badge className="ml-1.5">{links.data.total}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="sales">
            Sales
            {sales.data?.total ? <Badge className="ml-1.5">{sales.data.total}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="gaps">
            Gaps
            {gaps.data?.total ? (
              <Badge variant="secondary" className="ml-1.5">
                {gaps.data.total}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="link">
          <LinkProductsTab query={links} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="sales">
          <ReviewSalesTab query={sales} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="gaps">
          <GapsTab query={gaps} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

// ---------- Tab A: link unlinked Clover products ----------
function LinkProductsTab({ query, onChanged }: { query: any; onChanged: () => void }) {
  const linkFn = useServerFn(linkCloverItem);
  const createFn = useServerFn(createInventoryFromCloverLink);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (query.isLoading) return <Loading />;
  const rows = query.data?.rows ?? [];
  if (rows.length === 0)
    return (
      <Empty>
        <Check className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
        Every Clover product is linked. Sales for these items will decrement stock.
      </Empty>
    );

  const link = async (cloverItemId: string, inventoryItemId: string, label: string) => {
    setBusyId(cloverItemId);
    try {
      await linkFn({ data: { cloverItemId, inventoryItemId } });
      toast.success(`Linked to ${label}`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to link");
    } finally {
      setBusyId(null);
    }
  };

  const create = async (cloverItemId: string, name: string) => {
    setBusyId(cloverItemId);
    try {
      await createFn({ data: { cloverItemId } });
      toast.success(`Created draft item for "${name}"`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create item");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        These Clover products aren't tied to a workspace item, so their POS sales never decrement
        stock. Link each to the matching item, or create a draft for it.
      </p>
      {rows.map((r: any) => {
        const busy = busyId === r.cloverItemId;
        return (
          <div key={r.cloverItemId} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {r.cloverName || "(unnamed Clover item)"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Clover · {centsToMoney(r.cloverPriceCents)}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => create(r.cloverItemId, r.cloverName || "Clover item")}
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Create item
                  </>
                )}
              </Button>
            </div>
            {r.suggestions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No close match in inventory — create a draft, or link it from the item's page later.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {r.suggestions.map((s: any) => (
                  <li
                    key={s.inventoryItemId}
                    className="flex items-center gap-2 text-sm rounded-md border px-2.5 py-1.5"
                  >
                    <span className="flex-1 min-w-0 truncate">
                      {s.itemName}
                      <span className="text-muted-foreground">
                        {" "}
                        ·{" "}
                        {ITEM_TYPE_LABELS[s.itemType as keyof typeof ITEM_TYPE_LABELS] ??
                          s.itemType}
                        {s.retailPrice != null ? ` · ${fmtMoney(s.retailPrice)}` : ""}
                      </span>
                    </span>
                    <Badge variant="secondary" className="text-[10px] tabular-nums">
                      {Math.round(s.score * 100)}%
                    </Badge>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => link(r.cloverItemId, s.inventoryItemId, s.itemName)}
                    >
                      <Link2 className="w-3.5 h-3.5 mr-1" /> Link
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Tab B: resolve needs-review Clover sales ----------
function ReviewSalesTab({ query, onChanged }: { query: any; onChanged: () => void }) {
  const resolveFn = useServerFn(resolveReviewSaleEvent);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});

  if (query.isLoading) return <Loading />;
  const rows = query.data?.rows ?? [];
  if (rows.length === 0)
    return (
      <Empty>
        <Check className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
        No Clover sales waiting for review.
      </Empty>
    );

  const resolve = async (
    saleEventId: string,
    action: "apply" | "acknowledge",
    inventoryItemId?: string,
  ) => {
    setBusyId(saleEventId);
    try {
      const res = await resolveFn({ data: { saleEventId, action, inventoryItemId } });
      toast.success(
        action === "apply"
          ? res.stockMoved
            ? "Sale applied — stock decremented"
            : "Sale applied"
          : "Marked resolved",
      );
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to resolve");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        POS sales that couldn't be matched to a workspace item. Apply a sale to decrement its stock,
        or acknowledge a refund/void (no stock moves — per the no-auto-reverse policy).
      </p>
      {rows.map((r: any) => {
        const busy = busyId === r.id;
        const isSale = r.kind === "sale";
        const target = r.inventoryItemId ?? picked[r.id];
        return (
          <div key={r.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {r.cloverItemName || "(unnamed POS line)"}
                </div>
                <div className="text-xs text-muted-foreground">
                  ×{r.qty} · {centsToMoney(r.totalCents ?? r.unitPriceCents)}
                  {r.cloverOrderId ? ` · order ${r.cloverOrderId}` : ""}
                </div>
              </div>
              <Badge variant={isSale ? "default" : "outline"} className="capitalize shrink-0">
                {r.kind}
              </Badge>
            </div>

            {/* Already-linked target */}
            {r.linkedItemName && (
              <div className="text-xs mb-2">
                Item: <span className="font-medium">{r.linkedItemName}</span>
              </div>
            )}

            {/* Unmatched sale → pick a target from suggestions */}
            {isSale && !r.inventoryItemId && (
              <div className="mb-2">
                {r.suggestions.length === 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    No match found — link the Clover product on the Link tab first, then come back.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {r.suggestions.map((s: any) => (
                      <button
                        key={s.inventoryItemId}
                        onClick={() => setPicked((p) => ({ ...p, [r.id]: s.inventoryItemId }))}
                        className={`text-xs rounded-md border px-2 py-1 ${
                          picked[r.id] === s.inventoryItemId
                            ? "border-primary bg-primary/10"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        {s.itemName}{" "}
                        <span className="text-muted-foreground">{Math.round(s.score * 100)}%</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              {isSale && (
                <Button
                  size="sm"
                  disabled={busy || !target}
                  onClick={() => resolve(r.id, "apply", picked[r.id])}
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1" /> Apply (decrement)
                    </>
                  )}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => resolve(r.id, "acknowledge")}
              >
                {!isSale && <RefreshCcw className="w-3.5 h-3.5 mr-1" />}
                Acknowledge
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Tab C: in-store, not in Clover (read-only) ----------
function GapsTab({ query }: { query: any }) {
  if (query.isLoading) return <Loading />;
  const rows = query.data?.rows ?? [];
  if (rows.length === 0)
    return (
      <Empty>
        <Check className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
        Every sellable in-store item has a Clover link.
      </Empty>
    );

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <span>
          These sellable items have no Clover product linked — the POS can't ring them up, and any
          sale wouldn't decrement here. Add/link them in Clover, then they'll appear on the Link
          tab.
        </span>
      </div>
      <div className="rounded-lg border bg-card divide-y">
        {rows.map((r: any) => (
          <div key={r.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
            <Link
              to="/inventory/$id"
              params={{ id: r.id }}
              className="flex-1 min-w-0 truncate font-medium hover:underline"
            >
              {r.itemName}
            </Link>
            <span className="text-xs text-muted-foreground">
              {ITEM_TYPE_LABELS[r.itemType as keyof typeof ITEM_TYPE_LABELS] ?? r.itemType}
            </span>
            <span className="text-xs tabular-nums w-16 text-right">{fmtMoney(r.retailPrice)}</span>
            <Link
              to="/inventory/$id"
              params={{ id: r.id }}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
