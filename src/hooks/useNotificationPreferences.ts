/**
 * What a person has chosen to be notified about.
 *
 * Reads and writes `notification_preferences` — one row per choice actually
 * made. A category with no row is at its catalogue default, which is why this
 * hook returns a resolver rather than a plain map: absence is a meaningful
 * state and flattening it to `false` is how a new category would silently mute
 * mail somebody relies on.
 */
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  categoriesFor,
  notificationAllowed,
  type NotificationAudience,
  type NotificationChannel,
} from '../../supabase/functions/_shared/notification-catalogue';

interface StoredPreference {
  category: string;
  channel: NotificationChannel;
  enabled: boolean;
}

/** The generated types predate this table; the shape is asserted here instead. */
const preferencesTable = () =>
  (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (col: string, v: string) => Promise<{ data: StoredPreference[] | null; error: { message: string } | null }> };
      upsert: (rows: unknown, opts: unknown) => Promise<{ error: { message: string } | null }>;
    };
  }).from('notification_preferences');

export function useNotificationPreferences(audience: NotificationAudience) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const categories = useMemo(() => categoriesFor(audience), [audience]);

  const query = useQuery({
    queryKey: ['notification-preferences', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<StoredPreference[]> => {
      const { data, error } = await preferencesTable()
        .select('category, channel, enabled')
        .eq('user_id', user!.id);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const stored = query.data ?? [];

  const isEnabled = useCallback(
    (category: string, channel: NotificationChannel) =>
      notificationAllowed(
        category,
        channel,
        stored.find((p) => p.category === category && p.channel === channel),
      ),
    [stored],
  );

  const setEnabled = useMutation({
    mutationFn: async ({
      category,
      channel,
      enabled,
    }: {
      category: string;
      channel: NotificationChannel;
      enabled: boolean;
    }) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await preferencesTable().upsert(
        { user_id: user.id, category, channel, enabled, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,category,channel' },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-preferences', user?.id] }),
    // A preference that fails to save silently is a preference the person
    // believes they set.
    onError: (e: Error) => toast.error(e.message || 'Could not save that preference'),
  });

  return {
    categories,
    isEnabled,
    setEnabled: setEnabled.mutateAsync,
    isSaving: setEnabled.isPending,
    isLoading: query.isLoading,
  };
}
