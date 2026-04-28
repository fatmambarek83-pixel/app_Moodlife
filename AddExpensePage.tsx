import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  Alert,
} from "react-native";
import { financeService } from "./supabaseService";
import type { Budget } from "./types/finance";

const STATUS_BAR_HEIGHT =
  Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 44;

export default function AddExpensePage({ navigation }: any) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => { loadCategories(); }, []);

  // ─── Bloquer le retour si form non soumis ─────────────────────
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: any) => {
      if (!isDirty) return;
      e.preventDefault();
      Alert.alert(
        "⚠️ Dépense non enregistrée",
        "Vous avez saisi des informations non enregistrées. Quitter quand même ?",
        [
          { text: "Annuler", style: "cancel" },
          { text: "Quitter", style: "destructive", onPress: () => { setIsDirty(false); navigation.dispatch(e.data.action); } },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, isDirty]);

  const loadCategories = async () => {
    try {
      const budget: Budget = await financeService.getBudget();
      const cats = budget.budget_items?.map((item) => item.category) || [];
      setCategories(cats);
      if (cats.length > 0) setCategory(cats[0]);
    } catch {}
  };

  const handleSave = async () => {
    if (!amount || !category) {
      Alert.alert("Erreur", "Veuillez remplir le montant et choisir une catégorie");
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert("Erreur", "Montant invalide");
      return;
    }
    // ✅ FIX: valider le format de la date YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) {
      Alert.alert("Erreur", "Format de date invalide. Utilisez YYYY-MM-DD");
      return;
    }
    try {
      setLoading(true);
      await financeService.addExpense({
        category,
        amount: numAmount,
        description: description || undefined,
        expense_date: date,
      });
      setIsDirty(false);
      Alert.alert("✅ Succès", "Dépense ajoutée avec succès", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert("Erreur", "Impossible d'ajouter la dépense. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* HEADER unifié */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nouvelle Dépense</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.label}>💵 Montant (DT)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={t => { setAmount(t); setIsDirty(true); }}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>📂 Catégorie</Text>
            {categories.length === 0 ? (
              <Text style={styles.emptyText}>Aucune catégorie disponible. Ajoutez-en depuis Finance.</Text>
            ) : (
              <View style={styles.categoryContainer}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryBtn, category === cat && styles.categoryBtnActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>📝 Description (optionnel)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Ex: Courses hebdomadaires..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>📅 Date</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Text style={styles.saveText}>{loading ? "Enregistrement..." : "💾 Enregistrer"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3E8FF" },
  content: { padding: 20, paddingBottom: 40 },

  header: {
    paddingTop: STATUS_BAR_HEIGHT + 12,
    paddingBottom: 22,
    paddingHorizontal: 20,
    backgroundColor: "#7C3AED",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    marginBottom: 20,
    alignItems: "center",
    elevation: 6,
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
  headerTitle: { color: "white", fontSize: 22, fontWeight: "bold" },

  card: { backgroundColor: "white", padding: 20, borderRadius: 20, marginBottom: 14, elevation: 3 },
  label: { fontWeight: "700", marginBottom: 12, fontSize: 15, color: "#1F2937" },
  input: { backgroundColor: "#F9FAFB", padding: 14, borderRadius: 14, fontSize: 15, color: "#1F2937" },
  textArea: { height: 80, textAlignVertical: "top" },
  emptyText: { color: "#9CA3AF", fontStyle: "italic", textAlign: "center", marginVertical: 8 },

  categoryContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: "#F3E8FF" },
  categoryBtnActive: { backgroundColor: "#7C3AED" },
  categoryText: { color: "#4C1D95", fontWeight: "600", fontSize: 13 },
  categoryTextActive: { color: "white" },

  saveBtn: { backgroundColor: "#10B981", padding: 18, borderRadius: 16, alignItems: "center", marginTop: 6, elevation: 3 },
  saveBtnDisabled: { backgroundColor: "#9CA3AF" },
  saveText: { color: "white", fontWeight: "bold", fontSize: 16 },
});
