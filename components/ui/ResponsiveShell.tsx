/**
 * ResponsiveShell — wraps role layouts for cross-platform experience.
 * On mobile: renders children directly (assumes Tabs layout handles bottom nav)
 * On desktop: renders Sidebar + content area side-by-side
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Slot } from 'expo-router';
import { Sidebar } from './Sidebar';
import { useShouldShowSidebar } from '../../lib/responsive';

interface ResponsiveShellProps {
  children: React.ReactNode;
}

export function ResponsiveShell({ children }: ResponsiveShellProps) {
  const showSidebar = useShouldShowSidebar();

  if (showSidebar) {
    // Desktop/Tablet layout: Sidebar + Content
    return (
      <View style={styles.desktopContainer}>
        <Sidebar />
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  // Mobile layout: just children (Tabs handle navigation)
  return <>{children}</>;
}

const styles = StyleSheet.create({
  desktopContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
});
