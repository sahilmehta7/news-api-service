"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, Filter } from "lucide-react";

import { useFeedList } from "@/lib/api/feeds";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const filtersSchema = z.object({
  feedId: z.string().optional(),
  status: z.string().optional(),
  operation: z.string().optional(),
  search: z.string().optional()
});

export type LogFiltersValue = z.infer<typeof filtersSchema>;

type LogFiltersProps = {
  initialFilters?: LogFiltersValue;
  onChange: (value: LogFiltersValue) => void;
};

export function LogFilters({ initialFilters, onChange }: LogFiltersProps) {
  const { data: feedList } = useFeedList({
    limit: 200,
    sort: "name",
    order: "asc"
  });
  const feeds = feedList?.data ?? [];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isDirty }
  } = useForm<LogFiltersValue>({
    resolver: zodResolver(filtersSchema),
    defaultValues: {
      feedId: "",
      status: "",
      operation: "",
      search: "",
      ...initialFilters
    }
  });

  const feedId = watch("feedId") ?? "";
  const status = watch("status") ?? "";
  const operation = watch("operation") ?? "";

  const ALL_OPTION = "all";

  React.useEffect(() => {
    reset({
      feedId: initialFilters?.feedId ?? "",
      status: initialFilters?.status ?? "",
      operation: initialFilters?.operation ?? "",
      search: initialFilters?.search ?? ""
    });
  }, [initialFilters, reset]);

  function submit(values: LogFiltersValue) {
    onChange({
      ...values,
      feedId: values.feedId && values.feedId !== ALL_OPTION ? values.feedId : undefined,
      status: values.status && values.status !== ALL_OPTION ? values.status : undefined,
      operation:
        values.operation && values.operation !== ALL_OPTION ? values.operation : undefined,
      search: values.search ? values.search : undefined
    });
  }

  function handleReset() {
    reset({
      feedId: "",
      status: "",
      operation: "",
      search: ""
    });
    onChange({});
  }

  return (
    <form
      className="grid gap-4 rounded-lg border bg-card p-4 lg:grid-cols-5"
      onSubmit={handleSubmit(submit)}
    >
      <div>
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">
          Feed
        </Label>
        <Select
          value={feedId.length > 0 ? feedId : ALL_OPTION}
          onValueChange={(value: string) => {
            setValue("feedId", value === ALL_OPTION ? "" : value, { shouldDirty: true });
            void handleSubmit(submit)();
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All feeds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>All feeds</SelectItem>
            {feeds?.map((feed) => (
              <SelectItem key={feed.id} value={feed.id}>
                {feed.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">
          Status
        </Label>
        <Select
          value={status.length > 0 ? status : ALL_OPTION}
          onValueChange={(value: string) => {
            setValue("status", value === ALL_OPTION ? "" : value, { shouldDirty: true });
            void handleSubmit(submit)();
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>All</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failure">Failure</SelectItem>
            <SelectItem value="running">Running</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">
          Operation
        </Label>
        <Select
          value={operation.length > 0 ? operation : ALL_OPTION}
          onValueChange={(value: string) => {
            setValue("operation", value === ALL_OPTION ? "" : value, { shouldDirty: true });
            void handleSubmit(submit)();
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All operations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>All operations</SelectItem>
            <SelectItem value="fetch">Fetch</SelectItem>
            <SelectItem value="feed_import">Bulk import</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="lg:col-span-2">
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">
          Search
        </Label>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by error message or feed name"
            className="h-9 pl-8"
            {...register("search")}
            onBlur={() => void handleSubmit(submit)()}
          />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={!isDirty}>
          Reset
        </Button>
        <Button type="submit" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          Apply
        </Button>
      </div>
    </form>
  );
}

