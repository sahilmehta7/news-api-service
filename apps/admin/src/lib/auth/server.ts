import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ADMIN_API_KEY_COOKIE } from "@/lib/auth/constants";

export async function requireAdminApiKey() {
  const store = await cookies();
  const apiKey = store.get(ADMIN_API_KEY_COOKIE)?.value;

  if (!apiKey) {
    redirect("/login");
  }

  return apiKey;
}

