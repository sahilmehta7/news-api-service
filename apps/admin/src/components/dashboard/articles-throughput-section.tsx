import Link from "next/link";
import { ArrowUpRight, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { DashboardSnapshot } from "@/lib/dashboard/types";

type ArticlesThroughputSectionProps = {
  articles: DashboardSnapshot["articles"];
};

export function ArticlesThroughputSection({
  articles
}: ArticlesThroughputSectionProps) {
  const summary = [
    {
      label: "Articles ingested",
      value: formatNumber(articles.ingested),
      description: "New items fetched in the selected window"
    },
    {
      label: "Articles enriched",
      value: formatNumber(articles.enriched),
      description: "Successfully enriched items"
    },
    {
      label: "Pending enrichment",
      value: formatNumber(articles.pendingEnrichment),
      description: "Backlog awaiting enrichment",
      accent: articles.pendingEnrichment > 0 ? "text-amber-600" : undefined
    }
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold">
            Article throughput
          </CardTitle>
          <CardDescription>
            Processing volume and enrichment backlog.
          </CardDescription>
        </div>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {summary.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-border/80 p-4"
            >
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`mt-2 text-2xl font-semibold ${item.accent ?? ""}`}>
                {item.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Top languages
          </p>
          {articles.topLanguages.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No language distribution available for this window.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {articles.topLanguages.map((item) => (
                <li
                  key={item.language}
                  className="flex items-center justify-between rounded-lg border border-muted px-3 py-2 text-sm"
                >
                  <span className="font-medium uppercase text-muted-foreground">
                    {item.language}
                  </span>
                  <span>{formatNumber(item.count)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/dashboard/articles"
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Explore articles
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

