/**
 * DatePickerField — cross-platform date picker wrapped in FormField styling.
 *
 * - iOS/Android: tappable field → native DateTimePicker modal
 * - Web: HTML <input type="date"> styled to match design system
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, isValid } from 'date-fns';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius } from '../../constants/Typography';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface DatePickerFieldProps {
  label?: string;
  /** ISO date string YYYY-MM-DD */
  value: string;
  /** Called with ISO date string YYYY-MM-DD */
  onChange: (date: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  /** Minimum selectable date (ISO string) */
  minimumDate?: string;
  /** Maximum selectable date (ISO string) */
  maximumDate?: string;
  /** Display format for the selected date (date-fns pattern) */
  displayFormat?: string;
  iconLeft?: IoniconsName;
}

/**
 * Parse an ISO date string to a Date object at noon (avoids timezone shift).
 * Falls back to today if invalid.
 */
function parseDate(iso: string): Date {
  if (!iso) return new Date();
  // Ensure noon UTC to avoid off-by-one from timezone
  const d = new Date(`${iso}T12:00:00`);
  return isValid(d) ? d : new Date();
}

function toISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/* ─── Native picker (iOS / Android) ─── */
let DateTimePicker: any = null;
if (Platform.OS !== 'web') {
  // Lazy require so web bundle never pulls native module
  try {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch {
    // Package not installed — will fall back to text display
  }
}

export function DatePickerField({
  label,
  value,
  onChange,
  placeholder = 'Select date',
  helper,
  error,
  minimumDate,
  maximumDate,
  displayFormat = 'dd MMM yyyy',
  iconLeft = 'calendar-outline',
}: DatePickerFieldProps) {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const [focused, setFocused] = useState(false);

  const dateObj = parseDate(value);
  const displayText = value ? format(dateObj, displayFormat) : '';
  const borderColor = error ? colors.semantic.error : focused ? colors.brand.primary : colors.border;

  const handleNativeChange = useCallback(
    (_event: any, selectedDate?: Date) => {
      // Android fires on dismiss too
      if (Platform.OS === 'android') setShowPicker(false);
      if (selectedDate) {
        onChange(toISO(selectedDate));
      }
    },
    [onChange],
  );

  const handleIOSDone = useCallback(() => {
    setShowPicker(false);
    setFocused(false);
  }, []);

  /* ── Web: native <input type="date"> ── */
  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrapper}>
        {label ? <ThemedText style={styles.label}>{label}</ThemedText> : null}
        <View style={[styles.inputRow, { borderColor, backgroundColor: colors.surface }]}>
          {iconLeft ? (
            <Ionicons name={iconLeft} size={18} color={focused ? colors.brand.primary : colors.textMuted} style={styles.iconLeft} />
          ) : null}
          <input
            type="date"
            value={value || ''}
            onChange={(e: any) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            min={minimumDate}
            max={maximumDate}
            placeholder={placeholder}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 15,
              color: value ? colors.textPrimary : colors.textMuted,
              fontFamily: 'inherit',
              paddingTop: 14,
              paddingBottom: 14,
              cursor: 'pointer',
            } as any}
          />
        </View>
        {error ? (
          <ThemedText style={styles.error}>{error}</ThemedText>
        ) : helper ? (
          <ThemedText variant="caption" color="muted" style={styles.helper}>{helper}</ThemedText>
        ) : null}
      </View>
    );
  }

  /* ── Native (iOS / Android) ── */
  return (
    <View style={styles.wrapper}>
      {label ? <ThemedText style={styles.label}>{label}</ThemedText> : null}

      <Pressable
        onPress={() => { setShowPicker(true); setFocused(true); }}
        style={[styles.inputRow, { borderColor, backgroundColor: colors.surface }]}
      >
        {iconLeft ? (
          <Ionicons name={iconLeft} size={18} color={focused ? colors.brand.primary : colors.textMuted} style={styles.iconLeft} />
        ) : null}
        <ThemedText
          style={[
            styles.displayText,
            { color: displayText ? colors.textPrimary : colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {displayText || placeholder}
        </ThemedText>
        <Ionicons name="chevron-down-outline" size={16} color={colors.textMuted} />
      </Pressable>

      {error ? (
        <ThemedText style={styles.error}>{error}</ThemedText>
      ) : helper ? (
        <ThemedText variant="caption" color="muted" style={styles.helper}>{helper}</ThemedText>
      ) : null}

      {/* iOS: modal wrapper so user can tap Done */}
      {Platform.OS === 'ios' && showPicker && DateTimePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.iosOverlay}>
            <View style={[styles.iosSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.iosToolbar, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={handleIOSDone}>
                  <ThemedText style={{ color: colors.brand.primary, fontWeight: '600', fontSize: 16 }}>
                    Done
                  </ThemedText>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dateObj}
                mode="date"
                display="spinner"
                onChange={handleNativeChange}
                minimumDate={minimumDate ? parseDate(minimumDate) : undefined}
                maximumDate={maximumDate ? parseDate(maximumDate) : undefined}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Android: inline picker (auto-dismisses) */}
      {Platform.OS === 'android' && showPicker && DateTimePicker && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display="default"
          onChange={handleNativeChange}
          minimumDate={minimumDate ? parseDate(minimumDate) : undefined}
          maximumDate={maximumDate ? parseDate(maximumDate) : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
  },
  iconLeft: {
    marginRight: Spacing.sm,
  },
  displayText: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Spacing.md,
  },
  helper: {
    marginTop: 2,
  },
  error: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 2,
  },
  iosOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  iosSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
  },
  iosToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
