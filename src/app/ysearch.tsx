import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/contexts/ThemeContext';
import { YSearchScreen } from '@/components/video/YSearchScreen';

export default function YSearchRoute() {
  const { bgHex } = useAppTheme();
  const router = useRouter();

  return (
    <View style={[styles.root, { backgroundColor: bgHex }]}>
      <YSearchScreen onBack={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
