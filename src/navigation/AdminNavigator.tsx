// src/navigation/AdminNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminDashboardScreen } from '../screens/AdminDashboardScreen';
import { AdminSettingsScreen } from '../screens/AdminSettingsScreen';

export type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminSettings: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export function AdminNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ title: 'Dinodia Admin' }}
      />
      <Stack.Screen
        name="AdminSettings"
        component={AdminSettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Stack.Navigator>
  );
}
