import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
  LayoutAnimation,
  Alert,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { groceryService } from "./supabaseService";

const GROCERY_DRAFT_KEY = "grocery_input_draft";

const STATUS_BAR_HEIGHT =
  Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 44;

function Toast({ message }: { message: string }) {
  return (
    <View style={toastStyle.box}>
      <Text style={toastStyle.text}>{message}</Text>
    </View>
  );
}
const toastStyle = StyleSheet.create({
  box: {
    position: "absolute",
    top: STATUS_BAR_HEIGHT + 10,
    left: 20,
    right: 20,
    backgroundColor: "#EF4444",
    padding: 14,
    borderRadius: 14,
    zIndex: 9999,
    elevation: 20,
  },
  text: { color: "white", textAlign: "center", fontWeight: "bold", fontSize: 14 },
});

export default function GroceryPage({ navigation }: any) {
  const [task, setTask] = useState("");
  const [list, setList] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // ✅ Chargi el draft sauvegardé au démarrage
  useEffect(() => {
    AsyncStorage.getItem(GROCERY_DRAFT_KEY)
      .then((saved) => { if (saved) setTask(saved); })
      .catch(() => {});
  }, []);

  // ✅ CACHE-FIRST: chargi el cache instantanément au démarrage
  useEffect(() => {
    groceryService.getItems().then((data) => {
      if (data && data.length > 0) setList(data);
    }).catch(() => {});
  }, []);

  const handleTaskChange = (text: string) => {
    setTask(text);
    if (text.trim()) {
      AsyncStorage.setItem(GROCERY_DRAFT_KEY, text).catch(() => {});
    } else {
      AsyncStorage.removeItem(GROCERY_DRAFT_KEY).catch(() => {});
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await groceryService.getItems();
      if (data) setList(data);
    } catch {}
    setRefreshing(false);
  }, []);

  const addTask = async () => {
    const trimmed = task.trim();
    if (!trimmed) return;
    LayoutAnimation.easeInEaseOut();
    const tempId = `temp-${Date.now()}`;
    const tempItem = { id: tempId, item: trimmed, done: false };
    setList((prev) => [tempItem, ...prev]);
    setTask("");
    AsyncStorage.removeItem(GROCERY_DRAFT_KEY).catch(() => {});
    inputRef.current?.blur();
    try {
      const newItem = await groceryService.addItem(tempItem.item);
      setList((prev) => prev.map((i) => (i.id === tempId ? newItem : i)));
    } catch {
      setList((prev) => prev.filter((i) => i.id !== tempId));
      showToast("❌ Impossible d'ajouter. Vérifiez votre connexion.");
    }
  };

  const toggleDone = async (item: any) => {
    LayoutAnimation.easeInEaseOut();
    const newStatus = !item.done;
    setList((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, done: newStatus } : i))
    );
    try {
      await groceryService.toggleItem(item.id, newStatus);
    } catch {
      setList((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, done: !newStatus } : i))
      );
    }
  };

  const deleteItem = async (id: string) => {
    LayoutAnimation.easeInEaseOut();
    const backup = [...list];
    setList((prev) => prev.filter((i) => i.id !== id));
    try {
      await groceryService.deleteItem(id);
    } catch {
      setList(backup);
    }
  };

  const clearCompleted = () => {
    const completed = list.filter((i) => i.done);
    if (completed.length === 0) return;
    Alert.alert(
      "Nettoyer",
      `Supprimer ${completed.length} article(s) fait(s) ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            LayoutAnimation.easeInEaseOut();
            // ✅ FIX: supprimer item par item — un échec ne rollback plus tout le batch
            setList((prev) => prev.filter((i) => !i.done));
            for (const i of completed) {
              try { await groceryService.deleteItem(i.id); } catch {}
            }
          },
        },
      ]
    );
  };

  const filteredList = list.filter((item) => {
    if (filter === "active") return !item.done;
    if (filter === "done") return item.done;
    return true;
  });

  const stats = {
    total: list.length,
    done: list.filter((i) => i.done).length,
    active: list.filter((i) => !i.done).length,
  };

  const renderItem = ({ item }: any) => (
    <View style={[styles.card, item.done && styles.cardDone]}>
      <TouchableOpacity
        style={[styles.checkbox, item.done && styles.checkboxDone]}
        onPress={() => toggleDone(item)}
        activeOpacity={0.7}
      >
        {item.done && <Text style={styles.checkIcon}>✓</Text>}
      </TouchableOpacity>
      <Text
        style={[styles.itemText, item.done && styles.itemTextDone]}
        numberOfLines={2}
      >
        {item.item}
      </Text>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item.id)}>
        <Text style={styles.delete}>🗑</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />
      {toast && <Toast message={toast} />}

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🛒 Courses</Text>
        <TouchableOpacity style={styles.clearBtn} onPress={clearCompleted}>
          <Text style={styles.clearText}>🧹</Text>
        </TouchableOpacity>
      </View>

      {/* INPUT + STATS — hors FlatList pour éviter les bugs keyboard */}
      <View style={styles.topSection}>
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            placeholder="Ajouter un article..."
            value={task}
            onChangeText={handleTaskChange}
            style={styles.input}
            placeholderTextColor="#9CA3AF"
            onSubmitEditing={addTask}
            returnKeyType="done"
            blurOnSubmit={false}
          />
          <TouchableOpacity style={styles.addBtn} onPress={addTask}>
            <Text style={styles.addText}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          {(["all", "active", "done"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.statBadge, filter === f && styles.statActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.statNum, filter === f && styles.statNumActive]}>
                {f === "all" ? stats.total : f === "active" ? stats.active : stats.done}
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  filter === f && { color: "rgba(255,255,255,0.8)" },
                ]}
              >
                {f === "all" ? "Tout" : f === "active" ? "À faire" : "Fait"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* LIST */}
      <FlatList
        data={filteredList}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#7C3AED"
          />
        }
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>
              {filter === "done" ? "🎉" : "🛒"}
            </Text>
            <Text style={styles.emptyText}>
              {filter === "done"
                ? "Aucun article terminé"
                : filter === "active"
                ? "Tout est fait !"
                : "Liste vide"}
            </Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3FF" },

  header: {
    paddingTop: STATUS_BAR_HEIGHT + 12,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: "#7C3AED",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    elevation: 6,
  },
  backBtn: {
    position: "absolute",
    left: 20,
    bottom: 14,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 50,
    width: 42,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
  },
  back: { fontSize: 20, color: "white", fontWeight: "bold", marginLeft: -1 },
  clearBtn: {
    position: "absolute",
    right: 20,
    bottom: 14,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 50,
    width: 42,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
  },
  clearText: { fontSize: 20 },
  title: { fontSize: 20, fontWeight: "700", color: "white", marginBottom: 14 },

  topSection: {
    backgroundColor: "#F5F3FF",
    paddingTop: 16,
    paddingBottom: 4,
  },

  inputRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 14,
  },
  input: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    elevation: 2,
    color: "#1F2937",
  },
  addBtn: {
    marginLeft: 10,
    backgroundColor: "#7C3AED",
    borderRadius: 14,
    paddingHorizontal: 18,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  addText: { color: "white", fontSize: 24, fontWeight: "bold" },

  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  statBadge: {
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: "center",
    minWidth: 70,
    elevation: 2,
  },
  statActive: { backgroundColor: "#7C3AED" },
  statNum: { fontSize: 18, fontWeight: "bold", color: "#7C3AED" },
  statNumActive: { color: "white" },
  statLabel: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },

  listContent: { paddingBottom: 100, paddingHorizontal: 20, paddingTop: 4 },

  card: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    elevation: 2,
  },
  cardDone: { opacity: 0.65, backgroundColor: "#F9FAFB" },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#7C3AED",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  checkboxDone: { backgroundColor: "#7C3AED" },
  checkIcon: { color: "white", fontWeight: "bold", fontSize: 15 },
  itemText: { flex: 1, fontSize: 15, fontWeight: "500", color: "#1F2937" },
  itemTextDone: { textDecorationLine: "line-through", color: "#9CA3AF" },
  deleteBtn: { padding: 8, marginLeft: 6 },
  delete: { fontSize: 18 },

  emptyContainer: { alignItems: "center", paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 14 },
  emptyText: { color: "#9CA3AF", fontSize: 16, fontWeight: "500" },
});
