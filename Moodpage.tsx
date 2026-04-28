import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Share,
  StatusBar,
  Platform,
} from "react-native";

const STATUS_BAR_HEIGHT =
  Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 44;

import { moodService } from "./supabaseService";

const quranVerses = {
  Heureux: {
    emoji: "😊",
    short: [
      { arabic: "إِنَّ اللَّهَ غَفُورٌ رَّحِيمٌ", translation: "Allah est Pardonneur et Miséricordieux.", reference: "2:173" },
      { arabic: "اللَّهُ نُورُ السَّمَاوَاتِ وَالْأَرْضِ", translation: "Allah est la lumière des cieux et de la terre.", reference: "24:35" },
      { arabic: "اللَّهُ خَيْرُ الرَّازِقِينَ", translation: "Allah est le meilleur des pourvoyeurs.", reference: "62:11" },
      { arabic: "إِنَّ رَبِّي قَرِيبٌ مُّجِيبٌ", translation: "Mon Seigneur est proche et répond.", reference: "11:61" },
      { arabic: "اللَّهُ لَطِيفٌ بِعِبَادِهِ", translation: "Allah est doux envers Ses serviteurs.", reference: "42:19" },
    ],
    long: [
      { arabic: "لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ", translation: "Si vous êtes reconnaissants, J'augmenterai.", reference: "14:7" },
      { arabic: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ", translation: "Celui qui se confie en Allah, Il lui suffit.", reference: "65:3" },
      { arabic: "وَرَحْمَتِي وَسِعَتْ كُلَّ شَيْءٍ", translation: "Ma miséricorde embrasse toute chose.", reference: "7:156" },
      { arabic: "إِنَّ اللَّهَ لَا يُضِيعُ أَجْرَ الْمُحْسِنِينَ", translation: "Allah ne perd pas la récompense des bienfaiteurs.", reference: "9:120" },
      { arabic: "إِنَّ مَعَ الْعُسْرِ يُسْرًا", translation: "Avec la difficulté vient la facilité.", reference: "94:6" },
    ],
  },
  Neutre: {
    emoji: "😐",
    short: [
      { arabic: "قُلْ هُوَ اللَّهُ أَحَدٌ", translation: "Dis: Lui, Allah est Unique.", reference: "112:1" },
      { arabic: "اللَّهُ الصَّمَدُ", translation: "Allah, l'Absolu.", reference: "112:2" },
      { arabic: "اللَّهُ عَلِيمٌ خَبِيرٌ", translation: "Allah est savant et informé.", reference: "2:282" },
      { arabic: "اللَّهُ بَصِيرٌ بِالْعِبَادِ", translation: "Allah voit les serviteurs.", reference: "4:58" },
      { arabic: "اللَّهُ سَمِيعٌ عَلِيمٌ", translation: "Allah entend et sait.", reference: "2:127" },
    ],
    long: [
      { arabic: "اللَّهُ نُورُ السَّمَاوَاتِ وَالْأَرْضِ", translation: "Allah est la lumière des cieux et de la terre.", reference: "24:35" },
      { arabic: "وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ", translation: "Il est avec vous où que vous soyez.", reference: "57:4" },
      { arabic: "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ", translation: "Par le rappel d'Allah les cœurs se calment.", reference: "13:28" },
      { arabic: "إِنَّ اللَّهَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ", translation: "Allah est capable de toute chose.", reference: "2:20" },
      { arabic: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ", translation: "Allah, il n'y a de dieu que Lui.", reference: "2:255" },
    ],
  },
  Triste: {
    emoji: "😢",
    short: [
      { arabic: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", translation: "Allah est avec les patients.", reference: "2:153" },
      { arabic: "لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ", translation: "Ne désespérez pas de la miséricorde d'Allah.", reference: "39:53" },
      { arabic: "اللَّهُ قَرِيبٌ مُّجِيبٌ", translation: "Allah est proche et répond.", reference: "11:61" },
      { arabic: "اللَّهُ غَفُورٌ رَّحِيمٌ", translation: "Allah est pardonneur et miséricordieux.", reference: "39:53" },
      { arabic: "اللَّهُ رَحِيمٌ بِالْعِبَادِ", translation: "Allah est miséricordieux envers les serviteurs.", reference: "2:173" },
    ],
    long: [
      { arabic: "لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ إِنَّ اللَّهَ يَغْفِرُ الذُّنُوبَ جَمِيعًا", translation: "Ne désespérez pas de la miséricorde d'Allah. Allah pardonne tous les péchés.", reference: "39:53" },
      { arabic: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا إِنَّ مَعَ الْعُسْرِ يُسْرًا", translation: "Car avec la difficulté vient la facilité. Oui, avec la difficulté vient la facilité.", reference: "94:5-6" },
      { arabic: "وَاصْبِرْ وَمَا صَبْرُكَ إِلَّا بِاللَّهِ", translation: "Sois patient, et ta patience n'est que par Allah.", reference: "16:127" },
      { arabic: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ", translation: "Celui qui se confie en Allah, Il lui suffit.", reference: "65:3" },
      { arabic: "اللَّهُ لَا يُكَلِّفُ نَفْسًا إِلَّا وُسْعَهَا", translation: "Allah n'impose à aucune âme une charge supérieure à sa capacité.", reference: "2:286" },
    ],
  },
};

function getRandomItem(arr: any[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function Moodpage({ route, navigation }: any) {
  const mood = route?.params?.mood || "Heureux";
  const moodData = quranVerses[mood as keyof typeof quranVerses] || quranVerses.Heureux;
  const [verses, setVerses] = useState<any[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  // ✅ Sauvegarde à chaque visite (chaque pression sur un mood)
  useEffect(() => {
    moodService.saveMood(mood).catch(() => {});
  }, [mood]);

  const generateVerses = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      const newVerses = [getRandomItem(moodData.short), getRandomItem(moodData.long)];
      setVerses(newVerses);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    });
  }, [moodData, fadeAnim, scaleAnim]);

  useEffect(() => {
    generateVerses();
  }, [generateVerses]);

  const shareVerse = async () => {
    const verse = verses[0];
    if (!verse) return;
    try {
      await Share.share({
        message: `${verse.arabic}\n\n${verse.translation}\n\n- Quran ${verse.reference}`,
        title: "Verset du Coran",
      });
    } catch {}
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />

      {/* HEADER unifié */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mood</Text>
      </View>

      <View style={styles.emojiContainer}>
        <Text style={styles.emoji}>{moodData.emoji}</Text>
        <Text style={styles.moodTitle}>{mood}</Text>
        <View style={styles.savedBadge}>
          <Text style={styles.savedText}>✅ Humeur enregistrée</Text>
        </View>
      </View>

      <Animated.View style={[styles.versesContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        {verses.map((v, i) => (
          <View key={i} style={[styles.card, i === 0 && styles.shortCard]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>{i === 0 ? "Réflexion courte" : "Réflexion profonde"}</Text>
              {i === 0 && (
                <TouchableOpacity onPress={shareVerse}>
                  <Text style={styles.shareIcon}>📤</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.arabic}>{v.arabic}</Text>
            <View style={styles.divider} />
            <Text style={styles.translation}>{v.translation}</Text>
            <View style={styles.referenceBox}>
              <Text style={styles.reference}>📖 {v.reference}</Text>
            </View>
          </View>
        ))}
      </Animated.View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={generateVerses}>
          <Text style={styles.secondaryText}>🔄 Nouveaux versets</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate("History")}>
          <Text style={styles.primaryText}>📊 Historique →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3E8FF" },
  content: { paddingBottom: 40 },

  header: {
    paddingTop: STATUS_BAR_HEIGHT + 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "#7C3AED",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    marginBottom: 24,
    alignItems: "center",
  },
  backBtn: {
    position: "absolute",
    left: 20,
    bottom: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 50,
    width: 42,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
  },
  backArrow: { color: "white", fontSize: 20, fontWeight: "bold", marginLeft: -1 },
  headerTitle: { color: "white", fontSize: 24, fontWeight: "bold" },

  emojiContainer: { alignItems: "center", marginBottom: 24, paddingHorizontal: 20 },
  emoji: { fontSize: 90, marginBottom: 8 },
  moodTitle: { fontSize: 28, fontWeight: "800", color: "#4C1D95", textTransform: "capitalize", marginBottom: 10 },
  savedBadge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  savedText: { color: "#065F46", fontSize: 13, fontWeight: "600" },

  versesContainer: { paddingHorizontal: 20, marginBottom: 20 },
  card: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 24,
    marginBottom: 16,
    elevation: 4,
    shadowColor: "#7C3AED",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  shortCard: { borderLeftWidth: 4, borderLeftColor: "#7C3AED" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  cardLabel: { fontSize: 12, fontWeight: "bold", color: "#7C3AED", textTransform: "uppercase", letterSpacing: 1 },
  shareIcon: { fontSize: 20, opacity: 0.7 },
  arabic: { fontSize: 26, textAlign: "center", lineHeight: 44, color: "#1F2937", fontWeight: "600", marginBottom: 16 },
  divider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 16 },
  translation: { textAlign: "center", fontSize: 16, color: "#4B5563", lineHeight: 24, fontStyle: "italic" },
  referenceBox: { marginTop: 16, alignSelf: "center", backgroundColor: "#EDE9FE", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  reference: { fontSize: 13, color: "#7C3AED", fontWeight: "600" },

  buttonRow: { flexDirection: "row", gap: 12, marginTop: 4, paddingHorizontal: 20 },
  primaryBtn: { flex: 1, backgroundColor: "#7C3AED", padding: 18, borderRadius: 16, alignItems: "center", elevation: 4 },
  primaryText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  secondaryBtn: { flex: 1, backgroundColor: "#fff", padding: 18, borderRadius: 16, alignItems: "center", borderWidth: 2, borderColor: "#7C3AED" },
  secondaryText: { color: "#7C3AED", fontWeight: "bold", fontSize: 15 },
});
