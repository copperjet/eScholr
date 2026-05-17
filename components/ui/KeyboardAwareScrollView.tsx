import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  /** Extra bottom padding added on top of the safe-area inset. */
  extraBottomSpace?: number;
  children?: React.ReactNode;
}

/**
 * ScrollView that lifts content above the software keyboard and respects the
 * bottom safe-area inset. On web it degrades to a plain ScrollView.
 */
export function KeyboardAwareScrollView({
  extraBottomSpace = 24,
  contentContainerStyle,
  children,
  ...props
}: KeyboardAwareScrollViewProps) {
  const insets = useSafeAreaInsets();
  const padStyle: ViewStyle = { paddingBottom: insets.bottom + extraBottomSpace };

  const scroll = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      {...props}
      contentContainerStyle={[contentContainerStyle, padStyle]}
    >
      {children}
    </ScrollView>
  );

  if (Platform.OS === 'web') return scroll;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {scroll}
    </KeyboardAvoidingView>
  );
}
