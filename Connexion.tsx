// Connexion.tsx - VERSION FINALE
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  TouchableWithoutFeedback,
  Keyboard,
  Animated,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "./supabaseClient";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Connexion({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [emailErrorMsg, setEmailErrorMsg] = useState("");
  const [passwordErrorMsg, setPasswordErrorMsg] = useState("");

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    loadSavedEmail();
  }, [fadeAnim, slideAnim]);

  const loadSavedEmail = async () => {
    try {
      const savedEmail = await AsyncStorage.getItem("savedEmail");
      const savedRemember = await AsyncStorage.getItem("rememberMe");
      if (savedEmail && savedRemember === "true") {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch (e) {
      console.log("Error loading saved email:", e);
    }
  };

  const resetForm = useCallback(() => {
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setRememberMe(false);
    setEmailError(false);
    setPasswordError(false);
    setEmailErrorMsg("");
    setPasswordErrorMsg("");
    
    loadSavedEmail();
    
    fadeAnim.setValue(0);
    slideAnim.setValue(50);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useFocusEffect(resetForm);

  const isValidEmail = (emailValue: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    const noEmail = !email.trim();
    const noPassword = !password.trim();
    const invalidEmail = !noEmail && !isValidEmail(email);

    setEmailError(noEmail || invalidEmail);
    setPasswordError(noPassword);
    setEmailErrorMsg(
      noEmail ? "Email requis" : invalidEmail ? "Format email invalide" : ""
    );
    setPasswordErrorMsg(noPassword ? "Mot de passe requis" : "");

    if (noEmail || noPassword || invalidEmail) {
      shake();
      return;
    }

    try {
      setLoading(true);
      await supabase.auth.signOut();

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setEmailError(true);
          setPasswordError(true);
          setEmailErrorMsg("Email incorrect");
          setPasswordErrorMsg("Mot de passe incorrect");
          shake();
        } else {
          Alert.alert("Erreur ❌", error.message);
        }
        return;
      }

      if (rememberMe) {
        await AsyncStorage.setItem("savedEmail", email);
        await AsyncStorage.setItem("rememberMe", "true");
      } else {
        await AsyncStorage.removeItem("savedEmail");
        await AsyncStorage.setItem("rememberMe", "false");
      }

      // ✅ FIX: la navigation est gérée par onAuthStateChange dans App.tsx
      // Ne pas appeler navigation.replace ici pour éviter la double navigation

    } catch (e: any) {
      Alert.alert("Erreur ❌", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setEmailError(true);
      setEmailErrorMsg("Entre ton email d'abord");
      shake();
      return;
    }

    if (!isValidEmail(email)) {
      setEmailError(true);
      setEmailErrorMsg("Format email invalide");
      shake();
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "myapp://reset-password",
      });
      if (error) {
        Alert.alert("Erreur ❌", error.message);
        return;
      }
      Alert.alert("Email envoyé ✅", "Vérifie ta boîte mail 📩");
    } catch (e: any) {
      Alert.alert("Erreur ❌", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.full}>
            <ScrollView
              style={styles.full}
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Animated.View 
                style={[
                  styles.inner,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <Text style={styles.title}>Connexion</Text>

                <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                  <Text style={[styles.fieldLabel, emailError && styles.fieldLabelError]}>
                    Email {emailError && "⚠️"}
                  </Text>
                  <TextInput
                    placeholder="ton@email.com"
                    placeholderTextColor="#A78BFA"
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      if (t.trim()) {
                        setEmailError(false);
                        setEmailErrorMsg("");
                      }
                    }}
                    style={[styles.input, emailError && styles.inputError]}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    textContentType="username"
                    autoComplete="email"
                  />
                  {emailErrorMsg ? (
                    <Text style={styles.errorText}>{emailErrorMsg}</Text>
                  ) : null}
                </Animated.View>

                <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                  <Text style={[styles.fieldLabel, passwordError && styles.fieldLabelError]}>
                    Mot de passe {passwordError && "⚠️"}
                  </Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      placeholder="••••••••"
                      placeholderTextColor="#A78BFA"
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        if (t.trim()) {
                          setPasswordError(false);
                          setPasswordErrorMsg("");
                        }
                      }}
                      secureTextEntry={!showPassword}
                      style={[styles.inputPassword, passwordError && styles.inputError]}
                      textContentType="password"
                      autoComplete="password"
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      <Text style={styles.eyeText}>
                        {showPassword ? "🙈" : "👁️"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {passwordErrorMsg ? (
                    <Text style={styles.errorText}>{passwordErrorMsg}</Text>
                  ) : null}
                </Animated.View>

                <View style={styles.rememberContainer}>
                  <View style={styles.rememberLeft}>
                    <Switch
                      value={rememberMe}
                      onValueChange={setRememberMe}
                      trackColor={{ false: "#312E5B", true: "#7C3AED" }}
                      thumbColor={rememberMe ? "#EDE9FE" : "#A78BFA"}
                    />
                    <Text style={styles.rememberText}>Se souvenir de moi</Text>
                  </View>
                </View>

                <TouchableOpacity onPress={handleForgotPassword}>
                  <Text style={styles.forgot}>Mot de passe oublié ?</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Se connecter →</Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.hintText}>
                  Pas de compte ? Inscris-toi pour accéder à l'app →
                </Text>

                <TouchableOpacity
                  onPress={() => navigation.navigate("Inscription")}
                  activeOpacity={0.7}
                >
                  <Text style={styles.link}>Pas de compte ? S'inscrire →</Text>
                </TouchableOpacity>
              </Animated.View>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#1E1B3A" },
  container: { flex: 1, backgroundColor: "#1E1B3A" },
  full: { flex: 1, backgroundColor: "#1E1B3A" },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#1E1B3A",
  },
  inner: { flex: 1, justifyContent: "center" },

  title: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#EDE9FE",
    marginBottom: 32,
    textAlign: "center",
  },

  fieldLabel: {
    color: "#A78BFA",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginLeft: 4,
  },
  fieldLabelError: { color: "#F87171" },

  input: {
    backgroundColor: "#312E5B",
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
    color: "white",
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputError: {
    borderColor: "#F87171",
    backgroundColor: "#3D1F3A",
  },

  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  inputPassword: {
    flex: 1,
    backgroundColor: "#312E5B",
    borderRadius: 16,
    padding: 16,
    color: "white",
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  eyeButton: {
    position: "absolute",
    right: 16,
    padding: 8,
  },
  eyeText: {
    fontSize: 18,
  },

  errorText: {
    color: "#F87171",
    fontSize: 12,
    marginLeft: 4,
    marginBottom: 12,
    marginTop: 2,
  },

  rememberContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    marginTop: 4,
  },
  rememberLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  rememberText: {
    color: "#A78BFA",
    fontSize: 14,
    marginLeft: 8,
  },

  forgot: {
    textAlign: "center",
    color: "#A78BFA",
    marginBottom: 20,
    fontSize: 13,
  },
  button: {
    backgroundColor: "#7C3AED",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  link: { 
    textAlign: "center", 
    marginTop: 25, 
    color: "#A78BFA",
    fontSize: 14,
  },
  hintText: {
    textAlign: "center",
    marginTop: 12,
    color: "#6B6A8A",
    fontSize: 12,
    fontStyle: "italic",
  },
});