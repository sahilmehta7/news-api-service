"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarIcon, Search, X } from "lucide-react";
import { format } from "date-fns";

import { useFeeds } from "@/lib/api/feeds";
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
import { cn } from "@/lib/utils";

const filtersSchema = z.object({
  feedId: z.string().optional(),
  enrichmentStatus: z.string().optional(),
  language: z.string().optional(),
  hasMedia: z.enum(["", "true", "false"]).optional(),
  q: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional()
});

export type ArticleFiltersValue = z.infer<typeof filtersSchema>;

type ArticleFiltersProps = {
  initialFilters?: ArticleFiltersValue;
  onChange: (values: ArticleFiltersValue) => void;
};

export function ArticleFilters({ initialFilters, onChange }: ArticleFiltersProps) {
  const { data: feeds } = useFeeds();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { isDirty }
  } = useForm<ArticleFiltersValue>({
    resolver: zodResolver(filtersSchema),
    defaultValues: {
      feedId: "",
      enrichmentStatus: "",
      language: "",
      hasMedia: "",
      q: "",
      fromDate: "",
      toDate: "",
      ...initialFilters
    }
  });

  const feedId = watch("feedId");
  const enrichmentStatus = watch("enrichmentStatus");
  const hasMedia = watch("hasMedia");

  const ALL_OPTION = "all";

  function submit(values: ArticleFiltersValue) {
    onChange({
      ...values,
      hasMedia:
        values.hasMedia === "true"
          ? "true"
          : values.hasMedia === "false"
          ? "false"
          : ""
    });
  }

  React.useEffect(() => {
    reset({
      feedId: initialFilters?.feedId ?? "",
      enrichmentStatus: initialFilters?.enrichmentStatus ?? "",
      language: initialFilters?.language ?? "",
      hasMedia: initialFilters?.hasMedia ?? "",
      q: initialFilters?.q ?? "",
      fromDate: initialFilters?.fromDate ?? "",
      toDate: initialFilters?.toDate ?? ""
    });
  }, [initialFilters, reset]);

  function handleReset() {
    reset({
      feedId: "",
      enrichmentStatus: "",
      language: "",
      hasMedia: "",
      q: "",
      fromDate: "",
      toDate: ""
    });
    onChange({});
  }

  return (
    <form
      className="grid gap-3 rounded-lg border bg-card p-4 lg:grid-cols-6"
      onSubmit={handleSubmit(submit)}
    >
      <div className="lg:col-span-2">
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Feed</Label>
        <Select
          value={feedId && feedId.length > 0 ? feedId : ALL_OPTION}
          onValueChange={(value) => {
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
              <SelectItem value={feed.id} key={feed.id}>
                {feed.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Enrichment status</Label>
        <Select
          value={enrichmentStatus && enrichmentStatus.length > 0 ? enrichmentStatus : ALL_OPTION}
          onValueChange={(value) => {
            setValue("enrichmentStatus", value === ALL_OPTION ? "" : value, {
              shouldDirty: true
            });
            void handleSubmit(submit)();
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Language</Label>
        <Input
          placeholder="en"
          className="h-9"
          {...register("language")}
          onBlur={() => void handleSubmit(submit)()}
        />
      </div>
      <div>
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Media</Label>
        <Select
          value={hasMedia && hasMedia.length > 0 ? hasMedia : ALL_OPTION}
          onValueChange={(value) => {
            const normalized =
              value === ALL_OPTION ? "" : (value as ArticleFiltersValue["hasMedia"]);
            setValue("hasMedia", normalized, { shouldDirty: true });
            void handleSubmit(submit)();
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>All</SelectItem>
            <SelectItem value="true">Has media</SelectItem>
            <SelectItem value="false">No media</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="lg:col-span-2">
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Keywords</Label>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            className="h-9 pl-8"
            {...register("q")}
            onBlur={() => void handleSubmit(submit)()}
          />
        </div>
      </div>
      <div className="lg:col-span-3 flex items-end gap-2">
        <div className="w-full">
          <Label className="mb-1 block text-xs uppercase text-muted-foreground">From</Label>
          <DateInput {...register("fromDate")} onBlur={() => void handleSubmit(submit)()} />
        </div>
        <div className="w-full">
          <Label className="mb-1 block text-xs uppercase text-muted-foreground">To</Label>
          <DateInput {...register("toDate")} onBlur={() => void handleSubmit(submit)()} />
        </div>
      </div>
      <div className="flex items-end justify-end gap-2 lg:col-span-3">
        <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={!isDirty}>
          <X className="mr-2 h-4 w-4" />
          Reset
        </Button>
        <Button type="submit" size="sm" className="gap-2">
          <Search className="h-4 w-4" />
          Apply
        </Button>
      </div>
    </form>
  );
}

type DateInputProps = React.InputHTMLAttributes<HTMLInputElement>;

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, value, ...props }, ref) => {
    const normalizedValue = Array.isArray(value) ? value[0] : value;
    const formatted = normalizedValue ? format(new Date(normalizedValue), "yyyy-MM-dd") : "";
    return (
      <div className="relative">
        <CalendarIcon className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={ref}
          type="date"
          className={cn(
            "h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            className
          )}
          value={formatted}
          {...props}
        />
      </div>
    );
  }
);
DateInput.displayName = "DateInput";

