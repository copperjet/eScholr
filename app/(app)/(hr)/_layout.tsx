import { Tabs, Redirect, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../stores/authStore';
import { useTheme } from '../../../lib/theme';
import { AppTabBar, ResponsiveShell } from '../../../components/ui';
import { useShouldShowSidebar } from '../../../lib/responsive';

export default function HRLayout() {
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const showSidebar = useShouldShowSidebar();

  if (user?.activeRole !== 'hr') {
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
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: 'Leave',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="staff"
        options={{
          title: 'Staff',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden screens */}
      <Tabs.Screen name="leave-request" options={{ href: null }} />
      <Tabs.Screen name="leave-approve" options={{ href: null }} />
      <Tabs.Screen name="leave-balances" options={{ href: null }} />
      <Tabs.Screen name="staff-detail"  options={{ href: null }} />
    </Tabs>
  );
}
