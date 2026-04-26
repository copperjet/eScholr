import React, { useState } from 'react';
import {
  View,
  TextInput as RNTextInput,
  TextInputProps,
  StyleSheet,
  Pressable,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius } from '../../constants/Typography';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface FormFieldProps extends TextInputProps {
  label?: string;
  helper?: string;
  error?: string;
  iconLeft?: IoniconsName;
  iconRight?: IoniconsName;
  onIconRightPress?: () => void;
  containerStyle?: ViewStyle;
  /** multiline textarea */
  textarea?: boolean;
}

export function FormField({
  label,
  helper,
  error,
  iconLeft,
  iconRight,
  onIconRightPress,
  containerStyle,
  textarea = false,
  secureTextEntry,
  style,
  ...props
}: FormFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secureTextEntry ?? false);

  const borderColor = error ? '#DC2626' : focused ? colors.brand.primary : colors.border;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <ThemedText style={styles.label}>{label}</ThemedText>
      ) : null}

      <View style={[styles.inputRow, { borderColor, backgroundColor: colors.surface }]}>
        {iconLeft ? (
          <Ionicons name={iconLeft} size={18} color={focused ? colors.brand.primary : colors.textMuted} style={styles.iconLeft} />
        ) : null}

        <RNTextInput
          {...props}
          secureTextEntry={hidden}
          multiline={textarea}
          numberOfLines={textarea ? 4 : 1}
          textAlignVertical={textarea ? 'top' : 'center'}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
          style={[
            styles.input,
            { color: colors.textPrimary, minHeight: textarea ? 88 : undefined },
            style,
          ]}
          placeholderTextColor={colors.textMuted}
        />

        {secureTextEntry ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8} style={styles.iconRight}>
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
          </Pressable>
        ) : iconRight ? (
          <Pressable onPress={onIconRightPress} hitSlop={8} style={styles.iconRight}>
            <Ionicons name={iconRight} size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <ThemedText style={styles.error}>{error}</ThemedText>
      ) : helper ? (
        <ThemedText variant="caption" color="muted" style={styles.helper}>{helper}</ThemedText>
      ) : null}
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
  iconRight: {
    marginLeft: Spacing.sm,
  },
  input: {
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
});
