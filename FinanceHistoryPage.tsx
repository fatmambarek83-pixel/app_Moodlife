import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  StatusBar,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { financeService } from "./supabaseService";
import { useOnlineRefresh } from "./useOnlineRefresh";
import { supabase } from "./supabaseClient";
import type { Expense } from "./types/finance";

const STATUS_BAR_HEIGHT =
  Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 44;

export default function FinanceHistoryPage({ navigation }: any) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalBudget, setTotalBudget] = useState(0);
  const [mode, setMode] = useState<"week" | "month">("week");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [budgetData, expensesData] = await Promise.all([
        financeService.getBudget(),
        financeService.getExpenses(),
      ]);
      setTotalBudget(budgetData?.total_budget || 0);
      setExpenses(expensesData);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  useOnlineRefresh(load);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ─── DELETE ONE EXPENSE ───────────────────────────────────────
  const deleteExpense = useCallback((expense: Expense) => {
    Alert.alert(
      "Supprimer la dépense",
      `Supprimer "${expense.category}" — ${expense.amount} DT ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            // Mise à jour optimiste
            setExpenses(prev => prev.filter(e => e.id !== expense.id));
            try {
              // Suppression locale (cache)
              const userId = await AsyncStorage.getItem("cached_supabase_user_id")
                || await AsyncStorage.getItem("offline_fallback_user_id");
              if (userId) {
                const cacheKey = `expenses_${userId}`;
                const raw = await AsyncStorage.getItem(cacheKey);
                if (raw) {
                  const list = JSON.parse(raw);
                  await AsyncStorage.setItem(cacheKey, JSON.stringify(list.filter((e: any) => e.id !== expense.id)));
                }
              }
              // Suppression Supabase
              if (!String(expense.id).startsWith("loc-")) {
                await supabase.from("expenses").delete().eq("id", expense.id);
              }
            } catch {}
          },
        },
      ]
    );
  }, []);

  // ─── CLEAR ALL EXPENSES ───────────────────────────────────────
  const clearAll = useCallback(() => {
    if (expenses.length === 0) return;
    Alert.alert(
      "🗑 Vider l'historique",
      "Supprimer toutes les dépenses ? Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Tout supprimer",
          style: "destructive",
          onPress: async () => {
            setExpenses([]);
            try {
              const userId = await AsyncStorage.getItem("cached_supabase_user_id")
                || await AsyncStorage.getItem("offline_fallback_user_id");
              if (userId) {
                await AsyncStorage.setItem(`expenses_${userId}`, JSON.stringify([]));
              }
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user) {
                await supabase.from("expenses").delete().eq("user_id", session.user.id);
              }
            } catch {}
          },
        },
      ]
    );
  }, [expenses]);

  // ─── GROUPING ────────────────────────────────────────────────
  const getWeekKey = useCallback((date: Date) => {
    const d = new Date(date);
    const day = d.getDay() === 0 ? 7 : d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day + 1);
    return start.toISOString().split("T")[0];
  }, []);

  const getWeekLabel = useCallback((date: Date) => {
    const d = new Date(date);
    const day = d.getDay() === 0 ? 7 : d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const months = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];
    return `${start.getDate()}-${end.getDate()} ${months[start.getMonth()]}`;
  }, []);

  const groupData = useCallback(() => {
    if (!expenses.length) return [];
    if (mode === "month") {
      const months: Record<string, Expense[]> = {};
      expenses.forEach((expense) => {
        const date = new Date(expense.expense_date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        if (!months[key]) months[key] = [];
        months[key].push(expense);
      });
      return Object.keys(months).map((k) => ({
        title: `📅 ${k}`,
        items: months[k],
        total: months[k].reduce((s, i) => s + i.amount, 0),
      }));
    }
    const groups: Record<string, Expense[]> = {};
    expenses.forEach((expense) => {
      const date = new Date(expense.expense_date);
      if (isNaN(date.getTime())) return;
      const key = getWeekKey(date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(expense);
    });
    return Object.keys(groups).map((k) => {
      const first = groups[k][0];
      return {
        title: `📆 ${getWeekLabel(new Date(first.expense_date))}`,
        items: groups[k],
        total: groups[k].reduce((s, i) => s + i.amount, 0),
      };
    });
  }, [expenses, mode, getWeekKey, getWeekLabel]);

  const grouped = groupData();
  const totalSpent = expenses.reduce((s, i) => s + i.amount, 0);
  const remaining = totalBudget - totalSpent;

  const renderItem = ({ item }: any) => (
    <View style={styles.card}>
      <Text style={styles.groupTitle}>{item.title}</Text>
      <Text style={styles.groupTotal}>Total: {item.total.toFixed(2)} DT</Text>
      {item.items.map((i: Expense) => (
        <View key={i.id} style={styles.row}>
          <View style={styles.expenseInfo}>
            <Text style={styles.category}>{i.category}</Text>
            {i.description ? <Text style={styles.description}>{i.description}</Text> : null}
            <Text style={styles.expenseDate}>{i.expense_date}</Text>
          </View>
          <Text style={styles.amount}>{i.amount} DT</Text>
          <TouchableOpacity
            style={styles.deleteItemBtn}
            onPress={() => deleteExpense(i)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.deleteItemText}>🗑</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Historique Finances</Text>
        {expenses.length > 0 && (
          <TouchableOpacity style={styles.clearAllBtn} onPress={clearAll}>
            <Text style={styles.clearAllText}>🧹</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>💰 Budget total</Text>
          <Text style={styles.summaryValue}>{totalBudget} DT</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>💸 Dépensé</Text>
          <Text style={[styles.summaryValue, styles.red]}>{totalSpent.toFixed(2)} DT</Text>
        </View>
        <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.summaryLabel}>🏦 Restant</Text>
          <Text style={[styles.summaryValue, remaining >= 0 ? styles.green : styles.red]}>
            {remaining.toFixed(2)} DT
          </Text>
        </View>
      </View>

      {/* TOGGLE */}
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.btn, mode === "week" && styles.active]}
          onPress={() => setMode("week")}
        >
          <Text style={[styles.txt, mode === "week" && styles.activeTxt]}>📅 Semaine</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, mode === "month" && styles.active]}
          onPress={() => setMode("month")}
        >
          <Text style={[styles.txt, mode === "month" && styles.activeTxt]}>🗓 Mois</Text>
        </TouchableOpacity>
      </View>

      {grouped.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📝</Text>
          <Text style={styles.emptyText}>Aucune dépense enregistrée</Text>
          <Text style={styles.emptySubtext}>
            Ajoutez votre première dépense depuis la page Finance
          </Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate("AddExpense")}
          >
            <Text style={styles.addBtnText}>+ Ajouter une dépense</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={grouped}
          extraData={mode}
          keyExtractor={(_, index) => index.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7C3AED"
            />
          }
        />
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
  title: { color: "white", fontSize: 22, fontWeight: "bold" },
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

  summaryCard: {
    backgroundColor: "white",
    margin: 20,
    padding: 20,
    borderRadius: 20,
    elevation: 4,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  summaryLabel: { fontSize: 14, color: "#6B7280", fontWeight: "500" },
  summaryValue: { fontSize: 15, fontWeight: "bold", color: "#1F2937" },

  toggle: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: "#EDE9FE",
    borderRadius: 15,
    padding: 4,
  },
  btn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 12 },
  active: { backgroundColor: "#7C3AED" },
  txt: { fontWeight: "bold", color: "#4C1D95", fontSize: 13 },
  activeTxt: { color: "white" },

  list: { paddingBottom: 40, paddingHorizontal: 20 },
  card: { backgroundColor: "white", padding: 18, borderRadius: 18, marginBottom: 12, elevation: 3 },
  groupTitle: { fontWeight: "bold", fontSize: 15, marginBottom: 4, color: "#1F2937" },
  groupTotal: { fontSize: 13, color: "#7C3AED", fontWeight: "600", marginBottom: 12 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3E8FF",
  },
  expenseInfo: { flex: 1 },
  category: { fontWeight: "500", fontSize: 14, color: "#374151" },
  description: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  expenseDate: { fontSize: 11, color: "#C4B5FD", marginTop: 2 },
  amount: { fontWeight: "bold", fontSize: 14, color: "#1F2937", marginRight: 10 },

  deleteItemBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
  },
  deleteItemText: { fontSize: 16 },

  green: { color: "#10B981" },
  red: { color: "#EF4444" },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: "bold", color: "#4B5563", marginBottom: 8 },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 20,
  },
  addBtn: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    elevation: 3,
  },
  addBtnText: { color: "white", fontWeight: "bold", fontSize: 14 },
});
