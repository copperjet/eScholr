import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { View } from 'react-native';

export default function Index() {
  const { user, school, isReady } = useAuthStore();

  if (!isReady) {
    // Skeleton splash — neutral, no spinner
    return <View style={{ flex: 1 }} />;
  }

  if (!user) {
    // If we know the school already, skip school-code and go straight to login
    if (school) return <Redirect href="/(auth)/login" />;
    return <Redirect href="/(auth)/school-code" />;
  }

  switch (user.activeRole) {
    case 'super_admin':
      if (user.schoolId) return <Redirect href="/(app)/(admin)/home" />;
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
    case 'librarian':
      return <Redirect href="/(app)/(librarian)/home" />;
    default:
      return <Redirect href="/(auth)/school-code" />;
  }
}
