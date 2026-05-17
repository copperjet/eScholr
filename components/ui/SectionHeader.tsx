import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';
import { Spacing } from '../../constants/Typography';

interface SectionHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
  /** Remove the top margin — useful when it's the first item */
  noTopMargin?: boolean;
}

export function SectionHeader({ title, action, onAction, noTopMargin }: SectionHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, noTopMargin && { marginTop: 0 }]}>
      <ThemedText style={styles.title}>{title}</ThemedText>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={8}>
          <ThemedText style={{ color: colors.brand.primary, fontSize: 13, fontWeight: '600' }}>
            {action}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.screen,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
