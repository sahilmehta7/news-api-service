import { API_BASE_URL } from "@/lib/env";
import {
  getStoredApiKey,
  clearStoredApiKey
} from "@/components/auth/auth-context";

type FetchOptions = RequestInit & {
  headers?: HeadersInit;
  parseJson?: boolean;
};

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const MAX_CONCURRENCY = 4;
const MIN_INTERVAL_MS = 120;
const MAX_RETRIES = 2;

let activeRequests = 0;
const queue: Array<() => void> = [];
let lastRequestAt = 0;

async function request<T>(
  path: string,
  options: FetchOptions = {},
  attempt = 0
): Promise<T> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new ApiError("Missing API key", 401);
  }

  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  let res: Response;

  const headers = new Headers(options.headers);
  headers.set("X-API-Key", apiKey);

  // Only add Content-Type for requests that have a body
  if (options.body !== undefined && options.method !== "DELETE") {
    headers.set("Content-Type", "application/json");
  }

  try {
    res = await runWithThrottle(() =>
      fetch(url, {
        ...options,
        headers
      })
    );
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      await delay(getRetryDelay(attempt));
      return request<T>(path, options, attempt + 1);
    }

    const errorMessage = getNetworkErrorMessage(error);
    const detailedMessage = `${errorMessage} (${options.method ?? "GET"} ${url})`;
    throw new ApiError(detailedMessage, 0);
  }

  if (res.status === 429 && attempt < MAX_RETRIES) {
    const retryAfterHeader = res.headers.get("retry-after");
    const retrySeconds = retryAfterHeader ? Number(retryAfterHeader) : 1;
    const delayMs = Number.isFinite(retrySeconds)
      ? Math.max(500, retrySeconds * 1000)
      : 1000;
    await delay(delayMs);
    return request<T>(path, options, attempt + 1);
  }

  if (res.status === 401 || res.status === 403) {
    clearStoredApiKey();
    throw new ApiError("Unauthorized", res.status);
  }

  if (!res.ok) {
    const message = await safeParseError(res);
    throw new ApiError(message, res.status);
  }

  // DELETE requests may return 204 (no content) or 200 (with response body)
  if (options.method === "DELETE") {
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as T;
    }
    // If DELETE returns content, parse it (e.g., soft delete returns updated feed)
    return res.json() as Promise<T>;
  }

  if (options.parseJson === false) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

async function safeParseError(res: Response) {
  try {
    const data = await res.json();
    if (typeof data?.message === "string") return data.message;
    return res.statusText;
  } catch {
    return res.statusText;
  }
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => request<undefined>(path, { method: "DELETE" })
};

export type { ApiError };

function runWithThrottle<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const execute = () => {
      const now = Date.now();
      const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestAt));

      const start = () => {
        activeRequests += 1;
        lastRequestAt = Date.now();
        fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            activeRequests = Math.max(0, activeRequests - 1);
            const next = queue.shift();
            if (next) {
              next();
            }
          });
      };

      if (wait > 0) {
        setTimeout(start, wait);
      } else {
        start();
      }
    };

    if (activeRequests < MAX_CONCURRENCY) {
      execute();
    } else {
      queue.push(execute);
    }
  });
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getNetworkErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return `Unable to reach the News API at ${API_BASE_URL}. Check your network connection and verify that the API server is running.`;
    }
    if (error.message.includes("NetworkError") || error.message.includes("Network request failed")) {
      return `Network error connecting to ${API_BASE_URL}. Verify the API server is running and accessible.`;
    }
    return error.message;
  }
  return "Network request failed";
}

function getRetryDelay(attempt: number) {
  return Math.max(500, 500 * 2 ** attempt);
}

