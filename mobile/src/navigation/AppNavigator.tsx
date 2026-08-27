import React, { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme';
import AppHeader from '../components/AppHeader';

// Auth
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Parent
import ParentDashboard from '../screens/parent/ParentDashboard';
import RegisterChildScreen from '../screens/parent/RegisterChildScreen';
import FeeBreakdownScreen from '../screens/parent/FeeBreakdownScreen';
import FinancialDetailsScreen from '../screens/parent/FinancialDetailsScreen';
import PayOnlineScreen from '../screens/parent/PayOnlineScreen';
import PaymentsScreen from '../screens/parent/PaymentsScreen';
import ReceiptsScreen from '../screens/parent/ReceiptsScreen';
import StatementsScreen from '../screens/parent/StatementsScreen';
import ProfileScreen from '../screens/parent/ProfileScreen';
import EditProfileScreen from '../screens/parent/EditProfileScreen';
import ChangePasswordScreen from '../screens/parent/ChangePasswordScreen';
import NotificationsScreen from '../screens/parent/NotificationsScreen';
import InvoicesScreen from '../screens/parent/InvoicesScreen';
import LoadingScreen from '../components/LoadingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

const TAB_ICONS: Record<string, { focused: string; default: string }> = {
  Dashboard: { focused: 'home', default: 'home-outline' },
  PaymentsTab: { focused: 'wallet', default: 'wallet-outline' },
  InvoicesTab: { focused: 'receipt', default: 'receipt-outline' },
  StatementsTab: { focused: 'document-text', default: 'document-text-outline' },
  ProfileTab: { focused: 'person', default: 'person-outline' },
};

function ParentTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: (props) => <AppHeader {...props} />,
        tabBarActiveTintColor: colors.accentDark,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: '600',
          marginBottom: Platform.OS === 'ios' ? 0 : 2,
        },
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          paddingTop: 10,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          height: Platform.OS === 'ios' ? 88 : 64,
        },
        tabBarIcon: ({ color, focused }) => {
          const icons = TAB_ICONS[route.name] || TAB_ICONS.Dashboard;
          const iconName = focused ? icons.focused : icons.default;
          return <Ionicons name={iconName as any} size={19} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={ParentDashboard} options={{ title: 'Home' }} />
      <Tab.Screen name="PaymentsTab" component={PaymentsScreen} options={{ title: 'Payments' }} />
      <Tab.Screen name="InvoicesTab" component={InvoicesScreen} options={{ title: 'Invoices' }} />
      <Tab.Screen name="StatementsTab" component={StatementsScreen} options={{ title: 'Statements' }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

function ParentNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ParentHome" component={ParentTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="RegisterChild"
        component={RegisterChildScreen}
        options={{ header: (props) => <AppHeader title="Register Child" showBell={false} />, headerShown: true }}
      />
      <Stack.Screen
        name="FeeBreakdown"
        component={FeeBreakdownScreen}
        options={{ header: (props) => <AppHeader title="Fee Breakdown" showBell={false} />, headerShown: true }}
      />
      <Stack.Screen
        name="FinancialDetails"
        component={FinancialDetailsScreen}
        options={{ header: (props) => <AppHeader title="Financial Details" showBell={false} />, headerShown: true }}
      />
      <Stack.Screen
        name="PayOnline"
        component={PayOnlineScreen}
        options={{ header: (props) => <AppHeader title="Pay Online" showBell={false} />, headerShown: true }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ header: (props) => <AppHeader title="Notifications" showBell={false} />, headerShown: true }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ header: (props) => <AppHeader title="Edit Profile" showBell={false} />, headerShown: true }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ header: (props) => <AppHeader title="Change Password" showBell={false} />, headerShown: true }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, mustChangePassword, clearMustChangePassword, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;

  // Force password change for users with temporary passwords
  if (user && mustChangePassword) {
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="ForcePasswordChange" component={ChangePasswordScreen} />
      </AuthStack.Navigator>
    );
  }

  return user ? <ParentNavigator /> : <AuthNavigator />;
}
