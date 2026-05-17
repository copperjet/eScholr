import { Tabs, Redirect, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { AppTabBar, ResponsiveShell } from '../../../components/ui';
import { useShouldShowSidebar } from '../../../lib/responsive';

export default function PlatformLayout() {
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const showSidebar = useShouldShowSidebar();

  // Only the platform-level super_admin (no school attached) can access this layout.
  // school_super_admin has a schoolId and must never reach here.
  if (!user || user.activeRole !== 'super_admin' || user.schoolId !== null) {
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
      <Tabs.Screen name="home"    options={{ title: 'Schools',  tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="more"    options={{ title: 'Account',  tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={22} color={color} /> }} />
      {/* Hidden screens */}
      <Tabs.Screen name="school-detail"     options={{ href: null }} />
      <Tabs.Screen name="onboard"           options={{ href: null }} />
      <Tabs.Screen name="metrics"           options={{ href: null }} />
      <Tabs.Screen name="impersonation-log" options={{ href: null }} />
      <Tabs.Screen name="broadcast"         options={{ href: null }} />
    </Tabs>
  );
}
