/**
 * useSchoolModuleConfig — per-module sub-configuration hooks.
 *
 * Reads module.{moduleKey}.* rows from school_configs.
 * School users get their own school's config via RLS.
 * Platform admin writes via set-school-module-config edge function.
 *
 * Usage:
 *   const loanDays = useModuleConfigValue('library', 'max_loan_days', '14');
 *   const configs  = useSchoolModuleConfig('library');
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { ModuleKey, ModuleConfigField } from '../lib/modules';
import { moduleSubConfigKey, MODULES } from '../lib/modules';

/** Map of fieldKey → config_value string for a single module */
export type ModuleConfigMap = Record<string, string>;

/**
 * Fetch all sub-config rows for a module for the current user's school.
 * Returns a map of fieldKey → config_value.
 */
export function useSchoolModuleConfig(moduleKey: ModuleKey) {
  const { user } = useAuthStore();
  const schoolId = user?.schoolId;

  const moduleDef = MODULES.find((m) => m.key === moduleKey);
  const fieldKeys = (moduleDef?.configSchema ?? []).map((f) =>
    moduleSubConfigKey(moduleKey, f.key),
  );

  return useQuery<ModuleConfigMap>({
    queryKey: ['school-module-config', schoolId, moduleKey],
    enabled: !!schoolId && fieldKeys.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!schoolId || fieldKeys.length === 0) return {};

      const { data, error } = await (supabase as any)
        .from('school_configs')
        .select('config_key, config_value')
        .eq('school_id', schoolId)
        .in('config_key', fieldKeys);

      if (error) throw error;

      const map: ModuleConfigMap = {};
      for (const row of data ?? []) {
        // Strip the 'module.<moduleKey>.' prefix to get the short fieldKey
        const prefix = `module.${moduleKey}.`;
        const shortKey = row.config_key.startsWith(prefix)
          ? row.config_key.slice(prefix.length)
          : row.config_key;
        map[shortKey] = row.config_value;
      }
      return map;
    },
  });
}

/**
 * Read a single sub-config value with a fallback default.
 * Returns defaultValue if row is missing (fail-open).
 *
 * @example
 *   const maxLoan = useModuleConfigValue('library', 'max_loan_days', '14');
 */
export function useModuleConfigValue(
  moduleKey: ModuleKey,
  fieldKey: string,
  defaultValue: string,
): string {
  const { data } = useSchoolModuleConfig(moduleKey);
  return data?.[fieldKey] ?? defaultValue;
}

/**
 * Convenience: return a numeric config value parsed from string.
 */
export function useModuleConfigNumber(
  moduleKey: ModuleKey,
  fieldKey: string,
  defaultValue: number,
): number {
  const strVal = useModuleConfigValue(moduleKey, fieldKey, String(defaultValue));
  const parsed = parseInt(strVal, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Helper to get schema fields for a module (for rendering config editors).
 */
export function getModuleConfigSchema(moduleKey: ModuleKey): ModuleConfigField[] {
  const def = MODULES.find((m) => m.key === moduleKey);
  return def?.configSchema ?? [];
}
