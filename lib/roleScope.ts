/**
 * Role scoping utilities for Principal, Coordinator, and HOD
 * These roles share the admin dashboard but have different permissions
 */

import { useAuthStore } from '../stores/authStore';

export type AdminRole =
  | 'super_admin' | 'school_super_admin' | 'admin' | 'principal' | 'coordinator' | 'hod'
  | 'hrt' | 'st' | 'finance' | 'front_desk' | 'hr' | 'librarian';

/**
 * Role hierarchy - higher number = more permissions
 */
const ROLE_LEVEL: Record<string, number> = {
  super_admin: 100,
  school_super_admin: 95,
  admin: 90,
  principal: 80,
  coordinator: 70,
  hod: 60,
  hrt: 50,
  st: 40,
  finance: 30,
  hr: 30,
  librarian: 25,
  front_desk: 20,
  parent: 10,
  student: 10,
};

/**
 * Feature access matrix - which roles can access which features
 */
export const ROLE_ACCESS: Record<string, AdminRole[]> = {
  // Platform admin only
  onboard_school: ['super_admin'],

  // ── Super Admin governance (school-wide, not day-to-day) ────────────────
  // school_super_admin owns these; super_admin (platform) inherits.
  users:             ['super_admin', 'school_super_admin'], // Users hub (Staff/Students/Parents)
  school_structure:  ['super_admin', 'school_super_admin', 'admin'],
  school_settings:   ['super_admin', 'school_super_admin', 'admin'],
  staff:             ['super_admin', 'school_super_admin'],
  parents:           ['super_admin', 'school_super_admin', 'front_desk'],
  semesters:         ['super_admin', 'school_super_admin', 'admin'], // legacy key, kept for back-compat
  calendar_events:   ['super_admin', 'school_super_admin', 'admin'], // new combined screen
  promotion:         ['super_admin', 'school_super_admin'],
  audit:             ['super_admin', 'school_super_admin'],
  notification_log:  ['super_admin', 'school_super_admin'],
  backup:            ['super_admin', 'school_super_admin'],
  marks_windows:       ['super_admin', 'school_super_admin', 'hod'],
  assessment_config:   ['super_admin', 'school_super_admin'],

  // ── Admin (day-to-day operations) ───────────────────────────────────────
  students:          ['super_admin', 'school_super_admin', 'admin', 'front_desk'], // visible in Users hub for super; Students tab for admin
  assignments:       ['super_admin', 'school_super_admin', 'admin'],
  timetable:         ['super_admin', 'school_super_admin', 'admin'],
  reports:           ['super_admin', 'school_super_admin', 'admin', 'principal', 'coordinator', 'hod'],
  marking:           ['super_admin', 'school_super_admin', 'admin', 'principal', 'coordinator', 'hod'],
  daybook:           ['admin', 'principal', 'coordinator', 'hod'],
  announcements:     ['admin', 'principal', 'coordinator'],
  attendance:        ['admin', 'principal', 'coordinator'],

  // ── Finance only ────────────────────────────────────────────────────────
  fee_structure:     ['super_admin'], // platform admin retains visibility; school finance has its own dashboard

  // ── Library ─────────────────────────────────────────────────────────────
  library_catalog:       ['super_admin', 'school_super_admin', 'admin', 'librarian'],
  library_transactions:  ['super_admin', 'school_super_admin', 'librarian'],
  library_patrons:       ['super_admin', 'school_super_admin', 'librarian'],
  library_settings:      ['super_admin', 'school_super_admin', 'librarian'],
};

/**
 * Check if a role has access to a feature
 */
export function canAccess(role: string | undefined, feature: keyof typeof ROLE_ACCESS): boolean {
  if (!role) return false;
  const allowedRoles = ROLE_ACCESS[feature] ?? [];
  return allowedRoles.includes(role as AdminRole);
}

/**
 * Check if user has higher or equal role level than required
 */
export function hasMinRoleLevel(role: string | undefined, minRole: AdminRole): boolean {
  if (!role) return false;
  return (ROLE_LEVEL[role] ?? 0) >= (ROLE_LEVEL[minRole] ?? 0);
}

/**
 * Hook to get department scope for HOD
 * Returns department string if HOD, null otherwise
 */
export function useDepartmentScope(): string | null {
  const { user } = useAuthStore();
  if (user?.activeRole === 'hod') {
    return user?.department ?? null;
  }
  return null;
}

/**
 * Check if current user is HOD with a valid department
 */
export function useIsHOD(): boolean {
  const { user } = useAuthStore();
  return user?.activeRole === 'hod' && !!user?.department;
}

/**
 * Hook to check if user can access a feature
 */
export function useCanAccess(feature: keyof typeof ROLE_ACCESS): boolean {
  const { user } = useAuthStore();
  return canAccess(user?.activeRole, feature);
}

/**
 * Build a filtered query for HOD - adds department filter when applicable
 * Returns the modified query builder
 */
export function applyDepartmentFilter<T>(
  query: any,
  department: string | null,
  departmentColumn: string = 'department'
): T {
  if (department) {
    return query.eq(departmentColumn, department);
  }
  return query;
}
