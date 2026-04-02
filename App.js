import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { AlarmProvider } from './src/context/AlarmContext';
import HomeScreen from './src/screens/HomeScreen';
import CreateAlarmScreen from './src/screens/CreateAlarmScreen';
import AlarmRingingScreen from './src/screens/AlarmRingingScreen';
import PenaltyScreen from './src/screens/PenaltyScreen';
import QuestionBankScreen from './src/screens/QuestionBankScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <AlarmProvider>
      <NavigationContainer>
        <StatusBar style="light" backgroundColor="#060610" />
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#060610' },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="CreateAlarm" component={CreateAlarmScreen} />
          <Stack.Screen
            name="AlarmRinging"
            component={AlarmRingingScreen}
            options={{ gestureEnabled: false }} // can't swipe back
          />
          <Stack.Screen name="Penalty" component={PenaltyScreen} />
          <Stack.Screen name="QuestionBank" component={QuestionBankScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </AlarmProvider>
  );
}
