-- ================================================================
-- MOODLIFE - SCHÉMA COMPLET SUPABASE
-- Copiez-collez tout dans le SQL Editor de Supabase et exécutez
-- ================================================================

-- ── 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  prenom TEXT,
  birthday TEXT,
  phone TEXT,
  instagram TEXT,
  avatar_url TEXT,
  bio TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. MOODS
CREATE TABLE IF NOT EXISTS public.moods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mood TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. BUDGETS
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_budget NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. BUDGET_ITEMS
CREATE TABLE IF NOT EXISTS public.budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. EXPENSES
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  expense_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. RELIGION_TASKS
CREATE TABLE IF NOT EXISTS public.religion_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'custom',
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  task_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 7. QURAN_PROGRESS
CREATE TABLE IF NOT EXISTS public.quran_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  progress TEXT DEFAULT '0',
  pages_read INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. GROCERY_ITEMS
CREATE TABLE IF NOT EXISTS public.grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  quantity TEXT,
  category TEXT DEFAULT 'Autre',
  done BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. STUDY_SESSIONS
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  subject TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 10. STUDY_NOTES
CREATE TABLE IF NOT EXISTS public.study_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT DEFAULT '',
  color TEXT DEFAULT '#FEF08A',
  is_current BOOLEAN DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- ROW LEVEL SECURITY (RLS) - Sécurité par utilisateur
-- ================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.religion_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quran_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;

-- Policies profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Policies moods
DROP POLICY IF EXISTS "moods_all" ON public.moods;
CREATE POLICY "moods_all" ON public.moods USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policies budgets
DROP POLICY IF EXISTS "budgets_all" ON public.budgets;
CREATE POLICY "budgets_all" ON public.budgets USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policies budget_items (via budget)
DROP POLICY IF EXISTS "budget_items_all" ON public.budget_items;
CREATE POLICY "budget_items_all" ON public.budget_items
  USING (budget_id IN (SELECT id FROM public.budgets WHERE user_id = auth.uid()))
  WITH CHECK (budget_id IN (SELECT id FROM public.budgets WHERE user_id = auth.uid()));

-- Policies expenses
DROP POLICY IF EXISTS "expenses_all" ON public.expenses;
CREATE POLICY "expenses_all" ON public.expenses USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policies religion_tasks
DROP POLICY IF EXISTS "religion_tasks_all" ON public.religion_tasks;
CREATE POLICY "religion_tasks_all" ON public.religion_tasks USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policies quran_progress
DROP POLICY IF EXISTS "quran_progress_all" ON public.quran_progress;
CREATE POLICY "quran_progress_all" ON public.quran_progress USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policies grocery_items
DROP POLICY IF EXISTS "grocery_items_all" ON public.grocery_items;
CREATE POLICY "grocery_items_all" ON public.grocery_items USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policies study_sessions
DROP POLICY IF EXISTS "study_sessions_all" ON public.study_sessions;
CREATE POLICY "study_sessions_all" ON public.study_sessions USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policies study_notes
DROP POLICY IF EXISTS "study_notes_all" ON public.study_notes;
CREATE POLICY "study_notes_all" ON public.study_notes USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- FONCTION: Auto-créer profile à l'inscription
-- ================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger inscription
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================================
-- FONCTION: Supprimer compte (Edge Function alternative)
-- ================================================================
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- STORAGE: Bucket avatars
-- ================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policy
DROP POLICY IF EXISTS "avatars_public" ON storage.objects;
DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;

CREATE POLICY "avatars_public" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ================================================================
-- INDEX pour performance
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_moods_user_id ON public.moods(user_id);
CREATE INDEX IF NOT EXISTS idx_moods_created_at ON public.moods(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_religion_tasks_user_date ON public.religion_tasks(user_id, task_date);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON public.expenses(user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_grocery_user ON public.grocery_items(user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_day ON public.study_sessions(user_id, day);
CREATE INDEX IF NOT EXISTS idx_study_notes_user ON public.study_notes(user_id);

-- ================================================================
-- ✅ TERMINÉ - Votre base de données est prête !
-- ================================================================
