/**
 * Role scoping utilities for Principal, Coordinator, and HOD
 * These roles share the admin dashboard but have different permissions
 */

import { useAuthStore } from '../stores/authStore';

export type AdminRole = 'super_admin' | 'school_super_admin' | 'admin' | 'principal' | 'coordinator' | 'hod';

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

  // School-level governance (super_admin = platform; school_super_admin = school owner).
  school_structure: ['super_admin', 'school_super_admin'],
  school_settings:  ['super_admin', 'school_super_admin'],

  // Full admin access
  students: ['super_admin', 'school_super_admin', 'admin'],
  staff: ['super_admin', 'school_super_admin', 'admin'],
  parents: ['super_admin', 'school_super_admin', 'admin'],
  assignments: ['super_admin', 'school_super_admin', 'admin'],
  timetable: ['super_admin', 'school_super_admin', 'admin'],
  semesters: ['super_admin', 'school_super_admin', 'admin'],
  promotion: ['super_admin', 'school_super_admin', 'admin'],
  audit: ['super_admin', 'school_super_admin', 'admin'],
  fee_structure: ['super_admin', 'school_super_admin', 'admin'],
  backup: ['super_admin', 'school_super_admin', 'admin'],

  // Academic leadership (all academic roles)
  marks_windows: ['super_admin', 'school_super_admin', 'admin', 'hod'],
  reports: ['super_admin', 'school_super_admin', 'admin', 'principal', 'coordinator', 'hod'],
  attendance: ['super_admin', 'school_super_admin', 'admin', 'principal', 'coordinator'],
  marks_matrix: ['super_admin', 'school_super_admin', 'admin', 'principal', 'coordinator', 'hod'],
  daybook: ['super_admin', 'school_super_admin', 'admin', 'principal', 'coordinator', 'hod'],
  announcements: ['super_admin', 'school_super_admin', 'admin', 'principal', 'coordinator'],
  calendar: ['super_admin', 'school_super_admin', 'admin', 'principal', 'coordinator'],
  notification_log: ['super_admin', 'school_super_admin', 'admin', 'principal'],
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
