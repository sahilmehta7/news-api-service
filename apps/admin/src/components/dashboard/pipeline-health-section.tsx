import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSnapshot } from "@/lib/dashboard/types";

type PipelineHealthSectionProps = {
  pipeline: DashboardSnapshot["pipeline"];
};

export function PipelineHealthSection({ pipeline }: PipelineHealthSectionProps) {
  const items = [
    {
      title: "Queue size",
      value: formatNumber(pipeline.queueSize),
      description: "Enrichment jobs waiting in queue"
    },
    {
      title: "Ingestion success",
      value: formatPercent(pipeline.ingestionSuccessRate),
      description: "Share of successful ingestion runs"
    },
    {
      title: "Ingestion failures",
      value: formatPercent(pipeline.ingestionFailureRate),
      description: "Share of failed ingestion runs",
      accent: pipeline.ingestionFailureRate > 0.05 ? "text-destructive" : undefined
    },
    {
      title: "Enrichment success",
      value: formatPercent(pipeline.enrichmentSuccessRate),
      description: "Share of successful enrichment attempts"
    },
    {
      title: "Enrichment failures",
      value: formatPercent(pipeline.enrichmentFailureRate),
      description: "Share of failed enrichment attempts",
      accent: pipeline.enrichmentFailureRate > 0.05 ? "text-destructive" : undefined
    }
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <Card key={item.title}>
          <CardHeader>
            <CardTitle className="text-base">{item.title}</CardTitle>
            <CardDescription>{item.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-semibold ${item.accent ?? ""}`}>{item.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

