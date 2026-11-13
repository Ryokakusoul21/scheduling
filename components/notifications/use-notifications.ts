"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/(dashboard)/notifications/actions";
import type { NotificationPage } from "@/lib/notifications/format";

export async function fetchNotifications(params: URLSearchParams, signal?: AbortSignal): Promise<NotificationPage> {
  const response = await fetch(`/api/notifications?${params}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Could not load notifications. Please retry.");
  return response.json();
}

export function useNotificationActions(userId: string) {
  const client = useQueryClient();
  // Keep the current unread state until the server confirms the change.
  return useMutation({
    mutationFn: async (id: string | null) => {
      if (id) await markNotificationReadAction(id);
      else await markAllNotificationsReadAction();
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["notifications", userId] }); },
    onError: () => { toast.error("Could not mark notifications as read. Please retry."); },
  });
}
