import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, componentStack: null });
  };

  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      const stack = err?.stack ?? '';
      const compStack = this.state.componentStack ?? '';
      return (
        <View style={styles.container}>
          <Ionicons name="alert-circle-outline" size={56} color="#EF4444" />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {err?.message ?? 'An unexpected error occurred.'}
          </Text>
          <ScrollView style={styles.stackBox}>
            <Text style={styles.stackText}>{stack}</Text>
            {compStack ? <Text style={styles.stackText}>{'\nComponent stack:\n' + compStack}</Text> : null}
          </ScrollView>
          <TouchableOpacity style={styles.btn} onPress={this.handleReset}>
            <Text style={styles.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B2A4A',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  btn: {
    marginTop: 8,
    backgroundColor: '#1B2A4A',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  stackBox: { maxHeight: 220, alignSelf: 'stretch', backgroundColor: '#F3F4F6', borderRadius: 8, padding: 10 },
  stackText: { fontSize: 10, color: '#374151', fontFamily: 'monospace' },
});
