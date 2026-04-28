// Historypage.tsx — مع حذف فردي + clear all
import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, StatusBar, Platform, Alert,
} from "react-native";

const STATUS_BAR_HEIGHT = Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 44;

import { moodService, religionService } from "./supabaseService";
import { useOfflineFirst } from "./useOfflineFirst";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabaseClient";

const LAST_PURGE_KEY = "history_last_purge_date";

async function autoPurgeOldData() {
  try {
    const lastPurge = await AsyncStorage.getItem(LAST_PURGE_KEY);
    const today = new Date().toISOString().split("T")[0];
    if (lastPurge === today) return;
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const allKeys = await AsyncStorage.getAllKeys();
    for (const key of allKeys) {
      if (key.startsWith("moods_")) {
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const moods = JSON.parse(raw);
          const filtered = moods.filter((m: any) => new Date(m.created_at) >= oneMonthAgo);
          await AsyncStorage.setItem(key, JSON.stringify(filtered));
        }
      }
      if (key.startsWith("religion_tasks_local_")) {
        const dateStr = key.split("religion_tasks_local_")[1];
        if (dateStr && dateStr < oneMonthAgo.toISOString().split("T")[0]) {
          await AsyncStorage.removeItem(key);
        }
      }
    }
    await AsyncStorage.setItem(LAST_PURGE_KEY, today);
  } catch {}
}

// ─── HELPERS CACHE ──────────────────────────────────────────────
async function getCachedUserId(): Promise<string | null> {
  return (
    await AsyncStorage.getItem("cached_supabase_user_id") ||
    await AsyncStorage.getItem("offline_fallback_user_id")
  );
}

export default function HistoryPage({ navigation }: any) {
  const [moods, setMoods] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [quranProgress, setQuranProgress] = useState("0");
  const [currentPage, setCurrentPage] = useState(0);
  const [activeTab, setActiveTab] = useState<"mood" | "religion">("mood");
  const [showOldMood, setShowOldMood] = useState(false);
  const [showOldReligion, setShowOldReligion] = useState(false);
  const LIMIT = 5;

  const filterLast30Days = (data: any[]) => {
    const now = new Date();
    return data.filter(item => {
      const dateStr = item.task_date || item.created_at;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) <= 30;
    });
  };

  const filterCurrentMonth = (data: any[]) => {
    const now = new Date();
    return data.filter(item => {
      if (!item.created_at) return false;
      const d = new Date(item.created_at);
      if (isNaN(d.getTime())) return false;
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  };

  const serverLoader = useCallback(async () => {
    autoPurgeOldData();
    const [moodData, religionData, quran] = await Promise.all([
      moodService.getMoodHistory(100),
      religionService.getReligionHistory(),
      religionService.getQuranProgress(),
    ]);
    return { moodData, religionData, quran };
  }, []);

  const onData = useCallback((data: any) => {
    if (!data) return;
    const { moodData, religionData, quran } = data;
    setMoods(filterLast30Days(moodData || []));
    setTasks(filterLast30Days(religionData || []));
    const pages = quran?.pages_read?.toString() || quran?.progress || "0";
    setQuranProgress(pages);
    const cp = quran?.current_page ?? parseInt(pages, 10);
    setCurrentPage(cp);
  }, []);

  const cacheLoader = useCallback(async () => {
    try {
      const cachedUserId = await getCachedUserId();

      const [moodRaw, quranRaw] = await Promise.all([
        cachedUserId ? AsyncStorage.getItem(`moods_${cachedUserId}`) : Promise.resolve(null),
        AsyncStorage.getItem("religion_quran_local"),
      ]);

      const moodData = moodRaw ? JSON.parse(moodRaw) : [];

      // ✅ Toujours lire depuis les keys datés (religion_tasks_local_YYYY-MM-DD)
      // Ces keys contiennent TOUTES les tâches (completed + false) sauvées par Religionspage
      const allKeys = await AsyncStorage.getAllKeys();
      const dayKeys = allKeys
        .filter((k: string) => k.startsWith("religion_tasks_local_"))
        .sort((a, b) => b.localeCompare(a)); // tri décroissant par date

      const religionData: any[] = [];
      for (const key of dayKeys) {
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const dateStr = key.replace("religion_tasks_local_", "");
          const dayTasks: any[] = JSON.parse(raw);
          dayTasks.forEach(t => religionData.push({ ...t, task_date: t.task_date || dateStr }));
        }
      }

      const quranLocal = quranRaw ? JSON.parse(quranRaw) : null;
      const quranPages = quranLocal?.pages || quranLocal?.progress || quranLocal?.pages_read || 0;
      const quranCurrentPage = quranLocal?.current_page ?? quranPages;
      const quran = quranPages > 0 ? { progress: quranPages.toString(), current_page: quranCurrentPage } : null;

      if (moodData.length === 0 && religionData.length === 0 && !quran) return null;
      return { moodData, religionData, quran };
    } catch { return null; }
  }, []);

  const { refreshing, refresh } = useOfflineFirst({
    cacheLoader,
    serverLoader,
    onData,
    fallback: { moodData: [], religionData: [], quran: null },
  });

  // ─── DELETE ONE MOOD ──────────────────────────────────────────
  const deleteMood = useCallback((item: any) => {
    Alert.alert(
      "Supprimer",
      `Supprimer cette humeur "${item.mood}" ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            setMoods(prev => prev.filter(m => m.id !== item.id));
            try {
              const userId = await getCachedUserId();
              if (userId) {
                const raw = await AsyncStorage.getItem(`moods_${userId}`);
                if (raw) {
                  const list = JSON.parse(raw);
                  await AsyncStorage.setItem(`moods_${userId}`, JSON.stringify(list.filter((m: any) => m.id !== item.id)));
                }
              }
              if (!String(item.id).startsWith("loc-")) {
                await supabase.from("moods").delete().eq("id", item.id);
              }
            } catch {}
          },
        },
      ]
    );
  }, []);

  // ─── CLEAR ALL MOODS ─────────────────────────────────────────
  const clearAllMoods = useCallback(() => {
    if (moods.length === 0) return;
    Alert.alert(
      "🗑 Vider l'historique",
      "Supprimer toutes les humeurs ? Action irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Tout supprimer",
          style: "destructive",
          onPress: async () => {
            setMoods([]);
            try {
              const userId = await getCachedUserId();
              if (userId) await AsyncStorage.setItem(`moods_${userId}`, JSON.stringify([]));
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user) {
                await supabase.from("moods").delete().eq("user_id", session.user.id);
              }
            } catch {}
          },
        },
      ]
    );
  }, [moods]);

  // ─── DELETE ONE RELIGION DAY ──────────────────────────────────
  const deleteReligionDay = useCallback((dateLabel: string, dayTasks: any[]) => {
    Alert.alert(
      "Supprimer",
      `Supprimer l'historique du ${dateLabel} ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            const idsToRemove = new Set(dayTasks.map((t: any) => t.id));
            setTasks(prev => prev.filter(t => !idsToRemove.has(t.id)));
            try {
              // Supprimer du cache local par jour
              const taskDate = dayTasks[0]?.task_date;
              if (taskDate) {
                await AsyncStorage.removeItem(`religion_tasks_local_${taskDate}`);
              }
              const userId = await getCachedUserId();
              if (userId) {
                const raw = await AsyncStorage.getItem(`religion_history_${userId}`);
                if (raw) {
                  const list = JSON.parse(raw);
                  await AsyncStorage.setItem(`religion_history_${userId}`, JSON.stringify(list.filter((t: any) => !idsToRemove.has(t.id))));
                }
              }
              // Supprimer de Supabase
              const realIds = dayTasks.filter((t: any) => !String(t.id).startsWith("loc-")).map((t: any) => t.id);
              if (realIds.length > 0) {
                await supabase.from("religion_tasks").delete().in("id", realIds);
              }
            } catch {}
          },
        },
      ]
    );
  }, []);

  // ─── CLEAR ALL RELIGION ───────────────────────────────────────
  const clearAllReligion = useCallback(() => {
    if (tasks.length === 0) return;
    Alert.alert(
      "🗑 Vider l'historique",
      "Supprimer tout l'historique religieux ? Action irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Tout supprimer",
          style: "destructive",
          onPress: async () => {
            setTasks([]);
            try {
              const allKeys = await AsyncStorage.getAllKeys();
              const dayKeys = allKeys.filter((k: string) => k.startsWith("religion_tasks_local_"));
              await AsyncStorage.multiRemove(dayKeys);
              const userId = await getCachedUserId();
              if (userId) await AsyncStorage.setItem(`religion_history_${userId}`, JSON.stringify([]));
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user) {
                await supabase.from("religion_tasks").delete().eq("user_id", session.user.id);
              }
            } catch {}
          },
        },
      ]
    );
  }, [tasks]);

  // ─── GROUPING ────────────────────────────────────────────────
  // Titres exacts = makeDefaultTasks() dans Religionspage.tsx
  const ALL_TASKS = [
    { title: "Fajr",                              type: "prayer" },
    { title: "Dhuhr",                             type: "prayer" },
    { title: "Asr",                               type: "prayer" },
    { title: "Maghrib",                           type: "prayer" },
    { title: "Isha",                              type: "prayer" },
    { title: "Lecture du Coran (au moins 1 page)", type: "quran"  },
    { title: "Dhikr du matin",                    type: "dhikr"  },
    { title: "Dhikr du soir",                     type: "dhikr"  },
    { title: "Douaa",                             type: "dua"    },
  ];

  const groupByDate = () => {
    const groups: Record<string, { label: string; taskDate: string; tasks: any[] }> = {};

    tasks.forEach(t => {
      const dateStr = t.task_date || t.created_at;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const label = d.toLocaleDateString("fr-FR");
      const taskDate = t.task_date || dateStr.split("T")[0];
      if (!groups[label]) groups[label] = { label, taskDate, tasks: [] };
      groups[label].tasks.push(t);
    });

    return Object.values(groups).map(group => {
      // Titres déjà présents (normalisés)
      const existingTitlesNorm = new Set(
        group.tasks.map((t: any) => t.title?.trim().toLowerCase())
      );

      // Ajouter les tâches manquantes avec completed: false
      const missingTasks = ALL_TASKS
        .filter(dt => !existingTitlesNorm.has(dt.title.trim().toLowerCase()))
        .map(dt => ({
          id: `missing-${group.taskDate}-${dt.title}`,
          title: dt.title,
          type: dt.type,
          completed: false,
          task_date: group.taskDate,
        }));

      // Ordre fixe: prayer → quran → dhikr → dua
      const typeOrder = ["prayer", "quran", "dhikr", "dua"];
      const allTasks = [...group.tasks, ...missingTasks].sort((a, b) => {
        const ai = typeOrder.indexOf(a.type || "");
        const bi = typeOrder.indexOf(b.type || "");
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return a.title.localeCompare(b.title);
      });

      return { date: group.label, tasks: allTasks };
    });
  };

  const grouped = groupByDate();
  const moodRecent = moods.slice(0, LIMIT);
  const moodOld = moods.slice(LIMIT);
  const religionRecent = grouped.slice(0, LIMIT);
  const religionOld = grouped.slice(LIMIT);

  const getMoodStats = () => {
    const monthData = filterCurrentMonth(moods);
    let happy = 0, sad = 0, neutral = 0;
    monthData.forEach(m => {
      const mood = m.mood?.toLowerCase();
      if (mood === "heureux") happy++;
      else if (mood === "triste") sad++;
      else neutral++;
    });
    const total = monthData.length || 1;
    return {
      happy: Math.round((happy / total) * 100),
      sad: Math.round((sad / total) * 100),
      neutral: Math.round((neutral / total) * 100),
    };
  };

  const moodStats = getMoodStats();
  const current = parseInt(quranProgress || "0", 10);
  const remaining = 604 - current;
  const khatma = Math.floor(current / 604);
  const percentage = Math.round((current / 604) * 100);

  // ─── RENDER MOOD ─────────────────────────────────────────────
  const renderMood = ({ item }: any) => {
    const colors: Record<string, string> = { heureux: "#F0FDF4", triste: "#FEF2F2", neutre: "#F3F4F6" };
    const emojis: Record<string, string> = { heureux: "😊", triste: "😢", neutre: "😐" };
    const key = item.mood?.toLowerCase() || "neutre";
    return (
      <View style={[styles.card, { backgroundColor: colors[key] || "#F3F4F6" }]}>
        <View style={styles.moodRowContainer}>
          <View style={styles.moodLeft}>
            <View style={styles.moodRow}>
              <Text style={styles.moodEmoji}>{emojis[key] || "😐"}</Text>
              <Text style={styles.moodText}>{item.mood}</Text>
            </View>
            <Text style={styles.date}>
              {item.created_at ? new Date(item.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—"}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => deleteMood(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.deleteBtnText}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── RENDER RELIGION DAY ─────────────────────────────────────
  const renderReligion = ({ item }: any) => {
    const itemTasks = item.tasks || [];
    const completed = itemTasks.filter((t: any) => t.completed);
    const notDone = itemTasks.filter((t: any) => !t.completed);
    const rate = Math.round((completed.length / Math.max(itemTasks.length, 1)) * 100);
    return (
      <View style={styles.religionCard}>
        <View style={styles.religionHeader}>
          <Text style={styles.dateLabel}>📅 {item.date}</Text>
          <View style={styles.religionHeaderRight}>
            <View style={[styles.badge, rate === 100 && styles.badgePerfect]}>
              <Text style={[styles.badgeText, rate === 100 && { color: "#059669" }]}>
                {rate === 100 ? "🌟 Parfait" : `${rate}%`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => deleteReligionDay(item.date, item.tasks)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.deleteBtnText}>🗑</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.miniBarBg}>
          <View style={[styles.miniBarFill, { width: `${rate}%` as any, backgroundColor: rate === 100 ? "#10B981" : "#7C3AED" }]} />
        </View>

        {/* Toutes les tâches avec leur statut */}
        <View style={styles.taskSection}>
          {itemTasks.map((t: any) => (
            <View key={t.id} style={styles.taskRow}>
              <Text style={t.completed ? styles.taskDoneIcon : styles.taskMissIcon}>
                {t.completed ? "✅" : "❌"}
              </Text>
              <Text style={[styles.taskTitle, !t.completed && styles.taskMissedTitle]}>
                {t.title}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.taskSummary}>
          {completed.length}/{itemTasks.length} complétées
        </Text>
      </View>
    );
  };

  const currentData = activeTab === "mood"
    ? (showOldMood ? moodOld : moodRecent)
    : (showOldReligion ? religionOld : religionRecent);

  const canClearAll = activeTab === "mood" ? moods.length > 0 : tasks.length > 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Historique</Text>
        {canClearAll && (
          <TouchableOpacity
            style={styles.clearAllBtn}
            onPress={activeTab === "mood" ? clearAllMoods : clearAllReligion}
          >
            <Text style={styles.clearAllText}>🧹</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "mood" && styles.activeTab]}
          onPress={() => { setActiveTab("mood"); setShowOldMood(false); }}
        >
          <Text style={[styles.tabText, activeTab === "mood" && styles.activeTabText]}>😊 Humeurs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "religion" && styles.activeTab]}
          onPress={() => { setActiveTab("religion"); setShowOldReligion(false); }}
        >
          <Text style={[styles.tabText, activeTab === "religion" && styles.activeTabText]}>🤲 Religion</Text>
        </TouchableOpacity>
      </View>

      {activeTab === "mood" && (
        <View style={styles.dashboard}>
          <Text style={styles.dashboardTitle}>📊 Ce mois-ci</Text>
          <View style={styles.statsRow}>
            {[
              { emoji: "😢", color: "#EF4444", bg: "#FEF2F2", val: moodStats.sad, label: "Triste" },
              { emoji: "😊", color: "#22C55E", bg: "#F0FDF4", val: moodStats.happy, label: "Heureux" },
              { emoji: "😐", color: "#6B7280", bg: "#F3F4F6", val: moodStats.neutral, label: "Neutre" },
            ].map(s => (
              <View key={s.label} style={[styles.statBox, { backgroundColor: s.bg }]}>
                <Text style={[styles.statEmoji, { color: s.color }]}>{s.emoji}</Text>
                <Text style={[styles.statValue, { color: s.color }]}>{s.val}%</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {activeTab === "religion" && (
        <View style={styles.quranDashboard}>
          <Text style={[styles.dashboardTitle, { color: "white" }]}>📖 Progression Coran</Text>
          <View style={styles.quranStats}>
            {[
              { val: current, label: "Pages lues" },
              { val: remaining, label: "Restantes" },
              { val: khatma, label: "Khatmat" },
            ].map((s, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={styles.quranDivider} />}
                <View style={styles.quranStat}>
                  <Text style={styles.quranValue}>{s.val}</Text>
                  <Text style={styles.quranLabel}>{s.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
          <View style={styles.quranProgressBg}>
            <View style={[styles.quranProgressFill, { width: `${percentage}%` as any }]} />
          </View>
          <Text style={styles.quranPercent}>{percentage}% complété</Text>
          {current === 604 ? (
            <View style={styles.quranMotivBox}>
              <Text style={[styles.quranMotivText, { writingDirection: "rtl" }]}>🎉 مبروك! لقد ختمت القرآن الكريم! 🌟</Text>
            </View>
          ) : currentPage > 0 ? (
            <View style={styles.quranMotivBox}>
              <Text style={[styles.quranMotivText, { writingDirection: "rtl" }]}>{`📖 وصلت إلى صفحة ${currentPage} — باقي ${604 - currentPage} صفحة 💪`}</Text>
            </View>
          ) : null}
        </View>
      )}

      <FlatList
        data={currentData}
        keyExtractor={(item, index) =>
          activeTab === "mood" ? `mood-${item.id || index}` : `religion-${item.date}-${index}`
        }
        renderItem={activeTab === "mood" ? renderMood : renderReligion}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#7C3AED" />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📝</Text>
            <Text style={styles.emptyTitle}>Aucun historique</Text>
            <Text style={styles.emptySub}>
              {activeTab === "mood"
                ? "Enregistrez votre humeur depuis l'accueil"
                : "Complétez vos tâches religieuses pour voir l'historique"}
            </Text>
          </View>
        }
      />

      {((activeTab === "mood" && moodOld.length > 0) || (activeTab === "religion" && religionOld.length > 0)) && (
        <TouchableOpacity
          style={styles.rectBtn}
          onPress={() => activeTab === "mood" ? setShowOldMood(!showOldMood) : setShowOldReligion(!showOldReligion)}
        >
          <Text style={styles.rectBtnText}>
            {activeTab === "mood"
              ? showOldMood ? "Voir récents ↓" : `Voir anciens (${moodOld.length}) ↑`
              : showOldReligion ? "Voir récents ↓" : `Voir anciens (${religionOld.length}) ↑`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3E8FF" },

  header: {
    paddingTop: STATUS_BAR_HEIGHT + 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "#7C3AED",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    alignItems: "center",
    elevation: 6,
    flexDirection: "row",
    justifyContent: "center",
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
  title: { color: "white", fontSize: 24, fontWeight: "bold" },
  clearAllBtn: {
    position: "absolute",
    right: 20,
    bottom: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 50,
    width: 42,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
  },
  clearAllText: { fontSize: 20 },

  tabs: { flexDirection: "row", margin: 20, backgroundColor: "#EDE9FE", borderRadius: 15, padding: 4 },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 12 },
  activeTab: { backgroundColor: "#7C3AED" },
  tabText: { fontWeight: "bold", color: "#6B7280", fontSize: 13 },
  activeTabText: { color: "white" },

  dashboard: { backgroundColor: "white", marginHorizontal: 20, padding: 18, borderRadius: 20, marginBottom: 14, elevation: 2 },
  quranDashboard: { backgroundColor: "#7C3AED", marginHorizontal: 20, padding: 18, borderRadius: 20, marginBottom: 14, elevation: 4 },
  dashboardTitle: { fontWeight: "bold", fontSize: 15, color: "#4C1D95", marginBottom: 14 },
  statsRow: { flexDirection: "row", gap: 10 },
  statBox: { flex: 1, padding: 14, borderRadius: 14, alignItems: "center" },
  statEmoji: { fontSize: 22, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: "bold" },
  statLabel: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  quranStats: { flexDirection: "row", justifyContent: "space-around", marginBottom: 12 },
  quranStat: { alignItems: "center" },
  quranValue: { fontSize: 26, fontWeight: "bold", color: "white" },
  quranLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  quranDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  quranProgressBg: { height: 7, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 4, overflow: "hidden" },
  quranProgressFill: { height: 7, backgroundColor: "white", borderRadius: 4 },
  quranPercent: { textAlign: "center", color: "white", fontSize: 12, marginTop: 6, fontWeight: "600" },
  quranMotivBox: { marginTop: 10, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  quranMotivText: { color: "white", fontSize: 13, fontWeight: "700", textAlign: "center" },

  list: { padding: 20, paddingBottom: 100 },

  // Mood card
  card: { padding: 16, borderRadius: 16, marginBottom: 10, elevation: 2 },
  moodRowContainer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  moodLeft: { flex: 1 },
  moodRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  moodEmoji: { fontSize: 22, marginRight: 10 },
  moodText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  date: { color: "#9CA3AF", fontSize: 12 },

  // Delete button
  deleteBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.1)",
    marginLeft: 8,
  },
  deleteBtnText: { fontSize: 16 },

  // Religion card
  religionCard: { backgroundColor: "white", padding: 16, borderRadius: 16, marginBottom: 10, elevation: 2 },
  religionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  religionHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateLabel: { fontWeight: "bold", fontSize: 13, color: "#4C1D95" },
  badge: { backgroundColor: "#EDE9FE", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  badgePerfect: { backgroundColor: "#D1FAE5" },
  badgeText: { color: "#7C3AED", fontWeight: "bold", fontSize: 12 },
  miniBarBg: { height: 5, backgroundColor: "#F3F4F6", borderRadius: 4, overflow: "hidden", marginBottom: 10 },
  miniBarFill: { height: 5, borderRadius: 4 },
  taskSection: { marginTop: 8 },
  taskRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  taskDoneIcon: { fontSize: 14, marginRight: 8 },
  taskMissIcon: { fontSize: 14, marginRight: 8 },
  taskTitle: { fontSize: 13, color: "#374151", fontWeight: "500", flex: 1 },
  taskMissedTitle: { color: "#EF4444" },
  taskSummary: { marginTop: 10, fontSize: 12, color: "#9CA3AF", textAlign: "right", fontStyle: "italic" },
  sectionLabelGreen: { color: "#22C55E", fontWeight: "bold", fontSize: 12, marginBottom: 4 },
  sectionLabelRed: { color: "#EF4444", fontWeight: "bold", fontSize: 12, marginBottom: 4 },
  doneTask: { color: "#6B7280", fontSize: 12, textDecorationLine: "line-through", marginLeft: 8, marginVertical: 1 },
  missedTask: { color: "#EF4444", fontSize: 12, marginLeft: 8, marginVertical: 1 },
  moreText: { color: "#9CA3AF", fontSize: 11, fontStyle: "italic", marginLeft: 8, marginTop: 2 },

  emptyContainer: { alignItems: "center", paddingVertical: 50 },
  emptyEmoji: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: "bold", color: "#4C1D95", marginBottom: 6 },
  emptySub: { color: "#9CA3AF", fontSize: 13, textAlign: "center" },
  rectBtn: { position: "absolute", bottom: 26, alignSelf: "center", backgroundColor: "#7C3AED", paddingVertical: 12, paddingHorizontal: 40, borderRadius: 20, elevation: 4 },
  rectBtnText: { color: "white", fontWeight: "bold", fontSize: 13 },
});
