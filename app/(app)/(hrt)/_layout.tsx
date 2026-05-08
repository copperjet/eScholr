import { Tabs, Redirect, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { AppTabBar, ResponsiveShell } from '../../../components/ui';
import { useShouldShowSidebar } from '../../../lib/responsive';
import { useIsModuleEnabled } from '../../../hooks/useSchoolModules';

export default function HRTLayout() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const showSidebar = useShouldShowSidebar();
  const examsEnabled = useIsModuleEnabled('exams');
  if (user && user.activeRole !== 'hrt') {
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
      <Tabs.Screen name="home"       options={{ title: 'Home',       tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'checkbox' : 'checkbox-outline'} size={22} color={color} /> }} />
      <Tabs.Screen
        name="marks"
        options={examsEnabled
          ? { title: 'Marks', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={22} color={color} /> }
          : { href: null }}
      />
      <Tabs.Screen name="homework"   options={{ title: 'Homework',   tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'book' : 'book-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="students"   options={{ title: 'Students',   tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="more"       options={{ title: 'More',       tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      {/* Hidden */}
      <Tabs.Screen name="attendance-history" options={{ href: null }} />
      <Tabs.Screen name="reports-approve"    options={{ href: null }} />
      <Tabs.Screen name="creed"              options={{ href: null }} />
      <Tabs.Screen name="daybook"            options={{ href: null }} />
      <Tabs.Screen name="reports"            options={{ href: null }} />
      <Tabs.Screen name="messages"           options={{ href: null }} />
    </Tabs>
  );
}
