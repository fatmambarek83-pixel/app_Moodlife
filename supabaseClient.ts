import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://caktljgmffvzusrszero.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNha3RsamdtZmZ2enVzcnN6ZXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI5NzgsImV4cCI6MjA5MTc3ODk3OH0.Etlbt6MZdaJOuLTmDp-wDHuvq9uwQp5ngHSI1Z-YvEE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
