import { API_BASE_URL } from "@/lib/env";
import { requireAdminApiKey } from "@/lib/auth/server";

type ServerFetchOptions = RequestInit & {
  parseJson?: boolean;
};

class ServerApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ServerApiError";
    this.status = status;
  }
}

export async function serverApiFetch<T>(
  path: string,
  options: ServerFetchOptions = {}
): Promise<T> {
  const apiKey = await requireAdminApiKey();
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...(options.headers ?? {})
    },
    cache: options.cache ?? "no-store"
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ServerApiError(message, response.status);
  }

  if (options.method === "DELETE" || options.parseJson === false) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function parseErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: string };
    if (typeof data?.message === "string") {
      return data.message;
    }
  } catch {
    // ignore
  }

  return response.statusText;
}

export { ServerApiError };

