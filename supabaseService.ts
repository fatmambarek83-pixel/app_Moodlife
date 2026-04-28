// supabaseService.ts — VERSION FINALE
// Corrections:
//  ✅ maybeSingle() partout — plus d'erreur si 0 rows
//  ✅ syncAll religion_toggle robuste
//  ✅ signOut nettoie cached_supabase_user_id
//  ✅ studyService.getAllSessions() + saveDaySessions() ajoutés
//  ✅ getUserId robuste offline total

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabaseClient";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function localGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}

async function localSet(key: string, value: unknown): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function uid(): string {
  return "loc-" + Math.random().toString(36).slice(2) + "-" + Date.now();
}

// ═══════════════════════════════════════════════════════════════
// SESSION — lit AsyncStorage, 0 réseau
// ═══════════════════════════════════════════════════════════════

async function getSessionUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// USER ID
// ═══════════════════════════════════════════════════════════════

export const CACHED_USER_ID_KEY = "cached_supabase_user_id";
const FALLBACK_USER_ID_KEY = "offline_fallback_user_id";
const PENDING_QUEUE_KEY = "pending_ops_queue";

let _memUid: string | null = null;
let _memUidTs = 0;

async function getUserId(): Promise<string> {
  const now = Date.now();
  if (_memUid && now - _memUidTs < 30000) return _memUid;
  const cached = await AsyncStorage.getItem(CACHED_USER_ID_KEY);
  if (cached) { _memUid = cached; _memUidTs = now; return cached; }
  const user = await getSessionUser();
  if (user?.id) {
    _memUid = user.id; _memUidTs = now;
    await AsyncStorage.setItem(CACHED_USER_ID_KEY, user.id);
    return user.id;
  }
  let fb = await AsyncStorage.getItem(FALLBACK_USER_ID_KEY);
  if (!fb) {
    fb = `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem(FALLBACK_USER_ID_KEY, fb);
  }
  _memUid = fb; _memUidTs = now;
  return fb;
}

export function clearUserIdCache() { _memUid = null; _memUidTs = 0; }

// ═══════════════════════════════════════════════════════════════
// PENDING QUEUE
// ═══════════════════════════════════════════════════════════════

type PendingOp =
  | { type: "mood_insert"; data: { mood: string; created_at: string } }
  | { type: "expense_insert"; data: Record<string, any> }
  | { type: "grocery_toggle"; data: { localId: string; done: boolean } }
  | { type: "grocery_delete"; data: { localId: string } }
  | { type: "profile_update"; data: Record<string, any> }
  | { type: "religion_toggle"; data: { title: string; taskType: string; completed: boolean; task_date: string } }
  | { type: "study_toggle"; data: { localId: string; completed: boolean } }
  | { type: "study_delete"; data: { localId: string } }
  | { type: "study_note_update"; data: { localId: string; text: string } }
  | { type: "study_note_delete"; data: { localId: string } };

async function queuePending(op: PendingOp): Promise<void> {
  try {
    const queue: PendingOp[] = JSON.parse(await AsyncStorage.getItem(PENDING_QUEUE_KEY) || "[]");
    const deduped = queue.filter(q => {
      if (q.type !== op.type) return true;
      if (op.type === "religion_toggle" && q.type === "religion_toggle")
        return !(q.data.title === op.data.title && q.data.task_date === op.data.task_date);
      if (op.type === "grocery_toggle" && q.type === "grocery_toggle") return q.data.localId !== op.data.localId;
      if (op.type === "grocery_delete" && q.type === "grocery_delete") return q.data.localId !== op.data.localId;
      if (op.type === "study_toggle" && q.type === "study_toggle") return q.data.localId !== op.data.localId;
      if (op.type === "profile_update") return false;
      return true;
    });
    deduped.push(op);
    await AsyncStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(deduped));
  } catch {}
}

export async function syncAll(): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const raw = await AsyncStorage.getItem(PENDING_QUEUE_KEY);
  if (!raw) return;
  const queue: PendingOp[] = JSON.parse(raw);
  if (!queue.length) return;
  const failed: PendingOp[] = [];

  for (const op of queue) {
    try {
      switch (op.type) {
        case "mood_insert":
          await supabase.from("moods").insert({ user_id: user.id, ...op.data }); break;
        case "expense_insert":
          await supabase.from("expenses").insert({ user_id: user.id, ...op.data }); break;
        case "grocery_toggle": {
          const list = await localGet<any[]>(`grocery_${user.id}`, []);
          const item = list.find(i => i.id === op.data.localId);
          if (item && !item.id.startsWith("loc-"))
            await supabase.from("grocery_items").update({ done: op.data.done }).eq("id", item.id);
          break;
        }
        case "grocery_delete":
          if (!op.data.localId.startsWith("loc-"))
            await supabase.from("grocery_items").delete().eq("id", op.data.localId);
          break;
        case "profile_update":
          await supabase.from("profiles").upsert({ id: user.id, ...op.data, updated_at: new Date().toISOString() }); break;
        case "religion_toggle": {
          // ✅ maybeSingle() → pas d'erreur si non trouvé
          const { data: existing } = await supabase.from("religion_tasks").select("id")
            .eq("user_id", user.id).eq("title", op.data.title).eq("task_date", op.data.task_date).maybeSingle();
          if (existing?.id)
            await supabase.from("religion_tasks").update({ completed: op.data.completed }).eq("id", existing.id);
          else
            await supabase.from("religion_tasks").insert({
              user_id: user.id, title: op.data.title, type: op.data.taskType,
              completed: op.data.completed, task_date: op.data.task_date, created_at: new Date().toISOString(),
            });
          break;
        }
        case "study_toggle":
          if (!op.data.localId.startsWith("loc-"))
            await supabase.from("study_tasks").update({ completed: op.data.completed }).eq("id", op.data.localId);
          break;
        case "study_delete":
          if (!op.data.localId.startsWith("loc-"))
            await supabase.from("study_tasks").delete().eq("id", op.data.localId);
          break;
        case "study_note_update":
          if (!op.data.localId.startsWith("loc-"))
            await supabase.from("study_notes").update({ text: op.data.text }).eq("id", op.data.localId);
          break;
        case "study_note_delete":
          if (!op.data.localId.startsWith("loc-"))
            await supabase.from("study_notes").delete().eq("id", op.data.localId);
          break;
      }
    } catch { failed.push(op); }
  }
  await AsyncStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(failed));
}

// ═══════════════════════════════════════════════════════════════
// AUTH SERVICE
// ═══════════════════════════════════════════════════════════════

export const authService = {
  getCurrentUser: () => getSessionUser(),
  signOut: async () => {
    try { await supabase.auth.signOut(); } catch {}
    try {
      const keys = await AsyncStorage.getAllKeys();
      const toRemove = keys.filter((k: string) =>
        ["moods_","budget_","expenses_","grocery_","profile_","quran_","study_","religion_"]
          .some(prefix => k.startsWith(prefix))
      );
      if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
    } catch {}
    // ✅ Supprimer userId au signout
    await AsyncStorage.multiRemove([
      CACHED_USER_ID_KEY, FALLBACK_USER_ID_KEY, PENDING_QUEUE_KEY,
      "savedEmail", "rememberMe", "isNewUser", "avatar_local_base64",
      "religion_quran_local", "history_last_purge_date",
    ]);
    clearUserIdCache();
  },
};

// ═══════════════════════════════════════════════════════════════
// PROFILE SERVICE
// ═══════════════════════════════════════════════════════════════

const AVATAR_LOCAL_KEY = "avatar_local_base64";

async function injectLocalAvatar(profile: any): Promise<any> {
  if (profile?.avatar_url) return profile;
  const b64 = await AsyncStorage.getItem(AVATAR_LOCAL_KEY).catch(() => null);
  if (b64) return { ...profile, avatar_url: `data:image/jpeg;base64,${b64}` };
  return profile;
}

export const profileService = {
  getProfile: async () => {
    const userId = await getUserId();
    const cacheKey = `profile_${userId}`;
    const cached = await localGet<any>(cacheKey, null);
    if (cached) {
      // Refresh silencieux en arrière-plan
      getSessionUser().then(async user => {
        if (!user) return;
        const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
        if (!error && data) await localSet(cacheKey, data);
      }).catch(() => {});
      return injectLocalAvatar(cached);
    }
    try {
      const user = await getSessionUser();
      if (user) {
        const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
        if (data) { await localSet(cacheKey, data); return injectLocalAvatar(data); }
        // Créer le profil s'il n'existe pas
        const { data: newP } = await supabase.from("profiles").insert({ id: user.id }).select().maybeSingle();
        if (newP) { await localSet(cacheKey, newP); return injectLocalAvatar(newP); }
      }
    } catch {}
    const def = { id: userId, name: "", prenom: "", birthday: "", phone: "", instagram: "", avatar_url: "" };
    await localSet(cacheKey, def);
    return def;
  },

  updateProfile: async (updates: any) => {
    const userId = await getUserId();
    const cacheKey = `profile_${userId}`;
    const current = await localGet<any>(cacheKey, {});
    await localSet(cacheKey, { ...current, ...updates });
    try {
      const user = await getSessionUser();
      if (!user) { await queuePending({ type: "profile_update", data: updates }); return; }
      const { error } = await supabase.from("profiles").upsert({ id: user.id, ...updates, updated_at: new Date().toISOString() });
      if (error) await queuePending({ type: "profile_update", data: updates });
    } catch { await queuePending({ type: "profile_update", data: updates }); }
  },

  deleteProfile: async (userId: string) => {
    await supabase.from("profiles").delete().eq("id", userId).catch(() => {});
    await AsyncStorage.removeItem(`profile_${userId}`).catch(() => {});
  },
};

// ═══════════════════════════════════════════════════════════════
// MOOD SERVICE
// ═══════════════════════════════════════════════════════════════

export const moodService = {
  saveMood: async (mood: string) => {
    const userId = await getUserId();
    const cacheKey = `moods_${userId}`;
    const created_at = new Date().toISOString();
    const entry = { id: uid(), mood, created_at };
    const moods = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, [entry, ...moods]);
    try {
      const user = await getSessionUser();
      if (!user) { await queuePending({ type: "mood_insert", data: { mood, created_at } }); return; }
      const { error } = await supabase.from("moods").insert({ user_id: user.id, mood, created_at });
      if (error) await queuePending({ type: "mood_insert", data: { mood, created_at } });
    } catch { await queuePending({ type: "mood_insert", data: { mood, created_at } }); }
  },

  getMoodHistory: async (limit = 50) => {
    const userId = await getUserId();
    const cacheKey = `moods_${userId}`;
    const cached = await localGet<any[]>(cacheKey, []);
    if (cached.length > 0) {
      getSessionUser().then(async user => {
        if (!user) return;
        const { data, error } = await supabase.from("moods").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
        if (!error && data) await localSet(cacheKey, data);
      }).catch(() => {});
      return cached.slice(0, limit);
    }
    try {
      const user = await getSessionUser();
      if (user) {
        const { data, error } = await supabase.from("moods").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
        if (!error && data) { await localSet(cacheKey, data); return data; }
      }
    } catch {}
    return [];
  },
};

// ═══════════════════════════════════════════════════════════════
// FINANCE SERVICE
// ═══════════════════════════════════════════════════════════════

const DEFAULT_BUDGET = { id: "local-budget", total_budget: 0, budget_items: [] };

export const financeService = {
  getBudget: async () => {
    const userId = await getUserId();
    const cacheKey = `budget_${userId}`;
    const cached = await localGet<any>(cacheKey, null);
    if (cached) {
      getSessionUser().then(async user => {
        if (!user) return;
        const { data, error } = await supabase.from("budgets").select("*, budget_items(*)").eq("user_id", user.id).maybeSingle();
        if (!error && data) await localSet(cacheKey, data);
      }).catch(() => {});
      return cached;
    }
    try {
      const user = await getSessionUser();
      if (user) {
        const { data } = await supabase.from("budgets").select("*, budget_items(*)").eq("user_id", user.id).maybeSingle();
        if (data) { await localSet(cacheKey, data); return data; }
        const { data: nb } = await supabase.from("budgets").insert({ user_id: user.id, total_budget: 0 }).select("*, budget_items(*)").maybeSingle();
        if (nb) { await localSet(cacheKey, nb); return nb; }
      }
    } catch {}
    return { ...DEFAULT_BUDGET };
  },

  updateTotalBudget: async (budgetId: string, amount: number) => {
    const userId = await getUserId();
    const cacheKey = `budget_${userId}`;
    const b = await localGet<any>(cacheKey, { ...DEFAULT_BUDGET });
    b.total_budget = amount;
    await localSet(cacheKey, b);
    supabase.from("budgets").update({ total_budget: amount }).eq("id", budgetId).then(() => {}).catch(() => {});
  },

  addBudgetItem: async (budgetId: string, category: string) => {
    const userId = await getUserId();
    const cacheKey = `budget_${userId}`;
    const newItem = { id: uid(), budget_id: budgetId, category, amount: 0 };
    const b = await localGet<any>(cacheKey, { ...DEFAULT_BUDGET });
    b.budget_items = [...(b.budget_items || []), newItem];
    await localSet(cacheKey, b);
    try {
      const { data, error } = await supabase.from("budget_items").insert({ budget_id: budgetId, category, amount: 0 }).select().maybeSingle();
      if (!error && data) {
        b.budget_items = b.budget_items.map((i: any) => i.id === newItem.id ? data : i);
        await localSet(cacheKey, b);
        return data;
      }
    } catch {}
    return newItem;
  },

  updateBudgetItem: async (itemId: string, amount: number) => {
    const userId = await getUserId();
    const cacheKey = `budget_${userId}`;
    const b = await localGet<any>(cacheKey, { ...DEFAULT_BUDGET });
    b.budget_items = (b.budget_items || []).map((i: any) => i.id === itemId ? { ...i, amount } : i);
    await localSet(cacheKey, b);
    supabase.from("budget_items").update({ amount }).eq("id", itemId).then(() => {}).catch(() => {});
  },

  deleteBudgetItem: async (itemId: string) => {
    const userId = await getUserId();
    const cacheKey = `budget_${userId}`;
    const b = await localGet<any>(cacheKey, { ...DEFAULT_BUDGET });
    b.budget_items = (b.budget_items || []).filter((i: any) => i.id !== itemId);
    await localSet(cacheKey, b);
    supabase.from("budget_items").delete().eq("id", itemId).then(() => {}).catch(() => {});
  },

  addExpense: async (expense: { category: string; amount: number; description?: string; expense_date: string }) => {
    const userId = await getUserId();
    const cacheKey = `expenses_${userId}`;
    const created_at = new Date().toISOString();
    const entry = { id: uid(), ...expense, created_at };
    const expenses = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, [entry, ...expenses]);
    try {
      const user = await getSessionUser();
      if (!user) { await queuePending({ type: "expense_insert", data: { ...expense, created_at } }); return; }
      const { error } = await supabase.from("expenses").insert({ user_id: user.id, ...expense });
      if (error) await queuePending({ type: "expense_insert", data: { ...expense, created_at } });
    } catch { await queuePending({ type: "expense_insert", data: { ...expense, created_at } }); }
  },

  getExpenses: async () => {
    const userId = await getUserId();
    const cacheKey = `expenses_${userId}`;
    const cached = await localGet<any[]>(cacheKey, []);
    if (cached.length > 0) {
      getSessionUser().then(async user => {
        if (!user) return;
        const { data, error } = await supabase.from("expenses").select("*").eq("user_id", user.id).order("expense_date", { ascending: false });
        if (!error && data) await localSet(cacheKey, data);
      }).catch(() => {});
      return cached;
    }
    try {
      const user = await getSessionUser();
      if (user) {
        const { data, error } = await supabase.from("expenses").select("*").eq("user_id", user.id).order("expense_date", { ascending: false });
        if (!error && data) { await localSet(cacheKey, data); return data; }
      }
    } catch {}
    return [];
  },
};

// ═══════════════════════════════════════════════════════════════
// GROCERY SERVICE
// ═══════════════════════════════════════════════════════════════

export const groceryService = {
  getItems: async () => {
    const userId = await getUserId();
    const cacheKey = `grocery_${userId}`;
    const cached = await localGet<any[]>(cacheKey, []);
    if (cached.length > 0) {
      getSessionUser().then(async user => {
        if (!user) return;
        const { data, error } = await supabase.from("grocery_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        if (!error && data) await localSet(cacheKey, data);
      }).catch(() => {});
      return cached;
    }
    try {
      const user = await getSessionUser();
      if (user) {
        const { data, error } = await supabase.from("grocery_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        if (!error && data) { await localSet(cacheKey, data); return data; }
      }
    } catch {}
    return [];
  },

  addItem: async (item: string) => {
    const userId = await getUserId();
    const cacheKey = `grocery_${userId}`;
    const entry = { id: uid(), item, done: false, created_at: new Date().toISOString() };
    const list = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, [entry, ...list]);
    try {
      const user = await getSessionUser();
      if (!user) return entry;
      const { data, error } = await supabase.from("grocery_items").insert({ user_id: user.id, item, done: false }).select().maybeSingle();
      if (!error && data) {
        const updated = await localGet<any[]>(cacheKey, []);
        await localSet(cacheKey, updated.map(i => i.id === entry.id ? data : i));
        return data;
      }
    } catch {}
    return entry;
  },

  toggleItem: async (id: string, done: boolean) => {
    const userId = await getUserId();
    const cacheKey = `grocery_${userId}`;
    const list = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, list.map(i => i.id === id ? { ...i, done } : i));
    if (id.startsWith("loc-")) { await queuePending({ type: "grocery_toggle", data: { localId: id, done } }); return; }
    try {
      const { error } = await supabase.from("grocery_items").update({ done }).eq("id", id);
      if (error) await queuePending({ type: "grocery_toggle", data: { localId: id, done } });
    } catch { await queuePending({ type: "grocery_toggle", data: { localId: id, done } }); }
  },

  deleteItem: async (id: string) => {
    const userId = await getUserId();
    const cacheKey = `grocery_${userId}`;
    const list = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, list.filter(i => i.id !== id));
    if (id.startsWith("loc-")) return;
    try {
      const { error } = await supabase.from("grocery_items").delete().eq("id", id);
      if (error) await queuePending({ type: "grocery_delete", data: { localId: id } });
    } catch { await queuePending({ type: "grocery_delete", data: { localId: id } }); }
  },
};

// ═══════════════════════════════════════════════════════════════
// RELIGION SERVICE
// ═══════════════════════════════════════════════════════════════

const DEFAULT_RELIGION_TASKS = [
  { title: "Fajr", type: "prayer" },
  { title: "Dhuhr", type: "prayer" },
  { title: "Asr", type: "prayer" },
  { title: "Maghrib", type: "prayer" },
  { title: "Isha", type: "prayer" },
  { title: "Lire le Coran (au moins 1 page)", type: "quran" },
  { title: "Dhikr du matin", type: "dhikr" },
  { title: "Dhikr du soir", type: "dhikr" },
  { title: "Douaa", type: "dua" },
];

export const religionService = {
  getTodayTasks: async () => {
    const today = new Date().toISOString().split("T")[0];
    const cacheKey = `religion_tasks_local_${today}`;
    const cached = await localGet<any[]>(cacheKey, null as any);
    if (cached && cached.length > 0) {
      getSessionUser().then(async user => {
        if (!user) return;
        const { data, error } = await supabase.from("religion_tasks").select("*").eq("user_id", user.id).eq("task_date", today);
        if (!error && data && data.length > 0) await localSet(cacheKey, data);
      }).catch(() => {});
      return cached;
    }
    try {
      const user = await getSessionUser();
      if (user) {
        const { data: existing, error } = await supabase.from("religion_tasks").select("*").eq("user_id", user.id).eq("task_date", today);
        if (!error) {
          if (existing && existing.length > 0) { await localSet(cacheKey, existing); return existing; }
          const toInsert = DEFAULT_RELIGION_TASKS.map(t => ({
            user_id: user.id, title: t.title, type: t.type,
            completed: false, task_date: today, created_at: new Date().toISOString(),
          }));
          const { data: newTasks } = await supabase.from("religion_tasks").insert(toInsert).select();
          if (newTasks) { await localSet(cacheKey, newTasks); return newTasks; }
        }
      }
    } catch {}
    // Fallback 100% local
    const localTasks = DEFAULT_RELIGION_TASKS.map(t => ({
      id: uid(), title: t.title, type: t.type,
      completed: false, task_date: today, created_at: new Date().toISOString(),
    }));
    await localSet(cacheKey, localTasks);
    return localTasks;
  },

  toggleTask: async (id: string, completed: boolean, taskMeta?: { title: string; type: string }) => {
    const today = new Date().toISOString().split("T")[0];
    const cacheKey = `religion_tasks_local_${today}`;
    const tasks = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, tasks.map(t => t.id === id ? { ...t, completed } : t));

    if (id.startsWith("loc-")) {
      try {
        const user = await getSessionUser();
        if (!user) {
          await queuePending({ type: "religion_toggle", data: { title: taskMeta?.title || id, taskType: taskMeta?.type || "other", completed, task_date: today } });
          return null;
        }
        const task = tasks.find(t => t.id === id) || taskMeta;
        if (!task) return null;
        const { data: inserted } = await supabase.from("religion_tasks").insert({
          user_id: user.id, title: task.title, type: task.type || "other",
          completed, task_date: today, created_at: new Date().toISOString(),
        }).select().maybeSingle();
        if (inserted) {
          await localSet(cacheKey, tasks.map(t => t.id === id ? { ...t, ...inserted } : t));
          return inserted.id;
        }
      } catch {}
      return null;
    }
    try {
      const { error } = await supabase.from("religion_tasks").update({ completed }).eq("id", id);
      if (error) await queuePending({ type: "religion_toggle", data: { title: taskMeta?.title || id, taskType: taskMeta?.type || "other", completed, task_date: today } });
    } catch { await queuePending({ type: "religion_toggle", data: { title: taskMeta?.title || id, taskType: taskMeta?.type || "other", completed, task_date: today } }); }
    return null;
  },

  getReligionHistory: async () => {
    const userId = await getUserId();
    const cacheKey = `religion_history_${userId}`;
    const cached = await localGet<any[]>(cacheKey, []);
    if (cached.length > 0) {
      getSessionUser().then(async user => {
        if (!user) return;
        const since = new Date(); since.setDate(since.getDate() - 30);
        const { data, error } = await supabase.from("religion_tasks").select("*").eq("user_id", user.id).gte("task_date", since.toISOString().split("T")[0]).order("task_date", { ascending: false });
        if (!error && data) await localSet(cacheKey, data);
      }).catch(() => {});
      return cached;
    }
    try {
      const user = await getSessionUser();
      if (user) {
        const since = new Date(); since.setDate(since.getDate() - 30);
        const { data, error } = await supabase.from("religion_tasks").select("*").eq("user_id", user.id).gte("task_date", since.toISOString().split("T")[0]).order("task_date", { ascending: false });
        if (!error && data) { await localSet(cacheKey, data); return data; }
      }
    } catch {}
    // Assembler depuis les caches locaux par jour
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const result: any[] = [];
      for (const key of allKeys.filter((k: string) => k.startsWith("religion_tasks_local_"))) {
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const dateStr = key.replace("religion_tasks_local_", "");
          JSON.parse(raw).forEach((t: any) => result.push({ ...t, task_date: t.task_date || dateStr }));
        }
      }
      result.sort((a, b) => (b.task_date || "").localeCompare(a.task_date || ""));
      return result;
    } catch {}
    return [];
  },

  getQuranProgress: async () => {
    const localKey = "religion_quran_local";
    const cached = await localGet<any>(localKey, null);
    if (cached) {
      getSessionUser().then(async user => {
        if (!user) return;
        const { data, error } = await supabase.from("quran_progress").select("*").eq("user_id", user.id).maybeSingle();
        if (!error && data) await localSet(localKey, data);
      }).catch(() => {});
      return cached;
    }
    try {
      const user = await getSessionUser();
      if (user) {
        const { data, error } = await supabase.from("quran_progress").select("*").eq("user_id", user.id).maybeSingle();
        if (!error && data) { await localSet(localKey, data); return data; }
      }
    } catch {}
    return null;
  },

  updateQuranProgress: async (pages: number, currentPage?: number) => {
    const localKey = "religion_quran_local";
    const existing = await localGet<any>(localKey, {});
    await localSet(localKey, { ...existing, pages_read: pages, progress: pages.toString(), current_page: currentPage ?? pages, updated_at: new Date().toISOString() });
    getSessionUser().then(async user => {
      if (!user) return;
      await supabase.from("quran_progress").upsert({ user_id: user.id, pages_read: pages, current_page: currentPage ?? pages, updated_at: new Date().toISOString() });
    }).catch(() => {});
  },
};

// ═══════════════════════════════════════════════════════════════
// STUDY SERVICE
// ═══════════════════════════════════════════════════════════════

export const studyService = {
  // ✅ Appelé par Studypage au mount
  getAllSessions: async () => {
    const userId = await getUserId();
    const days = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
    const result: Record<string, any[]> = {};
    for (const day of days) {
      const cached = await localGet<any[]>(`study_sessions_${userId}_${day}`, []);
      if (cached.length > 0) result[day] = cached;
    }
    // Refresh Supabase en arrière-plan
    getSessionUser().then(async user => {
      if (!user) return;
      const { data, error } = await supabase.from("study_sessions").select("*").eq("user_id", user.id);
      if (error || !data) return;
      const grouped: Record<string, any[]> = {};
      for (const row of data) {
        const d = row.day || row.day_of_week;
        if (!d) continue;
        if (!grouped[d]) grouped[d] = [];
        grouped[d] = row.sessions || [{ start: row.start_time, end: row.end_time, text: row.subject || "" }];
      }
      for (const [day, sessions] of Object.entries(grouped))
        await localSet(`study_sessions_${user.id}_${day}`, sessions);
    }).catch(() => {});
    return result;
  },

  // ✅ Appelé par Studypage au save
  saveDaySessions: async (day: string, sessions: any[]) => {
    const userId = await getUserId();
    await localSet(`study_sessions_${userId}_${day}`, sessions);
    try {
      const user = await getSessionUser();
      if (!user) return;
      // ✅ maybeSingle() — plus d'erreur si 0 rows
      const { data: existing } = await supabase.from("study_sessions").select("id").eq("user_id", user.id).eq("day", day).maybeSingle();
      if (existing?.id)
        await supabase.from("study_sessions").update({ sessions, updated_at: new Date().toISOString() }).eq("id", existing.id);
      else
        await supabase.from("study_sessions").insert({ user_id: user.id, day, sessions, updated_at: new Date().toISOString() });
    } catch {}
  },

  // Alias
  saveSessions: async (day: string, sessions: any[]) => studyService.saveDaySessions(day, sessions),

  getSessions: async (day: string) => {
    const userId = await getUserId();
    const cacheKey = `study_sessions_${userId}_${day}`;
    const cached = await localGet<any[]>(cacheKey, []);
    if (cached.length > 0) {
      getSessionUser().then(async user => {
        if (!user) return;
        const { data, error } = await supabase.from("study_sessions").select("*").eq("user_id", user.id).eq("day", day);
        if (!error && data) await localSet(cacheKey, data);
      }).catch(() => {});
      return cached;
    }
    try {
      const user = await getSessionUser();
      if (user) {
        const { data, error } = await supabase.from("study_sessions").select("*").eq("user_id", user.id).eq("day", day);
        if (!error && data) { await localSet(cacheKey, data); return data; }
      }
    } catch {}
    return [];
  },

  getCurrentNotes: async () => {
    const userId = await getUserId();
    const cacheKey = `study_notes_${userId}`;
    const cached = await localGet<any[]>(cacheKey, []);
    if (cached.length > 0) {
      getSessionUser().then(async user => {
        if (!user) return;
        const { data, error } = await supabase.from("study_notes").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        if (!error && data) await localSet(cacheKey, data);
      }).catch(() => {});
      return cached;
    }
    try {
      const user = await getSessionUser();
      if (user) {
        const { data, error } = await supabase.from("study_notes").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        if (!error && data) { await localSet(cacheKey, data); return data; }
      }
    } catch {}
    return [];
  },

  addNote: async (color: string) => {
    const userId = await getUserId();
    const cacheKey = `study_notes_${userId}`;
    const entry = { id: uid(), text: "", color, created_at: new Date().toISOString() };
    const notes = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, [...notes, entry]);
    try {
      const user = await getSessionUser();
      if (!user) return entry;
      const { data, error } = await supabase.from("study_notes").insert({ user_id: user.id, text: "", color, created_at: entry.created_at }).select().maybeSingle();
      if (!error && data) {
        const updated = await localGet<any[]>(cacheKey, []);
        await localSet(cacheKey, updated.map(n => n.id === entry.id ? data : n));
        return data;
      }
    } catch {}
    return entry;
  },

  updateNote: async (id: string, text: string) => {
    const userId = await getUserId();
    const cacheKey = `study_notes_${userId}`;
    const notes = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, notes.map(n => n.id === id ? { ...n, text } : n));
    if (id.startsWith("loc-")) return;
    try {
      const { error } = await supabase.from("study_notes").update({ text }).eq("id", id);
      if (error) await queuePending({ type: "study_note_update", data: { localId: id, text } });
    } catch { await queuePending({ type: "study_note_update", data: { localId: id, text } }); }
  },

  deleteNote: async (id: string) => {
    const userId = await getUserId();
    const cacheKey = `study_notes_${userId}`;
    const notes = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, notes.filter(n => n.id !== id));
    if (id.startsWith("loc-")) return;
    try {
      const { error } = await supabase.from("study_notes").delete().eq("id", id);
      if (error) await queuePending({ type: "study_note_delete", data: { localId: id } });
    } catch { await queuePending({ type: "study_note_delete", data: { localId: id } }); }
  },

  getTasks: async () => {
    const userId = await getUserId();
    const cacheKey = `study_tasks_${userId}`;
    const cached = await localGet<any[]>(cacheKey, []);
    if (cached.length > 0) {
      getSessionUser().then(async user => {
        if (!user) return;
        const { data, error } = await supabase.from("study_tasks").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        if (!error && data) await localSet(cacheKey, data);
      }).catch(() => {});
      return cached;
    }
    try {
      const user = await getSessionUser();
      if (user) {
        const { data, error } = await supabase.from("study_tasks").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        if (!error && data) { await localSet(cacheKey, data); return data; }
      }
    } catch {}
    return [];
  },

  addTask: async (title: string, subject: string, priority: string) => {
    const userId = await getUserId();
    const cacheKey = `study_tasks_${userId}`;
    const entry = { id: uid(), title, subject, priority, completed: false, created_at: new Date().toISOString() };
    const tasks = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, [entry, ...tasks]);
    try {
      const user = await getSessionUser();
      if (!user) return entry;
      const { data, error } = await supabase.from("study_tasks").insert({ user_id: user.id, title, subject, priority, completed: false, created_at: entry.created_at }).select().maybeSingle();
      if (!error && data) {
        const updated = await localGet<any[]>(cacheKey, []);
        await localSet(cacheKey, updated.map(t => t.id === entry.id ? data : t));
        return data;
      }
    } catch {}
    return entry;
  },

  toggleTask: async (id: string, completed: boolean) => {
    const userId = await getUserId();
    const cacheKey = `study_tasks_${userId}`;
    const tasks = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, tasks.map(t => t.id === id ? { ...t, completed } : t));
    if (id.startsWith("loc-")) return;
    try {
      const { error } = await supabase.from("study_tasks").update({ completed }).eq("id", id);
      if (error) await queuePending({ type: "study_toggle", data: { localId: id, completed } });
    } catch { await queuePending({ type: "study_toggle", data: { localId: id, completed } }); }
  },

  deleteTask: async (id: string) => {
    const userId = await getUserId();
    const cacheKey = `study_tasks_${userId}`;
    const tasks = await localGet<any[]>(cacheKey, []);
    await localSet(cacheKey, tasks.filter(t => t.id !== id));
    if (id.startsWith("loc-")) return;
    try {
      const { error } = await supabase.from("study_tasks").delete().eq("id", id);
      if (error) await queuePending({ type: "study_delete", data: { localId: id } });
    } catch { await queuePending({ type: "study_delete", data: { localId: id } }); }
  },
};
