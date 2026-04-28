import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
  Keyboard,
  StatusBar,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import Icon from "react-native-vector-icons/Ionicons";
import { profileService } from "./supabaseService";
import { launchImageLibrary } from "react-native-image-picker";
import { supabase } from "./supabaseClient";
import RNFS from "react-native-fs";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STATUS_BAR_HEIGHT =
  Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 44;

// ─── Clé locale pour l'avatar en base64 ──────────────────────
const AVATAR_LOCAL_KEY = "avatar_local_base64";

type FormType = {
  name: string;
  prenom: string;
  birthday: string;
  phone: string;
  instagram: string;
  avatar_url: string;
};

type Props = {
  navigation: any;
  route?: any;
  isNewUser?: boolean;
  onFinish?: () => void;
};

export default function EditProfile({ navigation, route, isNewUser: isNewUserProp = false, onFinish }: Props) {
  // يقرأ isNewUser من route.params أو من الـ prop مباشرة
  const isNewUser = route?.params?.isNewUser ?? isNewUserProp;
  const scrollRef = useRef<ScrollView | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const nameRef = useRef<TextInput | null>(null);
  const prenomRef = useRef<TextInput | null>(null);
  const phoneRef = useRef<TextInput | null>(null);
  const instaRef = useRef<TextInput | null>(null);

  const [form, setForm] = useState<FormType>({
    name: "",
    prenom: "",
    birthday: "",
    phone: "",
    instagram: "",
    avatar_url: "",
  });

  const [initialForm, setInitialForm] = useState<FormType | null>(null);
  const isChangedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showMsg, setShowMsg] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormType, string>>>({});
  // URI local de la photo choisie (avant upload)
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // ─── Bloquer le retour si modifications non sauvegardées ─────
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: any) => {
      if (!isChangedRef.current || isNewUser) return;
      e.preventDefault();
      Alert.alert(
        "⚠️ Modifications non sauvegardées",
        "Voulez-vous sauvegarder avant de quitter ?",
        [
          { text: "Annuler", style: "cancel" },
          { text: "Ignorer", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
          { text: "💾 Enregistrer", onPress: save },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, isNewUser]);

  const loadProfile = async () => {
    try {
      setInitialLoading(true);
      const data = await profileService.getProfile();

      // Récupérer l'avatar local base64 si disponible
      const localB64 = await AsyncStorage.getItem(AVATAR_LOCAL_KEY);

      const avatarToShow =
        localB64 ? `data:image/jpeg;base64,${localB64}` :
        data?.avatar_url || "";

      const newData: FormType = {
        name: data?.name || "",
        prenom: data?.prenom || "",
        birthday: data?.birthday || "",
        phone: data?.phone || "",
        instagram: data?.instagram || "",
        avatar_url: avatarToShow,
      };
      setForm(newData);
      setInitialForm(newData);
      if (data?.birthday) setDate(new Date(data.birthday));
    } catch {
      Alert.alert("Erreur", "Impossible de charger le profil");
    } finally {
      setInitialLoading(false);
    }
  };

  const isChanged = JSON.stringify(form) !== JSON.stringify(initialForm);
  isChangedRef.current = isChanged;

  const validateForm = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormType, string>> = {};
    // Pour un nouveau utilisateur, les champs nom/prénom sont optionnels (peut passer)
    if (!isNewUser) {
      if (!form.name.trim()) newErrors.name = "Le nom est obligatoire";
      if (!form.prenom.trim()) newErrors.prenom = "Le prénom est obligatoire";
    }
    if (form.phone && !/^[0-9+\s]{8,15}$/.test(form.phone))
      newErrors.phone = "Numéro invalide";
    if (
      form.instagram &&
      !/^[a-zA-Z0-9_.]{1,30}$/.test(form.instagram.replace("@", ""))
    ) {
      newErrors.instagram = "Instagram handle invalide";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, isNewUser]);

  // ─── Upload vers Supabase Storage ────────────────────────────
  const uploadAvatarToStorage = async (uri: string, base64: string): Promise<string> => {
    // ✅ FIX: getSession() lit AsyncStorage — jamais bloquant offline
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) throw new Error("Non authentifié");
    const fileExt = uri.split(".").pop()?.toLowerCase().replace("jpg", "jpeg") || "jpeg";
    const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, bytes.buffer, { contentType: `image/${fileExt}`, upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName);
    return publicUrl;
  };

  // ─── Choisir une photo ────────────────────────────────────────
  const pickAvatar = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: "photo",
        quality: 0.6,          // un peu compressé pour limiter la taille base64
        maxWidth: 600,
        maxHeight: 600,
        includeBase64: true,   // ← on demande le base64 directement
      });

      if (result.didCancel || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const uri = asset.uri || "";
      const base64 = asset.base64 || "";

      Animated.spring(scaleAnim, { toValue: 0.9, useNativeDriver: true }).start();

      // 1. Afficher immédiatement en local
      const localDataUri = `data:image/jpeg;base64,${base64}`;
      setLocalAvatarUri(uri);
      setForm((prev) => ({ ...prev, avatar_url: localDataUri }));

      // 2. Sauvegarder en base64 dans AsyncStorage (disponible offline)
      if (base64) {
        await AsyncStorage.setItem(AVATAR_LOCAL_KEY, base64);
      }

      // 3. Essayer d'uploader vers Supabase (si online)
      try {
        const b64 = base64 || await RNFS.readFile(uri, "base64");
        const publicUrl = await uploadAvatarToStorage(uri, b64);
        // Upload réussi → utiliser l'URL Supabase + nettoyer le local
        setForm((prev) => ({ ...prev, avatar_url: publicUrl }));
        await AsyncStorage.removeItem(AVATAR_LOCAL_KEY);
        Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }).start();
      } catch {
        // Upload échoué (offline) → garder le base64 local, pas de message intrusif
        Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }).start();
      }
    } catch {
      Alert.alert("Erreur", "Impossible d'accéder à la galerie");
    }
  };

  const removeAvatar = () => {
    Alert.alert("Supprimer la photo ?", "", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          setForm((prev) => ({ ...prev, avatar_url: "" }));
          setLocalAvatarUri(null);
          await AsyncStorage.removeItem(AVATAR_LOCAL_KEY);
        },
      },
    ]);
  };

  // ─── Sauvegarder le profil ────────────────────────────────────
  const save = async () => {
    if (!validateForm()) return;
    try {
      setLoading(true);

      // Si la photo est encore en base64 local (pas encore uploadée), réessayer l'upload
      let finalForm = { ...form };
      if (form.avatar_url.startsWith("data:image/")) {
        const base64 = await AsyncStorage.getItem(AVATAR_LOCAL_KEY);
        if (base64 && localAvatarUri) {
          try {
            const publicUrl = await uploadAvatarToStorage(localAvatarUri, base64);
            finalForm.avatar_url = publicUrl;
            await AsyncStorage.removeItem(AVATAR_LOCAL_KEY);
            setForm((prev) => ({ ...prev, avatar_url: publicUrl }));
          } catch {
            // Toujours offline → garder le base64, ça s'affichera localement
          }
        }
      }

      await profileService.updateProfile(finalForm);
      setInitialForm(finalForm);
      setShowMsg(true);
      timeoutRef.current = setTimeout(() => setShowMsg(false), 2500);

      if (isNewUser) {
        if (onFinish) onFinish();
        else navigation.replace("Home");
      } else {
        navigation.goBack();
      }
    } catch {
      Alert.alert("Erreur", "Impossible de sauvegarder le profil");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (isChanged) {
      Alert.alert(
        "Modifications non sauvegardées",
        "Voulez-vous sauvegarder avant de quitter ?",
        [
          { text: "Annuler", style: "cancel" },
          { text: "Ignorer", style: "destructive", onPress: () => navigation.goBack() },
          { text: "Enregistrer", onPress: save },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const scrollToInput = (yPosition: number) => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: yPosition, animated: true }), 300);
  };

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: "#F3E8FF" }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* HEADER */}
          <View style={styles.header}>
            {!isNewUser && (
              <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                <Icon name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
            )}
            {isNewUser && (
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => {
                  if (onFinish) onFinish();
                  else navigation.replace("Home");
                }}
              >
                <Text style={styles.skipText}>Passer</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.headerTitle}>
              {isNewUser ? "Complète ton profil 👋" : "Modifier profil"}
            </Text>
          </View>

          {/* AVATAR */}
          <Animated.View style={[styles.avatarWrapper, { transform: [{ scale: scaleAnim }] }]}>
            <TouchableOpacity
              style={styles.avatar}
              onPress={pickAvatar}
              onLongPress={form.avatar_url ? removeAvatar : undefined}
            >
              {form.avatar_url ? (
                <Image
                  source={{ uri: form.avatar_url }}
                  style={styles.avatarImg}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Icon name="camera" size={32} color="#fff" />
                  <Text style={styles.avatarText}>Ajouter photo</Text>
                </View>
              )}
              <View style={styles.editBadge}>
                <Icon name="pencil" size={14} color="#7C3AED" />
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Nom sous l'avatar */}
          <Text style={styles.namePreview}>
            {form.prenom || form.name
              ? `${form.prenom} ${form.name}`.trim()
              : "Votre nom"}
          </Text>

          {/* FORM CARD */}
          <View style={styles.card}>
            {renderField("person-outline", "Nom *", "name", nameRef, prenomRef, true)}
            {renderField("happy-outline", "Prénom *", "prenom", prenomRef, phoneRef, true)}
            {renderField("call-outline", "Téléphone", "phone", phoneRef, instaRef, false, "phone-pad")}

            {/* Birthday picker */}
            <View style={styles.itemRow}>
              <Icon name="calendar-outline" size={20} color={errors.birthday ? "#EF4444" : "#7C3AED"} />
              <View style={styles.flex1}>
                <Text style={styles.fieldLabel}>Date de naissance</Text>
                <TouchableOpacity
                  onPress={() => setShowPicker(true)}
                  style={styles.inputField}
                >
                  <Text style={form.birthday ? styles.fieldValue : styles.placeholderText}>
                    {form.birthday || "Choisir une date"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {showPicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={new Date()}
                minimumDate={new Date(1900, 0, 1)}
                onChange={(e, d) => {
                  if (e.type === "dismissed" || !d) { setShowPicker(false); return; }
                  setShowPicker(false);
                  setDate(d);
                  const f =
                    d.getFullYear() +
                    "-" + String(d.getMonth() + 1).padStart(2, "0") +
                    "-" + String(d.getDate()).padStart(2, "0");
                  setForm((prev) => ({ ...prev, birthday: f }));
                }}
              />
            )}

            {renderField("logo-instagram", "Instagram", "instagram", instaRef, null, false, "default", "@username")}
          </View>

          {/* SAVE BUTTON */}
          <TouchableOpacity
            style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
            onPress={save}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon name={isNewUser ? "rocket-outline" : "checkmark-circle-outline"} size={20} color="#fff" />
                <Text style={styles.saveBtnText}>
                  {isNewUser ? "Commencer →" : "Enregistrer les modifications"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Toast */}
      {showMsg && (
        <View style={styles.toast}>
          <Icon name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.toastText}>Profil enregistré !</Text>
        </View>
      )}
    </SafeAreaView>
  );

  function renderField(
    icon: string,
    label: string,
    key: keyof FormType,
    ref: any,
    nextRef: any,
    required = false,
    keyboardType = "default",
    placeholder?: string
  ) {
    const isError = errors[key];
    return (
      <View style={styles.itemRow} key={key}>
        <Icon name={icon} size={20} color={isError ? "#EF4444" : "#7C3AED"} />
        <View style={styles.flex1}>
          <Text
            style={[
              styles.fieldLabel,
              isError && styles.fieldLabelError,
              required && styles.fieldLabelRequired,
            ]}
          >
            {label}
          </Text>
          <TextInput
            ref={ref}
            style={[styles.inputFieldEditable, isError && styles.inputFieldError]}
            value={form[key]}
            placeholder={placeholder || label}
            placeholderTextColor="#9CA3AF"
            returnKeyType={nextRef ? "next" : "done"}
            keyboardType={keyboardType as any}
            autoCapitalize={key === "instagram" ? "none" : "words"}
            onSubmitEditing={() =>
              nextRef?.current ? nextRef.current.focus() : Keyboard.dismiss()
            }
            onFocus={() =>
              scrollToInput(
                { name: 0, prenom: 80, phone: 160, birthday: 240, instagram: 320 }[key] || 0
              )
            }
            onChangeText={(text) => {
              setForm((prev) => ({ ...prev, [key]: text }));
              if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
            }}
          />
          {isError && <Text style={styles.errorText}>{isError}</Text>}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F3E8FF" },
  loadingContainer: {
    flex: 1, justifyContent: "center", alignItems: "center",
    backgroundColor: "#F3E8FF", gap: 16,
  },
  loadingText: { color: "#7C3AED", fontSize: 16, fontWeight: "500" },
  scrollContent: { paddingBottom: 40 },

  header: {
    paddingTop: STATUS_BAR_HEIGHT + 12,
    paddingBottom: 60,
    backgroundColor: "#7C3AED",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 65,
  },
  backBtn: {
    position: "absolute", left: 20, bottom: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 50, width: 42, height: 42,
    justifyContent: "center", alignItems: "center",
  },
  skipBtn: {
    position: "absolute", right: 20, bottom: 16,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 20,
  },
  skipText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "600" },

  avatarWrapper: { alignSelf: "center", marginTop: -65, zIndex: 10 },
  avatar: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: "#7C3AED",
    justifyContent: "center", alignItems: "center",
    borderWidth: 4, borderColor: "#fff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
  },
  avatarImg: { width: 110, height: 110, borderRadius: 55 },
  avatarPlaceholder: { justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontSize: 11, marginTop: 4, fontWeight: "600" },
  editBadge: {
    position: "absolute", bottom: 2, right: 2,
    backgroundColor: "#fff", borderRadius: 15,
    width: 30, height: 30,
    justifyContent: "center", alignItems: "center",
    borderWidth: 2, borderColor: "#7C3AED",
  },

  namePreview: {
    textAlign: "center", fontSize: 20, fontWeight: "700",
    color: "#1F2937", marginTop: 12, marginBottom: 4,
  },

  card: {
    marginHorizontal: 20, marginTop: 20,
    backgroundColor: "#fff", borderRadius: 20,
    paddingVertical: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6", gap: 12,
  },
  flex1: { flex: 1 },
  fieldLabel: { fontSize: 12, color: "#6B7280", fontWeight: "500", marginBottom: 4 },
  fieldLabelRequired: { color: "#7C3AED", fontWeight: "600" },
  fieldLabelError: { color: "#EF4444" },
  fieldValue: { fontSize: 15, color: "#111827", fontWeight: "500" },
  placeholderText: { fontSize: 15, color: "#9CA3AF" },
  errorText: { color: "#EF4444", fontSize: 12, marginTop: 4 },
  inputField: { paddingVertical: 6, paddingHorizontal: 0 },
  inputFieldEditable: {
    fontSize: 15, color: "#111827", fontWeight: "500",
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: "#F9FAFB", borderRadius: 10,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
  inputFieldError: { borderColor: "#EF4444", backgroundColor: "#FEF2F2" },

  saveBtn: {
    marginHorizontal: 20, marginTop: 24,
    backgroundColor: "#7C3AED", padding: 16,
    borderRadius: 30, alignItems: "center",
    flexDirection: "row", justifyContent: "center", gap: 10,
    shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  toast: {
    position: "absolute", bottom: 50, alignSelf: "center",
    backgroundColor: "#22C55E",
    paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 30, flexDirection: "row",
    alignItems: "center", gap: 8, elevation: 10,
  },
  toastText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
});
