"use client";

import Link from "next/link";

import { FeedBulkImport } from "@/components/feeds/feed-bulk-import";
import { Button } from "@/components/ui/button";

export default function FeedImportPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bulk Import</h1>
          <p className="text-sm text-muted-foreground">
            Paste a JSON payload to create multiple feeds at once. Review the summary to validate each
            entry.
          </p>
        </div>
        <Button asChild size="sm" className="w-full sm:w-auto">
          <Link href="/feeds">Back to feeds</Link>
        </Button>
      </div>
      <FeedBulkImport />
    </div>
  );
}


