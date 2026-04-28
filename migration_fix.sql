-- ================================================================
-- MIGRATION: Corriger la table study_sessions
-- Exécutez ce SQL dans Supabase SQL Editor
-- ================================================================

-- ── Ajouter la colonne "sessions" (jsonb) si elle n'existe pas
ALTER TABLE public.study_sessions
  ADD COLUMN IF NOT EXISTS sessions JSONB DEFAULT '[]'::jsonb;

-- ── Ajouter colonne updated_at si elle n'existe pas
ALTER TABLE public.study_sessions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ── Migrer les anciennes données (rows séparées → jsonb)
-- Regrouper les anciennes rows par user_id + day et les convertir en jsonb
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id, day
    FROM public.study_sessions
    WHERE sessions IS NULL OR sessions = '[]'::jsonb
  LOOP
    UPDATE public.study_sessions
    SET sessions = (
      SELECT jsonb_agg(
        jsonb_build_object(
          'start', start_time,
          'end', end_time,
          'text', COALESCE(subject, '')
        )
        ORDER BY start_time
      )
      FROM public.study_sessions sub
      WHERE sub.user_id = r.user_id AND sub.day = r.day
    )
    WHERE user_id = r.user_id AND day = r.day
      AND id = (
        SELECT id FROM public.study_sessions
        WHERE user_id = r.user_id AND day = r.day
        ORDER BY created_at ASC
        LIMIT 1
      );
  END LOOP;
END;
$$;

-- ── Supprimer les doublons (garder seulement une row par user_id+day)
DELETE FROM public.study_sessions
WHERE id NOT IN (
  SELECT MIN(id)
  FROM public.study_sessions
  GROUP BY user_id, day
);

-- ── Ajouter une contrainte UNIQUE sur (user_id, day)
ALTER TABLE public.study_sessions
  DROP CONSTRAINT IF EXISTS study_sessions_user_day_unique;
ALTER TABLE public.study_sessions
  ADD CONSTRAINT study_sessions_user_day_unique UNIQUE (user_id, day);

-- ── Corriger la table religion_tasks: s'assurer que task_date n'est pas null
UPDATE public.religion_tasks
SET task_date = created_at::date
WHERE task_date IS NULL;

-- ✅ Migration terminée !
