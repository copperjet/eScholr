import React, { useEffect, useRef } from 'react';
import {
  View,
  Modal,
  Animated,
  TouchableWithoutFeedback,
  StyleSheet,
  Dimensions,
  ViewStyle,
  PanResponder,
  ScrollView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing } from '../../constants/Typography';
import { ThemedText } from './ThemedText';

const { height: SCREEN_H } = Dimensions.get('window');

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapHeight?: number;
}

export function BottomSheet({ visible, onClose, title, children, snapHeight = SCREEN_H * 0.55 }: BottomSheetProps) {
  const { colors } = useTheme();
  const translateY = useRef(new Animated.Value(snapHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 180 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: snapHeight, duration: 260, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // Web: dismiss on Escape key
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  // PanResponder only works on mobile, skip on web
  const panResponder = useRef(
    Platform.OS !== 'web'
      ? PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
          onPanResponderMove: (_, g) => {
            if (g.dy > 0) translateY.setValue(g.dy);
          },
          onPanResponderRelease: (_, g) => {
            if (g.dy > 80 || g.vy > 0.8) {
              onClose();
            } else {
              Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20 }).start();
            }
          },
        })
      : undefined
  ).current;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { backgroundColor: colors.overlay, opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            height: snapHeight,
            transform: [{ translateY }],
          },
        ]}
        {...(Platform.OS !== 'web' && panResponder ? { ...panResponder.panHandlers } : {})}
      >
        <View style={styles.handle}>
          {Platform.OS !== 'web' && (
            <View style={[styles.pill, { backgroundColor: colors.border }]} />
          )}
          <View style={styles.headerRow}>
            {title && (
              <ThemedText variant="h4" style={styles.title}>{title}</ThemedText>
            )}
            {Platform.OS === 'web' && (
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {Platform.OS === 'web' ? (
          <View style={[styles.content, styles.contentInner, { overflowY: 'auto' } as any]}>
            {children}
          </View>
        ) : (
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentInner}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {children}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  handle: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Spacing.lg,
  },
  pill: {
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    marginBottom: Spacing.sm,
  },
  title: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    flex: 1,
  },
  closeBtn: {
    padding: Spacing.sm,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.base,
  },
  contentInner: {
    paddingBottom: Spacing.xl,
  },
});
