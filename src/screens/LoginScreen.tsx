// src/screens/LoginScreen.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, NativeModules } from 'react-native';
import { loginWithCredentials } from '../api/auth';
import { getUserWithHaConnection } from '../api/dinodia';
import { useSession } from '../store/sessionStore';
import { clearAllDeviceCacheForUser } from '../store/deviceStore';

const { InlineWifiSetupLauncher } = NativeModules;

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setSession } = useSession();

  const handleOpenWifiSetup = () => {
    if (InlineWifiSetupLauncher && typeof InlineWifiSetupLauncher.open === 'function') {
      InlineWifiSetupLauncher.open();
    } else {
      Alert.alert('Wi-Fi', 'Wi-Fi setup is not available on this device.');
    }
  };

  async function handleLogin() {
    if (loading) return;
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      Alert.alert('Login', 'Please enter both username and password.');
      return;
    }
    setLoading(true);
    try {
      const user = await loginWithCredentials(trimmedUsername, password);
      await clearAllDeviceCacheForUser(user.id);
      const { haConnection } = await getUserWithHaConnection(user.id);
      await setSession({ user, haConnection });
      // Navigation container will switch from Auth to App automatically
    } catch (err) {
      console.log('login error in screen', err);
      Alert.alert(
        'Login failed',
        err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err)
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dinodia Portal</Text>

      <TextInput
        style={styles.input}
        placeholder="Username"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
      />

      <Button
        title={loading ? 'Logging in…' : 'Login'}
        onPress={() => {
          void handleLogin();
        }}
        disabled={loading}
      />

      <View style={styles.wifiButton}>
        <Button title="Add Wi-Fi" onPress={handleOpenWifiSetup} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  title: { fontSize: 24, marginBottom: 24, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  wifiButton: { marginTop: 16 },
});
