import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, Button, Card, Badge,
  EmptyState, ErrorState, SectionHeader,
} from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { Ionicons } from '@expo/vector-icons';
import {
  useBackupDestination, useBackupLogs, useTriggerBackup,
  useUpdateBackupSchedule,
} from '../../../hooks/useBackup';
import { Colors } from '../../../constants/Colors';
import { format } from 'date-fns';
import { supabase } from '../../../lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────
const SCHEDULES: Array<{ value: 'manual' | 'daily' | 'weekly' | 'monthly'; label: string; desc: string }> = [
  { value: 'manual',  label: 'Manual',  desc: 'Run only when triggered' },
  { value: 'daily',   label: 'Daily',   desc: 'Every day at midnight' },
  { value: 'weekly',  label: 'Weekly',  desc: 'Every Monday at midnight' },
  { value: 'monthly', label: 'Monthly', desc: '1st of each month' },
];

const BACKED_UP_TABLES = [
  'Students & enrolment',
  'Staff & HR data',
  'Parents & guardians',
  'Attendance records',
  'Marks & assessments',
  'Report cards',
  'Finance & payments',
  'Daybook entries',
  'Leave requests',
  'Library catalog & loans',
];

export default function BackupSettingsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const staffId  = user?.staffId ?? null;

  const { data: destination, isLoading, isError, refetch } = useBackupDestination(schoolId);
  const { data: logs } = useBackupLogs(schoolId);
  const triggerBackup  = useTriggerBackup(schoolId);
  const updateSchedule = useUpdateBackupSchedule(schoolId);

  const [triggering, setTriggering] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // ── Google OAuth via Supabase edge function ─────────────────────────────────
  const handleConnectGoogle = async () => {
    setConnecting(true);
    try {
      // Request OAuth URL from edge function (keeps client secrets server-side)
      const { data, error } = await (supabase as any).functions.invoke('google-drive-auth-url', {
        body: { school_id: schoolId, staff_id: staffId },
      });

      if (error || !data?.url) {
        throw new Error(error?.message ?? data?.error ?? 'Could not generate auth URL');
      }

      // Open Google auth in browser
      const result = await WebBrowser.openAuthSessionAsync(data.url, data.redirect_uri ?? '');

      if (result.type === 'success' && result.url) {
        // Pass callback URL to edge function to complete token exchange
        const url = result.url;
        const { data: tokenData, error: tokenError } = await (supabase as any).functions.invoke('google-drive-auth-callback', {
          body: { callback_url: url, school_id: schoolId, staff_id: staffId },
        });

        if (tokenError || !tokenData?.success) {
          throw new Error(tokenError?.message ?? tokenData?.error ?? 'Token exchange failed');
        }

        refetch();
        const msg = 'Google Drive connected! Data will be backed up to "eScholr Backups".';
        if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Connected', msg); }
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // User cancelled — no action needed
      }
    } catch (e: any) {
      const msg = e.message ?? 'Could not connect Google Drive';
      if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Connection Failed', msg); }
    } finally {
      setConnecting(false);
    }
  };

  const handleTriggerBackup = async () => {
    if (!destination) {
      if (Platform.OS === 'web') { window.alert('Google Drive not connected.'); }
      else { Alert.alert('Error', 'Google Drive not connected'); }
      return;
    }
    setTriggering(true);
    try {
      const result = await triggerBackup.mutateAsync({ triggeredBy: staffId! });
      if (result.success) {
        const msg = `Backup complete.\n${result.total_records.toLocaleString()} records → ${result.filename}`;
        if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Backup Complete', msg); }
      }
    } catch (e: any) {
      const msg = e.message ?? 'Backup failed';
      if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Error', msg); }
    }
    setTriggering(false);
  };

  const handleScheduleChange = async (schedule: 'manual' | 'daily' | 'weekly' | 'monthly') => {
    try {
      await updateSchedule.mutateAsync(schedule);
    } catch (e: any) {
      const msg = e.message ?? 'Could not update schedule';
      if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Error', msg); }
    }
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load settings" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Backup Settings" showBack />

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Connection status ── */}
        <Card style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md }}>
            <Ionicons name="logo-google" size={24} color={destination ? '#4285F4' : colors.textMuted} />
            <ThemedText variant="h4" style={{ marginLeft: Spacing.md }}>Google Drive</ThemedText>
          </View>

          {isLoading ? (
            <View style={{ height: 14, width: '50%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
          ) : destination ? (
            <>
              <Badge label="Connected" preset="success" style={{ alignSelf: 'flex-start' }} />
              <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm }}>
                Folder: {destination.folder_name ?? 'eScholr Backups'}
              </ThemedText>
              {destination.last_backup_at && (
                <ThemedText variant="caption" color="muted">
                  Last backup: {format(new Date(destination.last_backup_at), 'dd MMM yyyy, HH:mm')}
                </ThemedText>
              )}
              {destination.last_backup_status === 'failed' && destination.last_backup_error && (
                <ThemedText variant="caption" style={{ color: Colors.semantic.error, marginTop: Spacing.xs }}>
                  Last error: {destination.last_backup_error}
                </ThemedText>
              )}
              <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
                <Button
                  label={triggering ? 'Backing up…' : 'Backup Now'}
                  onPress={handleTriggerBackup}
                  disabled={triggering}
                  style={{ flex: 1 }}
                />
                <Button
                  label={connecting ? 'Connecting…' : 'Reconnect'}
                  variant="secondary"
                  onPress={handleConnectGoogle}
                  disabled={connecting}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          ) : (
            <>
              <Badge label="Not Connected" preset="neutral" style={{ alignSelf: 'flex-start' }} />
              <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm, marginBottom: Spacing.lg }}>
                Connect Google Drive to enable automatic school data backups.
              </ThemedText>
              <Button
                label={connecting ? 'Connecting…' : 'Connect Google Drive'}
                onPress={handleConnectGoogle}
                disabled={connecting}
                fullWidth
              />
            </>
          )}
        </Card>

        {/* ── Schedule ── */}
        {destination && (
          <>
            <SectionHeader title="Backup Schedule" />
            <View style={styles.scheduleGrid}>
              {SCHEDULES.map((s) => (
                <Button
                  key={s.value}
                  label={s.label}
                  variant={destination.schedule === s.value ? 'primary' : 'secondary'}
                  onPress={() => handleScheduleChange(s.value)}
                  disabled={updateSchedule.isPending}
                  style={styles.scheduleBtn}
                />
              ))}
            </View>
            <ThemedText variant="caption" color="muted" style={{ paddingHorizontal: Spacing.screen, marginBottom: Spacing.base }}>
              {SCHEDULES.find((s) => s.value === destination.schedule)?.desc ?? ''}
            </ThemedText>
          </>
        )}

        {/* ── What's backed up ── */}
        <SectionHeader title="What's Included" />
        <Card style={styles.card}>
          {BACKED_UP_TABLES.map((item) => (
            <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 }}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.semantic.success} />
              <ThemedText variant="bodySm">{item}</ThemedText>
            </View>
          ))}
        </Card>

        {/* ── Backup history ── */}
        <SectionHeader title="Backup History" />
        {(logs ?? []).length === 0 ? (
          <EmptyState title="No backups yet" description="Backup history appears here." icon="cloud-upload-outline" />
        ) : (
          (logs ?? []).map((log: any) => (
            <Card key={log.id} style={[styles.card, { padding: Spacing.md }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '600' }} numberOfLines={1}>{log.file_name}</ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {format(new Date(log.started_at), 'dd MMM yyyy, HH:mm')}
                  </ThemedText>
                  {log.total_records != null && (
                    <ThemedText variant="caption" color="muted">
                      {log.total_records.toLocaleString()} records
                    </ThemedText>
                  )}
                  {log.error_message && (
                    <ThemedText variant="caption" style={{ color: Colors.semantic.error }} numberOfLines={2}>
                      {log.error_message}
                    </ThemedText>
                  )}
                </View>
                <Badge
                  label={log.status}
                  preset={log.status === 'success' ? 'success' : log.status === 'started' ? 'warning' : 'error'}
                />
              </View>
            </Card>
          ))
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  card: { marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.lg },
  scheduleGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.screen, gap: Spacing.sm, marginBottom: Spacing.sm },
  scheduleBtn: { flex: 1, minWidth: '45%' },
});
