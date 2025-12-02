import React from 'react';
import { StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from './src/store/sessionStore';
import { RootNavigator } from './src/navigation';

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <SessionProvider>
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" />
          <RootNavigator />
        </SafeAreaProvider>
      </SessionProvider>
    </View>
  );
}
