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
  const { setUser, setSchool, setReady, school } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const meta = session.user.app_metadata as any;
        const schoolId = meta?.school_id ?? '';
        setUser({
          id: session.user.id,
          email: session.user.email ?? '',
          fullName: session.user.user_metadata?.full_name ?? '',
          staffId: meta?.staff_id ?? null,
          parentId: meta?.parent_id ?? null,
          roles: meta?.roles ?? [],
          activeRole: meta?.active_role ?? 'hrt',
          schoolId,
        });
        if (schoolId) {
          const { data: schoolData } = await supabase
            .from('schools')
            .select('*')
            .eq('id', schoolId)
            .single();
          if (schoolData) setSchool(schoolData as any);
        }
      }
      setReady(true);
      SplashScreen.hideAsync();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setSchool(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const brand = school
    ? { primary: school.primary_color ?? '#1B2A4A', secondary: school.secondary_color ?? '#E8A020' }
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
