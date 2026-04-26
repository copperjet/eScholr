import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '../../../stores/authStore';

export default function FinanceLayout() {
  const { user } = useAuthStore();
  if (user && user.activeRole !== 'finance') {
    return <Redirect href="/" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
