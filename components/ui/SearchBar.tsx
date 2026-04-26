import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing, Typography } from '../../constants/Typography';

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  debounceMs?: number;
  style?: ViewStyle;
  autoFocus?: boolean;
}

export function SearchBar({
  placeholder = 'Search…',
  value,
  onChangeText,
  debounceMs = 200,
  style,
  autoFocus,
}: SearchBarProps) {
  const { colors } = useTheme();
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (text: string) => {
    setLocalValue(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChangeText(text), debounceMs);
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceSecondary,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.icon} />
      <TextInput
        value={localValue}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoFocus={autoFocus}
        style={[
          Typography.body,
          { flex: 1, color: colors.textPrimary, paddingVertical: 0 },
        ]}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {localValue.length > 0 && (
        <TouchableOpacity onPress={() => handleChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    height: 46,
  },
  icon: {
    marginRight: Spacing.sm,
  },
});
