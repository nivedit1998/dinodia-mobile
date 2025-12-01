// src/navigation/TenantNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TenantDashboardScreen } from '../screens/TenantDashboardScreen';
import { TenantSettingsScreen } from '../screens/TenantSettingsScreen';

export type TenantStackParamList = {
  TenantDashboard: undefined;
  TenantSettings: undefined;
};

const Stack = createNativeStackNavigator<TenantStackParamList>();

export function TenantNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="TenantDashboard"
        component={TenantDashboardScreen}
        options={{ title: 'Dinodia Tenant' }}
      />
      <Stack.Screen
        name="TenantSettings"
        component={TenantSettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Stack.Navigator>
  );
}
