import { Tabs, Redirect, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { AppTabBar, ResponsiveShell } from '../../../components/ui';
import { useShouldShowSidebar } from '../../../lib/responsive';
import { useIsModuleEnabled } from '../../../hooks/useSchoolModules';

export default function ParentLayout() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const showSidebar = useShouldShowSidebar();
  const financeEnabled = useIsModuleEnabled('finance');
  const announcementsEnabled = useIsModuleEnabled('announcements');
  const examsEnabled = useIsModuleEnabled('exams');

  if (user && user.activeRole !== 'parent') {
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
      <Tabs.Screen name="home"     options={{ title: 'Home',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="homework" options={{ title: 'Homework', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'book' : 'book-outline'} size={22} color={color} /> }} />
      <Tabs.Screen
        name="reports"
        options={examsEnabled
          ? { title: 'Reports', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={22} color={color} /> }
          : { href: null }}
      />
      <Tabs.Screen
        name="fees"
        options={financeEnabled
          ? { title: 'Fees', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'cash' : 'cash-outline'} size={22} color={color} /> }
          : { href: null }}
      />
      <Tabs.Screen name="more"     options={{ title: 'More',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      {/* Hidden screens */}
      <Tabs.Screen name="inbox"      options={{ href: null }} />
      <Tabs.Screen name="messages"   options={{ href: null }} />
      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="marks"      options={{ href: null }} />
      <Tabs.Screen name="eca"        options={{ href: null }} />
    </Tabs>
  );
}
