"use client";

import * as React from "react";
import { AlertTriangle, Copy, ExternalLink, Info, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { Article } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { retryArticleEnrichment } from "@/lib/api/articles";
import { toast } from "sonner";

type ArticleDetailProps = {
  article: Article | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => void;
};

export function ArticleDetail({
  article,
  open,
  onOpenChange,
  onRefresh
}: ArticleDetailProps) {
  const [copied, setCopied] = React.useState(false);
  const [isRetrying, setIsRetrying] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setCopied(false);
      setIsRetrying(false);
    }
  }, [open]);

  const enrichmentStatus = article?.enrichmentStatus ?? "pending";

  async function handleCopyUrl() {
    if (!article?.sourceUrl) return;
    try {
      await navigator.clipboard.writeText(article.sourceUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  async function handleRetryEnrichment() {
    if (!article) return;
    try {
      setIsRetrying(true);
      await retryArticleEnrichment(article.id);
      toast.success("Enrichment re-queued");
      onRefresh?.();
      if (article) {
        onOpenChange(false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to retry enrichment";
      console.error("Retry enrichment failed", error);
      toast.error(message);
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex max-w-xl flex-1 flex-col gap-4 overflow-y-auto">
        {article ? (
          <>
            <SheetHeader className="space-y-3 text-left">
              <SheetTitle className="text-lg leading-tight">{article.title}</SheetTitle>
              <div className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{article.feedName}</Badge>
                  {article.feedCategory ? (
                    <Badge variant="secondary">{article.feedCategory}</Badge>
                  ) : null}
                  <StatusChip status={enrichmentStatus} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {article.publishedAt ? `Published ${formatDate(article.publishedAt)} · ` : null}
                  Fetched {formatDate(article.fetchedAt)}
                </div>
              </div>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              <Button variant="default" size="sm" onClick={() => window.open(article.sourceUrl, "_blank")}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open article
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyUrl}>
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copied" : "Copy URL"}
              </Button>
              {article.enrichmentStatus === "failed" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRetryEnrichment}
                  disabled={isRetrying}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  {isRetrying ? "Retrying..." : "Retry enrichment"}
                </Button>
              ) : null}
            </div>

            <div className="h-px w-full bg-border" />

            <section className="space-y-2">
              <SectionTitle>Summary</SectionTitle>
              <p className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
                {article.summary ?? "No summary available."}
              </p>
            </section>

            <section className="grid gap-3">
              <SectionTitle>Metadata</SectionTitle>
              <MetadataGrid article={article} />
            </section>

            <section className="grid gap-3">
              <SectionTitle>Enrichment Signals</SectionTitle>
              <JsonViewer label="Open Graph" data={article.openGraph} />
              <JsonViewer label="Twitter Card" data={article.twitterCard} />
              <JsonViewer label="Custom Metadata" data={article.metadata} />
            </section>

            <section className="grid gap-3">
              <SectionTitle>Debugging Aids</SectionTitle>
              <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="mb-2 flex items-center gap-2 font-medium text-foreground">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Troubleshooting
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Validate the feed entry on the source URL above.</li>
                  <li>
                    Review recent fetch attempts in the{" "}
                    <a className="underline" href={`/logs?feedId=${article.feedId}`}>
                      logs view
                    </a>
                    .
                  </li>
                  <li>
                    Check enrichment worker metrics for elevated failure rates on the{" "}
                    <a className="underline" href={`/metrics?feedId=${article.feedId}`}>
                      metrics dashboard
                    </a>
                    .
                  </li>
                </ul>
              </div>
              {article.enrichmentStatus === "failed" ? (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
                  <p className="mb-2 flex items-center gap-2 font-medium">
                    <Info className="h-4 w-4" />
                    Enrichment Failure Context
                  </p>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-[11px]">
                    {article.errorMessage ?? "Unknown error"}
                  </pre>
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select an article to view details.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({ children }: React.PropsWithChildren) {
  return <h2 className="text-sm font-semibold uppercase text-muted-foreground">{children}</h2>;
}

function MetadataGrid({ article }: { article: Article }) {
  const items = [
    { label: "Author", value: article.author ?? "Unknown" },
    {
      label: "Language",
      value: article.language ?? "—"
    },
    { label: "Keywords", value: article.keywords.join(", ") || "—" },
    {
      label: "Reading time",
      value: article.readingTimeSeconds ? `${Math.round(article.readingTimeSeconds / 60)} min` : "—"
    },
    { label: "Word count", value: article.wordCount ?? "—" },
    { label: "Content type", value: article.contentType ?? "—" }
  ];

  return (
    <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border bg-muted/10 p-3">
          <dt className="font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-sm text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function JsonViewer({
  label,
  data
}: {
  label: string;
  data: Record<string, unknown> | null | undefined;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">{label}</div>
      {data && Object.keys(data).length > 0 ? (
        <pre className="max-h-[200px] overflow-auto rounded-md bg-muted/30 p-3 text-[11px] leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <div className="text-xs text-muted-foreground">No data captured.</div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variants: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
    processing: "bg-sky-100 text-sky-700",
    pending: "bg-amber-100 text-amber-700"
  };

  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[normalized] ?? "bg-muted/80 text-muted-foreground"
      )}
    >
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

