import { useEffect } from 'react';
import { Tabs, Redirect, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { AppTabBar, ResponsiveShell } from '../../../components/ui';
import { useShouldShowSidebar } from '../../../lib/responsive';

export default function LibrarianLayout() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const showSidebar = useShouldShowSidebar();
  const qc = useQueryClient();
  const schoolId = user?.schoolId ?? '';

  // Realtime: invalidate queries on library table changes
  useEffect(() => {
    if (!schoolId) return;
    const channel = (supabase as any)
      .channel('library-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'library_books', filter: `school_id=eq.${schoolId}` }, () => {
        qc.invalidateQueries({ queryKey: ['library-books', schoolId] });
        qc.invalidateQueries({ queryKey: ['library-dashboard', schoolId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'library_transactions', filter: `school_id=eq.${schoolId}` }, () => {
        qc.invalidateQueries({ queryKey: ['library-transactions', schoolId] });
        qc.invalidateQueries({ queryKey: ['library-dashboard', schoolId] });
        qc.invalidateQueries({ queryKey: ['library-overdue', schoolId] });
      })
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [schoolId, qc]);

  if (user && user.activeRole !== 'librarian') {
    return <Redirect href="/" />;
  }

  if (showSidebar) {
    return (
      <ResponsiveShell>
        <Slot />
      </ResponsiveShell>
    );
  }

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.icon,
      }}
    >
      <Tabs.Screen name="home"    options={{ title: 'Home',    tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="catalog" options={{ title: 'Catalog', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'library' : 'library-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="loans"   options={{ title: 'Loans',   tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'swap-horizontal' : 'swap-horizontal-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="more"    options={{ title: 'More',    tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      {/* Hidden screens */}
      <Tabs.Screen name="book-detail"       options={{ href: null }} />
      <Tabs.Screen name="book-form"         options={{ href: null }} />
      <Tabs.Screen name="book-import"       options={{ href: null }} />
      <Tabs.Screen name="scan"              options={{ href: null }} />
      <Tabs.Screen name="checkout"          options={{ href: null }} />
      <Tabs.Screen name="collections"       options={{ href: null }} />
      <Tabs.Screen name="collection-detail" options={{ href: null }} />
      <Tabs.Screen name="patrons"           options={{ href: null }} />
      <Tabs.Screen name="patron-detail"     options={{ href: null }} />
      <Tabs.Screen name="settings"          options={{ href: null }} />
      <Tabs.Screen name="quick-checkin"     options={{ href: null }} />
      <Tabs.Screen name="quick-checkout"    options={{ href: null }} />
    </Tabs>
  );
}
