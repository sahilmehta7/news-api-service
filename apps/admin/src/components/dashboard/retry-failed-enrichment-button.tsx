"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { retryFailedArticlesEnrichment } from "@/lib/api/articles";
import type { ApiError } from "@/lib/api/client";

type RetryFailedEnrichmentButtonProps = Pick<ButtonProps, "size" | "variant" | "className">;

export function RetryFailedEnrichmentButton({
  size,
  variant = "outline",
  className
}: RetryFailedEnrichmentButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  async function handleClick() {
    try {
      setIsLoading(true);
      const result = await retryFailedArticlesEnrichment();
      if (result.updated > 0) {
        toast.success(
          `Queued ${result.updated} failed article${result.updated === 1 ? "" : "s"} for reprocessing`
        );
      } else {
        toast.info("No failed articles awaiting enrichment.");
      }
    } catch (error) {
      const message = resolveErrorMessage(error);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={isLoading}
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
      Retry failed enrichment
    </Button>
  );
}

function resolveErrorMessage(error: unknown) {
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Failed to retry failed articles.";
}

function isApiError(error: unknown): error is ApiError {
  return Boolean(error && typeof error === "object" && "status" in error);
}

