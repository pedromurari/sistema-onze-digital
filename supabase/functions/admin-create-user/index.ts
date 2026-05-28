import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Restringe CORS a origens conhecidas â€” nunca * em endpoints admin
const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") ?? "",
  "http://localhost:8080",
  "http://localhost:3000",
];

function corsHeaders(origin: string | null) {
  const allowed = ALLOWED_ORIGINS.includes(origin ?? "") ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const hdrs = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: hdrs });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticated client (uses caller JWT)
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAuthed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseAuthed.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "NÃ£o autenticado" }), {
        status: 401,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    // Admin client (service role)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Permission check: caller must be admin
    const { data: isAdmin, error: roleCheckError } = await supabaseAdmin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });

    if (roleCheckError) {
      console.error("Role check error:", roleCheckError);
      return new Response(JSON.stringify({ error: "Erro ao validar permissÃ£o" }), {
        status: 500,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar usuÃ¡rios" }), {
        status: 403,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const nome = String(body?.nome ?? "").trim();
    const tipo = (body?.tipo === "admin" ? "admin" : "vendedor") as "admin" | "vendedor";
    const cor = String(body?.cor ?? "#A93356");

    if (!email || !password || !nome) {
      return new Response(JSON.stringify({ error: "Email, senha e nome sÃ£o obrigatÃ³rios" }), {
        status: 400,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "A senha precisa ter pelo menos 6 caracteres" }), {
        status: 400,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    console.log(`Admin creating user: ${email} (${tipo})`);

    // Create auth user with confirmed email so they can login immediately
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !created?.user) {
      console.error("Auth create error:", createErr);
      // Check for duplicate email error
      if (createErr?.code === "email_exists") {
        return new Response(JSON.stringify({ error: "Este email jÃ¡ estÃ¡ cadastrado no sistema" }), {
          status: 400,
          headers: { ...hdrs, "Content-Type": "application/json" },
        });
      }
      const msg = createErr?.message ?? "Erro ao criar usuÃ¡rio";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    const newUserId = created.user.id;

    // Create profile
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUserId,
      nome,
      email,
      cor,
      ativo: true,
    });

    if (profileError) {
      console.error("Profile insert error:", profileError);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: "Erro ao criar perfil: " + profileError.message }), {
        status: 500,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    // Create role
    const { error: roleInsertError } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUserId,
      role: tipo,
    });

    if (roleInsertError) {
      console.error("Role insert error:", roleInsertError);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: "Erro ao definir permissÃ£o: " + roleInsertError.message }), {
        status: 500,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUserId,
          email,
          nome,
          tipo,
          cor,
          ativo: true,
        },
      }),
      { status: 200, headers: { ...hdrs, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("admin-create-user error:", error);
    return new Response(JSON.stringify({ error: "Erro interno: " + (error as Error).message }), {
      status: 500,
      headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }
});
