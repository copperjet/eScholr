import { Tabs, Redirect, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { AppTabBar, ResponsiveShell } from '../../../components/ui';
import { useShouldShowSidebar } from '../../../lib/responsive';
import { useIsModuleEnabled } from '../../../hooks/useSchoolModules';

export default function FinanceLayout() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const showSidebar = useShouldShowSidebar();
  const financeEnabled = useIsModuleEnabled('finance');

  if (user && user.activeRole !== 'finance') {
    return <Redirect href="/" />;
  }
  if (!financeEnabled) {
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
      <Tabs.Screen name="home"             options={{ title: 'Home',    tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="finance-reports"  options={{ title: 'Reports', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="more"             options={{ title: 'More',    tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      {/* Hidden screens (deep-linked from home/more) */}
      <Tabs.Screen name="student-finance"  options={{ href: null }} />
      <Tabs.Screen name="fee-categories"   options={{ href: null }} />
      <Tabs.Screen name="fee-schedules"    options={{ href: null }} />
      <Tabs.Screen name="invoice-batch"    options={{ href: null }} />
      <Tabs.Screen name="invoice"          options={{ href: null }} />
      <Tabs.Screen name="sage-sync"        options={{ href: null }} />
      <Tabs.Screen name="sage-mappings"    options={{ href: null }} />
      <Tabs.Screen name="payment-methods"  options={{ href: null }} />
      <Tabs.Screen name="reports"          options={{ href: null }} />
    </Tabs>
  );
}
