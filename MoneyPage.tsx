// MoneyPage.tsx — VERSION FINALE CORRIGÉE
// Fix: utilise financeService.getBudget() directement au lieu
// d'un cacheLoader custom qui dupliquait mal la logique getUserId()
import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  StatusBar, Alert, RefreshControl,
} from "react-native";
import { financeService } from "./supabaseService";
import type { BudgetItem } from "./types/finance";

const STATUS_BAR_HEIGHT = Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 44;

function Toast({ message, color = "#22C55E" }: { message: string; color?: string }) {
  return (
    <View style={[toastStyles.box, { backgroundColor: color }]}>
      <Text style={toastStyles.text}>{message}</Text>
    </View>
  );
}
const toastStyles = StyleSheet.create({
  box: { position: "absolute", top: STATUS_BAR_HEIGHT + 10, left: 20, right: 20, padding: 14, borderRadius: 14, zIndex: 9999, elevation: 20 },
  text: { color: "white", textAlign: "center", fontWeight: "bold", fontSize: 14 },
});

export default function MoneyPage({ navigation }: any) {
  const [budgetId, setBudgetId] = useState("local-budget");
  const [totalBudget, setTotalBudget] = useState("0");
  const [newCategory, setNewCategory] = useState("");
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [toast, setToast] = useState<{ msg: string; color?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const showToast = (msg: string, color?: string) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  };

  const onData = useCallback((data: any) => {
    if (!data) return;
    setBudgetId(data.id || "local-budget");
    setTotalBudget(data.total_budget?.toString() || "0");
    setBudgetItems(data.budget_items || []);
  }, []);

  // ✅ Utilise directement financeService (cache-first en interne)
  const load = useCallback(async () => {
    try { onData(await financeService.getBudget()); }
    catch { onData({ id: "local-budget", total_budget: 0, budget_items: [] }); }
  }, [onData]);

  useEffect(() => { load(); }, [load]);

  // ─── Bloquer le retour si modifications non sauvegardées ─────
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: any) => {
      if (!isDirty) return;
      e.preventDefault();
      Alert.alert(
        "⚠️ Modifications non sauvegardées",
        "Vous avez des modifications non enregistrées. Quitter quand même ?",
        [
          { text: "Annuler", style: "cancel" },
          { text: "Quitter", style: "destructive", onPress: () => { setIsDirty(false); navigation.dispatch(e.data.action); } },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, isDirty]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  const total = parseFloat(totalBudget) || 0;
  const totalAllocated = budgetItems.reduce((s, i) => s + (i.amount || 0), 0);
  const remaining = total - totalAllocated;

  const handleTotalBudgetChange = async (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    setTotalBudget(cleaned);
    setIsDirty(true);
    if (budgetId && cleaned) {
      try { await financeService.updateTotalBudget(budgetId, parseFloat(cleaned)); } catch {}
    }
  };

  const updateAmount = async (id: string, value: string) => {
    const amount = parseFloat(value.replace(/[^0-9]/g, "")) || 0;
    setBudgetItems(prev => prev.map(item => item.id === id ? { ...item, amount } : item));
    setIsDirty(true);
    try { await financeService.updateBudgetItem(id, amount); } catch {}
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      const newItem = await financeService.addBudgetItem(budgetId, newCategory.trim());
      setBudgetItems(prev => [...prev, newItem]);
      setNewCategory("");
      setIsDirty(false);
      showToast("✅ Catégorie ajoutée");
    } catch { showToast("❌ Erreur lors de l'ajout", "#EF4444"); }
  };

  const deleteCategory = (id: string, cat: string) => {
    Alert.alert("Supprimer la catégorie", `Supprimer "${cat}" ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        try {
          await financeService.deleteBudgetItem(id);
          setBudgetItems(prev => prev.filter(i => i.id !== id));
          showToast("🗑 Supprimé", "#6B7280");
        } catch { showToast("❌ Erreur", "#EF4444"); }
      }},
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />
      {toast && <Toast message={toast.msg} color={toast.color} />}

      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />}>

        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerEmoji}>💰</Text>
          <Text style={styles.title}>Finance</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.cards}>
            {[
              { label: "Budget", val: `${total} DT`, style: styles.green },
              { label: "Alloué", val: `${totalAllocated} DT`, style: styles.blue },
              { label: "Restant", val: `${remaining} DT`, style: remaining >= 0 ? styles.purple : styles.red },
            ].map(c => (
              <View key={c.label} style={[styles.cardTop, c.style]}>
                <Text style={styles.cardTitle}>{c.label}</Text>
                <Text style={styles.cardValue}>{c.val}</Text>
              </View>
            ))}
          </View>

          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${Math.min((totalAllocated / total) * 100 || 0, 100)}%` as any }]} />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Budget Total (DT)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={totalBudget} onChangeText={handleTotalBudgetChange} placeholder="0" />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Répartition</Text>
            {budgetItems.length === 0
              ? <Text style={styles.emptyText}>Aucune catégorie. Ajoutez-en une ci-dessous.</Text>
              : budgetItems.map(item => {
                const percent = total ? Math.round((item.amount / total) * 100) : 0;
                return (
                  <View key={item.id} style={styles.row}>
                    <Text style={styles.category}>{item.category} ({percent}%)</Text>
                    <TextInput
                      style={styles.smallInput}
                      value={item.amount?.toString() || "0"}
                      onChangeText={v => updateAmount(item.id, v)}
                      keyboardType="numeric"
                    />
                    <TouchableOpacity onPress={() => deleteCategory(item.id, item.category)}>
                      <Text style={styles.delete}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            }
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              value={newCategory} onChangeText={setNewCategory}
              placeholder="Nouvelle catégorie..." onSubmitEditing={addCategory} returnKeyType="done"
            />
            <TouchableOpacity style={styles.addBtn} onPress={addCategory}>
              <Text style={styles.addText}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Actions rapides</Text>
            <TouchableOpacity style={styles.actionBtnGreen} onPress={() => navigation.navigate("AddExpense")}>
              <Text style={styles.actionText}>+ Ajouter une dépense</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnBlue} onPress={() => navigation.navigate("FinanceHistory")}>
              <Text style={styles.actionText}>📊 Voir l'historique</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3E8FF" },
  content: { paddingBottom: 40 },
  header: { paddingTop: STATUS_BAR_HEIGHT + 12, paddingBottom: 22, paddingHorizontal: 20, backgroundColor: "#7C3AED", borderBottomLeftRadius: 30, borderBottomRightRadius: 30, alignItems: "center", elevation: 6 },
  backBtn: { position: "absolute", left: 20, bottom: 18, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 50, width: 42, height: 42, justifyContent: "center", alignItems: "center" },
  backArrow: { color: "white", fontSize: 20, fontWeight: "bold", marginLeft: -1 },
  headerEmoji: { fontSize: 38, marginBottom: 4 },
  title: { color: "white", fontSize: 26, fontWeight: "bold" },
  cards: { flexDirection: "row", marginHorizontal: 10, marginTop: 20, marginBottom: 16 },
  cardTop: { flex: 1, padding: 16, borderRadius: 20, marginHorizontal: 5, elevation: 4 },
  green: { backgroundColor: "#10B981" }, blue: { backgroundColor: "#3B82F6" },
  purple: { backgroundColor: "#7C3AED" }, red: { backgroundColor: "#EF4444" },
  cardTitle: { color: "white", fontSize: 12, marginBottom: 4 },
  cardValue: { color: "white", fontSize: 18, fontWeight: "bold" },
  progressContainer: { height: 10, backgroundColor: "#E5E7EB", borderRadius: 10, marginHorizontal: 20, marginBottom: 16 },
  progressBar: { height: "100%", backgroundColor: "#7C3AED", borderRadius: 10 },
  card: { backgroundColor: "white", marginHorizontal: 20, marginBottom: 16, padding: 20, borderRadius: 20, elevation: 4 },
  label: { fontWeight: "700", marginBottom: 12, fontSize: 15, color: "#1F2937" },
  input: { backgroundColor: "#F9FAFB", padding: 14, borderRadius: 14, fontSize: 15, color: "#1F2937" },
  emptyText: { textAlign: "center", color: "#9CA3AF", marginVertical: 16, fontStyle: "italic" },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: "#F8F7FF", padding: 10, borderRadius: 12, marginBottom: 8 },
  category: { flex: 1, fontWeight: "500", fontSize: 14, color: "#374151" },
  smallInput: { width: 70, backgroundColor: "#FFF", padding: 8, borderRadius: 10, textAlign: "center", borderWidth: 1, borderColor: "#E5E7EB" },
  delete: { fontSize: 18, marginLeft: 10 },
  addBtn: { backgroundColor: "#7C3AED", padding: 14, borderRadius: 14, alignItems: "center", marginTop: 10 },
  addText: { color: "white", fontWeight: "bold", fontSize: 14 },
  actionBtnGreen: { backgroundColor: "#10B981", padding: 14, borderRadius: 14, alignItems: "center", marginBottom: 10 },
  actionBtnBlue: { backgroundColor: "#3B82F6", padding: 14, borderRadius: 14, alignItems: "center" },
  actionText: { color: "white", fontWeight: "bold", fontSize: 14 },
});
