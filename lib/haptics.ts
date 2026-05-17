import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const isSupported = Platform.OS !== 'web';

export const haptics = {
  light: () => isSupported && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => isSupported && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => isSupported && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => isSupported && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => isSupported && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => isSupported && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  selection: () => isSupported && Haptics.selectionAsync(),
};
