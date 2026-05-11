import { Tabs, Redirect, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { AppTabBar, ResponsiveShell } from '../../../components/ui';
import { useShouldShowSidebar } from '../../../lib/responsive';
import { useIsModuleEnabled } from '../../../hooks/useSchoolModules';
import { useRealtimeStudents } from '../../../hooks/useRealtimeSync';

export default function STLayout() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const showSidebar = useShouldShowSidebar();
  const examsEnabled = useIsModuleEnabled('exams');
  useRealtimeStudents(user?.schoolId ?? '');
  if (user && user.activeRole !== 'st') {
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
      <Tabs.Screen
        name="marks"
        options={examsEnabled
          ? { title: 'Marks', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={22} color={color} /> }
          : { href: null }}
      />
      <Tabs.Screen name="homework" options={{ title: 'Homework', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'book' : 'book-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="students" options={{ title: 'Students', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="more"     options={{ title: 'More',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="marks-entry"        options={{ href: null }} />
      <Tabs.Screen name="marks-import"       options={{ href: null }} />
      <Tabs.Screen name="daybook"            options={{ href: null }} />
      <Tabs.Screen name="messages"           options={{ href: null }} />
      <Tabs.Screen name="analysis"           options={{ href: null }} />
      <Tabs.Screen name="eca-my-activities"  options={{ href: null }} />
      <Tabs.Screen name="eca-attendance"     options={{ href: null }} />
      <Tabs.Screen name="absence-report"     options={{ href: null }} />
      <Tabs.Screen name="swap-request"       options={{ href: null }} />
    </Tabs>
  );
}
