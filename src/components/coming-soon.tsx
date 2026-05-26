import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";

export function ComingSoon({
  title,
  description,
  bullets,
  footnote,
}: {
  title: string;
  description: string;
  bullets: string[];
  footnote?: string;
}) {
  return (
    <div className="p-8 max-w-3xl">
      <PageHeader title={title} description={description} action={<Badge variant="secondary">Coming soon</Badge>} />
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
          Planned capabilities
        </h2>
        <ul className="space-y-2 text-sm">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {footnote && (
          <p className="mt-5 pt-4 border-t text-xs text-muted-foreground leading-relaxed">{footnote}</p>
        )}
      </div>
    </div>
  );
}
