// HomePage.tsx — VERSION OFFLINE (design inchangé, pas de banner)
import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { profileService } from "./supabaseService";
import { useOnlineRefresh } from "./useOnlineRefresh";
import Icon from "react-native-vector-icons/Ionicons";

let cachedProfile: any = null;
export const clearProfileCache = () => { cachedProfile = null; };

export default function HomePage({ navigation }: any) {
  const [profile, setProfile] = useState<any>(cachedProfile);
  const [loading, setLoading] = useState(!cachedProfile);
  const [refreshing, setRefreshing] = useState(false);
  const [imageError, setImageError] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const loadProfile = async () => {
    try {
      setLoading(true);
      setImageError(false);
      const data = await profileService.getProfile();
      cachedProfile = data;
      setProfile(data);
    } catch (e: any) {
      console.error("Load error:", e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    cachedProfile = null;
    await loadProfile();
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { loadProfile(); }, []));
  useOnlineRefresh(loadProfile);

  const handleMood = (mood: string) => {
    // Moodpage handles saving — no double-save
    navigation.navigate("Moodpage", { mood });
  };

  const animateMood = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bonjour ☀️";
    if (hour < 18) return "Bon après-midi 🌤️";
    return "Bonsoir 🌙";
  };

  const today = new Date();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />

      {/* 🔥 SUPPRIMÉ: Banner offline orange */}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7C3AED"
            colors={["#7C3AED"]}
          />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.bonjour}>
              {getGreeting()} {profile?.nom ? `👋 ${profile.nom} !` : ""}
            </Text>
            <Text style={styles.appName}>MoodLife 💜</Text>
          </View>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => {
              clearProfileCache();
              navigation.navigate("Profile");
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : profile?.avatar_url && !imageError ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatarImg}
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Icon name="person" size={26} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.dateText}>
          {today.toLocaleDateString("fr-FR", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </Text>

        {/* MOOD SECTION */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Comment tu te sens aujourd'hui ?</Text>
          <View style={styles.moodRow}>
            {[
              { label: "Heureux", emoji: "😊", bg: "#FDE68A", textColor: "#92400E" },
              { label: "Neutre", emoji: "😐", bg: "#E5E7EB", textColor: "#374151" },
              { label: "Triste", emoji: "😢", bg: "#BFDBFE", textColor: "#1E40AF" },
            ].map((item) => (
              <Animated.View
                key={item.label}
                style={[styles.moodAnimated, { transform: [{ scale: scaleAnim }] }]}
              >
                <TouchableOpacity
                  style={[styles.moodBox, { backgroundColor: item.bg }]}
                  onPress={() => { animateMood(); handleMood(item.label); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.moodEmoji}>{item.emoji}</Text>
                  <Text style={[styles.moodText, { color: item.textColor }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* NAVIGATION GRID */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Mes espaces</Text>
          <View style={styles.grid}>
            {[
              { label: "Finance", emoji: "💰", screen: "MoneyPage" },
              { label: "Études", emoji: "📚", screen: "Studypage" },
              { label: "Religion", emoji: "❤️", screen: "Religionspage" },
              { label: "Courses", emoji: "🛒", screen: "GroceryPage" },
            ].map((item) => (
              <TouchableOpacity
                key={item.screen}
                style={styles.navCard}
                onPress={() => navigation.navigate(item.screen)}
                activeOpacity={0.8}
              >
                <Text style={styles.navEmoji}>{item.emoji}</Text>
                <Text style={styles.navText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* HISTORY BUTTONS */}
        <View style={styles.historyRow}>
          <TouchableOpacity
            style={styles.historyCardPurple}
            onPress={() => navigation.navigate("History")}
            activeOpacity={0.8}
          >
            <Text style={styles.historyEmoji}>📊</Text>
            <Text style={styles.historyText}>Historique{"\n"}Humeurs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.historyCardGreen}
            onPress={() => navigation.navigate("FinanceHistory")}
            activeOpacity={0.8}
          >
            <Text style={styles.historyEmoji}>💰</Text>
            <Text style={styles.historyText}>Historique{"\n"}Finances</Text>
          </TouchableOpacity>
        </View>

        {/* 🔥 SUPPRIMÉ: Bouton connexion si guest (pas besoin, app marche offline) */}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F1F5F9" },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 32, paddingBottom: 40 },

  // 🔥 SUPPRIMÉ: offlineBanner styles

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  bonjour: { fontSize: 13, color: "#7C3AED", marginBottom: 2, fontWeight: "600" },
  appName: { fontSize: 28, fontWeight: "bold", color: "#1F2937" },
  dateText: { color: "#6B7280", fontSize: 12, marginBottom: 12 },

  profileButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#7C3AED",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#7C3AED",
    justifyContent: "center",
    alignItems: "center",
  },

  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 24,
    marginBottom: 18,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  sectionTitle: { fontWeight: "bold", fontSize: 16, marginBottom: 16, color: "#1F2937" },

  moodRow: { flexDirection: "row", gap: 10 },
  moodBox: { flex: 1, paddingVertical: 18, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  moodEmoji: { fontSize: 30, marginBottom: 6 },
  moodText: { fontWeight: "700", fontSize: 13, textAlign: "center" },
  moodAnimated: { flex: 1 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  navCard: {
    width: "47%",
    height: 110,
    backgroundColor: "#7C3AED",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  navEmoji: { fontSize: 30, marginBottom: 8 },
  navText: { color: "white", fontWeight: "700", fontSize: 14, textAlign: "center" },

  historyRow: { flexDirection: "row", gap: 12 },
  historyCardPurple: {
    flex: 1, paddingVertical: 20, paddingHorizontal: 12, borderRadius: 20,
    alignItems: "center", elevation: 3, backgroundColor: "#7C3AED",
  },
  historyCardGreen: {
    flex: 1, paddingVertical: 20, paddingHorizontal: 12, borderRadius: 20,
    alignItems: "center", elevation: 3, backgroundColor: "#10B981",
  },
  historyEmoji: { fontSize: 26, marginBottom: 6 },
  historyText: { color: "white", fontWeight: "bold", fontSize: 13, textAlign: "center", lineHeight: 18 },

  // 🔥 SUPPRIMÉ: loginPrompt styles

  bottomSpacer: { height: 40 },
});