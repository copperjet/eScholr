import { Redirect, Stack, router, usePathname } from 'expo-router';
import { View, Platform } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { OfflineBanner, BiometricEnrollModal } from '../../components/ui';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerPushToken(userId: string, schoolId: string) {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;
    const deviceId = `${Platform.OS}-${Date.now()}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('push_tokens').upsert({
      user_id: userId,
      school_id: schoolId,
      device_id: deviceId,
      push_token: pushToken,
      platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    }, { onConflict: 'user_id,device_id' });
  } catch {
    // Non-fatal — push token registration failure should not break the app
  }
}

export default function AppLayout() {
  const { user, school, isReady } = useAuthStore();
  const pathname = usePathname();
  const notifListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const [mustResetPassword, setMustResetPassword] = useState(false);

  // Read the must_reset_password flag from the live session each time
  // the user changes. Cheaper than wiring it through the auth store.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const flag = (data.session?.user.user_metadata as any)?.must_reset_password === true;
      setMustResetPassword(flag);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;

    // Push notifications not supported on web
    if (Platform.OS === 'web') return;

    registerPushToken(user.id, user.schoolId ?? '');

    notifListener.current = Notifications.addNotificationReceivedListener(_notification => {
      // Foreground notification — badge updates handled by handler above
    });

    // Tapped notification → deep link
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const deepLink = response.notification.request.content.data?.deep_link_url as string | undefined;
      if (deepLink) {
        router.push(deepLink as any);
      }
    });

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [user?.id]);

  if (isReady && !user) {
    return <Redirect href={school ? '/(auth)/login' : '/(auth)/school-code'} />;
  }

  // Force password reset on first login (temp password issued by admin).
  if (user && mustResetPassword && pathname !== '/reset-password' && !pathname?.endsWith('/reset-password')) {
    return <Redirect href="/(app)/reset-password" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <OfflineBanner />
      {user && <BiometricEnrollModal userId={user.id} />}
    </View>
  );
}
