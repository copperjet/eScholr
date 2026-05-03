import React from 'react';
import { View, StyleSheet, ScrollView, Alert, StatusBar, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { ThemedText, Avatar } from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
  icon: IoniconsName;
  label: string;
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
}

function MenuRow({ item, colors, last }: { item: MenuItem; colors: any; last: boolean }) {
  return (
    <Pressable
      onPress={() => { haptics.light(); item.onPress(); }}
      style={({ pressed }) => [styles.menuRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, { opacity: pressed ? 0.75 : 1 }, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined]}
    >
      <View style={[styles.menuIcon, { backgroundColor: item.danger ? '#FEE2E2' : 'rgba(255,255,255,0.12)' }]}>
        <Ionicons name={item.icon} size={19} color={item.danger ? '#EF4444' : '#fff'} />
      </View>
      <View style={styles.menuText}>
        <ThemedText style={{ fontSize: 15, fontWeight: '500', color: item.danger ? '#EF4444' : colors.textPrimary }}>
          {item.label}
        </ThemedText>
        {item.sublabel ? <ThemedText variant="caption" color="muted" numberOfLines={1}>{item.sublabel}</ThemedText> : null}
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
    </Pressable>
  );
}

export default function PlatformMore() {
  const { colors } = useTheme();
  const { user, signOut } = useAuthStore();

  const sections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Platform Tools',
      items: [
        {
          icon: 'bar-chart-outline',
          label: 'Platform Metrics',
          sublabel: 'MRR, ARR, churn, school growth',
          onPress: () => router.push('/(app)/(platform)/metrics' as any),
        },
        {
          icon: 'shield-outline',
          label: 'Impersonation Log',
          sublabel: 'Support session audit trail',
          onPress: () => router.push('/(app)/(platform)/impersonation-log' as any),
        },
        {
          icon: 'business-outline',
          label: 'Onboard School',
          sublabel: 'Add a new school tenant',
          onPress: () => router.push('/(app)/(platform)/onboard' as any),
        },
        {
          icon: 'megaphone-outline',
          label: 'Broadcast Notification',
          sublabel: 'Send to one school or all schools',
          onPress: () => router.push('/(app)/(platform)/broadcast' as any),
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          icon: 'person-outline',
          label: 'My Profile',
          sublabel: user?.email ?? undefined,
          onPress: () => router.push('/(app)/profile' as any),
        },
        {
          icon: 'log-out-outline',
          label: 'Sign Out',
          danger: true,
          onPress: () => {
            if (Platform.OS === 'web') {
              if (window.confirm('Are you sure you want to sign out?')) {
                signOut().then(() => router.replace('/(auth)/school-code' as any));
              }
              return;
            }
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/(auth)/school-code' as any); } },
            ]);
          },
        },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.brand.primaryDark }}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.brand.primaryDark }}>
          <View style={styles.hero}>
            <View style={styles.heroAvatarRow}>
              <Avatar name={user?.fullName ?? 'SA'} size={70} />
              <View style={styles.heroText}>
                <ThemedText style={styles.heroName} numberOfLines={1}>{user?.fullName ?? '—'}</ThemedText>
                <ThemedText style={styles.heroEmail} numberOfLines={1}>{user?.email}</ThemedText>
                <View style={styles.rolePill}>
                  <Ionicons name="shield-checkmark" size={11} color="#fff" style={{ marginRight: 4 }} />
                  <ThemedText style={styles.rolePillText}>PLATFORM ADMIN</ThemedText>
                </View>
              </View>
            </View>
          </View>
        </SafeAreaView>

        <View style={[styles.body, { backgroundColor: colors.background }]}>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <ThemedText variant="label" color="muted" style={styles.sectionTitle}>
                {section.title.toUpperCase()}
              </ThemedText>
              <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
                {section.items.map((item, i) => (
                  <MenuRow key={item.label} item={item} colors={colors} last={i === section.items.length - 1} />
                ))}
              </View>
            </View>
          ))}
          <ThemedText variant="caption" color="muted" style={styles.version}>eScholr Platform v1.0.0</ThemedText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing['2xl'] },
  heroAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  heroText: { flex: 1, gap: 3 },
  heroName: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  heroEmail: { fontSize: 13, color: 'rgba(255,255,255,0.72)' },
  rolePill: {
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 999, marginTop: 4,
  },
  rolePillText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  body: { borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20, paddingTop: Spacing.lg, minHeight: 400 },
  section: { paddingHorizontal: Spacing.base, marginBottom: Spacing.lg },
  sectionTitle: { marginBottom: Spacing.sm, marginLeft: 2 },
  card: { borderRadius: Radius.lg, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md,
  },
  menuIcon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1, gap: 2 },
  version: { textAlign: 'center', paddingVertical: Spacing.xl },
});
