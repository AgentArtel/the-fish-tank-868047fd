import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { ReefClubCard } from "@/components/reef-club-card";
import { getCustomer } from "@/lib/customers.functions";
import { fmtMoney, ITEM_TYPE_LABELS, type ItemType } from "@/lib/ops";
import { ArrowLeft, Mail, Phone } from "lucide-react";

export const Route = createFileRoute("/_app/customers/$id")({ component: CustomerDetail });

const money = (cents: number) => fmtMoney(cents / 100);
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CustomerDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getCustomer);
  const { data, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => fn({ data: { id } }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-8 text-muted-foreground">Customer not found.</div>;

  const c = data.customer;

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">
      <Link
        to="/customers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> All customers
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{c.name}</h1>
          {c.marketingConsent && <Badge variant="outline">opted in</Badge>}
        </div>
        <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
          {c.email && (
            <span className="inline-flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> {c.email}
            </span>
          )}
          {c.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" /> {c.phone}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            Lifetime spend
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">
            {money(data.lifetimeSpendCents)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Orders</div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{data.orderCount}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">First seen</div>
          <div className="text-sm font-medium mt-2">
            {c.firstSeenAt ? new Date(c.firstSeenAt).toLocaleDateString() : "—"}
          </div>
        </div>
      </div>

      <ReefClubCard customerId={id} />

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Purchase history
        </h2>
        <div className="rounded-lg border bg-card divide-y">
          {data.history.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No purchases recorded yet.</p>
          ) : (
            data.history.map((h: any) => (
              <div key={h.id} className="flex items-center gap-3 p-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{h.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDateTime(h.soldAt)}
                    {h.itemType
                      ? ` · ${ITEM_TYPE_LABELS[h.itemType as ItemType] ?? h.itemType}`
                      : ""}
                  </div>
                </div>
                {h.kind !== "sale" && (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-amber-700 dark:text-amber-300"
                  >
                    {h.kind}
                  </Badge>
                )}
                <div className="text-right tabular-nums">
                  <div>{money(h.totalCents)}</div>
                  <div className="text-xs text-muted-foreground">{h.qty}u</div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
