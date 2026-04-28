// Inscription.tsx - VERSION FINALE SANS ERREURS
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "./supabaseClient";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Inscription({ navigation }: any) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [nameError, setNameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [nameErrorMsg, setNameErrorMsg] = useState("");
  const [emailErrorMsg, setEmailErrorMsg] = useState("");
  const [passwordErrorMsg, setPasswordErrorMsg] = useState("");
  const [confirmErrorMsg, setConfirmErrorMsg] = useState("");

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
  }, [fadeAnim, slideAnim]);

  const resetForm = useCallback(() => {
    setFullName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setNameError(false);
    setEmailError(false);
    setPasswordError(false);
    setConfirmError(false);
    setNameErrorMsg("");
    setEmailErrorMsg("");
    setPasswordErrorMsg("");
    setConfirmErrorMsg("");
    
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

  const handleSignUp = async () => {
    const noName = !fullName.trim();
    const noEmail = !email.trim();
    const noPassword = !password.trim();
    const noConfirm = !confirmPassword.trim();
    const invalidEmail = !noEmail && !isValidEmail(email);
    const weakPassword = password.length < 6;
    const mismatchPassword = password !== confirmPassword;

    setNameError(noName);
    setEmailError(noEmail || invalidEmail);
    setPasswordError(noPassword || weakPassword);
    setConfirmError(noConfirm || mismatchPassword);

    setNameErrorMsg(noName ? "Nom requis" : "");
    setEmailErrorMsg(
      noEmail ? "Email requis" : invalidEmail ? "Format email invalide" : ""
    );
    setPasswordErrorMsg(
      noPassword ? "Mot de passe requis" : weakPassword ? "Min 6 caractères" : ""
    );
    setConfirmErrorMsg(
      noConfirm ? "Confirmation requise" : mismatchPassword ? "Mots de passe différents" : ""
    );

    if (noName || noEmail || noPassword || noConfirm || invalidEmail || weakPassword || mismatchPassword) {
      shake();
      return;
    }

    try {
      setLoading(true);

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: fullName }
        }
      });

      if (signUpError) {
        Alert.alert("Erreur ❌", signUpError.message);
        return;
      }

      await AsyncStorage.setItem("isNewUser", "true");

      // Session dispo directement (pas de confirmation email) → naviguer maintenant
      if (signUpData?.session) {
        navigation.reset({ index: 0, routes: [{ name: "EditProfile", params: { isNewUser: true } }] });
      } else {
        // Email confirmation activé → informer l'utilisateur
        Alert.alert(
          "Compte créé ✅",
          "Vérifie ta boîte mail pour confirmer ton compte, puis connecte-toi.",
          [{ text: "OK", onPress: () => navigation.navigate("Login") }]
        );
      }

    } catch (e: any) {
      Alert.alert("Erreur ❌", e.message);
    } finally {
      setLoading(false);
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
                <Text style={styles.title}>Inscription</Text>

                <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                  <Text style={[styles.fieldLabel, nameError && styles.fieldLabelError]}>
                    Nom complet {nameError && "⚠️"}
                  </Text>
                  <TextInput
                    placeholder="Ton nom"
                    placeholderTextColor="#A78BFA"
                    value={fullName}
                    onChangeText={(t) => {
                      setFullName(t);
                      if (t.trim()) {
                        setNameError(false);
                        setNameErrorMsg("");
                      }
                    }}
                    style={[styles.input, nameError && styles.inputError]}
                    autoCapitalize="words"
                    autoCorrect={false}
                    textContentType="name"
                  />
                  {nameErrorMsg ? (
                    <Text style={styles.errorText}>{nameErrorMsg}</Text>
                  ) : null}
                </Animated.View>

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
                      textContentType="newPassword"
                      autoComplete="password-new"
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

                <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                  <Text style={[styles.fieldLabel, confirmError && styles.fieldLabelError]}>
                    Confirmer {confirmError && "⚠️"}
                  </Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      placeholder="••••••••"
                      placeholderTextColor="#A78BFA"
                      value={confirmPassword}
                      onChangeText={(t) => {
                        setConfirmPassword(t);
                        if (t.trim()) {
                          setConfirmError(false);
                          setConfirmErrorMsg("");
                        }
                      }}
                      secureTextEntry={!showConfirmPassword}
                      style={[styles.inputPassword, confirmError && styles.inputError]}
                      textContentType="newPassword"
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      <Text style={styles.eyeText}>
                        {showConfirmPassword ? "🙈" : "👁️"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {confirmErrorMsg ? (
                    <Text style={styles.errorText}>{confirmErrorMsg}</Text>
                  ) : null}
                </Animated.View>

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleSignUp}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>S'inscrire →</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate("Login")}
                  activeOpacity={0.7}
                >
                  <Text style={styles.link}>Déjà un compte ? Se connecter →</Text>
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

  button: {
    backgroundColor: "#7C3AED",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 10,
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
});