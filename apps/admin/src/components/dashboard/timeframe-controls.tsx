"use client";

import { parseAsStringEnum, useQueryState } from "nuqs";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const timeframeParser = parseAsStringEnum(["12h", "24h", "7d"]).withDefault("24h");

export function TimeframeControls() {
  const [window, setWindow] = useQueryState("window", timeframeParser);

  return (
    <Select
      value={window}
      onValueChange={(next: "12h" | "24h" | "7d") => {
        void setWindow(next);
      }}
    >
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder="Select window" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="12h">Last 12 hours</SelectItem>
        <SelectItem value="24h">Last 24 hours</SelectItem>
        <SelectItem value="7d">Last 7 days</SelectItem>
      </SelectContent>
    </Select>
  );
}

