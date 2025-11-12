import { createHash } from "node:crypto";

export function sha256FromStrings(
  ...inputs: Array<string | null | undefined>
): string {
  const hash = createHash("sha256");
  for (const input of inputs) {
    if (!input) continue;
    hash.update(input);
  }

  return hash.digest("hex");
}

