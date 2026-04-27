import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { AppTabBar } from '../../../components/ui';

export default function FrontDeskLayout() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  if (user && user.activeRole !== 'front_desk') {
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
      <Tabs.Screen name="home"      options={{ title: 'Home',      tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="inquiries" options={{ title: 'Inquiries', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="more"      options={{ title: 'More',      tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="inquiry-detail" options={{ href: null }} />
      <Tabs.Screen name="visitors"       options={{ href: null }} />
      <Tabs.Screen name="applications"   options={{ href: null }} />
    </Tabs>
  );
}
