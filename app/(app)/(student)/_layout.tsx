import { Tabs, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../stores/authStore';
import { Redirect } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { AppTabBar, ResponsiveShell } from '../../../components/ui';
import { useShouldShowSidebar } from '../../../lib/responsive';
import { useIsModuleEnabled } from '../../../hooks/useSchoolModules';

export default function StudentLayout() {
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const showSidebar = useShouldShowSidebar();
  const examsEnabled = useIsModuleEnabled('exams');

  if (user?.activeRole !== 'student') {
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
      <Tabs.Screen name="home"     options={{ title: 'Home',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }} />
      <Tabs.Screen
        name="marks"
        options={examsEnabled
          ? { title: 'Marks', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'school' : 'school-outline'} size={22} color={color} /> }
          : { href: null }}
      />
      <Tabs.Screen
        name="reports"
        options={examsEnabled
          ? { title: 'Reports', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={22} color={color} /> }
          : { href: null }}
      />
      <Tabs.Screen name="homework" options={{ title: 'Homework', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'book' : 'book-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="more"     options={{ title: 'More',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      {/* Hidden screens */}
      <Tabs.Screen name="fees" options={{ href: null }} />
      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="timetable" options={{ href: null }} />
      <Tabs.Screen name="announcements" options={{ href: null }} />
    </Tabs>
  );
}
