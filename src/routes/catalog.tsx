import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useMemo, useState, useEffect } from "react";
import { getPublicCatalog } from "@/lib/catalog.functions";
import { ITEM_TYPES, ITEM_TYPE_LABELS, type ItemType, fmtMoney } from "@/lib/ops";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Search, Fish } from "lucide-react";

const searchSchema = z.object({
  location: z.string().uuid().optional(),
  descendants: z.union([z.literal("1"), z.literal("0"), z.boolean()]).optional()
    .transform((v) => v === "1" || v === true ? true : undefined),
  type: z.enum(ITEM_TYPES).optional(),
  q: z.string().max(200).optional(),
});

const catalogQueryOptions = (input: {
  search?: string; locationId?: string; descendants?: boolean; type?: ItemType;
}) => queryOptions({
  queryKey: ["public-catalog", input],
  queryFn: () => getPublicCatalog({ data: input }),
  staleTime: 30_000,
});

export const Route = createFileRoute("/catalog")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({
    location: search.location, descendants: search.descendants, type: search.type, q: search.q,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(catalogQueryOptions({
      locationId: deps.location, descendants: deps.descendants, type: deps.type, search: deps.q,
    })),
  head: () => ({
    meta: [
      { title: "Live Stock Catalog — The Fish Tank" },
      { name: "description", content: "Browse what's swimming, growing, and crawling at The Fish Tank right now. Live fish, corals, inverts, and more — updated in real time." },
      { property: "og:title", content: "Live Stock Catalog — The Fish Tank" },
      { property: "og:description", content: "Browse what's swimming, growing, and crawling at The Fish Tank right now." },
      { name: "twitter:title", content: "Live Stock Catalog — The Fish Tank" },
      { name: "twitter:description", content: "Browse what's in stock at The Fish Tank right now." },
    ],
  }),
  component: CatalogPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Catalog unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
});

function CatalogPage() {
  const { location: locationId, descendants, type, q } = Route.useSearch();
  const nav = useNavigate({ from: "/catalog" });
  const { data } = useSuspenseQuery(catalogQueryOptions({
    locationId, descendants, type, search: q,
  }));

  const [searchInput, setSearchInput] = useState(q ?? "");
  useEffect(() => { setSearchInput(q ?? ""); }, [q]);

  // Debounce search → URL
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = searchInput.trim();
      if ((trimmed || "") !== (q ?? "")) {
        nav({ search: (prev: any) => ({ ...prev, q: trimmed || undefined }) });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, q, nav]);

  const locationName = useMemo(
    () => data.locations.find((l) => l.id === locationId)?.name ?? null,
    [data.locations, locationId],
  );

  const setType = (v: string) => nav({ search: (prev: any) => ({ ...prev, type: v === "all" ? undefined : v }) });
  const clearLocation = () => nav({ search: (prev: any) => ({ ...prev, location: undefined, descendants: undefined }) });
  const clearType = () => nav({ search: (prev: any) => ({ ...prev, type: undefined }) });
  const toggleDescendants = () => nav({ search: (prev: any) => ({ ...prev, descendants: descendants ? undefined : true }) });
  const clearAll = () => nav({ search: {} });

  const hasFilters = !!locationId || !!type || !!q;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
          <div className="flex items-center gap-3">
            <Fish className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Live Stock Catalog</h1>
              <p className="text-sm text-muted-foreground">The Fish Tank — what's in store right now</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or scientific name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={type ?? "all"} onValueChange={setType}>
            <SelectTrigger className="sm:w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {ITEM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{ITEM_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <div className="flex gap-2 mb-4 items-center flex-wrap">
            <span className="text-xs text-muted-foreground">Filters:</span>
            {locationId && (
              <>
                <Badge variant="secondary" className="gap-1">
                  Location: {locationName ?? "…"}
                  {descendants && <span className="text-muted-foreground">+ sub-locations</span>}
                  <button onClick={clearLocation} className="ml-1 hover:text-destructive" aria-label="Clear location">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={toggleDescendants}>
                  {descendants ? "Exact location only" : "Include sub-locations"}
                </Button>
              </>
            )}
            {type && (
              <Badge variant="secondary" className="gap-1">
                {ITEM_TYPE_LABELS[type as ItemType]}
                <button onClick={clearType} className="ml-1 hover:text-destructive" aria-label="Clear type">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            <Button size="sm" variant="ghost" className="h-6 text-xs ml-auto" onClick={clearAll}>
              Clear all
            </Button>
          </div>
        )}

        <div className="text-xs text-muted-foreground mb-4">
          {data.items.length} item{data.items.length === 1 ? "" : "s"} in stock
        </div>

        {data.items.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 text-center">
            <Fish className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <div className="font-medium">No items match these filters</div>
            <p className="text-sm text-muted-foreground mt-1">
              Try clearing a filter, or check back soon — new arrivals land weekly.
            </p>
            {hasFilters && (
              <Button size="sm" variant="outline" className="mt-4" onClick={clearAll}>Clear filters</Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.items.map((item) => (
              <CatalogCard key={item.id} item={item} />
            ))}
          </div>
        )}

        <footer className="mt-12 pt-6 border-t text-center text-xs text-muted-foreground">
          Stock updates throughout the day. Stop by the shop or message us to hold an item.{" "}
          <Link to="/" className="underline hover:text-foreground">Staff sign in</Link>
        </footer>
      </main>
    </div>
  );
}

function CatalogCard({ item }: { item: any }) {
  return (
    <div className="group rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-square bg-muted overflow-hidden">
        <img
          src={item.photo_url}
          alt={item.item_name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>
      <div className="p-3">
        <div className="font-medium text-sm line-clamp-2">{item.item_name}</div>
        {item.scientific_name && (
          <div className="text-xs italic text-muted-foreground line-clamp-1">{item.scientific_name}</div>
        )}
        <div className="flex items-center justify-between mt-2">
          <div className="font-semibold text-sm">{fmtMoney(item.retail_price)}</div>
          {item.item_type && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {ITEM_TYPE_LABELS[item.item_type as ItemType]}
            </Badge>
          )}
        </div>
        {(item.size || item.location_name) && (
          <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
            {[item.size, item.location_name].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}
