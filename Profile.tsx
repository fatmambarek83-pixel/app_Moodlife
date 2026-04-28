import React, { useState, useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";

const STATUS_BAR_HEIGHT =
  Platform.OS === "android" ? (require("react-native").StatusBar.currentHeight || 24) : 44;
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  Alert,
  Animated,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { profileService, authService, clearUserIdCache } from "./supabaseService";
import { supabase } from "./supabaseClient";
import AsyncStorage from "@react-native-async-storage/async-storage";

let shouldRefreshProfile = true;

export default function Profile({ navigation }: any) {
  const [profile, setProfile] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageError, setImageError] = useState(false);

  const scaleLogout = useRef(new Animated.Value(1)).current;
  const scaleDelete = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      scaleLogout.stopAnimation();
      scaleDelete.stopAnimation();
    };
  });

  const pressIn = (anim: Animated.Value) => {
    Animated.spring(anim, { toValue: 0.95, useNativeDriver: true }).start();
  };

  const pressOut = (anim: Animated.Value) => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true }).start();
  };

  const loadData = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setImageError(false);
    try {
      const data = await profileService.getProfile();
      setProfile(data);
      const user = await authService.getCurrentUser();
      setEmail(user?.email || "");
    } catch {
      // silencieux
    } finally {
      if (showLoader) setLoading(false);
      shouldRefreshProfile = false;
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleLogout = async () => {
    try {
      await authService.signOut();
    } catch {
      Alert.alert("Erreur", "Problème lors de la déconnexion");
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "⚠️ Supprimer le compte",
      "Cette action est irréversible. Toutes vos données seront supprimées.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Je comprends",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Confirmation finale",
              `Supprimer définitivement ${maskEmail(email)} ?`,
              [
                { text: "Annuler", style: "cancel" },
                { text: "SUPPRIMER", style: "destructive", onPress: confirmDelete },
              ]
            );
          },
        },
      ]
    );
  };

  // ✅ FIX: Nettoyage complet + gestion claire si le compte n'a pas pu être supprimé côté Supabase
  const confirmDelete = async () => {
    try {
      setDeleting(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      const token = sessionData.session?.access_token;

      if (!user || !token) {
        Alert.alert("Erreur", "Session expirée. Reconnecte-toi d'abord.");
        setDeleting(false);
        return;
      }

      // 1. Supprimer le profil de la DB
      await profileService.deleteProfile(user.id).catch(() => {});

      // 2. Supprimer le compte auth Supabase (edge function → fallback RPC)
      let authDeleted = false;
      try {
        const res = await fetch(
          "https://caktljgmffvzusrszero.functions.supabase.co/delete-user",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ user_id: user.id }),
          }
        );
        const result = await res.json();
        if (res.ok && !result.error) authDeleted = true;
      } catch {}

      if (!authDeleted) {
        try {
          const { error: rpcError } = await supabase.rpc("delete_user");
          if (!rpcError) authDeleted = true;
        } catch {}
      }

      // 3. ✅ FIX: Déconnexion + nettoyage TOTAL du AsyncStorage
      try { await supabase.auth.signOut(); } catch {}
      clearUserIdCache();
      try { await AsyncStorage.clear(); } catch {}

      setDeleting(false);

      if (!authDeleted) {
        // L'auth user n'a pas pu être supprimé côté Supabase
        // On informe l'utilisateur mais on le redirige quand même
        Alert.alert(
          "⚠️ Suppression partielle",
          "Tes données locales ont été effacées. Si tu veux te réinscrire avec le même email, contacte le support ou attends 24h.",
          [{ text: "OK", onPress: () => navigation.reset({ index: 0, routes: [{ name: "Login" }] }) }]
        );
      } else {
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
      }

    } catch {
      // Erreur inattendue — on nettoie quand même et on redirige
      try { await supabase.auth.signOut(); } catch {}
      clearUserIdCache();
      try { await AsyncStorage.clear(); } catch {}
      setDeleting(false);
      navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    }
  };

  const maskEmail = (emailToMask: string) => {
    if (!emailToMask || !emailToMask.includes("@")) return "—";
    const [name, domain] = emailToMask.split("@");
    if (name.length <= 2) return emailToMask;
    return name.slice(0, 2) + "***@" + domain;
  };

  const getUsername = () => {
    if (profile?.instagram) return profile.instagram.replace("@", "");
    if (profile?.name) return profile.name.toLowerCase().replace(/\s/g, "");
    return "utilisateur";
  };

  if (deleting) {
    return (
      <View style={styles.loadingOverlay}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loadingText}>Suppression en cours...</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" colors={["#7C3AED"]} />
          }
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Retour">
              <Icon name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Profil</Text>
          </View>

          <View style={styles.avatar}>
            {profile?.avatar_url && !imageError ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} resizeMode="cover" onError={() => setImageError(true)} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Icon name="person" size={50} color="#fff" />
              </View>
            )}
          </View>

          <Text style={styles.name}>{profile?.prenom || ""} {profile?.name || ""}</Text>
          <Text style={styles.username}>@{getUsername()}</Text>

          <View style={styles.card}>
            {item("person-outline", "Nom", profile?.name)}
            {item("happy-outline", "Prénom", profile?.prenom)}
            {item("calendar-outline", "Date de naissance", profile?.birthday)}
            {item("call-outline", "Téléphone", profile?.phone)}
            {item("logo-instagram", "Instagram", profile?.instagram)}
            {item("mail-outline", "Email", maskEmail(email))}
          </View>

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => { shouldRefreshProfile = true; navigation.navigate("EditProfile"); }}
          >
            <Icon name="create-outline" size={18} color="#fff" />
            <Text style={styles.editText}>Modifier profil</Text>
          </TouchableOpacity>

          <View style={styles.rowButtons}>
            <Animated.View style={[styles.btnContainer, { transform: [{ scale: scaleLogout }] }]}>
              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={handleLogout}
                onPressIn={() => pressIn(scaleLogout)}
                onPressOut={() => pressOut(scaleLogout)}
              >
                <Icon name="log-out-outline" size={18} color="#fff" />
                <Text style={styles.btnText}>Déconnexion</Text>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={[styles.btnContainer, { transform: [{ scale: scaleDelete }] }]}>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDeleteAccount}
                onPressIn={() => pressIn(scaleDelete)}
                onPressOut={() => pressOut(scaleDelete)}
              >
                <Icon name="trash-outline" size={18} color="#fff" />
                <Text style={styles.btnText}>Supprimer</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>

          <View style={styles.footerSpace} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const item = (icon: string, title: string, value?: string) => (
  <View style={styles.item} key={title}>
    <View style={styles.left}>
      <Icon name={icon} size={20} color="#6C4CCF" />
      <Text style={styles.itemText}>{title}</Text>
    </View>
    <Text style={styles.value}>{value || "—"}</Text>
  </View>
);

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1, backgroundColor: "#F3E8FF" },
  scrollContent: { paddingBottom: 20 },
  loadingOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F3E8FF", gap: 16 },
  loadingText: { color: "#7C3AED", fontSize: 16, fontWeight: "500" },
  header: {
    paddingTop: STATUS_BAR_HEIGHT + 12,
    paddingBottom: 24,
    backgroundColor: "#7C3AED",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 55,
  },
  backBtn: {
    position: "absolute", left: 20, bottom: 16,
    backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 50,
    width: 42, height: 42, justifyContent: "center", alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "600" },
  avatar: {
    width: 110, height: 110, borderRadius: 55, backgroundColor: "#7C3AED",
    alignSelf: "center", marginTop: -55, justifyContent: "center", alignItems: "center",
    borderWidth: 4, borderColor: "#fff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
    elevation: 8, zIndex: 10,
  },
  avatarImg: { width: 110, height: 110, borderRadius: 55 },
  avatarPlaceholder: { justifyContent: "center", alignItems: "center" },
  name: { textAlign: "center", fontSize: 22, fontWeight: "700", marginTop: 15, color: "#1F2937" },
  username: { textAlign: "center", color: "#6B7280", marginBottom: 25, fontSize: 14 },
  card: { marginHorizontal: 20, backgroundColor: "#fff", borderRadius: 20, paddingVertical: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  item: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  left: { flexDirection: "row", alignItems: "center", gap: 12 },
  itemText: { fontSize: 15, color: "#374151", fontWeight: "500" },
  value: { color: "#6B7280", fontSize: 14, maxWidth: "50%" },
  editBtn: {
    margin: 25, backgroundColor: "#7C3AED", padding: 16, borderRadius: 30,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10,
    shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  editText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  rowButtons: { flexDirection: "row", gap: 12, marginHorizontal: 20, marginTop: 10 },
  btnContainer: { flex: 1 },
  logoutBtn: {
    backgroundColor: "#6366F1", padding: 16, borderRadius: 25,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    shadowColor: "#6366F1", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  deleteBtn: {
    backgroundColor: "#EF4444", padding: 16, borderRadius: 25,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    shadowColor: "#EF4444", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  footerSpace: { height: 40 },
});
