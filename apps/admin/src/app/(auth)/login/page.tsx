"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-context";

export default function LoginPage() {
  const { signIn, isAuthenticated } = useAuth();
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, router]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) {
      setError("API key is required");
      return;
    }
    signIn(value.trim());
    router.replace("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Admin Sign In</CardTitle>
          <CardDescription>
            Enter the admin API key to access feed management tools.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="apiKey">Admin API key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter API key"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(null);
                }}
                autoFocus
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

