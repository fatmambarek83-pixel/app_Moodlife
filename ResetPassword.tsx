import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { supabase } from "./supabaseClient";

const STATUS_BAR_HEIGHT =
  Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 44;

export default function ResetPassword({ navigation }: any) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleReset = async () => {
    if (!password || !confirm) {
      Alert.alert("Erreur", "Remplis tous les champs");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Erreur", "Les mots de passe ne correspondent pas");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Erreur", "Minimum 6 caractères");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setLoading(false);
        Alert.alert("Erreur ❌", error.message);
        return;
      }

      setLoading(false);

      // ✅ FIX: Alert d'abord, signOut + navigation DANS le callback
      Alert.alert(
        "Succès ✅",
        "Mot de passe mis à jour ! Connecte-toi avec ton nouveau mot de passe.",
        [
          {
            text: "Se connecter",
            onPress: async () => {
              await supabase.auth.signOut();
              navigation.reset({
                index: 0,
                routes: [{ name: "Login" }],
              });
            },
          },
        ],
        { cancelable: false }
      );
    } catch (e: any) {
      setLoading(false);
      Alert.alert("Erreur ❌", e.message || "Une erreur est survenue");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1E1B3A" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <Text style={styles.lockEmoji}>🔐</Text>
          <Text style={styles.title}>Nouveau mot de passe</Text>
          <Text style={styles.subtitle}>Choisis un mot de passe sécurisé (min. 6 caractères)</Text>
        </View>

        <View>
          <Text style={styles.label}>Nouveau mot de passe</Text>
          <View style={styles.inputRow}>
            <TextInput
              placeholder="••••••••"
              placeholderTextColor="#A78BFA"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.eyeText}>{showPassword ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirmer le mot de passe</Text>
          <View style={styles.inputRow}>
            <TextInput
              placeholder="••••••••"
              placeholderTextColor="#A78BFA"
              secureTextEntry={!showConfirm}
              value={confirm}
              onChangeText={setConfirm}
              style={styles.input}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirm(!showConfirm)}>
              <Text style={styles.eyeText}>{showConfirm ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          {confirm.length > 0 && (
            <Text style={[styles.matchText, password === confirm ? styles.matchOk : styles.matchErr]}>
              {password === confirm ? "✅ Mots de passe identiques" : "❌ Mots de passe différents"}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleReset}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={styles.buttonText}>Mettre à jour →</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1E1B3A" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: STATUS_BAR_HEIGHT + 20 },

  header: { alignItems: "center", marginBottom: 40 },
  lockEmoji: { fontSize: 60, marginBottom: 16 },
  title: { fontSize: 28, color: "#EDE9FE", fontWeight: "bold", marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 14, color: "#A78BFA", textAlign: "center", lineHeight: 20 },

  label: { color: "#A78BFA", fontSize: 13, fontWeight: "600", marginBottom: 6, marginLeft: 4, marginTop: 16 },
  inputRow: { flexDirection: "row", alignItems: "center", position: "relative" },
  input: {
    flex: 1,
    backgroundColor: "#312E5B",
    borderRadius: 16,
    padding: 16,
    paddingRight: 50,
    color: "white",
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  eyeBtn: { position: "absolute", right: 14, padding: 8 },
  eyeText: { fontSize: 18 },

  matchText: { fontSize: 13, marginLeft: 4, marginTop: 8 },
  matchOk: { color: "#34D399" },
  matchErr: { color: "#F87171" },

  button: {
    backgroundColor: "#7C3AED",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 32,
    elevation: 4,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
});
