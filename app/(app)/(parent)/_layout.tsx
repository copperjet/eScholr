import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { AppTabBar } from '../../../components/ui';

export default function ParentLayout() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  if (user && user.activeRole !== 'parent') {
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
      <Tabs.Screen name="home"     options={{ title: 'Home',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="homework" options={{ title: 'Homework', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'book' : 'book-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="reports"  options={{ title: 'Reports',  tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="fees"     options={{ title: 'Fees',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'cash' : 'cash-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="more"     options={{ title: 'More',     tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      {/* Hidden screens */}
      <Tabs.Screen name="inbox"    options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
    </Tabs>
  );
}
