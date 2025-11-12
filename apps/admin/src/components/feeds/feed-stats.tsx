import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Feed } from "@/lib/api/types";

type FeedStatsProps = {
  feeds: Feed[] | undefined;
};

export function FeedStats({ feeds }: FeedStatsProps) {
  const activeFeeds = feeds?.filter((feed) => feed.isActive).length ?? 0;
  const pendingFeeds =
    feeds?.filter((feed) => feed.lastFetchStatus === "fetching").length ?? 0;
  const warningFeeds =
    feeds?.filter((feed) => feed.lastFetchStatus === "warning").length ?? 0;
  const errorFeeds =
    feeds?.filter((feed) => feed.lastFetchStatus === "error").length ?? 0;

  const totalArticles =
    feeds?.reduce((sum, feed) => sum + feed.stats.articleCount, 0) ?? 0;

  const cards = [
    {
      title: "Active feeds",
      value: activeFeeds,
      description: `${feeds?.length ?? 0} feeds total`
    },
    {
      title: "Currently fetching",
      value: pendingFeeds,
      description: "Feeds running ingestion jobs right now"
    },
    {
      title: "Warnings",
      value: warningFeeds,
      description: "Feeds with non-blocking issues"
    },
    {
      title: "Errors",
      value: errorFeeds,
      description: "Feeds needing attention"
    },
    {
      title: "Articles ingested",
      value: totalArticles,
      description: "Total articles across all feeds"
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">
              {card.value}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {card.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

