"use client";
import { useQueryClient } from "@tanstack/react-query";
import { browserToday } from "@/lib/utils";
import { qk, type Dashboard } from "./queries";

/** The user's current local date (server-computed when available, device clock otherwise). */
export function useToday(): string {
  const qc = useQueryClient();
  const d = qc.getQueryData<Dashboard>(qk.dashboard);
  const device = browserToday();
  // If the cached dashboard is from yesterday, trust the device clock.
  return d?.today && d.today >= device ? d.today : device;
}
