"use client";
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase realtime events on tasks / task_assignees
 * and triggers router.refresh() so the server component re-fetches.
 * Debounced so a burst of changes only refreshes once.
 */
export function RealtimeRefresher({ channel = "dashboard" }: { channel?: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };
    const ch = supabase
      .channel(`realtime-${channel}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, schedule)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(ch);
    };
  }, [supabase, router, channel]);

  return null;
}
