import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../lib/theme';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { StyleSheet } from 'react-native';
import { ErrorBoundary } from '../components/ErrorBoundary';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 2,
    },
  },
});

export default function RootLayout() {
  const { setUser, setSchool, setReady, loadPersistedSchool, school } = useAuthStore();

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const result = await supabase.auth.getSession();
        const session = result?.data?.session ?? null;
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
            roles: Array.isArray(meta?.roles) ? meta.roles : [],
            activeRole: meta?.active_role ?? 'hrt',
            schoolId,
          });

          if (schoolId) {
            try {
              const { data: schoolData } = await supabase
                .from('schools')
                .select('*')
                .eq('id', schoolId)
                .single();
              if (schoolData) setSchool(schoolData as any);
            } catch (e) {
              console.warn('[bootstrap] school fetch failed', e);
            }
          }
          // Platform admin: school stays null — no school to load
        } else {
          await loadPersistedSchool();
        }
      } catch (e) {
        console.warn('[bootstrap] getSession failed', e);
      } finally {
        setReady(true);
        try { await SplashScreen.hideAsync(); } catch {}
      }
    };
    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
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
        <QueryClientProvider client={queryClient}>
          <ThemeProvider brand={brand}>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeProvider>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
