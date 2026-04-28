import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { AppTabBar } from '../../../components/ui';

export default function PlatformLayout() {
  const { colors } = useTheme();
  const { user } = useAuthStore();

  // Platform routes: only pure super_admin (no school) allowed
  if (!user || user.activeRole !== 'super_admin' || user.schoolId) {
    return <Redirect href="/" />;
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
    </Tabs>
  );
}
