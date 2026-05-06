import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#0a0a0f" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
