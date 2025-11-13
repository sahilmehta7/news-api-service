import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  feedInputSchema,
  type Feed,
  type FeedInput
} from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { createFeed, updateFeed } from "@/lib/api/feeds";

type FeedFormProps = {
  onSuccess?: () => void;
  initialData?: Feed;
};

export function FeedForm({ initialData, onSuccess }: FeedFormProps) {
  const {
    handleSubmit,
    register,
    setValue,
    formState: { errors, isSubmitting },
    reset
  } = useForm<FeedInput>({
    resolver: zodResolver(feedInputSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      url: initialData?.url ?? "",
      category: initialData?.category ?? "",
      tags: initialData?.tags ?? [],
      fetchIntervalMinutes: initialData?.fetchIntervalMinutes ?? 30,
      metadata: initialData?.metadata ?? {},
      isActive: initialData?.isActive ?? true
    }
  });

  const [tagsInput, setTagsInput] = React.useState(
    initialData?.tags?.join(", ") ?? ""
  );
  const [metadataInput, setMetadataInput] = React.useState(
    initialData?.metadata ? JSON.stringify(initialData.metadata, null, 2) : ""
  );
  const [metadataError, setMetadataError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTagsInput(initialData?.tags?.join(", ") ?? "");
    setMetadataInput(
      initialData?.metadata ? JSON.stringify(initialData.metadata, null, 2) : ""
    );
  }, [initialData]);

  React.useEffect(() => {
    const tags = tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    setValue("tags", tags, { shouldDirty: true });
  }, [tagsInput, setValue]);

  React.useEffect(() => {
    if (!metadataInput.trim()) {
      setValue("metadata", {}, { shouldDirty: true });
      setMetadataError(null);
      return;
    }
    try {
      const parsed = JSON.parse(metadataInput);
      setValue("metadata", parsed, { shouldDirty: true });
      setMetadataError(null);
    } catch {
      setMetadataError("Invalid JSON");
    }
  }, [metadataInput, setValue]);

  async function onSubmit(values: FeedInput) {
    const payload: FeedInput = {
      ...values,
      tags: Array.isArray(values.tags)
        ? values.tags.filter(Boolean)
        : undefined,
      metadata: Object.keys(values.metadata ?? {}).length
        ? values.metadata
        : undefined
    };

    try {
      if (initialData) {
        await updateFeed(initialData.id, payload);
        toast.success("Feed updated");
      } else {
        await createFeed(payload);
        toast.success("Feed created");
        reset();
      }
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save feed");
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="TechCrunch" {...register("name")} />
          {errors.name ? (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="url">Feed URL</Label>
          <Input
            id="url"
            placeholder="https://example.com/rss"
            {...register("url")}
          />
          {errors.url ? (
            <p className="text-xs text-destructive">{errors.url.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="category">Category</Label>
          <Input id="category" placeholder="Technology" {...register("category")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tags">Tags (comma separated)</Label>
          <Input
            id="tags"
            placeholder="ai, startups"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
          />
          {tagsInput ? (
            <p className="text-xs text-muted-foreground">
              Stored as:{" "}
              {tagsInput
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean)
                .join(", ") || "—"}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fetchIntervalMinutes">Fetch interval (minutes)</Label>
          <Input
            id="fetchIntervalMinutes"
            type="number"
            min={5}
            step={5}
            {...register("fetchIntervalMinutes", { valueAsNumber: true })}
          />
          {errors.fetchIntervalMinutes ? (
            <p className="text-xs text-destructive">
              {errors.fetchIntervalMinutes.message}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="metadata">Metadata (JSON)</Label>
          <Textarea
            id="metadata"
            placeholder='{"topic":"ai"}'
            value={metadataInput}
            onChange={(event) => setMetadataInput(event.target.value)}
          />
          {metadataError ? (
            <p className="text-xs text-destructive">{metadataError}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="isActive" className="text-sm font-medium">
              Active
            </Label>
            <p className="text-xs text-muted-foreground">
              Pause ingestion for this feed when disabled.
            </p>
          </div>
          <Switch
            id="isActive"
            defaultChecked={initialData?.isActive ?? true}
            onCheckedChange={(checked: boolean) =>
              setValue("isActive", checked, { shouldDirty: true })
            }
          />
        </div>
      </div>
      <Button type="submit" disabled={isSubmitting || Boolean(metadataError)} className="w-full sm:w-auto">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving
          </>
        ) : initialData ? (
          "Update feed"
        ) : (
          "Create feed"
        )}
      </Button>
    </form>
  );
}

