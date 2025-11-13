"use client";

import * as React from "react";

import { LogFilters, type LogFiltersValue } from "@/components/logs/log-filters";
import { LogTable } from "@/components/logs/log-table";
import { LogDetail } from "@/components/logs/log-detail";
import { Pagination } from "@/components/ui/pagination";
import { useLogs, type LogsQuery } from "@/lib/api/logs";
import type { LogEntry } from "@/lib/api/types";

const DEFAULT_PAGE_SIZE = 25;

export default function LogsPage() {
  const [page, setPage] = React.useState(1);
  const [filters, setFilters] = React.useState<LogFiltersValue>({});
  const [selectedLog, setSelectedLog] = React.useState<LogEntry | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const query: LogsQuery = {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    ...sanitizeFilters(filters)
  };

  const { data, error, isLoading } = useLogs(query);

  const pagination = data?.pagination;

  function handleFiltersChange(value: LogFiltersValue) {
    setFilters(value);
    setPage(1);
  }

  function handleSelectLog(log: LogEntry) {
    setSelectedLog(log);
    setDetailOpen(true);
  }

  React.useEffect(() => {
    if (!detailOpen) {
      const timeout = window.setTimeout(() => setSelectedLog(null), 200);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [detailOpen]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fetch Logs</h1>
        <p className="text-sm text-muted-foreground">
          Inspect recent fetches, enrichment attempts, and error details.
        </p>
      </div>

      <LogFilters initialFilters={filters} onChange={handleFiltersChange} />

      <LogTable
        logs={data?.data}
        loading={isLoading}
        error={error as Error | undefined}
        onSelectLog={handleSelectLog}
      />

      {pagination ? (
        <Pagination
          page={page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={setPage}
        />
      ) : null}

      <LogDetail
        log={selectedLog}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

function sanitizeFilters(filters: LogFiltersValue): LogsQuery {
  const cleaned: LogsQuery = {};

  if (filters.feedId) {
    cleaned.feedId = filters.feedId;
  }
  if (filters.status) {
    cleaned.status = filters.status;
  }
  if (filters.operation) {
    cleaned.operation = filters.operation;
  }
  if (filters.search) {
    cleaned.search = filters.search.trim();
  }

  return cleaned;
}

