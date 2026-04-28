// Religionspage.tsx — VERSION CORRIGÉE
// Bug fix:
//  ✅ onData ne sauvegarde plus les default tasks si des tâches locales existent déjà
//  ✅ saveTasksLocally appelée UNIQUEMENT quand on a des vraies données (serveur ou toggle)
//  ✅ Initialisation: charge d'abord le cache local, puis serveur si disponible
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, StatusBar,
  Platform, KeyboardAvoidingView, Keyboard, Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { religionService } from "./supabaseService";
import { useOfflineFirst } from "./useOfflineFirst";

const STATUS_BAR_HEIGHT = Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 44;

const STORAGE_TASKS_KEY = "religion_tasks_local";
const STORAGE_QURAN_KEY = "religion_quran_local";

const dailyVerses = [
  { arabic: "وَابْتَغِ فِيمَا آتَاكَ اللَّهُ الدَّارَ الْآخِرَةَ", text: "Et recherche à travers ce qu'Allah t'a donné la Demeure dernière.", ref: "Sourate Al-Qasas (28:77)" },
  { arabic: "إِنَّ مَعَ الْعُسْرِ يُسْرًا", text: "Certes, avec la difficulté vient la facilité.", ref: "Sourate Al-Inshirah (94:6)" },
  { arabic: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", text: "Allah est avec les patients.", ref: "Sourate Al-Baqara (2:153)" },
  { arabic: "لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ", text: "Ne désespérez pas de la miséricorde d'Allah.", ref: "Sourate Az-Zumar (39:53)" },
  { arabic: "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ", text: "Par le rappel d'Allah, les cœurs se tranquillisent.", ref: "Sourate Ar-Ra'd (13:28)" },
  { arabic: "وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ", text: "Il est avec vous où que vous soyez.", ref: "Sourate Al-Hadid (57:4)" },
  { arabic: "وَرَحْمَتِي وَسِعَتْ كُلَّ شَيْءٍ", text: "Ma miséricorde embrasse toute chose.", ref: "Sourate Al-A'raf (7:156)" },
];

const todayVerse = dailyVerses[new Date().getDay() % dailyVerses.length];

const makeDefaultTasks = () => {
  const base = Date.now();
  return [
    { id: `local-${base}-1`, title: "Fajr", type: "prayer", completed: false },
    { id: `local-${base}-2`, title: "Dhuhr", type: "prayer", completed: false },
    { id: `local-${base}-3`, title: "Asr", type: "prayer", completed: false },
    { id: `local-${base}-4`, title: "Maghrib", type: "prayer", completed: false },
    { id: `local-${base}-5`, title: "Isha", type: "prayer", completed: false },
    { id: `local-${base}-6`, title: "Lecture du Coran (au moins 1 page)", type: "quran", completed: false },
    { id: `local-${base}-7`, title: "Dhikr du matin", type: "dhikr", completed: false },
    { id: `local-${base}-8`, title: "Dhikr du soir", type: "dhikr", completed: false },
    { id: `local-${base}-9`, title: "Douaa", type: "dua", completed: false },
  ];
};

function Toast({ message, color = "#22C55E" }: { message: string; color?: string }) {
  return (
    <View style={[toastStyle.box, { backgroundColor: color }]}>
      <Text style={toastStyle.text}>{message}</Text>
    </View>
  );
}
const toastStyle = StyleSheet.create({
  box: { position: "absolute", top: STATUS_BAR_HEIGHT + 10, left: 20, right: 20, padding: 14, borderRadius: 14, zIndex: 9999, elevation: 20 },
  text: { color: "white", textAlign: "center", fontWeight: "bold", fontSize: 14 },
});

const getTodayKey = () => `${STORAGE_TASKS_KEY}_${new Date().toISOString().split("T")[0]}`;
const getTodayDate = () => new Date().toISOString().split("T")[0];

// ✅ FIX: Sauvegarde SEULEMENT si les tâches ont au moins une complétée OU si on le force
const saveTasksLocally = async (tasks: any[], force = false) => {
  try {
    const today = getTodayDate();
    const hasProgress = tasks.some(t => t.completed);
    // Ne sauvegarder que si il y a de la progression OU si on force (depuis toggleTask)
    if (!hasProgress && !force) return;
    const withDate = tasks.map(t => ({ ...t, task_date: t.task_date || today }));
    await AsyncStorage.setItem(getTodayKey(), JSON.stringify(withDate));
    await AsyncStorage.setItem(`religion_tasks_local_${today}`, JSON.stringify(withDate));
  } catch {}
};

const loadTasksLocally = async (): Promise<any[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(getTodayKey());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const saveQuranLocally = async (pages: number, currentPage?: number) => {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_QURAN_KEY);
    const prev = existing ? JSON.parse(existing) : {};
    await AsyncStorage.setItem(STORAGE_QURAN_KEY, JSON.stringify({ ...prev, pages, current_page: currentPage ?? pages }));
  } catch {}
};

const loadQuranLocally = async (): Promise<number> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_QURAN_KEY);
    return raw ? JSON.parse(raw).pages || 0 : 0;
  } catch { return 0; }
};

const loadCurrentPageLocally = async (): Promise<number> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_QURAN_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return data.current_page ?? data.pages ?? 0;
  } catch { return 0; }
};

export default function ReligionsPage({ navigation }: any) {
  const [tasks, setTasks] = useState<any[]>(() => makeDefaultTasks());
  const [quranInput, setQuranInput] = useState("");
  const [quranProgress, setQuranProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [savingQuran, setSavingQuran] = useState(false);
  const [toast, setToast] = useState<{ msg: string; color?: string } | null>(null);
  const [quranDirty, setQuranDirty] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const quranInputRef = useRef<TextInput>(null);
  const isEditingQuran = useRef(false);

  // ─── Bloquer le retour si Quran non sauvegardé ────────────────
  useEffect(() => {
    const unsubscribe = (navigation as any).addListener("beforeRemove", (e: any) => {
      if (!quranDirty) return;
      e.preventDefault();
      Alert.alert(
        "⚠️ Progression non sauvegardée",
        "Vous avez modifié la progression du Coran. Sauvegarder avant de quitter ?",
        [
          { text: "Annuler", style: "cancel" },
          { text: "Ignorer", style: "destructive", onPress: () => { setQuranDirty(false); (navigation as any).dispatch(e.data.action); } },
          { text: "💾 Sauvegarder", onPress: async () => { await saveQuranProgress(); setQuranDirty(false); (navigation as any).dispatch(e.data.action); } },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, quranDirty]);

  const showToast = (msg: string, color?: string) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  };

  const cacheLoader = useCallback(async () => {
    try {
      const [localTasks, localPages, localCurrentPage] = await Promise.all([
        loadTasksLocally(),
        loadQuranLocally(),
        loadCurrentPageLocally(),
      ]);
      // ✅ FIX: Si des tâches locales existent (avec ou sans progression), on les utilise
      // On NE génère PAS de defaults ici — le composant est déjà initialisé avec des defaults
      const resolvedTasks = localTasks && localTasks.length > 0 ? localTasks : null;
      return { tasks: resolvedTasks, pages: localPages, current_page: localCurrentPage };
    } catch {
      return { tasks: null, pages: 0, current_page: 0 };
    }
  }, []);

  const serverLoader = useCallback(async () => {
    try {
      const [todayTasks, quranData] = await Promise.allSettled([
        religionService.getTodayTasks(),
        religionService.getQuranProgress(),
      ]);
      const taskResult = todayTasks.status === "fulfilled" ? todayTasks.value : null;
      const quran = quranData.status === "fulfilled" ? quranData.value : null;
      const serverTasks = taskResult && taskResult.length > 0 ? taskResult : null;
      const pages = parseInt(quran?.progress || quran?.pages_read || "0", 10);
      return { tasks: serverTasks, pages: isNaN(pages) ? 0 : pages, current_page: quran?.current_page ?? pages };
    } catch {
      return null;
    }
  }, []);

  const onData = useCallback((data: { tasks: any[] | null; pages: number; current_page?: number }) => {
    if (!data) return;

    // ✅ FIX PRINCIPAL: on met à jour les tâches SEULEMENT si le serveur en renvoie
    // On ne sauvegarde JAMAIS les defaults (completed: false) automatiquement
    if (data.tasks && data.tasks.length > 0) {
      setTasks(data.tasks);
      // Sauvegarde avec force=true car ça vient du serveur (source de vérité)
      saveTasksLocally(data.tasks, true);
    }
    // Si data.tasks === null: on garde l'état local (déjà chargé par cacheLoader ou defaults)
    // et on ne touche PAS au cache — les tâches togglées restent intactes

    if (data.pages > 0) {
      setQuranProgress(prev => Math.max(prev, data.pages));
      const cp = data.current_page ?? data.pages;
      if (!isEditingQuran.current) {
        setCurrentPage(prevCp => {
          const newVal = Math.max(prevCp, cp);
          setQuranInput(newVal > 0 ? newVal.toString() : "");
          return newVal;
        });
      }
      saveQuranLocally(data.pages, cp);
    }
  }, []);

  const { refreshing, refresh } = useOfflineFirst({
    cacheLoader,
    serverLoader,
    onData,
    fallback: { tasks: null, pages: 0 },
  });

  // ✅ FIX: Appliquer le cache au state dès le mount
  useEffect(() => {
    loadTasksLocally().then(localTasks => {
      if (localTasks && localTasks.length > 0) {
        setTasks(localTasks);
      }
    }).catch(() => {});
    loadCurrentPageLocally().then(cp => {
      if (cp > 0) {
        setCurrentPage(cp);
        setQuranInput(cp.toString());
      }
    }).catch(() => {});
    loadQuranLocally().then(pages => {
      if (pages > 0) setQuranProgress(pages);
    }).catch(() => {});
  }, []);

  const toggleTask = async (task: any) => {
    const newVal = !task.completed;
    setTasks(prev => {
      const updated = prev.map(t => t.id === task.id ? { ...t, completed: newVal } : t);
      // ✅ FIX: force=true — on sauvegarde toujours depuis toggleTask, même si 0 complétées
      saveTasksLocally(updated, true);
      return updated;
    });
    try {
      const newRealId = await religionService.toggleTask(task.id, newVal, { title: task.title, type: task.type || "other" });
      if (newRealId && task.id.startsWith("local-")) {
        setTasks(prev => {
          const updated = prev.map(t => t.id === task.id ? { ...t, id: newRealId, completed: newVal } : t);
          saveTasksLocally(updated, true);
          return updated;
        });
      }
    } catch {
      setTasks(prev => {
        const reverted = prev.map(t => t.id === task.id ? { ...t, completed: !newVal } : t);
        saveTasksLocally(reverted, true);
        return reverted;
      });
      showToast("⚠️ Sauvegardé localement", "#F59E0B");
    }
  };

  const saveQuranProgress = async () => {
    Keyboard.dismiss();
    const pages = parseInt(quranInput, 10);
    if (isNaN(pages) || pages < 0) {
      showToast("❌ Entrez un nombre entre 0 et 604", "#EF4444");
      return;
    }
    if (pages > 604) {
      showToast("❌ Mtnjmech t5ou9 604 pages!", "#EF4444");
      return;
    }
    const newTotal = Math.max(quranProgress, pages);
    setCurrentPage(pages);
    setQuranProgress(newTotal);
    setQuranDirty(false);
    await saveQuranLocally(newTotal, pages);
    try {
      setSavingQuran(true);
      await religionService.updateQuranProgress(pages, pages);
      if (pages === 604) {
        showToast("🎉 مبروك! لقد ختمت القرآن الكريم! 🌟", "#7C3AED");
      } else {
        showToast(`✅ وصلت إلى صفحة ${pages} — باقي ${604 - pages} صفحة 💪`);
      }
    } catch {
      showToast("⚠️ Sauvegardé localement ✅", "#F59E0B");
    } finally {
      setSavingQuran(false);
    }
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const quranPercent = Math.round((currentPage / 604) * 100);
  const khatmat = Math.floor(currentPage / 604);

  const getTaskIcon = (type: string) => {
    switch (type) {
      case "prayer": return "🕌";
      case "quran": return "📖";
      case "dhikr": return "📿";
      case "dua": return "🤲";
      default: return "✨";
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />
        {toast && <Toast message={toast.msg} color={toast.color} />}

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerEmoji}>🤲</Text>
            <Text style={styles.headerTitle}>Religion</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#7C3AED" />}
        >
          {/* TÂCHES */}
          <View style={styles.card}>
            <View style={styles.progressHeader}>
              <Text style={styles.cardTitle}>📋 Tâches du jour</Text>
              <Text style={styles.progressPercent}>{progressPercent}%</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` as any }]} />
            </View>
            <Text style={styles.progressSub}>{completedCount}/{totalCount} complétées</Text>

            {tasks.map(task => (
              <TouchableOpacity key={task.id} style={styles.taskRow} onPress={() => toggleTask(task)} activeOpacity={0.7}>
                <View style={[styles.checkbox, task.completed && styles.checkboxDone]}>
                  {task.completed && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.taskIcon}>{getTaskIcon(task.type)}</Text>
                <Text style={[styles.taskTitle, task.completed && styles.taskDone]}>{task.title}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* CORAN */}
          <View style={[styles.card, styles.quranCard]}>
            <View style={styles.quranHeader}>
              <Text style={styles.quranTitle}>📖 Lecture du Coran</Text>
              <TouchableOpacity onPress={saveQuranProgress} disabled={savingQuran} style={styles.saveQuranBtn}>
                {savingQuran
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveIcon}>💾</Text>
                }
              </TouchableOpacity>
            </View>

            <View style={styles.quranStatsRow}>
              <View style={styles.quranStat}>
                <Text style={styles.quranStatVal}>{currentPage}</Text>
                <Text style={styles.quranStatLabel}>Pages lues</Text>
              </View>
              <View style={styles.quranDivider} />
              <View style={styles.quranStat}>
                <Text style={styles.quranStatVal}>{604 - currentPage}</Text>
                <Text style={styles.quranStatLabel}>Restantes</Text>
              </View>
              <View style={styles.quranDivider} />
              <View style={styles.quranStat}>
                <Text style={styles.quranStatVal}>{khatmat}</Text>
                <Text style={styles.quranStatLabel}>Khatmat</Text>
              </View>
            </View>

            <View style={styles.quranProgressBg}>
              <View style={[styles.quranProgressFill, { width: `${quranPercent}%` as any }]} />
            </View>
            <Text style={styles.quranSub}>{quranPercent}% complété</Text>

            <TextInput
              ref={quranInputRef}
              style={styles.quranInput}
              placeholder="Page où t'es (1-604)..."
              placeholderTextColor="rgba(255,255,255,0.65)"
              keyboardType="number-pad"
              value={quranInput}
              onChangeText={text => { isEditingQuran.current = true; setQuranInput(text); setQuranDirty(true); }}
              onFocus={() => { isEditingQuran.current = true; setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 350); }}
              onBlur={() => { isEditingQuran.current = false; }}
              onSubmitEditing={saveQuranProgress}
              returnKeyType="done"
              blurOnSubmit={true}
              maxLength={3}
            />
          </View>

          {/* VERSET DU JOUR */}
          <View style={styles.verseCard}>
            <Text style={styles.verseLabel}>✨ Verset du jour</Text>
            <Text style={styles.verseArabic}>{todayVerse.arabic}</Text>
            <Text style={styles.verseText}>"{todayVerse.text}"</Text>
            <Text style={styles.verseRef}>{todayVerse.ref}</Text>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3E8FF" },
  header: { paddingTop: STATUS_BAR_HEIGHT + 12, paddingBottom: 18, paddingHorizontal: 20, backgroundColor: "#7C3AED", borderBottomLeftRadius: 30, borderBottomRightRadius: 30, flexDirection: "row", alignItems: "center", elevation: 6 },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.25)", justifyContent: "center", alignItems: "center" },
  backArrow: { color: "white", fontSize: 20, fontWeight: "bold" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerEmoji: { fontSize: 32, marginBottom: 2 },
  headerTitle: { color: "white", fontSize: 24, fontWeight: "bold" },
  headerRight: { width: 42 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  card: { backgroundColor: "white", borderRadius: 20, padding: 20, marginBottom: 16, elevation: 4 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  progressPercent: { fontSize: 16, fontWeight: "bold", color: "#7C3AED" },
  progressBarBg: { height: 8, backgroundColor: "#E5E7EB", borderRadius: 4, overflow: "hidden" },
  progressBarFill: { height: 8, backgroundColor: "#7C3AED", borderRadius: 4 },
  progressSub: { marginTop: 8, fontSize: 13, color: "#6B7280", textAlign: "right" },
  taskRow: { flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F3E8FF" },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: "#7C3AED", justifyContent: "center", alignItems: "center", marginRight: 12, backgroundColor: "white" },
  checkboxDone: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  checkmark: { color: "white", fontSize: 15, fontWeight: "bold" },
  taskIcon: { fontSize: 18, marginRight: 10 },
  taskTitle: { fontSize: 15, color: "#1F2937", fontWeight: "500", flex: 1 },
  taskDone: { textDecorationLine: "line-through", color: "#9CA3AF" },
  quranCard: { backgroundColor: "#7C3AED" },
  quranHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  quranTitle: { color: "white", fontSize: 16, fontWeight: "700" },
  saveQuranBtn: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  saveIcon: { fontSize: 18 },
  quranStatsRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 14 },
  quranStat: { alignItems: "center" },
  quranStatVal: { fontSize: 24, fontWeight: "bold", color: "white" },
  quranStatLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  quranDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  quranProgressBg: { height: 8, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 4, overflow: "hidden", marginBottom: 6 },
  quranProgressFill: { height: 8, backgroundColor: "white", borderRadius: 4 },
  quranSub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginBottom: 14, textAlign: "center" },
  quranInput: { backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 14, padding: 16, color: "white", fontSize: 16, fontWeight: "600", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)", textAlign: "center", minHeight: 52 },
  verseCard: { backgroundColor: "white", borderRadius: 20, padding: 22, marginBottom: 16, elevation: 2, alignItems: "center" },
  verseLabel: { fontSize: 13, fontWeight: "700", color: "#7C3AED", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 },
  verseArabic: { fontSize: 22, color: "#1F2937", textAlign: "center", lineHeight: 38, marginBottom: 10, fontWeight: "700", writingDirection: "rtl" },
  verseText: { fontSize: 15, color: "#374151", fontStyle: "italic", textAlign: "center", lineHeight: 24, marginBottom: 12 },
  verseRef: { fontSize: 13, color: "#7C3AED", fontWeight: "700" },
});
