import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { searchVendorImages } from "@/lib/scrape.functions";
import { ImageIcon, Search, Loader2 } from "lucide-react";

// Search the downloaded vendor-scrape images by name and attach one to an item.
// Scrape images already live in the inventory-media bucket, so onPick returns the
// storage path directly — attach it as the item's photo, no copy needed.
export function VendorImagePicker({
  initialQuery = "",
  onPick,
  triggerLabel = "Search vendor images",
}: {
  initialQuery?: string;
  onPick: (photoPath: string, previewUrl: string) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(initialQuery);
  const searchFn = useServerFn(searchVendorImages);

  const { data, isFetching } = useQuery({
    queryKey: ["vendor-image-search", q.trim()],
    queryFn: () => searchFn({ data: { q: q.trim() } }),
    enabled: open && q.trim().length >= 2,
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !q) setQ(initialQuery);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ImageIcon className="w-3.5 h-3.5 mr-1" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Attach a vendor image</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-8"
            placeholder="Search by name… e.g. Rainbow Hornet"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {q.trim().length < 2 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Type a coral name to search downloaded vendor images.
          </p>
        ) : isFetching && rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Searching…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No vendor images match “{q.trim()}”.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {rows.map((r: any) => (
              <button
                key={r.id}
                type="button"
                className="group rounded-md border overflow-hidden text-left hover:border-primary"
                onClick={() => {
                  onPick(r.photoPath, r.url);
                  setOpen(false);
                }}
              >
                <img
                  src={r.url}
                  alt={r.title}
                  className="w-full aspect-square object-cover bg-muted"
                  loading="lazy"
                />
                <div className="px-2 py-1 text-[11px] truncate group-hover:text-primary">
                  {r.title}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
