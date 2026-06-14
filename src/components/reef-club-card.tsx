import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Waves, Plus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/hooks/use-me";
import { getCustomerLoyalty, recordLoyaltyEntry } from "@/lib/loyalty.functions";
import { fmtMoney } from "@/lib/ops";

const money = (cents: number) => fmtMoney(cents / 100);

type EntryKind = "bonus" | "redeem" | "doa" | "adjust";
type LedgerRow = {
  id: string;
  kind: string;
  amountCents: number;
  channel: string | null;
  reason: string | null;
  createdAt: string;
};
const KIND_LABELS: Record<string, string> = {
  earn: "Earned",
  bonus: "Bonus credit",
  redeem: "Redeemed",
  doa: "Arrive-Alive credit",
  adjust: "Adjustment",
  expire: "Expired",
};

export function ReefClubCard({ customerId }: { customerId: string }) {
  const qc = useQueryClient();
  const me = useMe();
  const isAdmin = (me.data?.roles ?? []).includes("admin");

  const fn = useServerFn(getCustomerLoyalty);
  const { data, isLoading } = useQuery({
    queryKey: ["customer-loyalty", customerId],
    queryFn: () => fn({ data: { id: customerId } }),
  });

  if (isLoading || !data) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Waves className="w-4 h-4" /> Loading Reef Club…
        </div>
      </section>
    );
  }

  const toNext = data.nextTier
    ? Math.max(0, data.nextTier.minAnnualCents - data.annualSpendCents)
    : 0;
  const progressPct = data.nextTier
    ? Math.min(100, Math.round((data.annualSpendCents / data.nextTier.minAnnualCents) * 100))
    : 100;

  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <Waves className="w-4 h-4 text-sky-600" />
        <h2 className="text-sm font-semibold">Reef Club</h2>
        {data.enrolled ? (
          <Badge
            variant="outline"
            className="ml-auto border-sky-400 text-sky-700 dark:text-sky-300"
          >
            {data.tier.name}
          </Badge>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">Not a member yet</span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {!data.enabled && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            The program isn't live yet — credit won't accrue on purchases until an admin enables it
            in Settings → Reef Club.
          </p>
        )}

        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Reef Credit</div>
            <div className="text-3xl font-semibold tabular-nums mt-1">
              {money(data.balanceCents)}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Earning <span className="font-medium text-foreground">{data.earnPercent}%</span>
            {data.tier.earnMultiplier !== 1 && (
              <>
                {" "}
                · {data.tier.name} {data.tier.earnMultiplier}×
              </>
            )}
          </div>
        </div>

        {data.nextTier ? (
          <div className="space-y-1">
            <Progress value={progressPct} className="h-2" />
            <div className="text-xs text-muted-foreground">
              {money(toNext)} more in rolling-year spend to reach{" "}
              <span className="font-medium text-foreground">{data.nextTier.name}</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Top tier reached 🐠</div>
        )}

        {data.tier.perks.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {data.tier.perks.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        )}

        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
            Reef Passport
          </div>
          {data.badges.length === 0 ? (
            <p className="text-xs text-muted-foreground">No coral types collected yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.badges.map((b) => (
                <Badge key={b.slug} variant="secondary" className="text-[11px]">
                  {b.label}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {data.ledger.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
              Activity
            </div>
            <div className="space-y-1.5">
              {data.ledger.slice(0, 6).map((r: LedgerRow) => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 min-w-0 truncate">
                    {KIND_LABELS[r.kind] ?? r.kind}
                    {r.channel === "live_sale" && (
                      <span className="text-sky-600 dark:text-sky-400"> · live sale</span>
                    )}
                    {r.reason ? <span className="text-muted-foreground"> · {r.reason}</span> : null}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                  <span
                    className={`tabular-nums font-medium ${
                      r.amountCents >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {r.amountCents >= 0 ? "+" : "−"}
                    {money(Math.abs(r.amountCents))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isAdmin && (
          <AdminCreditForm
            customerId={customerId}
            onDone={() => {
              qc.invalidateQueries({ queryKey: ["customer-loyalty", customerId] });
              qc.invalidateQueries({ queryKey: ["customer", customerId] });
            }}
          />
        )}
      </div>
    </section>
  );
}

function AdminCreditForm({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const recordFn = useServerFn(recordLoyaltyEntry);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EntryKind>("bonus");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState<"live_sale" | "in_store" | "online">("live_sale");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const dollars = parseFloat(amount);
    if (!isFinite(dollars) || dollars <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    setSaving(true);
    try {
      await recordFn({
        data: {
          customerId,
          kind,
          amountCents: Math.round(dollars * 100),
          channel: kind === "redeem" ? channel : undefined,
          reason: reason.trim() || undefined,
        },
      });
      toast.success(kind === "redeem" ? "Redemption recorded" : "Reef Credit added");
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
          <Plus className="w-4 h-4 mr-1" /> Manage Reef Credit
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t pt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">Action</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as EntryKind)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bonus">Add credit</SelectItem>
              <SelectItem value="redeem">Record redemption</SelectItem>
              <SelectItem value="doa">Arrive-Alive credit</SelectItem>
              <SelectItem value="adjust">Adjustment</SelectItem>
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

      {kind === "redeem" && (
        <div className="grid gap-1.5">
          <Label className="text-xs">Redeemed at</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="live_sale">Live sale auction</SelectItem>
              <SelectItem value="in_store">In store</SelectItem>
              <SelectItem value="online">Online</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label className="text-xs">Note (optional)</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={kind === "redeem" ? "e.g. won Bounce Mushroom — live sale" : "Reason"}
          className="h-9"
        />
      </div>

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
