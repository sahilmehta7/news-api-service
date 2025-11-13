"use client";

import * as React from "react";
import { CalendarIcon, X } from "lucide-react";

import { useFeedList } from "@/lib/api/feeds";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ArticleFiltersValue {
  feedId?: string;
  enrichmentStatus?: string;
  language?: string;
  hasMedia?: "true" | "false";
  fromDate?: string;
  toDate?: string;
}

type ArticleFiltersProps = {
  values: ArticleFiltersValue;
  onChange: (values: Partial<ArticleFiltersValue>) => void;
  onReset: () => void;
  className?: string;
  feedSelectDisabled?: boolean;
};

const ALL_OPTION = "all";

export function ArticleFilters({
  values,
  onChange,
  onReset,
  className,
  feedSelectDisabled = false
}: ArticleFiltersProps) {
  const { data: feedList } = useFeedList({
    limit: 200,
    sort: "name",
    order: "asc"
  });
  const feeds = feedList?.data ?? [];

  function handleSelectChange<Key extends keyof ArticleFiltersValue>(
    key: Key,
    value: ArticleFiltersValue[Key] | undefined
  ) {
    onChange({ [key]: value } as Partial<ArticleFiltersValue>);
  }

  return (
    <div className={cn("grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      <div>
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Feed</Label>
        <Select
          value={values.feedId ?? ALL_OPTION}
          onValueChange={(value: string) => {
            handleSelectChange("feedId", value === ALL_OPTION ? undefined : value);
          }}
        >
          <SelectTrigger className="h-9 text-sm" disabled={feedSelectDisabled}>
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
          value={values.enrichmentStatus ?? ALL_OPTION}
          onValueChange={(value: string) =>
            handleSelectChange("enrichmentStatus", value === ALL_OPTION ? undefined : value)
          }
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Language</Label>
        <FilterTextInput
          placeholder="en"
          value={values.language ?? ""}
          onChange={(value: string) =>
            handleSelectChange("language", value.trim().length > 0 ? value : undefined)
          }
        />
      </div>

      <div>
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Media</Label>
        <Select
          value={values.hasMedia ?? ALL_OPTION}
          onValueChange={(value: string) =>
            handleSelectChange("hasMedia", value === ALL_OPTION ? undefined : (value as "true" | "false"))
          }
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All media" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>All media</SelectItem>
            <SelectItem value="true">Has media</SelectItem>
            <SelectItem value="false">No media</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Published from</Label>
        <DateInput
          value={values.fromDate}
          onChange={(value) => handleSelectChange("fromDate", value)}
        />
      </div>

      <div>
        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Published to</Label>
        <DateInput
          value={values.toDate}
          onChange={(value) => handleSelectChange("toDate", value)}
        />
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <Button type="button" variant="outline" className="w-full justify-center gap-2" onClick={onReset}>
          <X className="h-4 w-4" />
          Reset filters
        </Button>
      </div>
    </div>
  );
}

type FilterTextInputProps = {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

function FilterTextInput({ value, placeholder, onChange }: FilterTextInputProps) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      spellCheck={false}
    />
  );
}

type DateInputProps = {
  value?: string;
  onChange: (value: string | undefined) => void;
};

function DateInput({ value, onChange }: DateInputProps) {
  return (
    <div className="relative">
      <CalendarIcon className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="date"
        value={value ?? ""}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue.length > 0 ? nextValue : undefined);
        }}
        className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </div>
  );
}

