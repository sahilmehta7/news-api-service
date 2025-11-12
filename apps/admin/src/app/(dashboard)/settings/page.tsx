"use client";

import * as React from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-context";
import { API_BASE_URL } from "@/lib/env";

type TestStatus = "idle" | "pending" | "success" | "error";

export default function SettingsPage() {
  const { apiKey, signIn, signOut } = useAuth();
  const [value, setValue] = React.useState(apiKey ?? "");
  const [saved, setSaved] = React.useState(false);
  const [testStatus, setTestStatus] = React.useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setValue(apiKey ?? "");
  }, [apiKey]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    signIn(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTestConnection() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setTestStatus("pending");
    setTestMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        headers: {
          "X-API-Key": trimmed
        }
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || response.statusText);
      }
      setTestStatus("success");
      setTestMessage("Connection verified successfully.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to reach the API. Verify the base URL and key.";
      setTestStatus("error");
      setTestMessage(message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage authentication, API keys, and client safeguards.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Admin API key</CardTitle>
          <CardDescription>
            Store the admin API key locally in your browser. The key is required for all authenticated requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="api-key">Current key</Label>
              <Input
                id="api-key"
                type="password"
                autoComplete="off"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setSaved(false);
                }}
                placeholder="Enter admin API key"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!value.trim()}>
                Save key
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={handleTestConnection}
                disabled={testStatus === "pending" || !value.trim()}
              >
                <RefreshCw className={`h-4 w-4 ${testStatus === "pending" ? "animate-spin" : ""}`} />
                Test connection
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => signOut()}
              >
                Sign out
              </Button>
            </div>
            {saved ? (
              <p className="text-sm text-emerald-600">API key saved locally.</p>
            ) : null}
            {testMessage ? (
              <p
                className={`text-sm ${
                  testStatus === "success" ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {testMessage}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Client guardrails
          </CardTitle>
          <CardDescription>
            Automatic protections prevent accidental bursts and capture unauthorized access attempts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Up to four concurrent admin requests are allowed, with a minimum spacing of 120&nbsp;ms between calls.
            </li>
            <li>
              HTTP 429 responses automatically retry with the provided <code>Retry-After</code> delay.
            </li>
            <li>
              Unauthorized responses clear the stored API key and require re-authentication.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

