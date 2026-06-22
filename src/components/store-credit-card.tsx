import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wallet, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/hooks/use-me";
import {
  getStoreCredit,
  grantStoreCredit,
  redeemStoreCredit,
  adjustStoreCredit,
} from "@/lib/store-credit.functions";
import { fmtMoney } from "@/lib/ops";

const money = (cents: number) => fmtMoney(cents / 100);

type LedgerRow = {
  id: string;
  kind: string;
  amountCents: number;
  source: string | null;
  reason: string | null;
  createdAt: string;
};

// grants/refund_reversals add; redeems subtract; adjust can go either way.
const ADDS = (kind: string) => kind === "grant" || kind === "refund_reversal";
const KIND_LABELS: Record<string, string> = {
  grant: "Credit added",
  redeem: "Redeemed",
  adjust: "Adjustment",
  refund_reversal: "Refund credit",
};
const SOURCE_LABELS: Record<string, string> = {
  trade_in: "trade-in",
  return: "return",
  refund: "refund",
  manual: "manual",
  goodwill: "goodwill",
};

export function StoreCreditCard({ customerId }: { customerId: string }) {
  const qc = useQueryClient();
  const me = useMe();
  const roles = me.data?.roles ?? [];
  const canManage = roles.some((r) => r === "admin" || r === "dev" || r === "floor_staff");
  const isAdmin = roles.some((r) => r === "admin" || r === "dev");

  const fn = useServerFn(getStoreCredit);
  const { data, isLoading } = useQuery({
    queryKey: ["store-credit", customerId],
    queryFn: () => fn({ data: { customerId } }),
    enabled: canManage,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["store-credit", customerId] });
    qc.invalidateQueries({ queryKey: ["customer", customerId] });
  };

  // Floor staff (and above) gate the whole card — store credit is owed money;
  // customers/anonymous viewers never see it.
  if (!canManage) return null;

  if (isLoading || !data) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="w-4 h-4" /> Loading store credit…
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <Wallet className="w-4 h-4 text-emerald-600" />
        <h2 className="text-sm font-semibold">Store credit</h2>
        <span className="ml-auto text-xs text-muted-foreground">Owed balance</span>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Balance</div>
          <div className="text-3xl font-semibold tabular-nums mt-1">{money(data.balanceCents)}</div>
        </div>

        {data.ledger.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
              Activity
            </div>
            <div className="space-y-1.5">
              {data.ledger.slice(0, 6).map((r: LedgerRow) => {
                const adds = ADDS(r.kind) || (r.kind === "adjust" && r.amountCents > 0);
                return (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 min-w-0 truncate">
                      {KIND_LABELS[r.kind] ?? r.kind}
                      {r.source && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {SOURCE_LABELS[r.source] ?? r.source}
                        </span>
                      )}
                      {r.reason ? (
                        <span className="text-muted-foreground"> · {r.reason}</span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                    <span
                      className={`tabular-nums font-medium ${
                        adds
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {adds ? "+" : "−"}
                      {money(Math.abs(r.amountCents))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <ManageCreditForm
          customerId={customerId}
          balanceCents={data.balanceCents}
          isAdmin={isAdmin}
          onDone={refresh}
        />
      </div>
    </section>
  );
}

type Action = "grant" | "redeem" | "adjust";

function ManageCreditForm({
  customerId,
  balanceCents,
  isAdmin,
  onDone,
}: {
  customerId: string;
  balanceCents: number;
  isAdmin: boolean;
  onDone: () => void;
}) {
  const grantFn = useServerFn(grantStoreCredit);
  const redeemFn = useServerFn(redeemStoreCredit);
  const adjustFn = useServerFn(adjustStoreCredit);

  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action>("grant");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<"trade_in" | "return" | "refund" | "manual" | "goodwill">(
    "trade_in",
  );
  const [adjustDir, setAdjustDir] = useState<"add" | "remove">("add");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const dollars = parseFloat(amount);
    if (!isFinite(dollars) || dollars <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    const cents = Math.round(dollars * 100);
    if (action === "redeem" && cents > balanceCents) {
      toast.error(`Balance is only ${money(balanceCents)}`);
      return;
    }
    if (action === "adjust" && !reason.trim()) {
      toast.error("Adjustments require a reason");
      return;
    }
    setSaving(true);
    try {
      if (action === "grant") {
        await grantFn({
          data: { customerId, amountCents: cents, source, reason: reason.trim() || undefined },
        });
        toast.success("Store credit added");
      } else if (action === "redeem") {
        await redeemFn({
          data: { customerId, amountCents: cents, reason: reason.trim() || undefined },
        });
        toast.success("Redemption recorded");
      } else {
        // Admin adjustment: signed amount — "remove" debits (overdraw-checked in the RPC).
        const signed = adjustDir === "remove" ? -cents : cents;
        await adjustFn({ data: { customerId, amountCents: signed, reason: reason.trim() } });
        toast.success("Adjustment recorded");
      }
      setAmount("");
      setReason("");
      setOpen(false);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not record entry");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="border-t pt-3">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Manage store credit
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t pt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">Action</Label>
          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v as Action);
              setReason("");
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grant">Add credit</SelectItem>
              <SelectItem value="redeem">Redeem</SelectItem>
              {isAdmin && <SelectItem value="adjust">Adjust / write-off</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Amount ($)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-9"
          />
        </div>
      </div>

      {action === "grant" && (
        <div className="grid gap-1.5">
          <Label className="text-xs">Source</Label>
          <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trade_in">Trade-in</SelectItem>
              <SelectItem value="return">Return</SelectItem>
              <SelectItem value="refund">Refund</SelectItem>
              <SelectItem value="goodwill">Goodwill</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {action === "adjust" && (
        <div className="grid gap-1.5">
          <Label className="text-xs">Direction</Label>
          <Select value={adjustDir} onValueChange={(v) => setAdjustDir(v as "add" | "remove")}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="add">Add credit</SelectItem>
              <SelectItem value="remove">Remove credit (write-off)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label className="text-xs">Note {action === "adjust" ? "(required)" : "(optional)"}</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            action === "grant"
              ? "e.g. traded in 3 frags"
              : action === "redeem"
                ? "e.g. applied to checkout"
                : "e.g. dormant-account write-off"
          }
          className="h-9"
        />
      </div>

      {action === "adjust" && (
        <p className="text-[11px] text-muted-foreground">
          Adjustments are admin-only and auditable. Use a write-off to debit a dormant or settled
          balance — large corrections should be rare.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
          Record
        </Button>
      </div>
    </div>
  );
}
