// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase.from("profiles").delete().eq("id", user_id);
    await supabase.auth.admin.deleteUser(user_id);

    return new Response(JSON.stringify({ success: true }));
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Error" }),
      { status: 500 }
    );
  }
});