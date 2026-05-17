/**
 * ModuleGate — Renders children only if the specified module is enabled
 * for the current school. Falls back to null (or custom fallback) if disabled.
 * Fail-open: renders children while module state is loading.
 */
import React from 'react';
import { type ModuleKey } from '../../lib/modules';
import { useIsModuleEnabled } from '../../hooks/useSchoolModules';

export interface ModuleGateProps {
  module: ModuleKey;
  /** Rendered when module is disabled. Defaults to null. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function ModuleGate({ module, fallback = null, children }: ModuleGateProps) {
  const enabled = useIsModuleEnabled(module);
  return enabled ? <>{children}</> : <>{fallback}</>;
}
