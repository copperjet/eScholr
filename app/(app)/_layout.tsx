import { Redirect, Stack, router } from 'expo-router';
import { View, Platform } from 'react-native';
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { OfflineBanner } from '../../components/ui';

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
    await (supabase.from('push_tokens') as any).upsert({
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
  const notifListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    if (!user) return;
    registerPushToken(user.id, user.schoolId);

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

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <OfflineBanner />
    </View>
  );
}
