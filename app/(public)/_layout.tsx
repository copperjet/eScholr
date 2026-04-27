/**
 * Public layout — no auth required.
 * Used for public-facing screens like admissions forms.
 */
import { Stack } from 'expo-router';

export default function PublicLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
