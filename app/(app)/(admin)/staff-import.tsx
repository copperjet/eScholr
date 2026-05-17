/**
 * Admin — Bulk Staff CSV Import
 * 4-step wizard: template → upload → preview/validate → import
 * CSV columns: first_name, last_name, email, role
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText } from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import type { UserRole } from '../../../types/database';

const VALID_ROLES: UserRole[] = [
  'admin', 'principal', 'coordinator', 'hod', 'hrt', 'st',
  'finance', 'front_desk', 'hr',
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator', principal: 'Principal', coordinator: 'Coordinator',
  hod: 'Head of Department', hrt: 'Class Teacher (HRT)', st: 'Subject Teacher',
  finance: 'Finance', front_desk: 'Front Desk', hr: 'HR',
};

const CSV_HEADERS = ['employee_id', 'first_name', 'last_name', 'email', 'phone', 'role', 'department', 'subject', 'join_date', 'status', 'gender', 'date_of_birth', 'national_id', 'address'];
const TEMPLATE_ROWS = [
  'STF001,Jane,Wanjiku,jane@school.edu,+1234567890,hrt,Primary,Math,2024-01-15,active,female,1990-05-15,NIN-123456,123 School Street',
  'STF002,John,Omondi,john@school.edu,+1234567891,st,Secondary,English,2023-09-01,active,male,1985-08-20,NIN-123457,456 Education Ave',
  'STF003,Alice,Mwangi,alice@school.edu,+1234567892,admin,Administration,,2022-03-10,active,female,1988-11-10,NIN-123458,789 Admin Road',
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedRow {
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  role: UserRole | '';
  errors: string[];
  valid: boolean;
  // Optional fields from CSV
  employee_id?: string;
  phone?: string;
  department?: string;
  subject?: string;
  join_date?: string;
  status?: string;
  gender?: string;
  date_of_birth?: string;
  national_id?: string;
  address?: string;
}

interface ImportResult {
  full_name: string;
  email: string;
  role: string;
  temp_password?: string;
  error?: string;
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLower = lines[0]?.toLowerCase() ?? '';
  const hasHeader = firstLower.includes('employee_id') || firstLower.includes('first_name') || firstLower.includes('email');
  const start = hasHeader ? 1 : 0;

  return lines.slice(start).map((line) => {
    // Handle CSV with potential commas inside quoted fields
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cols.push(current.trim());

    // Map columns: employee_id,first_name,last_name,email,phone,role,department,subject,join_date,status,gender,date_of_birth,national_id,address
    const [
      employee_id = '',
      first_name = '',
      last_name = '',
      email = '',
      phone = '',
      role = '',
      department = '',
      subject = '',
      join_date = '',
      status = '',
      gender = '',
      date_of_birth = '',
      national_id = '',
      address = ''
    ] = cols;

    const full_name = [first_name, last_name].filter(Boolean).join(' ').trim();
    const errors: string[] = [];

    if (!full_name) errors.push('First or last name required');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email required');
    const normalizedRole = role.toLowerCase().trim();
    if (!VALID_ROLES.includes(normalizedRole as UserRole)) {
      errors.push(`Role "${role}" invalid — use: ${VALID_ROLES.join(', ')}`);
    }

    return {
      first_name, last_name, full_name, email: email.toLowerCase(),
      role: VALID_ROLES.includes(normalizedRole as UserRole) ? (normalizedRole as UserRole) : '',
      errors, valid: errors.length === 0,
      // Store additional fields for database insertion
      employee_id, phone, department, subject, join_date, status, gender, date_of_birth, national_id, address
    } as ParsedRow;
  });
}

// ── Step bar ──────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

function StepBar({ step }: { step: Step }) {
  const { colors } = useTheme();
  const steps = [
    { n: 1 as Step, label: 'Template' },
    { n: 2 as Step, label: 'Upload' },
    { n: 3 as Step, label: 'Preview' },
    { n: 4 as Step, label: 'Done' },
  ];
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={[
              sbStyles.circle,
              { backgroundColor: s.n <= step ? colors.brand.primary : colors.surfaceSecondary, borderColor: s.n <= step ? colors.brand.primary : colors.border },
            ]}>
              {s.n < step
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <ThemedText variant="caption" style={{ color: s.n <= step ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '700' }}>{s.n}</ThemedText>
              }
            </View>
            <ThemedText variant="caption" style={{ color: s.n <= step ? colors.brand.primary : colors.textMuted, fontSize: 10, marginTop: 3 }}>{s.label}</ThemedText>
          </View>
          {i < steps.length - 1 && <View style={[sbStyles.line, { backgroundColor: s.n < step ? colors.brand.primary : colors.border }]} />}
        </React.Fragment>
      ))}
    </View>
  );
}
const sbStyles = StyleSheet.create({
  circle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  line: { flex: 1, height: 1.5, marginTop: 12 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function StaffImportScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [step, setStep]           = useState<Step>(1);
  const [rows, setRows]           = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults]     = useState<ImportResult[]>([]);

  const validCount   = rows.filter((r) => r.valid).length;
  const invalidCount = rows.filter((r) => !r.valid).length;

  // ── Template download ──────────────────────────────────────────────────────

  const handleDownloadTemplate = async () => {
    const content = [CSV_HEADERS.join(','), ...TEMPLATE_ROWS].join('\n');

    if (Platform.OS === 'web') {
      const blob = new Blob([content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'staff_import_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    const path = FileSystem.cacheDirectory + 'staff_import_template.csv';
    await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Save staff template' });
    } else {
      Alert.alert('Template ready', `Saved to: ${path}`);
    }
  };

  // ── CSV upload ─────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    let text: string;
    if (Platform.OS === 'web') {
      text = await fetch(result.assets[0].uri).then((r) => r.text());
    } else {
      text = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
    }

    const parsed = parseCSV(text);
    if (!parsed.length) { Alert.alert('Empty file', 'No rows found in the CSV.'); return; }
    setRows(parsed);
    setStep(3);
  };

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    const valid = rows.filter((r) => r.valid);
    if (!valid.length) { Alert.alert('No valid rows', 'Fix all errors before importing.'); return; }

    haptics.medium();
    setImporting(true);

    const { data: { session } } = await supabase.auth.getSession();
    const importResults: ImportResult[] = [];

    for (const row of valid) {
      try {
        // 1. Create staff record (no auth user yet)
        const { data: newStaff, error: staffErr } = await (supabase as any)
          .from('staff')
          .insert({
            school_id: schoolId,
            full_name: row.full_name,
            email: row.email,
            phone: row.phone || null,
            department: row.department || null,
            // Use CSV's employee_id as staff_number if provided; else trigger auto-generates
            ...(row.employee_id ? { staff_number: row.employee_id } : {}),
            date_joined: row.join_date || new Date().toISOString().split('T')[0],
            status: row.status || 'active',
          })
          .select('id')
          .single();

        if (staffErr) {
          importResults.push({ full_name: row.full_name, email: row.email, role: row.role, error: staffErr.message });
          continue;
        }

        const staffId = (newStaff as any).id;

        // 2. Assign role
        await (supabase as any).from('staff_roles').insert({
          school_id: schoolId,
          staff_id: staffId,
          role: row.role,
        });

        // 3. Create auth user + send invite (get temp password)
        const res = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/invite-user`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              staff_id: staffId,
              email: row.email,
              full_name: row.full_name,
              school_id: schoolId,
            }),
          },
        );
        const json = await res.json();

        if (!res.ok) {
          importResults.push({ full_name: row.full_name, email: row.email, role: row.role, error: json.error ?? 'Invite failed' });
        } else {
          importResults.push({ full_name: row.full_name, email: row.email, role: row.role, temp_password: json.temp_password });
        }
      } catch (e: any) {
        importResults.push({ full_name: row.full_name, email: row.email, role: row.role, error: e.message ?? 'Unknown error' });
      }
    }

    haptics.success();
    setResults(importResults);
    setImporting(false);
    setStep(4);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => step > 1 ? setStep((s) => (s - 1) as Step) : router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <ThemedText variant="h4" style={{ flex: 1, textAlign: 'center' }}>Import Staff</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <StepBar step={step} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Step 1: Template ── */}
        {step === 1 && (
          <View style={{ gap: Spacing.base }}>
            <View style={[styles.infoBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <ThemedText variant="label" color="muted" style={{ fontSize: 10, marginBottom: 8 }}>REQUIRED COLUMNS</ThemedText>
              {['first_name', 'last_name', 'email', 'role'].map((h) => (
                <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 }}>
                  <View style={[styles.dot, { backgroundColor: colors.brand.primary }]} />
                  <ThemedText variant="bodySm" style={{ fontFamily: 'monospace' }}>{h}</ThemedText>
                </View>
              ))}
              <ThemedText variant="label" color="muted" style={{ fontSize: 10, marginTop: 12, marginBottom: 8 }}>OPTIONAL COLUMNS</ThemedText>
              {['employee_id', 'phone', 'department', 'join_date', 'status'].map((h) => (
                <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 }}>
                  <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
                  <ThemedText variant="bodySm" style={{ fontFamily: 'monospace', color: colors.textMuted }}>{h}</ThemedText>
                </View>
              ))}
              <ThemedText variant="caption" color="muted" style={{ marginTop: 8 }}>
                Valid roles: {VALID_ROLES.join(', ')}. Email is used as the unique identifier — extra CSV columns (subject, gender, address, etc.) are ignored for now. Passwords are auto-generated and shown on the Done screen so you can hand them to staff.
              </ThemedText>
            </View>

            <TouchableOpacity onPress={handleDownloadTemplate} style={[styles.actionBtn, { backgroundColor: colors.brand.primary }]}>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>Download Template CSV</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setStep(2)} style={[styles.outlineBtn, { borderColor: colors.brand.primary }]}>
              <ThemedText variant="body" style={{ color: colors.brand.primary, fontWeight: '700' }}>Skip — I have my own CSV</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 2: Upload ── */}
        {step === 2 && (
          <View style={{ gap: Spacing.base }}>
            <ThemedText variant="body" color="secondary" style={{ lineHeight: 22 }}>
              Fill in your CSV using the template format and upload it here. One staff member per row.
            </ThemedText>
            <TouchableOpacity onPress={handleUpload} style={[styles.uploadZone, { backgroundColor: colors.surfaceSecondary, borderColor: colors.brand.primary + '60' }]}>
              <Ionicons name="cloud-upload-outline" size={36} color={colors.brand.primary} />
              <ThemedText variant="body" style={{ color: colors.brand.primary, fontWeight: '600', marginTop: Spacing.sm }}>Tap to select CSV file</ThemedText>
              <ThemedText variant="caption" color="muted">.csv files only</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 3: Preview ── */}
        {step === 3 && (
          <View style={{ gap: Spacing.base }}>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <View style={[styles.countCard, { backgroundColor: Colors.semantic.success + '12', borderColor: Colors.semantic.success + '30' }]}>
                <ThemedText variant="h3" style={{ color: Colors.semantic.success }}>{validCount}</ThemedText>
                <ThemedText variant="caption" style={{ color: Colors.semantic.success }}>Valid</ThemedText>
              </View>
              {invalidCount > 0 && (
                <View style={[styles.countCard, { backgroundColor: Colors.semantic.error + '12', borderColor: Colors.semantic.error + '30' }]}>
                  <ThemedText variant="h3" style={{ color: Colors.semantic.error }}>{invalidCount}</ThemedText>
                  <ThemedText variant="caption" style={{ color: Colors.semantic.error }}>Errors</ThemedText>
                </View>
              )}
            </View>

            {rows.map((row, i) => (
              <View
                key={i}
                style={[
                  styles.previewRow,
                  { backgroundColor: row.valid ? colors.surface : Colors.semantic.error + '08', borderColor: row.valid ? colors.border : Colors.semantic.error + '40' },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{row.full_name || '—'}</ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {row.email}{row.role ? ' · ' + (ROLE_LABELS[row.role] ?? row.role) : ''}
                  </ThemedText>
                  {row.errors.map((e, j) => (
                    <ThemedText key={j} variant="caption" style={{ color: Colors.semantic.error }}>✕ {e}</ThemedText>
                  ))}
                </View>
                <Ionicons
                  name={row.valid ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={row.valid ? Colors.semantic.success : Colors.semantic.error}
                />
              </View>
            ))}

            {invalidCount > 0 && (
              <View style={[styles.warnBox, { backgroundColor: Colors.semantic.warning + '12', borderColor: Colors.semantic.warning + '40' }]}>
                <Ionicons name="warning-outline" size={14} color={Colors.semantic.warning} />
                <ThemedText variant="caption" style={{ color: Colors.semantic.warning, flex: 1, marginLeft: 6 }}>
                  {invalidCount} row{invalidCount !== 1 ? 's' : ''} with errors will be skipped. Only valid rows will be imported.
                </ThemedText>
              </View>
            )}

            <TouchableOpacity
              onPress={handleImport}
              disabled={validCount === 0 || importing}
              style={[styles.actionBtn, { backgroundColor: validCount > 0 && !importing ? Colors.semantic.success : colors.border }]}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                {importing ? 'Importing…' : `Import ${validCount} Staff Member${validCount !== 1 ? 's' : ''}`}
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <View style={{ gap: Spacing.base }}>
            <View style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.base }}>
              <View style={[styles.successCircle, { backgroundColor: Colors.semantic.success + '15' }]}>
                <Ionicons name="checkmark-circle" size={56} color={Colors.semantic.success} />
              </View>
              <ThemedText variant="h3" style={{ color: Colors.semantic.success }}>Import Complete</ThemedText>
              <ThemedText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                {results.filter((r) => !r.error).length} of {results.length} staff imported successfully.
              </ThemedText>
              <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginTop: -Spacing.sm }}>
                Temporary passwords are saved. Go to Staff → Pending to view and share them any time.
              </ThemedText>
            </View>

            {results.map((r, i) => (
              <View
                key={i}
                style={[
                  styles.previewRow,
                  { backgroundColor: r.error ? Colors.semantic.error + '08' : colors.surface, borderColor: r.error ? Colors.semantic.error + '40' : colors.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{r.full_name}</ThemedText>
                  <ThemedText variant="caption" color="muted">{r.email} · {ROLE_LABELS[r.role] ?? r.role}</ThemedText>
                  {r.temp_password && (
                    <ThemedText variant="caption" style={{ color: colors.brand.primary, fontFamily: 'monospace', marginTop: 2 }}>
                      Temp password: {r.temp_password}
                    </ThemedText>
                  )}
                  {r.error && (
                    <ThemedText variant="caption" style={{ color: Colors.semantic.error }}>✕ {r.error}</ThemedText>
                  )}
                </View>
                <Ionicons
                  name={r.error ? 'close-circle' : 'checkmark-circle'}
                  size={18}
                  color={r.error ? Colors.semantic.error : Colors.semantic.success}
                />
              </View>
            ))}

            <TouchableOpacity
              onPress={() => router.back()}
              style={[styles.actionBtn, { backgroundColor: colors.brand.primary, marginTop: Spacing.sm }]}
            >
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>View Staff List</ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm,
  },
  scroll: { padding: Spacing.base, paddingBottom: 40 },
  infoBox: { padding: Spacing.base, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth },
  dot: { width: 6, height: 6, borderRadius: 3 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg },
  outlineBtn: { alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  uploadZone: {
    alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, borderRadius: Radius.lg,
    borderWidth: 2, borderStyle: 'dashed', gap: 4,
  },
  countCard: { flex: 1, alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  previewRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.xs,
  },
  warnBox: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  successCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
});
