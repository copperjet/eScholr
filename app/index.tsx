import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const { user, isReady } = useAuthStore();

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/school-code" />;

  switch (user.activeRole) {
    case 'super_admin':
      return <Redirect href="/(app)/(platform)/home" />;
    case 'hrt':
      return <Redirect href="/(app)/(hrt)/home" />;
    case 'st':
      return <Redirect href="/(app)/(st)/home" />;
    case 'school_super_admin':
    case 'admin':
    case 'principal':
    case 'coordinator':
    case 'hod':
      return <Redirect href="/(app)/(admin)/home" />;
    case 'finance':
      return <Redirect href="/(app)/(finance)/home" />;
    case 'front_desk':
      return <Redirect href="/(app)/(frontdesk)/home" />;
    case 'parent':
      return <Redirect href="/(app)/(parent)/home" />;
    case 'student':
      return <Redirect href="/(app)/(student)/home" />;
    case 'hr':
      return <Redirect href="/(app)/(hr)/home" />;
    default:
      return <Redirect href="/(auth)/school-code" />;
  }
}
