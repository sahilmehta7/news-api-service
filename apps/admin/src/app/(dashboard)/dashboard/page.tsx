import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const highlights = [
  {
    title: "Active Feeds",
    value: "—",
    description: "Feeds currently scheduled for ingestion."
  },
  {
    title: "Pending Articles",
    value: "—",
    description: "Articles awaiting metadata enrichment."
  },
  {
    title: "Fetch Success Rate",
    value: "—",
    description: "Successful ingestions in the last 24 hours."
  }
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Monitor feed health, enrichment throughput, and ingestion trends.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {highlights.map((item) => (
          <Card key={item.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tracking-tight">
                {item.value}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {item.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

