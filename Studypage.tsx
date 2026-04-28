// Studypage.tsx — VERSION FINALE + MODIFIER SESSION
import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, ScrollView, ActivityIndicator, StatusBar, Platform,
} from "react-native";

const STATUS_BAR_HEIGHT = Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 44;
import { studyService } from "./supabaseService";

const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const colors = ["#FEF08A", "#FBCFE8", "#BFDBFE", "#BBF7D0", "#E9D5FF"];

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

// ─── Helper: parse "HH:MM" → nombre décimal ───────────────────
function timeToDecimal(t: string): number {
  const parts = t.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h + m / 60;
}

// ─── Helper: nombre décimal → "HH:MM" ────────────────────────
function decimalToTime(t: number): string {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export default function StudyPage({ navigation }: any) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<any>({});
  const [showPopup, setShowPopup] = useState(false);
  const [exitPopup, setExitPopup] = useState(false);

  const [notes, setNotes] = useState<any[]>([]);
  const [showAll, setShowAll] = useState(false);

  const [duration, setDuration] = useState(1);
  const [startHour, setStartHour] = useState("8");
  const [endHour, setEndHour] = useState("19");

  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [toast, setToast] = useState<{ msg: string; color?: string } | null>(null);

  // ─── MODIFIER SESSION STATE ───────────────────────────────────
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editStart, setEditStart] = useState("08:00");
  const [editDuration, setEditDuration] = useState(1); // 1, 1.5, ou 2
  const [showEditModal, setShowEditModal] = useState(false);

  const exitSourceRef = useRef<"back" | "home">("back");
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const showToast = (msg: string, color?: string) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [sessionsData, notesData] = await Promise.all([
          studyService.getAllSessions(),
          studyService.getCurrentNotes(),
        ]);
        // ✅ Filtrer automatiquement la session 11:00-12:00
        const filtered: any = {};
        for (const [day, sessions] of Object.entries(sessionsData || {})) {
          filtered[day] = (sessions as any[]).filter(
            s => !(s.start === "11:00" && s.end === "12:00")
          );
        }
        setSchedule(filtered || {});
        setNotes(notesData || []);
      } catch {}
      finally { setDataReady(true); }
    };
    load();
  }, []);

  const formatTime = (t: number) => {
    const h = Math.floor(t);
    const m = (t % 1) * 60;
    return `${h.toString().padStart(2, "0")}:${m === 0 ? "00" : "30"}`;
  };

  const handleDay = (day: string) => {
    setSelectedDay(day);
    if (!schedule[day] || schedule[day].length === 0) setShowPopup(true);
  };

  const generate = () => {
    const start = parseFloat(startHour);
    const end = parseFloat(endHour);
    if (isNaN(start) || isNaN(end)) { showToast("❌ Heures invalides", "#EF4444"); return; }
    if (start >= end) { showToast("❌ Début doit être avant la fin", "#EF4444"); return; }
    if (end > 24 || start < 0) { showToast("❌ Heures entre 0 et 24", "#EF4444"); return; }
    let cur = start;
    const arr: any[] = [];
    while (cur < end) {
      const next = cur + duration;
      arr.push({ start: formatTime(cur), end: formatTime(next), text: "" });
      cur = next;
    }
    setSchedule((prev: any) => ({ ...prev, [selectedDay!]: arr }));
    setShowPopup(false);
    setIsDirty(true);
  };

  const saveDay = async () => {
    if (!selectedDay) return;
    try {
      setSaving(true);
      await studyService.saveDaySessions(selectedDay, schedule[selectedDay] || []);
      setIsDirty(false);
      showToast(`✅ ${selectedDay} sauvegardé`);
    } catch {
      showToast("❌ Impossible de sauvegarder", "#EF4444");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (isDirty) { exitSourceRef.current = "back"; setExitPopup(true); }
    else setSelectedDay(null);
  };

  const handleHome = () => {
    if (isDirty) { exitSourceRef.current = "home"; setExitPopup(true); }
    else navigation.goBack();
  };

  const deleteSession = (index: number) => {
    setDeleteIndex(index);
    setShowDeleteModal(true);
  };

  const confirmDeleteSession = () => {
    if (deleteIndex === null) return;
    const copy = [...(schedule[selectedDay] || [])];
    copy.splice(deleteIndex, 1);
    setSchedule((prev: any) => ({ ...prev, [selectedDay!]: copy }));
    setIsDirty(true);
    setShowDeleteModal(false);
    setDeleteIndex(null);
    showToast("🗑 Session supprimée", "#6B7280");
  };

  // ─── OUVRIR MODAL MODIFIER ────────────────────────────────────
  const openEditModal = (index: number) => {
    const session = schedule[selectedDay]?.[index];
    if (!session) return;
    setEditIndex(index);
    setEditStart(session.start || "08:00");
    // Calculer la durée actuelle
    const s = timeToDecimal(session.start);
    const e = timeToDecimal(session.end);
    const diff = Math.round((e - s) * 2) / 2; // arrondi à 0.5
    setEditDuration([1, 1.5, 2].includes(diff) ? diff : 1);
    setShowEditModal(true);
  };

  // ─── SAUVEGARDER LA MODIFICATION ─────────────────────────────
  const confirmEdit = () => {
    if (editIndex === null || !selectedDay) return;
    const startDecimal = timeToDecimal(editStart);
    if (isNaN(startDecimal) || startDecimal < 0 || startDecimal >= 24) {
      showToast("❌ Heure de début invalide (ex: 08:00)", "#EF4444");
      return;
    }
    const endDecimal = startDecimal + editDuration;
    if (endDecimal > 24) {
      showToast("❌ La session dépasse minuit", "#EF4444");
      return;
    }
    const copy = [...(schedule[selectedDay] || [])];
    copy[editIndex] = {
      ...copy[editIndex],
      start: decimalToTime(startDecimal),
      end: decimalToTime(endDecimal),
    };
    setSchedule((prev: any) => ({ ...prev, [selectedDay!]: copy }));
    setIsDirty(true);
    setShowEditModal(false);
    setEditIndex(null);
    showToast("✅ Session modifiée — pense à sauvegarder 💾");
  };

  /* NOTES */
  const addNote = async () => {
    const color = colors[Math.floor(Math.random() * colors.length)];
    try {
      const newNote = await studyService.addNote(color);
      setNotes(prev => [...prev, newNote]);
    } catch { showToast("❌ Impossible d'ajouter une note", "#EF4444"); }
  };

  const deleteNote = async (id: string) => {
    try {
      await studyService.deleteNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
      showToast("🗑 Note supprimée", "#6B7280");
    } catch { showToast("❌ Impossible de supprimer la note", "#EF4444"); }
  };

  const updateNote = async (id: string, text: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
    try { await studyService.updateNote(id, text); } catch {}
  };

  const displayedNotes = showAll ? notes : notes.slice(0, 5);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {toast && <Toast message={toast.msg} color={toast.color} />}

      {/* HOME HEADER */}
      {!selectedDay && (
        <View style={styles.headerContainer}>
          <TouchableOpacity style={styles.headerBackBtn} onPress={handleHome}>
            <Text style={styles.headerBackText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>📚 Étude</Text>
          <View style={styles.headerSpacer} />
        </View>
      )}

      {/* DAY HEADER */}
      {selectedDay && (
        <>
          <View style={styles.headerContainer}>
            <TouchableOpacity style={styles.headerBackBtn} onPress={handleBack}>
              <Text style={styles.headerBackText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>📅 {selectedDay}</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.headerActionBtn, styles.headerModifyBtn]}
                onPress={() => {
                  const sessions = schedule[selectedDay] || [];
                  if (sessions.length > 0) openEditModal(0);
                }}
              >
                <Text style={styles.headerActionText}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerActionBtn, styles.headerSaveBtn, (!isDirty || saving) && styles.headerSaveBtnDisabled]}
                onPress={saveDay}
                disabled={!isDirty || saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.headerActionText}>💾</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* DAYS LIST */}
      {!selectedDay && (
        <>
          {days.map(day => (
            <View key={day} style={[styles.day, schedule[day]?.length > 0 && styles.dayDone]}>
              <View style={styles.dayContent}>
                <TouchableOpacity style={styles.dayMainArea} onPress={() => handleDay(day)}>
                  <Text style={styles.dayEmoji}>📅</Text>
                  <Text style={[styles.dayText, schedule[day]?.length > 0 && styles.dayDoneText]}>{day}</Text>
                  {schedule[day]?.length > 0
                    ? <View style={styles.dayBadge}><Text style={styles.dayBadgeText}>{schedule[day].length}</Text></View>
                    : <Text style={styles.dayArrow}>→</Text>
                  }
                </TouchableOpacity>
                {schedule[day]?.length > 0 && (
                  <TouchableOpacity style={styles.editDayBtn} onPress={() => { setSelectedDay(day); setShowPopup(false); }}>
                    <Text style={styles.editDayText}>✏️</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}

          {/* NOTES */}
          <View style={styles.notesHeader}>
            <Text style={styles.subtitle}>📝 Notes</Text>
            <TouchableOpacity style={styles.addBtn} onPress={addNote}>
              <Text style={styles.white}>➕</Text>
            </TouchableOpacity>
          </View>

          {displayedNotes.map(note => (
            <View key={note.id} style={[styles.note, { backgroundColor: note.color }]}>
              <TouchableOpacity style={styles.delete} onPress={() => deleteNote(note.id)}>
                <Text>🗑️</Text>
              </TouchableOpacity>
              <TextInput
                placeholder="✨ écrire..."
                value={note.text}
                onChangeText={t => updateNote(note.id, t)}
                multiline
                style={styles.noteInput}
              />
            </View>
          ))}

          {notes.length > 5 && (
            <TouchableOpacity onPress={() => setShowAll(!showAll)}>
              <Text style={styles.center}>{showAll ? "Voir moins 🔼" : "Afficher tout 🔽"}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* PLANNER */}
      {selectedDay && (
        <>
          {(schedule[selectedDay] || []).length === 0 && (
            <Text style={styles.emptyText}>Aucune session. Ajoutez-en une !</Text>
          )}

          {(schedule[selectedDay] || []).map((s: any, i: number) => (
            <View key={i} style={styles.card}>
              {/* Bouton supprimer */}
              <TouchableOpacity style={styles.deleteSession} onPress={() => deleteSession(i)}>
                <Text style={styles.deleteSessionText}>✕</Text>
              </TouchableOpacity>

              {/* Affichage heure */}
              <View style={styles.timeRow}>
                <TextInput
                  style={styles.timeInput}
                  value={s.start}
                  onChangeText={t => {
                    const copy = [...schedule[selectedDay]];
                    copy[i] = { ...copy[i], start: t };
                    setSchedule((prev: any) => ({ ...prev, [selectedDay!]: copy }));
                    setIsDirty(true);
                  }}
                />
                <Text style={styles.arrow}>→</Text>
                <TextInput
                  style={styles.timeInput}
                  value={s.end}
                  onChangeText={t => {
                    const copy = [...schedule[selectedDay]];
                    copy[i] = { ...copy[i], end: t };
                    setSchedule((prev: any) => ({ ...prev, [selectedDay!]: copy }));
                    setIsDirty(true);
                  }}
                />
              </View>

              <TextInput
                style={styles.input}
                value={s.text}
                placeholder="📚 matière..."
                onChangeText={t => {
                  const copy = [...schedule[selectedDay]];
                  copy[i] = { ...copy[i], text: t };
                  setSchedule((prev: any) => ({ ...prev, [selectedDay!]: copy }));
                  setIsDirty(true);
                }}
              />
            </View>
          ))}

          {/* ADD SESSION */}
          <TouchableOpacity
            style={styles.addSession}
            onPress={() => {
              const copy = [...(schedule[selectedDay] || [])];
              const last = copy[copy.length - 1];
              const start = last ? last.end : "08:00";
              const hour = parseInt(start.split(":")[0], 10);
              const next = hour + 1;
              copy.push({
                start: `${hour.toString().padStart(2, "0")}:00`,
                end: `${next.toString().padStart(2, "0")}:00`,
                text: "",
              });
              setSchedule((prev: any) => ({ ...prev, [selectedDay!]: copy }));
              setIsDirty(true);
            }}
          >
            <Text style={styles.white}>➕ Ajouter session</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ══ MODAL MODIFIER SESSION ══ */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>✏️ Modifier la session</Text>

            {/* Heure de début */}
            <Text style={styles.popupLabel}>🕐 Heure de début (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={editStart}
              onChangeText={setEditStart}
              placeholder="ex: 08:00"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
            />

            {/* Durée */}
            <Text style={styles.popupLabel}>⏱ Durée de la session</Text>
            <View style={styles.durationRow}>
              {[
                { val: 1, label: "1h" },
                { val: 1.5, label: "1h30" },
                { val: 2, label: "2h" },
              ].map(d => (
                <TouchableOpacity
                  key={d.val}
                  style={[styles.durationBtn, editDuration === d.val && styles.durationBtnActive]}
                  onPress={() => setEditDuration(d.val)}
                >
                  <Text style={[styles.durationText, editDuration === d.val && styles.durationTextActive]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Aperçu */}
            {editStart ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewText}>
                  ⏰ {editStart} → {decimalToTime(timeToDecimal(editStart) + editDuration)}
                </Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <TouchableOpacity style={styles.cancel} onPress={() => { setShowEditModal(false); setEditIndex(null); }}>
                <Text style={styles.white}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveEditBtn} onPress={confirmEdit}>
                <Text style={styles.white}>💾 Sauvegarder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── GENERATE POPUP ── */}
      <Modal visible={showPopup} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>⚙️ Générer l'emploi du temps</Text>
            <Text style={styles.popupLabel}>⏱ Durée par session</Text>
            <View style={styles.durationRow}>
              {[
                { val: 1, label: "1h" },
                { val: 1.5, label: "1h30" },
                { val: 2, label: "2h" },
              ].map(d => (
                <TouchableOpacity
                  key={d.val}
                  style={[styles.durationBtn, duration === d.val && styles.durationBtnActive]}
                  onPress={() => setDuration(d.val)}
                >
                  <Text style={[styles.durationText, duration === d.val && styles.durationTextActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.popupLabel}>🕗 Heure de début</Text>
            <TextInput style={styles.input} value={startHour} onChangeText={setStartHour} keyboardType="numeric" placeholder="ex: 8" />
            <Text style={styles.popupLabel}>🕖 Heure de fin</Text>
            <TextInput style={styles.input} value={endHour} onChangeText={setEndHour} keyboardType="numeric" placeholder="ex: 19" />
            <View style={styles.row}>
              <TouchableOpacity style={styles.cancel} onPress={() => { setShowPopup(false); setSelectedDay(null); }}>
                <Text style={styles.white}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.generate} onPress={generate}>
                <Text style={styles.white}>Générer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── EXIT POPUP ── */}
      <Modal visible={exitPopup} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>⚠️ Modifications non sauvegardées</Text>
            <Text style={{ color: "#6B7280", marginBottom: 16 }}>Voulez-vous sauvegarder avant de quitter ?</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.cancel} onPress={() => {
                setExitPopup(false); setIsDirty(false);
                if (exitSourceRef.current === "home") navigation.goBack();
                else setSelectedDay(null);
              }}>
                <Text style={styles.white}>Ignorer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.save} onPress={async () => {
                if (selectedDay) {
                  try {
                    await studyService.saveDaySessions(selectedDay, schedule[selectedDay] || []);
                    showToast(`✅ ${selectedDay} sauvegardé`);
                  } catch { showToast("❌ Impossible de sauvegarder", "#EF4444"); }
                }
                setExitPopup(false); setIsDirty(false);
                if (exitSourceRef.current === "home") navigation.goBack();
                else setSelectedDay(null);
              }}>
                <Text style={styles.white}>💾 Sauvegarder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── DELETE SESSION CONFIRM ── */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>🗑 Supprimer cette session ?</Text>
            <Text style={{ color: "#6B7280", marginBottom: 16 }}>Cette action est irréversible.</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.cancel} onPress={() => { setShowDeleteModal(false); setDeleteIndex(null); }}>
                <Text style={styles.white}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteConfirmBtn} onPress={confirmDeleteSession}>
                <Text style={styles.white}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3FF" },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },

  headerContainer: { backgroundColor: "#7C3AED", paddingTop: 50, paddingBottom: 30, paddingHorizontal: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20, marginTop: -20, marginHorizontal: -20 },
  headerBackBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "flex-start" },
  headerBackText: { color: "#fff", fontSize: 24, fontWeight: "bold" },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "bold", flex: 1, textAlign: "center" },
  headerSpacer: { width: 40 },
  headerActions: { flexDirection: "row", gap: 8 },
  headerActionBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
  headerModifyBtn: { backgroundColor: "rgba(255,255,255,0.25)" },
  headerSaveBtn: { backgroundColor: "#10B981" },
  headerSaveBtnDisabled: { backgroundColor: "rgba(255,255,255,0.15)" },
  headerActionText: { fontSize: 18 },

  floatingSaveBtn: { position: "absolute", top: 55, right: 25, backgroundColor: "#10B981", width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", zIndex: 100, elevation: 5 },

  day: { backgroundColor: "#DDD6FE", padding: 20, borderRadius: 16, marginBottom: 12, elevation: 1 },
  dayDone: { backgroundColor: "#C4B5FD", borderWidth: 2, borderColor: "#7C3AED", elevation: 3 },
  dayContent: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayMainArea: { flex: 1, flexDirection: "row", alignItems: "center" },
  dayEmoji: { fontSize: 20, marginRight: 12 },
  dayText: { color: "#7C3AED", fontSize: 16, fontWeight: "600", flex: 1 },
  dayDoneText: { color: "#5B21B6", fontWeight: "700" },
  dayBadge: { backgroundColor: "#7C3AED", borderRadius: 12, minWidth: 24, height: 24, justifyContent: "center", alignItems: "center", paddingHorizontal: 6 },
  dayBadgeText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  dayArrow: { color: "#A78BFA", fontSize: 18, fontWeight: "600" },
  editDayBtn: { backgroundColor: "rgba(124,58,237,0.15)", borderRadius: 10, width: 36, height: 36, justifyContent: "center", alignItems: "center", marginLeft: 8 },
  editDayText: { fontSize: 16 },

  center: { textAlign: "center", marginTop: 10, color: "#7C3AED" },
  emptyText: { textAlign: "center", color: "#9CA3AF", marginTop: 20, fontSize: 15 },

  notesHeader: { flexDirection: "row", justifyContent: "space-between", marginTop: 24, marginBottom: 12, alignItems: "center" },
  subtitle: { fontSize: 20, fontWeight: "bold", color: "#1F2937" },
  addBtn: { backgroundColor: "#7C3AED", width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  note: { padding: 16, borderRadius: 16, marginTop: 12, elevation: 2, minHeight: 80 },
  delete: { position: "absolute", right: 12, top: 12, zIndex: 1, backgroundColor: "rgba(255,255,255,0.6)", borderRadius: 12, width: 28, height: 28, justifyContent: "center", alignItems: "center" },
  noteInput: { fontSize: 14, color: "#374151", marginTop: 4 },

  card: { backgroundColor: "#fff", padding: 18, borderRadius: 25, marginTop: 15, elevation: 4, position: "relative" },
  deleteSession: { position: "absolute", right: 12, top: 12, backgroundColor: "#FEE2E2", borderRadius: 20, width: 28, height: 28, justifyContent: "center", alignItems: "center", zIndex: 1 },
  deleteSessionText: { color: "#EF4444", fontSize: 12, fontWeight: "bold" },

  timeRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 },
  timeInput: { backgroundColor: "#EDE9FE", padding: 8, borderRadius: 10, width: 70, textAlign: "center", color: "#7C3AED", fontWeight: "600" },
  arrow: { marginHorizontal: 5, color: "#A78BFA", fontSize: 16 },

  // ✅ NOUVEAU: style bouton Modifier
  modifyBtn: {
    marginLeft: "auto",
    backgroundColor: "#7C3AED",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  modifyBtnText: { color: "white", fontSize: 12, fontWeight: "700" },

  input: { backgroundColor: "#F3F4F6", padding: 12, borderRadius: 12, marginTop: 4, color: "#374151" },
  addSession: { backgroundColor: "#10B981", padding: 16, borderRadius: 25, marginTop: 20, alignItems: "center", elevation: 4 },
  saveBtn: { backgroundColor: "#7C3AED", padding: 16, borderRadius: 25, marginTop: 12, alignItems: "center", elevation: 4 },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  popup: { backgroundColor: "#fff", padding: 24, borderRadius: 25, width: "88%" },
  popupTitle: { fontWeight: "bold", fontSize: 16, marginBottom: 16, color: "#1F2937" },
  popupLabel: { fontSize: 13, color: "#6B7280", marginTop: 12, marginBottom: 6 },

  durationRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  durationBtn: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#DDD6FE", alignItems: "center" },
  durationBtnActive: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  durationText: { color: "#7C3AED", fontWeight: "600" },
  durationTextActive: { color: "#fff" },

  // Aperçu heure résultante
  previewBox: { marginTop: 12, backgroundColor: "#EDE9FE", borderRadius: 12, padding: 12, alignItems: "center" },
  previewText: { color: "#5B21B6", fontWeight: "700", fontSize: 15 },

  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, gap: 10 },
  generate: { flex: 1, backgroundColor: "#7C3AED", padding: 12, borderRadius: 15, alignItems: "center" },
  cancel: { flex: 1, backgroundColor: "#6B7280", padding: 12, borderRadius: 15, alignItems: "center" },
  save: { flex: 1, backgroundColor: "#10B981", padding: 12, borderRadius: 15, alignItems: "center" },
  saveEditBtn: { flex: 1, backgroundColor: "#7C3AED", padding: 12, borderRadius: 15, alignItems: "center" },
  deleteConfirmBtn: { flex: 1, backgroundColor: "#EF4444", padding: 12, borderRadius: 15, alignItems: "center" },

  saveBtnDisabled: { backgroundColor: "#C4B5FD", opacity: 0.7 },
  white: { color: "#fff", fontWeight: "bold" },
});
