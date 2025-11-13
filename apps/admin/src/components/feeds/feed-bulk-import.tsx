import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Download, Sparkles, Eraser, ClipboardCheck } from "lucide-react";

import { bulkImportFeeds } from "@/lib/api/feeds";
import {
  type BulkImportResponse,
  type BulkImportResult,
  bulkImportPayloadSchema
} from "@/lib/api/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const SAMPLE_TEMPLATE = JSON.stringify(
  {
    feeds: [
      {
        name: "TechCrunch",
        url: "https://techcrunch.com/feed/",
        category: "Technology",
        tags: ["startups", "venture"]
      }
    ]
  },
  null,
  2
);

type ValidationState = {
  isValid: boolean;
  error: string | null;
};

export function FeedBulkImport() {
  const [input, setInput] = React.useState("");
  const [validation, setValidation] = React.useState<ValidationState>({
    isValid: true,
    error: null
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<BulkImportResponse | null>(null);

  React.useEffect(() => {
    if (!input.trim()) {
      setValidation({ isValid: true, error: null });
      return;
    }

    const handle = window.setTimeout(() => {
      try {
        JSON.parse(input);
        setValidation({ isValid: true, error: null });
      } catch (error) {
        setValidation({
          isValid: false,
          error: error instanceof Error ? error.message : "Invalid JSON"
        });
      }
    }, 300);

    return () => window.clearTimeout(handle);
  }, [input]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!input.trim()) {
      toast.error("Provide a JSON payload before importing.");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
      bulkImportPayloadSchema.parse(parsed);
    } catch (error) {
      setValidation({
        isValid: false,
        error: error instanceof Error ? error.message : "Invalid JSON"
      });
      toast.error("The JSON payload is invalid.");
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await bulkImportFeeds(parsed);
      setResult(response);
      announceSummary(response);
      toast.success("Bulk import completed. Review the summary below.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Bulk import failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFormat() {
    if (!input.trim()) {
      setInput(SAMPLE_TEMPLATE);
      toast.info("Inserted sample template.");
      return;
    }

    try {
      const parsed = JSON.parse(input);
      setInput(JSON.stringify(parsed, null, 2));
    } catch (error) {
      toast.error("Cannot format invalid JSON.");
    }
  }

  function handleInsertSample() {
    setInput(SAMPLE_TEMPLATE);
    toast.success("Sample JSON inserted.");
  }

  function handleClear() {
    setInput("");
    setResult(null);
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl">Bulk Import</CardTitle>
        <CardDescription>
          Paste a JSON payload containing the feeds you want to create. Each feed is validated
          individually—successes are created even if others fail.{" "}
          <Link
            href="/bulk-import-sample.json"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Download sample JSON
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleFormat}>
                <Sparkles className="mr-2 h-4 w-4" />
                Format or insert template
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleInsertSample}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Use sample payload
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={!input && !result}
              >
                <Eraser className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={SAMPLE_TEMPLATE}
              className="min-h-[280px] font-mono text-sm"
            />
            {validation.error ? (
              <p className="text-sm text-destructive">JSON error: {validation.error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Paste a payload following the feed creation schema. The request accepts either an
                object with a <code>feeds</code> array or a raw array of feed definitions.
              </p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting || !validation.isValid} className="w-full sm:w-auto">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing feeds…
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Import feeds
              </>
            )}
          </Button>
        </form>

        <p id="bulk-import-announcer" aria-live="polite" className="sr-only" />

        {result ? (
          <div className="mt-8 space-y-4">
            <ImportSummary summary={result.summary} />
            <ResultsTable results={result.results} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ImportSummary({ summary }: { summary: BulkImportResponse["summary"] }) {
  const statusColor =
    summary.overallStatus === "success"
      ? "bg-emerald-500/10 text-emerald-700"
      : summary.overallStatus === "failure"
        ? "bg-destructive/10 text-destructive"
        : "bg-amber-500/10 text-amber-700";

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Import summary
          </p>
          <p className="text-lg font-semibold">
            {summary.total} feed{summary.total === 1 ? "" : "s"} processed
          </p>
        </div>
        <span className={`inline-flex items-center rounded-md px-3 py-1 text-sm ${statusColor}`}>
          Overall: {formatStatus(summary.overallStatus)}
        </span>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
        <div className="space-y-1 rounded-md bg-muted/40 p-3">
          <dt className="text-muted-foreground">Succeeded</dt>
          <dd className="text-base font-semibold text-emerald-700">{summary.succeeded}</dd>
        </div>
        <div className="space-y-1 rounded-md bg-muted/40 p-3">
          <dt className="text-muted-foreground">Failed</dt>
          <dd className="text-base font-semibold text-destructive">{summary.failed}</dd>
        </div>
        <div className="space-y-1 rounded-md bg-muted/40 p-3">
          <dt className="text-muted-foreground">Skipped</dt>
          <dd className="text-base font-semibold text-amber-700">{summary.skipped}</dd>
        </div>
        <div className="space-y-1 rounded-md bg-muted/40 p-3">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="text-base font-semibold">{summary.total}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Need full diagnostics?{" "}
        <Link href="/logs" className="font-medium text-primary underline-offset-4 hover:underline">
          Review the Logs tab for the detailed import entry.
        </Link>
      </p>
    </div>
  );
}

function ResultsTable({ results }: { results: BulkImportResult[] }) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((item) => (
            <TableRow key={`${item.index}-${item.url}`}>
              <TableCell>{item.index + 1}</TableCell>
              <TableCell>{item.name}</TableCell>
              <TableCell className="break-all text-sm text-muted-foreground">{item.url}</TableCell>
              <TableCell>
                <Badge variant={badgeVariant(item.status)}>{formatStatus(item.status)}</Badge>
              </TableCell>
              <TableCell className="text-sm">
                {renderDetails(item)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function badgeVariant(status: BulkImportResult["status"]) {
  if (status === "success") return "default";
  if (status === "failure") return "destructive";
  return "secondary";
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function announceSummary(response: BulkImportResponse) {
  if (typeof window === "undefined") return;
  const { summary } = response;
  const message = `Bulk import ${summary.overallStatus.replaceAll("_", " ")}. ${
    summary.succeeded
  } succeeded, ${summary.failed} failed, ${summary.skipped} skipped.`;
  window.setTimeout(() => {
    const liveRegion = document.getElementById("bulk-import-announcer");
    if (liveRegion) {
      liveRegion.textContent = message;
    }
  }, 0);
}

function renderDetails(result: BulkImportResult) {
  if (result.reason) {
    return <span className="text-destructive">{result.reason}</span>;
  }

  if (result.validation?.isValid === false) {
    const statusInfo =
      typeof result.validation.statusCode === "number"
        ? ` (HTTP ${result.validation.statusCode})`
        : "";
    return (
      <span className="text-amber-700">
        Validation failed{statusInfo}
        {result.validation.error ? ` — ${result.validation.error}` : ""}
      </span>
    );
  }

  if (result.status === "success" && result.feed) {
    return <span className="text-muted-foreground">Created feed #{result.feed.id}</span>;
  }

  if (result.status === "skipped") {
    return <span className="text-muted-foreground">Already exists</span>;
  }

  return <span className="text-muted-foreground">—</span>;
}

