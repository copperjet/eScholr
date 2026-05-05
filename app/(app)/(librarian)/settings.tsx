import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, Platform } from 'react-native';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useLibrarySettings, useUpsertLibrarySettings } from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, Card, FormField, Button,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: settings, isLoading } = useLibrarySettings(schoolId);
  const upsertMut = useUpsertLibrarySettings(schoolId);

  const [loanDays, setLoanDays] = useState('14');
  const [maxStudent, setMaxStudent] = useState('3');
  const [maxStaff, setMaxStaff] = useState('5');
  const [overdueDays, setOverdueDays] = useState('3');

  useEffect(() => {
    if (settings) {
      setLoanDays(String(settings.default_loan_days));
      setMaxStudent(String(settings.max_books_per_student));
      setMaxStaff(String(settings.max_books_per_staff));
      setOverdueDays(String(settings.overdue_notification_days));
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await upsertMut.mutateAsync({
        defaultLoanDays: parseInt(loanDays, 10) || 14,
        maxBooksPerStudent: parseInt(maxStudent, 10) || 3,
        maxBooksPerStaff: parseInt(maxStaff, 10) || 5,
        overdueNotificationDays: parseInt(overdueDays, 10) || 3,
      });
      if (Platform.OS === 'web') {
        window.alert('Library settings updated.');
      } else {
        Alert.alert('Saved', 'Library settings updated.');
      }
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message ?? 'Could not save settings');
      } else {
        Alert.alert('Error', e.message ?? 'Could not save settings');
      }
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Library Settings" showBack />

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <FormField
            label="Default Loan Period (days)"
            value={loanDays}
            onChangeText={setLoanDays}
            keyboardType="numeric"
            placeholder="14"
          />
          <FormField
            label="Max Books per Student"
            value={maxStudent}
            onChangeText={setMaxStudent}
            keyboardType="numeric"
            placeholder="3"
          />
          <FormField
            label="Max Books per Staff"
            value={maxStaff}
            onChangeText={setMaxStaff}
            keyboardType="numeric"
            placeholder="5"
          />
          <FormField
            label="Overdue Notification (days before)"
            value={overdueDays}
            onChangeText={setOverdueDays}
            keyboardType="numeric"
            placeholder="3"
          />
        </Card>

        <View style={{ paddingHorizontal: Spacing.screen, marginTop: Spacing.lg }}>
          <Button
            label="Save Settings"
            onPress={handleSave}
            loading={upsertMut.isPending}
            disabled={upsertMut.isPending}
            fullWidth
          />
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  card: { marginHorizontal: Spacing.screen, marginTop: Spacing.base, padding: Spacing.base, borderRadius: Radius.lg },
});
