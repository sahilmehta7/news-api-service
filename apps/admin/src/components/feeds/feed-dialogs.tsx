"use client";

import * as React from "react";
import { Plus, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { FeedForm } from "@/components/feeds/feed-form";
import type { Feed } from "@/lib/api/types";

type CreateFeedDialogProps = {
  trigger?: React.ReactNode;
  onCreated?: () => void;
};

type EditFeedDialogProps = {
  feed: Feed;
  trigger?: React.ReactNode;
  onUpdated?: () => void;
};

export function CreateFeedDialog({ trigger, onCreated }: CreateFeedDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add feed
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add new feed</DialogTitle>
          <DialogDescription>
            Enter the RSS feed details. The ingestion worker will pick it up using the configured
            interval.
          </DialogDescription>
        </DialogHeader>
        <FeedForm onSuccess={onCreated} />
      </DialogContent>
    </Dialog>
  );
}

export function EditFeedDialog({ feed, trigger, onUpdated }: EditFeedDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="icon">
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit feed</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit feed</DialogTitle>
          <DialogDescription>
            Update feed details and ingestion settings.
          </DialogDescription>
        </DialogHeader>
        <FeedForm initialData={feed} onSuccess={onUpdated} />
      </DialogContent>
    </Dialog>
  );
}


