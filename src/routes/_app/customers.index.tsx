import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listCustomers } from "@/lib/customers.functions";
import { fmtMoney } from "@/lib/ops";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_app/customers/")({ component: CustomersPage });

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CustomersPage() {
  const fn = useServerFn(listCustomers);
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["customers", q],
    queryFn: () => fn({ data: { q: q || undefined } }),
  });
  const rows = data?.rows ?? [];

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Customers"
        description="People who've bought from you, captured from Clover sales. Walk-ins with no customer attached aren't listed."
      />
      <div className="flex gap-2 mb-4 items-center">
        <Input
          placeholder="Search name, email, phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-xs text-muted-foreground">{rows.length} customers</span>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Customer</th>
              <th className="p-3">Contact</th>
              <th className="p-3 text-right">Lifetime spend</th>
              <th className="p-3 text-right">Orders</th>
              <th className="p-3">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c: any) => (
              <tr key={c.id} className="border-t hover:bg-muted/30">
                <td className="p-3">
                  <Link
                    to="/customers/$id"
                    params={{ id: c.id }}
                    className="font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                  {c.marketingConsent && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      opted in
                    </Badge>
                  )}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {c.email || c.phone || "—"}
                </td>
                <td className="p-3 text-right tabular-nums font-medium">
                  {fmtMoney(c.lifetimeSpendCents / 100)}
                </td>
                <td className="p-3 text-right tabular-nums">{c.orderCount}</td>
                <td className="p-3 text-xs text-muted-foreground">{fmtDate(c.lastPurchaseAt)}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10">
                  <div className="flex flex-col items-center text-center gap-3">
                    <Users className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <div className="font-medium">No customers yet</div>
                      <div className="text-sm text-muted-foreground max-w-md">
                        Customers appear here once a Clover sale is attached to one. Run "Sync sales
                        now" in Settings → Clover to pull them in. Most walk-in sales are anonymous.
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
