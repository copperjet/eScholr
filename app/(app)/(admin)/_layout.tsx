import { Tabs, Redirect, Slot } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { AppTabBar, ResponsiveShell } from '../../../components/ui';
import { useShouldShowSidebar } from '../../../lib/responsive';

const ADMIN_ROLES = ['super_admin', 'school_super_admin', 'admin', 'principal', 'coordinator', 'hod'];
const SUPER_ROLES = ['super_admin', 'school_super_admin'];

// Desktop layout with sidebar (no tabs)
function DesktopAdminLayout({ isSuper, colors }: { isSuper: boolean; colors: any }) {
  return (
    <ResponsiveShell>
      <Slot />
    </ResponsiveShell>
  );
}

// Mobile layout with bottom tabs
function MobileAdminLayout({ isSuper, colors }: { isSuper: boolean; colors: any }) {
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.icon,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }} />

      <Tabs.Screen name="users" options={{ title: 'Users', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="students" options={{ href: null }} />
      <Tabs.Screen name="staff"    options={{ href: null }} />

      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />

      {/* Hidden screens */}
      <Tabs.Screen name="analysis"          options={{ href: null }} />
      <Tabs.Screen name="assessment-config" options={{ href: null }} />
      <Tabs.Screen name="attendance-overview" options={{ href: null }} />
      <Tabs.Screen name="attendance-correct"  options={{ href: null }} />
      <Tabs.Screen name="assignments"         options={{ href: null }} />
      <Tabs.Screen name="parents"             options={{ href: null }} />
      <Tabs.Screen name="reports"             options={{ href: null }} />
      <Tabs.Screen name="marks-matrix"        options={{ href: null }} />
      <Tabs.Screen name="marks-unlock"        options={{ href: null }} />
      <Tabs.Screen name="daybook"             options={{ href: null }} />
      <Tabs.Screen name="notification-log"    options={{ href: null }} />
      <Tabs.Screen name="calendar"            options={{ href: null }} />
      <Tabs.Screen name="calendar-events"     options={{ href: null }} />
      <Tabs.Screen name="audit-log"           options={{ href: null }} />
      <Tabs.Screen name="marks-windows"       options={{ href: null }} />
      <Tabs.Screen name="semesters"           options={{ href: null }} />
      <Tabs.Screen name="promotion-wizard"    options={{ href: null }} />
      <Tabs.Screen name="student-add"         options={{ href: null }} />
      <Tabs.Screen name="student-edit"        options={{ href: null }} />
      <Tabs.Screen name="student-import"      options={{ href: null }} />
      <Tabs.Screen name="staff-import"        options={{ href: null }} />
      <Tabs.Screen name="parent-import"       options={{ href: null }} />
      <Tabs.Screen name="announcements"       options={{ href: null }} />
      <Tabs.Screen name="timetable-upload"    options={{ href: null }} />
      <Tabs.Screen name="school-onboarding"   options={{ href: null }} />
      <Tabs.Screen name="school-structure"    options={{ href: null }} />
      <Tabs.Screen name="school-settings"    options={{ href: null }} />
      <Tabs.Screen name="fee-structure"       options={{ href: null }} />
      <Tabs.Screen name="backup-settings"     options={{ href: null }} />
      <Tabs.Screen name="student-credentials" options={{ href: null }} />
    </Tabs>
  );
}

export default function AdminLayout() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const showSidebar = useShouldShowSidebar();

  if (user && !ADMIN_ROLES.includes(user.activeRole)) {
    return <Redirect href="/" />;
  }

  const isSuper = user ? SUPER_ROLES.includes(user.activeRole) : false;

  if (showSidebar) {
    return <DesktopAdminLayout isSuper={isSuper} colors={colors} />;
  }

  return <MobileAdminLayout isSuper={isSuper} colors={colors} />;
}
