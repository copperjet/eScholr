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
  | 'announcements'
  | 'eca'
  | 'timetable_builder'
  | 'timetable_live_adjust';

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
      { key: 'late_fee_grace_days',  label: 'Late Fee Grace Days',   description: 'Days after due date before late fee applies', type: 'number',  defaultValue: '0',     min: 0, max: 30 },
      { key: 'receipt_prefix',       label: 'Receipt Prefix',         description: 'Prefix for receipt numbers (e.g. RCT)',       type: 'string',  defaultValue: 'RCT'   },
      { key: 'invoicing',            label: 'Invoice Generation',     description: 'Enable batch invoice generation UI',           type: 'boolean', defaultValue: 'true'  },
      { key: 'sage_api',             label: 'Sage API Sync (opt-in)', description: 'Enable live push to Sage Business Cloud REST API (requires OAuth setup)', type: 'boolean', defaultValue: 'false' },
      { key: 'sage_csv_format',      label: 'Sage CSV Format',        description: 'CSV format: cloud, pastel, or evolution',     type: 'string',  defaultValue: 'cloud', options: ['cloud', 'pastel', 'evolution'] },
      { key: 'sage_api_company_id',  label: 'Sage Company ID',        description: 'Sage Business Cloud company GUID',            type: 'string',  defaultValue: ''      },
      { key: 'sage_api_oauth_token', label: 'Sage OAuth Token',       description: 'Access token for Sage Business Cloud API',    type: 'string',  defaultValue: ''      },
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
      { key: 'max_leave_days_annual',       label: 'Annual Leave Days',      description: 'Default annual leave entitlement per staff', type: 'number',  defaultValue: '21',    min: 0, max: 365 },
      { key: 'payroll_export',              label: 'Payroll Export',          description: 'Enable pay period management and CSV export', type: 'boolean', defaultValue: 'true'  },
      { key: 'sage_payroll_api_token',      label: 'Sage Payroll API Token',  description: 'Bearer token for Sage Payroll API',           type: 'string',  defaultValue: ''      },
      { key: 'sage_payroll_company_id',     label: 'Sage Payroll Company ID', description: 'Company ID for Sage Payroll API',             type: 'string',  defaultValue: ''      },
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
  {
    key: 'eca',
    label: 'Extra-Curricular Activities',
    description: 'Clubs, sports, and activities with parent sign-up and FCFS allocation',
    icon: 'football-outline',
    category: 'admin',
    affectedRoles: ['admin', 'principal', 'coordinator', 'st', 'hrt', 'parent', 'student'],
    tierDefault: { starter: false, growth: true, scale: true, enterprise: true },
    configSchema: [
      { key: 'default_max_choices', label: 'Default Max Choices', description: 'Maximum ranked choices per category', type: 'number', defaultValue: '3', min: 1, max: 5 },
      { key: 'allow_parent_withdraw', label: 'Allow Parent Withdrawal', description: 'Parents can withdraw their child from an assigned activity', type: 'boolean', defaultValue: 'false' },
      { key: 'session_reminder_hour', label: 'Session Reminder Hour', description: 'Hour of day (0–23) to send session reminders', type: 'number', defaultValue: '18', min: 0, max: 23 },
    ],
  },
  {
    key: 'timetable_builder',
    label: 'Timetable Builder',
    description: 'Structured timetable generator with room, period, and teacher constraint management',
    icon: 'calendar-outline',
    category: 'admin',
    affectedRoles: ['admin', 'principal', 'coordinator'],
    tierDefault: { starter: false, growth: true, scale: true, enterprise: true },
  },
  {
    key: 'timetable_live_adjust',
    label: 'Timetable Live Adjustments',
    description: 'Teacher absence cover, slot overrides, and substitute management',
    icon: 'swap-horizontal-outline',
    category: 'extended',
    affectedRoles: ['admin', 'principal', 'st', 'hrt'],
    tierDefault: { starter: false, growth: false, scale: true, enterprise: true },
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
