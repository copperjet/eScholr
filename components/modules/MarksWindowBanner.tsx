import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../ui';
import { Spacing } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';

interface MarksWindowBannerProps {
  isOpen: boolean;
  /** e.g. "15 Nov 2026" */
  closesAt?: string;
}

export function MarksWindowBanner({ isOpen, closesAt }: MarksWindowBannerProps) {
  if (isOpen) {
    if (!closesAt) return null;
    return (
      <View style={[styles.banner, { backgroundColor: Colors.semantic.warningLight }]}>
        <Ionicons name="time-outline" size={14} color={Colors.semantic.warning} />
        <ThemedText variant="bodySm" style={{ color: Colors.semantic.warning, marginLeft: Spacing.sm, flex: 1 }}>
          Marks window closes {closesAt}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.banner, { backgroundColor: Colors.semantic.errorLight }]}>
      <Ionicons name="lock-closed" size={14} color={Colors.semantic.error} />
      <ThemedText variant="bodySm" style={{ color: Colors.semantic.error, marginLeft: Spacing.sm, flex: 1 }}>
        Marks window is closed. All fields are read-only.{' '}
        <ThemedText variant="bodySm" style={{ color: Colors.semantic.error, fontWeight: '700' }}>
          Contact Admin to reopen.
        </ThemedText>
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
