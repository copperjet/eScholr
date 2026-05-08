/**
 * useSchoolModules — React Query hook for per-school module flags.
 * Reads module.* keys from school_configs.
 * Fail-open: missing row = module enabled (safe rollout).
 * Realtime: subscribes to school_configs changes — module toggles propagate live.
 */
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { type ModuleKey, moduleConfigKey, parseModuleEnabled } from '../lib/modules';

// ── Types ─────────────────────────────────────────────────────

export type ModuleMap = Record<ModuleKey, boolean>;

const ALL_MODULE_KEYS: ModuleKey[] = [
  'finance', 'hr', 'library', 'frontdesk',
  'transport', 'hostel', 'exams',
  'daybook', 'character', 'announcements',
];

// ── Fetcher ───────────────────────────────────────────────────

async function fetchModules(schoolId: string): Promise<ModuleMap> {
  const configKeys = ALL_MODULE_KEYS.map(moduleConfigKey);

  const { data, error } = await (supabase as any)
    .from('school_configs')
    .select('config_key, config_value')
    .eq('school_id', schoolId)
    .in('config_key', configKeys);

  if (error) throw new Error(error.message);

  // Build lookup map
  const lookup: Record<string, string> = {};
  for (const row of (data ?? [])) {
    lookup[row.config_key] = row.config_value;
  }

  // Map to ModuleMap — fail-open for missing rows
  const result = {} as ModuleMap;
  for (const key of ALL_MODULE_KEYS) {
    result[key] = parseModuleEnabled(lookup[moduleConfigKey(key)]);
  }
  return result;
}

// ── Primary hook ──────────────────────────────────────────────

export function useSchoolModules() {
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const qc = useQueryClient();

  // Stable per-instance suffix so multiple hook callers don't collide on channel name.
  // Supabase keys channels by name globally — same name twice = `.on()` after subscribe error.
  const instanceIdRef = useRef<string>(Math.random().toString(36).slice(2, 10));

  // Realtime: invalidate cache on any school_configs change for this school.
  // Filters server-side to module.* row changes only.
  useEffect(() => {
    if (!schoolId) return;
    const channelName = `school-modules-${schoolId}-${instanceIdRef.current}`;
    const channel = (supabase as any)
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'school_configs',
          filter: `school_id=eq.${schoolId}`,
        },
        (payload: any) => {
          const key: string | undefined = payload?.new?.config_key ?? payload?.old?.config_key;
          if (key && key.startsWith('module.')) {
            qc.invalidateQueries({ queryKey: ['school-modules', schoolId] });
          }
        }
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(channel);
    };
  }, [schoolId, qc]);

  return useQuery<ModuleMap>({
    queryKey: ['school-modules', schoolId],
    queryFn: () => fetchModules(schoolId),
    enabled: !!schoolId,
    staleTime: 5 * 60 * 1000,  // 5 min — module changes are rare
    gcTime: 10 * 60 * 1000,
  });
}

// ── Convenience hooks ─────────────────────────────────────────

/**
 * Returns whether a specific module is enabled for the current school.
 * Returns `true` while loading (fail-open).
 */
export function useIsModuleEnabled(key: ModuleKey): boolean {
  const { data, isLoading } = useSchoolModules();
  if (isLoading || !data) return true; // fail-open during load
  return data[key] ?? true;
}

/**
 * Returns the full ModuleMap, or all-enabled map while loading.
 */
export function useModuleMap(): ModuleMap {
  const { data } = useSchoolModules();
  if (!data) {
    // Return all-enabled during loading (fail-open)
    const fallback = {} as ModuleMap;
    for (const key of ALL_MODULE_KEYS) fallback[key] = true;
    return fallback;
  }
  return data;
}
