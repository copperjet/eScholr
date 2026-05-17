/**
 * Wires React Query's onlineManager + focusManager to RN primitives.
 *
 * - `onlineManager`: tells React Query when the device is offline so
 *   queries can pause and mutations can queue safely.
 * - `focusManager`: refetches stale queries when the user brings the
 *   app back to foreground (e.g. after switching tabs / locking phone).
 *
 * Call `setupNetworkManager()` once at app boot.
 */
import { focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus, Platform } from 'react-native';

let initialised = false;

export function setupNetworkManager() {
  if (initialised) return;
  initialised = true;

  // ── Online status ──────────────────────────────────────────────
  onlineManager.setEventListener((setOnline) => {
    const sub = NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected);
    });
    return () => sub();
  });

  // ── App focus (foreground/background) ──────────────────────────
  // On web, React Query handles `visibilitychange` automatically.
  if (Platform.OS !== 'web') {
    const onChange = (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    };
    const sub = AppState.addEventListener('change', onChange);
    // Cleanup at process exit; in practice this lives for the app lifetime.
    return () => sub.remove();
  }
}
