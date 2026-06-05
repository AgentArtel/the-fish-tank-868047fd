import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { schemaFor, type AttrField } from "@/lib/item-type-attrs";
import { Sparkles } from "lucide-react";

/**
 * Per-item-type attribute editor.
 *
 * Renders a schema-driven form for the JSONB `attrs` column on inventory_items
 * (or vendor_line_items). The schema is driven by `itemType` — adding new
 * fields is a code-only change to src/lib/item-type-attrs.ts.
 */
export function AttrsEditor({
  itemType,
  value,
  onSave,
  saving,
}: {
  itemType?: string | null;
  value: Record<string, any> | null | undefined;
  onSave: (next: Record<string, any>) => Promise<void> | void;
  saving?: boolean;
}) {
  const groups = schemaFor(itemType);
  const [local, setLocal] = useState<Record<string, any>>(value ?? {});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocal(value ?? {});
    setDirty(false);
  }, [value, itemType]);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold">Per-type details</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Set an item type to enable per-type fields (care level, lighting, brand, etc.).
        </p>
      </div>
    );
  }

  const update = (key: string, v: any) => {
    setLocal((prev) => {
      const next = { ...prev };
      if (v === "" || v === null || v === undefined) delete next[key];
      else next[key] = v;
      return next;
    });
    setDirty(true);
  };

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold">Per-type details</h2>
        </div>
        <Button size="sm" disabled={!dirty || !!saving} onClick={async () => { await onSave(local); setDirty(false); }}>
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </Button>
      </div>

      {groups.map((g) => (
        <div key={g.label} className="space-y-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{g.label}</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {g.fields.map((f) => (
              <FieldInput key={f.key} field={f} value={local[f.key]} onChange={(v) => update(f.key, v)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: AttrField; value: any; onChange: (v: any) => void }) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm cursor-pointer mt-5">
        <Checkbox checked={!!value} onCheckedChange={(v) => onChange(!!v)} />
        <span>{field.label}</span>
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <div className="space-y-1">
        <Label className="text-xs">{field.label}</Label>
        <Select value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__clear__" onSelect={(e) => { e.preventDefault(); onChange(null); }}>—</SelectItem>
            {(field.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label className="text-xs">{field.label}</Label>
      <Input
        className="h-9"
        type={field.type === "number" ? "number" : "text"}
        step={field.type === "number" ? "any" : undefined}
        value={value ?? ""}
        placeholder={field.placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (field.type === "number") onChange(v === "" ? null : Number(v));
          else onChange(v);
        }}
      />
      {field.help && <p className="text-[11px] text-muted-foreground">{field.help}</p>}
    </div>
  );
}
