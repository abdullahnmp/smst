import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'smart-reminder-v1';

export async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function saveState(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
}
