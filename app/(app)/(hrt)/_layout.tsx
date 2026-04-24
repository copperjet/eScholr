import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { ThemedText } from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface TabIconProps {
  name: IoniconsName;
  focused: boolean;
  label: string;
  badge?: number;
}

function TabIcon({ name, focused, label, badge }: TabIconProps) {
  const { colors } = useTheme();
  const color = focused ? colors.brand.primary : colors.icon;

  return (
    <View style={styles.tabItem}>
      <View>
        <Ionicons name={name} size={24} color={color} />
        {badge != null && badge > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.brand.secondary }]}>
            <ThemedText style={styles.badgeText}>{badge > 9 ? '9+' : badge}</ThemedText>
          </View>
        )}
      </View>
      <ThemedText variant="tabLabel" style={{ color, marginTop: 2 }}>{label}</ThemedText>
    </View>
  );
}

export default function HRTLayout() {
  const { colors, scheme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} label="Home" />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'checkbox' : 'checkbox-outline'} focused={focused} label="Attendance" />,
        }}
      />
      <Tabs.Screen
        name="marks"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'bar-chart' : 'bar-chart-outline'} focused={focused} label="Marks" />,
        }}
      />
      <Tabs.Screen
        name="students"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'people' : 'people-outline'} focused={focused} label="Students" />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'grid' : 'grid-outline'} focused={focused} label="More" />,
        }}
      />
      {/* Hidden stack screens — not shown in tab bar */}
      <Tabs.Screen name="attendance-history" options={{ href: null }} />
      <Tabs.Screen name="reports-approve"    options={{ href: null }} />
      <Tabs.Screen name="creed"              options={{ href: null }} />
      <Tabs.Screen name="daybook"            options={{ href: null }} />
      <Tabs.Screen name="reports"            options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
});
