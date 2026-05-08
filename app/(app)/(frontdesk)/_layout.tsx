import { Tabs, Redirect, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { AppTabBar, ResponsiveShell } from '../../../components/ui';
import { useShouldShowSidebar } from '../../../lib/responsive';
import { useIsModuleEnabled } from '../../../hooks/useSchoolModules';
import { useFrontDeskRealtime } from '../../../hooks/useRealtimeSync';

export default function FrontDeskLayout() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const showSidebar = useShouldShowSidebar();
  const frontdeskEnabled = useIsModuleEnabled('frontdesk');

  // Realtime: invalidate students/inquiries/admissions caches on DB change
  useFrontDeskRealtime(user?.schoolId ?? '');

  if (user && user.activeRole !== 'front_desk') {
    return <Redirect href="/" />;
  }
  if (!frontdeskEnabled) {
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
      <Tabs.Screen name="home"         options={{ title: 'Home',         tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="inquiries"    options={{ title: 'Inquiries',    tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="applications" options={{ title: 'Applications', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="students"     options={{ title: 'Students',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="more"         options={{ title: 'More',         tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="inquiry-detail"    options={{ href: null }} />
      <Tabs.Screen name="application-detail" options={{ href: null }} />
      <Tabs.Screen name="student-detail"    options={{ href: null }} />
      <Tabs.Screen name="student-edit"      options={{ href: null }} />
      <Tabs.Screen name="visitors"          options={{ href: null }} />
    </Tabs>
  );
}
