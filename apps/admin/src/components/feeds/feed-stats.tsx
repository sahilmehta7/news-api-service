import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeedListResponse } from "@/lib/api/types";

type FeedStatsProps = {
  summary: FeedListResponse["summary"] | undefined;
};

const formatNumber = new Intl.NumberFormat("en-US").format;

export function FeedStats({ summary }: FeedStatsProps) {
  const totalFeeds = summary?.totalFeeds ?? 0;
  const activeFeeds = summary?.activeFeeds ?? 0;
  const inactiveFeeds = summary?.inactiveFeeds ?? 0;
  const issueFeeds = summary?.issueFeeds ?? 0;
  const totalArticles = summary?.totalArticles ?? 0;

  const issueRate =
    totalFeeds > 0 ? Math.round((issueFeeds / totalFeeds) * 100) : 0;
  const activeRate =
    totalFeeds > 0 ? Math.round((activeFeeds / totalFeeds) * 100) : 0;

  const cards = [
    {
      title: "Feeds onboarded",
      value: formatNumber(totalFeeds),
      description: `${activeRate}% active`
    },
    {
      title: "Active feeds",
      value: formatNumber(activeFeeds),
      description: `${formatNumber(inactiveFeeds)} inactive`
    },
    {
      title: "Feeds with issues",
      value: formatNumber(issueFeeds),
      description: `${issueRate}% require attention`
    },
    {
      title: "Inactive feeds",
      value: formatNumber(inactiveFeeds),
      description: "Paused or muted sources"
    },
    {
      title: "Articles ingested",
      value: formatNumber(totalArticles),
      description: "Across current filter scope"
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

