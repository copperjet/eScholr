import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ThemeProvider } from '../lib/theme';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { StyleSheet } from 'react-native';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { queryClient, asyncStoragePersister, CACHE_BUSTER } from '../lib/queryClient';
import { setupNetworkManager } from '../lib/networkManager';

SplashScreen.preventAutoHideAsync();
setupNetworkManager();

export default function RootLayout() {
  const { setUser, setSchool, setReady, loadPersistedSchool, school } = useAuthStore();

  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Kick off session + persisted school in parallel so splash hides sooner.
        const [sessionResult] = await Promise.all([
          supabase.auth.getSession(),
          loadPersistedSchool(),
        ]);
        const session = sessionResult?.data?.session ?? null;
        if (session?.user) {
          const meta = (session.user.app_metadata ?? {}) as any;
          const userMeta = (session.user.user_metadata ?? {}) as any;
          // Platform admin has no school_id — keep as null
          const schoolId: string | null = meta?.school_id ?? null;

          setUser({
            id: session.user.id,
            email: session.user.email ?? '',
            fullName: userMeta?.full_name ?? '',
            staffId: meta?.staff_id ?? null,
            parentId: meta?.parent_id ?? null,
            studentId: meta?.student_id ?? null,
            department: null,
            roles: Array.isArray(meta?.roles) ? meta.roles : [],
            activeRole: meta?.active_role ?? 'hrt',
            schoolId,
          });

          if (schoolId) {
            // Fire in background — UI already has persisted school loaded in parallel above.
            (supabase as any)
              .from('schools')
              .select('*')
              .eq('id', schoolId)
              .single()
              .then(({ data: schoolData }: { data: any }) => {
                if (schoolData) setSchool(schoolData as any);
              })
              .catch((e: any) => console.warn('[bootstrap] school fetch failed', e));
          }
          // Platform admin: school stays null — no school to load
        }
      } catch (e) {
        console.warn('[bootstrap] getSession failed', e);
      } finally {
        setReady(true);
        try { await SplashScreen.hideAsync(); } catch {}
      }
    };
    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Password-recovery email link → land directly on the reset
      // screen even though the user appears 'signed in' for a moment.
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/(app)/reset-password' as any);
        return;
      }
      if (!session) {
        setUser(null);
        setSchool(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const brand = school
    ? { primary: school.primary_color ?? undefined, secondary: school.secondary_color ?? undefined }
    : undefined;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
            maxAge: 1000 * 60 * 60 * 24, // 24h
            buster: CACHE_BUSTER,
          }}
        >
          <ThemeProvider brand={brand}>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeProvider>
        </PersistQueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
