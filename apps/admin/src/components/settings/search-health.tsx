"use client";

import * as React from "react";
import { Search, RefreshCw, CheckCircle2, XCircle, AlertCircle, Database } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSearchSettings } from "@/lib/api/settings";
import { cn } from "@/lib/utils";

export function SearchHealth() {
  const { data, error, isLoading, mutate } = useSearchSettings();

  const handleRefresh = () => {
    mutate();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search & Clustering
          </CardTitle>
          <CardDescription>Loading search configuration...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search & Clustering
          </CardTitle>
          <CardDescription>Error loading search settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load search settings"}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const { searchEnabled, elasticsearch, health, indices } = data;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ok":
        return "bg-emerald-500";
      case "unavailable":
        return "bg-gray-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ok":
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case "unavailable":
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getHealthBadgeVariant = (health?: string) => {
    switch (health) {
      case "green":
        return "default";
      case "yellow":
        return "secondary";
      case "red":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search & Clustering
            </CardTitle>
            <CardDescription>
              Elasticsearch connection status and index health
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Enabled Status */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Search Enabled</span>
          </div>
          <Badge variant={searchEnabled ? "default" : "secondary"}>
            {searchEnabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>

        {!searchEnabled ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            Search features are disabled. Enable by setting <code className="rounded bg-yellow-100 px-1">SEARCH_ENABLED=true</code> in your environment.
          </div>
        ) : (
          <>
            {/* Elasticsearch Configuration */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Database className="h-4 w-4" />
                Elasticsearch Configuration
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Node:</span>{" "}
                  <code className="rounded bg-muted px-1 text-xs">{elasticsearch.node}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Index Prefix:</span>{" "}
                  <code className="rounded bg-muted px-1 text-xs">{elasticsearch.indexPrefix}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Default Language:</span>{" "}
                  <span className="font-medium">{elasticsearch.defaultLanguage}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Authentication:</span>{" "}
                  <Badge variant={elasticsearch.hasAuth ? "default" : "outline"}>
                    {elasticsearch.hasAuth ? "Configured" : "None"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Connection Health */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  Connection Status
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(health.status)}
                  <Badge
                    variant={
                      health.status === "ok"
                        ? "default"
                        : health.status === "unavailable"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {health.status === "ok"
                      ? "Connected"
                      : health.status === "unavailable"
                        ? "Disabled"
                        : "Error"}
                  </Badge>
                </div>
              </div>
              {health.message && (
                <div className="text-xs text-muted-foreground">{health.message}</div>
              )}
              {health.clusterStatus && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Cluster Status:</span>
                  <Badge variant={getHealthBadgeVariant(health.clusterStatus)}>
                    {health.clusterStatus}
                  </Badge>
                </div>
              )}
            </div>

            {/* Index Health */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="text-sm font-medium">Index Health</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {/* Articles Index */}
                <div className="rounded border bg-muted/50 p-2">
                  <div className="mb-1 text-xs font-medium">Articles Index</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Exists:</span>
                      <Badge variant={indices.articles.exists ? "default" : "secondary"}>
                        {indices.articles.exists ? "Yes" : "No"}
                      </Badge>
                    </div>
                    {indices.articles.exists && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Documents:</span>
                          <span className="font-medium">
                            {indices.articles.documentCount?.toLocaleString() ?? "N/A"}
                          </span>
                        </div>
                        {indices.articles.health && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Health:</span>
                            <Badge variant={getHealthBadgeVariant(indices.articles.health)}>
                              {indices.articles.health}
                            </Badge>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Stories Index */}
                <div className="rounded border bg-muted/50 p-2">
                  <div className="mb-1 text-xs font-medium">Stories Index</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Exists:</span>
                      <Badge variant={indices.stories.exists ? "default" : "secondary"}>
                        {indices.stories.exists ? "Yes" : "No"}
                      </Badge>
                    </div>
                    {indices.stories.exists && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Documents:</span>
                          <span className="font-medium">
                            {indices.stories.documentCount?.toLocaleString() ?? "N/A"}
                          </span>
                        </div>
                        {indices.stories.health && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Health:</span>
                            <Badge variant={getHealthBadgeVariant(indices.stories.health)}>
                              {indices.stories.health}
                            </Badge>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

