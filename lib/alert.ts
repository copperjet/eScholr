import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirm dialog.
 * Native: Alert.alert with Cancel/Confirm buttons.
 * Web: window.confirm (synchronous browser dialog).
 */
export function webConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

/**
 * Cross-platform info/success/error alert.
 * Native: Alert.alert.
 * Web: window.alert (synchronous browser dialog).
 */
export function webAlert(title: string, message?: string, onOk?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n${message}` : title);
    onOk?.();
    return;
  }
  Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
}
