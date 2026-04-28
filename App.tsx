// App.tsx — VERSION FINALE OFFLINE
import React, {
  useState, useEffect, useRef, createContext, useContext, ReactNode, useCallback,
} from "react";
import {
  View, Text, StyleSheet, Linking, LogBox,
  AppState, AppStateStatus, StatusBar, ActivityIndicator,
} from "react-native";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Session, User } from "@supabase/supabase-js";

import Connexion from "./Connexion";
import Inscription from "./Inscription";
import ResetPassword from "./ResetPassword";
import HomePage, { clearProfileCache } from "./HomePage";
import FinanceHistoryPage from "./FinanceHistoryPage";
import Profile from "./Profile";
import EditProfile from "./EditProfile";
import MoneyPage from "./MoneyPage";
import Moodpage from "./Moodpage";
import Historypage from "./Historypage";
import Studypage from "./Studypage";
import Religionspage from "./Religionspage";
import GroceryPage from "./GroceryPage";
import SplashScreen from "./SplashScreen";
import AddExpensePage from "./AddExpensePage";
import { supabase } from "./supabaseClient";
import { syncAll, clearUserIdCache, CACHED_USER_ID_KEY } from "./supabaseService";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
type RootStackParamList = {
  Splash: undefined; Login: undefined; Inscription: undefined;
  ResetPassword: undefined; Home: undefined; Profile: undefined;
  EditProfile: { isNewUser?: boolean }; MoneyPage: undefined;
  Moodpage: { mood?: string }; History: undefined;
  FinanceHistory: undefined; Studypage: undefined;
  Religionspage: undefined; GroceryPage: undefined; AddExpense: undefined;
};

type AuthCtx = { session: Session | null; user: User | null; isLoading: boolean; };
const AuthContext = createContext<AuthCtx>({ session: null, user: null, isLoading: true });
export const useAuth = () => useContext(AuthContext);

// ═══════════════════════════════════════════════════════════════
// ERROR BOUNDARY
// ═══════════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component<{ children: ReactNode }, { err: boolean }> {
  constructor(p: any) { super(p); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  render() {
    if (this.state.err) return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Oups! 🚨</Text>
        <Text style={styles.errorSub}>Redémarre l'application</Text>
      </View>
    );
    return this.props.children;
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>();

// ═══════════════════════════════════════════════════════════════
// DEEP LINK
// ═══════════════════════════════════════════════════════════════
const linking = {
  prefixes: ["myapp://", "com.yourcompany.moodlife://"],
  config: { screens: { ResetPassword: "reset-password", Login: "login", Home: "home" } },
};

function parseTokens(url: string) {
  try {
    const src = url.includes("#") ? url.split("#")[1] : (url.split("?")[1] || "");
    const p = new URLSearchParams(src);
    return { access_token: p.get("access_token") || p.get("token"), refresh_token: p.get("refresh_token") };
  } catch { return { access_token: null, refresh_token: null }; }
}

// ═══════════════════════════════════════════════════════════════
// SPLASH — OFFLINE FRIENDLY
// ═══════════════════════════════════════════════════════════════
function SplashWrapper({ navigation }: any) {
  const { session, isLoading } = useAuth();
  const [checked, setChecked] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [hadSession, setHadSession] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rem = await AsyncStorage.getItem("rememberMe");
        const uid = await AsyncStorage.getItem(CACHED_USER_ID_KEY);
        setRememberMe(rem === "true");
        setHadSession(!!uid);
      } catch {}
      setChecked(true);
    })();
  }, []);

  useEffect(() => {
    if (isLoading || !checked) return;
    const t = setTimeout(() => {
      if (session?.user) {
        navigation.replace("Home");
      } else if (hadSession && rememberMe) {
        // ✅ Était connecté + "se souvenir" → Home en mode offline
        navigation.replace("Home");
      } else {
        navigation.replace("Login");
      }
    }, 2200);
    return () => clearTimeout(t);
  }, [isLoading, checked, session, rememberMe, hadSession, navigation]);

  return <SplashScreen />;
}

// ═══════════════════════════════════════════════════════════════
// APP PRINCIPALE
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const signInDone = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Sync au retour au premier plan
  useEffect(() => {
    const sub = AppState.addEventListener("change", async next => {
      if (appStateRef.current.match(/inactive|background/) && next === "active") {
        syncAll().catch(() => {});
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // ✅ Init — getSession() lit AsyncStorage, 0 réseau
  useEffect(() => {
    LogBox.ignoreLogs(["Non-serializable values", "new NativeEventEmitter"]);
    (async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s) {
          setSession(s); setUser(s.user);
          await AsyncStorage.setItem(CACHED_USER_ID_KEY, s.user.id);
        }
      } catch {}
      setLoading(false);
      supabase.auth.refreshSession().catch(() => {}); // silencieux en arrière-plan
    })();
  }, []);

  // Auth events
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === "SIGNED_OUT") {
        setSession(null); setUser(null);
        signInDone.current = false;
        clearProfileCache(); clearUserIdCache();
        await AsyncStorage.removeItem(CACHED_USER_ID_KEY);
        navRef.current?.reset({ index: 0, routes: [{ name: "Login" }] });
        return;
      }
      if (event === "SIGNED_IN") {
        if (signInDone.current) { setSession(newSession); setUser(newSession?.user ?? null); return; }
        signInDone.current = true;
        setSession(newSession); setUser(newSession?.user ?? null);
        if (newSession?.user?.id) await AsyncStorage.setItem(CACHED_USER_ID_KEY, newSession.user.id);
        const isNew = await AsyncStorage.getItem("isNewUser");
        if (isNew === "true") {
          await AsyncStorage.removeItem("isNewUser");
          navRef.current?.reset({ index: 0, routes: [{ name: "EditProfile", params: { isNewUser: true } }] });
        } else {
          navRef.current?.reset({ index: 0, routes: [{ name: "Home" }] });
        }
        return;
      }
      if (["TOKEN_REFRESHED","USER_UPDATED","PASSWORD_RECOVERY"].includes(event)) {
        setSession(newSession); setUser(newSession?.user ?? null);
        if (newSession?.user?.id) await AsyncStorage.setItem(CACHED_USER_ID_KEY, newSession.user.id);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Deep link
  useEffect(() => {
    const handle = async ({ url }: { url: string }) => {
      if (!url) return;
      if (!url.includes("reset-password") && !url.includes("type=recovery") && !url.includes("#access_token")) return;
      const { access_token, refresh_token } = parseTokens(url);
      if (!access_token) return;
      try {
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token: refresh_token || "" });
        if (!error && data.session) {
          setSession(data.session); setUser(data.session.user);
          setTimeout(() => navRef.current?.navigate("ResetPassword"), 500);
        }
      } catch {}
    };
    const sub = Linking.addEventListener("url", handle);
    Linking.getInitialURL().then(url => { if (url) handle({ url }); });
    return () => sub.remove();
  }, []);

  if (loading) return (
    <View style={styles.center}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1B3A" />
      <ActivityIndicator size="large" color="#7C3AED" />
    </View>
  );

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#1E1B3A" />
        <AuthContext.Provider value={{ session, user, isLoading: loading }}>
          <NavigationContainer
            ref={navRef} linking={linking}
            fallback={<View style={styles.center}><ActivityIndicator color="#7C3AED" /></View>}
          >
            <Stack.Navigator
              screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: "#1E1B3A" } }}
              initialRouteName="Splash"
            >
              <Stack.Screen name="Splash" component={SplashWrapper} options={{ animation: "none" }} />
              <Stack.Screen name="Login" component={Connexion} />
              <Stack.Screen name="Inscription" component={Inscription} />
              <Stack.Screen name="ResetPassword" component={ResetPassword} />
              <Stack.Screen name="Home" component={HomePage} />
              <Stack.Screen name="Profile" component={Profile} />
              <Stack.Screen name="EditProfile" component={EditProfile} />
              <Stack.Screen name="MoneyPage" component={MoneyPage} />
              <Stack.Screen name="Moodpage" component={Moodpage} />
              <Stack.Screen name="History" component={Historypage} />
              <Stack.Screen name="FinanceHistory" component={FinanceHistoryPage} />
              <Stack.Screen name="Studypage" component={Studypage} />
              <Stack.Screen name="Religionspage" component={Religionspage} />
              <Stack.Screen name="GroceryPage" component={GroceryPage} />
              <Stack.Screen name="AddExpense" component={AddExpensePage} />
            </Stack.Navigator>
          </NavigationContainer>
        </AuthContext.Provider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#1E1B3A" },
  errorTitle: { fontSize: 24, fontWeight: "bold", color: "#F87171", marginBottom: 8 },
  errorSub: { color: "#A78BFA", fontSize: 16 },
});
