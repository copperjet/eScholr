/**
 * Module catalog — static definition of all gateable school modules.
 * Module state (enabled/disabled) lives in school_configs with module.* keys.
 */

export type ModuleKey =
  | 'finance'
  | 'hr'
  | 'library'
  | 'frontdesk'
  | 'transport'
  | 'hostel'
  | 'exams'
  | 'daybook'
  | 'character'
  | 'announcements';

export type SubscriptionTier = 'starter' | 'growth' | 'scale' | 'enterprise';

/** A per-module sub-configuration field stored in school_configs */
export interface ModuleConfigField {
  /** Short key — stored as `module.<moduleKey>.<key>` in school_configs */
  key: string;
  label: string;
  description?: string;
  type: 'number' | 'boolean' | 'string';
  defaultValue: string; // always string — matches school_configs.config_value
  min?: number;
  max?: number;
  options?: string[]; // for string enum fields
}

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  icon: string; // Ionicons name
  category: 'core' | 'admin' | 'extended';
  /** Roles whose nav items are hidden when this module is disabled */
  affectedRoles: string[];
  /** Default enabled state per subscription tier */
  tierDefault: Record<SubscriptionTier, boolean>;
  /** Per-module sub-configuration fields (platform-admin editable) */
  configSchema?: ModuleConfigField[];
}

export const MODULES: ModuleDefinition[] = [
  // ── Core (all tiers) ────────────────────────────────────────
  {
    key: 'finance',
    label: 'Finance',
    description: 'Fee collection, receipts, day book, finance reports',
    icon: 'cash-outline',
    category: 'core',
    affectedRoles: ['finance'],
    tierDefault: { starter: true, growth: true, scale: true, enterprise: true },
    configSchema: [
      { key: 'late_fee_grace_days', label: 'Late Fee Grace Days', description: 'Days after due date before late fee applies', type: 'number', defaultValue: '0', min: 0, max: 30 },
      { key: 'receipt_prefix', label: 'Receipt Prefix', description: 'Prefix for receipt numbers (e.g. RCT)', type: 'string', defaultValue: 'RCT' },
    ],
  },
  {
    key: 'exams',
    label: 'Exams & Marks',
    description: 'Mark entry, assessment config, marks windows, report cards',
    icon: 'school-outline',
    category: 'core',
    affectedRoles: [],
    tierDefault: { starter: true, growth: true, scale: true, enterprise: true },
  },
  {
    key: 'daybook',
    label: 'Day Book',
    description: 'Daily cash register and reconciliation',
    icon: 'book-outline',
    category: 'core',
    affectedRoles: [],
    tierDefault: { starter: true, growth: true, scale: true, enterprise: true },
  },
  {
    key: 'announcements',
    label: 'Announcements',
    description: 'School-wide announcements and notices',
    icon: 'megaphone-outline',
    category: 'core',
    affectedRoles: [],
    tierDefault: { starter: true, growth: true, scale: true, enterprise: true },
  },

  // ── Admin (growth+) ──────────────────────────────────────────
  {
    key: 'hr',
    label: 'Human Resources',
    description: 'Staff management, leave tracking, certifications',
    icon: 'briefcase-outline',
    category: 'admin',
    affectedRoles: ['hr'],
    tierDefault: { starter: false, growth: true, scale: true, enterprise: true },
    configSchema: [
      { key: 'max_leave_days_annual', label: 'Annual Leave Days', description: 'Default annual leave entitlement per staff', type: 'number', defaultValue: '21', min: 0, max: 365 },
    ],
  },
  {
    key: 'frontdesk',
    label: 'Front Desk',
    description: 'Visitor management, inquiries, applications',
    icon: 'business-outline',
    category: 'admin',
    affectedRoles: ['front_desk'],
    tierDefault: { starter: false, growth: true, scale: true, enterprise: true },
  },
  {
    key: 'library',
    label: 'Library',
    description: 'Book catalog, loans, patron management',
    icon: 'library-outline',
    category: 'admin',
    affectedRoles: ['librarian'],
    tierDefault: { starter: false, growth: true, scale: true, enterprise: true },
    configSchema: [
      { key: 'max_loan_days', label: 'Max Loan Duration (days)', description: 'Maximum days a book can be checked out', type: 'number', defaultValue: '14', min: 1, max: 90 },
      { key: 'max_loans_per_patron', label: 'Max Books Per Patron', description: 'Maximum concurrent loans per student/staff', type: 'number', defaultValue: '3', min: 1, max: 20 },
    ],
  },
  {
    key: 'character',
    label: 'Character Framework',
    description: 'Student character and values assessment',
    icon: 'heart-outline',
    category: 'admin',
    affectedRoles: [],
    tierDefault: { starter: false, growth: true, scale: true, enterprise: true },
  },

  // ── Extended (scale+) ────────────────────────────────────────
  {
    key: 'transport',
    label: 'Transport',
    description: 'Bus routes, stops, and student transport tracking',
    icon: 'bus-outline',
    category: 'extended',
    affectedRoles: [],
    tierDefault: { starter: false, growth: false, scale: true, enterprise: true },
    configSchema: [
      { key: 'max_routes', label: 'Max Routes', description: 'Maximum number of transport routes', type: 'number', defaultValue: '10', min: 1, max: 200 },
    ],
  },
  {
    key: 'hostel',
    label: 'Hostel',
    description: 'Boarding accommodation and room management',
    icon: 'home-outline',
    category: 'extended',
    affectedRoles: [],
    tierDefault: { starter: false, growth: false, scale: true, enterprise: true },
    configSchema: [
      { key: 'max_capacity', label: 'Max Hostel Capacity', description: 'Total bed capacity across all dorms', type: 'number', defaultValue: '100', min: 1, max: 10000 },
    ],
  },
];

/** DB key for a module flag in school_configs */
export const moduleConfigKey = (key: ModuleKey): string => `module.${key}`;

/** DB key for a per-module sub-config field in school_configs */
export const moduleSubConfigKey = (moduleKey: ModuleKey, fieldKey: string): string =>
  `module.${moduleKey}.${fieldKey}`;

/** Parse config_value string to boolean. Missing row = true (fail-open). */
export const parseModuleEnabled = (value: string | null | undefined): boolean => {
  if (value === null || value === undefined) return true; // fail-open
  return value === 'true';
};

/** Get ModuleDefinition by key */
export const getModuleDefinition = (key: ModuleKey): ModuleDefinition | undefined =>
  MODULES.find((m) => m.key === key);

/** Modules grouped by category */
export const MODULE_CATEGORIES: { id: ModuleDefinition['category']; label: string }[] = [
  { id: 'core',     label: 'Core Features' },
  { id: 'admin',    label: 'Administration' },
  { id: 'extended', label: 'Extended Features' },
];
