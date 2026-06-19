import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") ?? "",
  "http://localhost:8080",
  "http://localhost:3000",
];

function corsHeaders(origin: string | null) {
  const allowed = ALLOWED_ORIGINS.includes(origin ?? "") ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed || "null",
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

    // 1. Verificar autenticação do caller
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAuthed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseAuthed.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Verificar se caller é admin
    const { data: isAdmin, error: roleErr } = await supabaseAdmin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });

    if (roleErr) {
      console.error("Role check error:", roleErr);
      return new Response(JSON.stringify({ error: "Erro ao validar permissão" }), {
        status: 500,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem deletar usuários" }), {
        status: 403,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email é obrigatório" }), {
        status: 400,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    // 3. Encontrar usuário por email
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      return new Response(JSON.stringify({ error: "Erro ao buscar usuários" }), {
        status: 500,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    const userToDelete = usersData.users.find(u => u.email?.toLowerCase() === email);

    if (!userToDelete) {
      return new Response(JSON.stringify({ error: "Usuário não encontrado" }), {
        status: 404,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    // 4. Impedir auto-deleção
    if (userToDelete.id === userData.user.id) {
      return new Response(JSON.stringify({ error: "Não é possível deletar o próprio usuário" }), {
        status: 400,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    console.log(`Admin ${userData.user.email} deleting user: ${email}`);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userToDelete.id);

    if (deleteError) {
      return new Response(JSON.stringify({ error: "Erro ao deletar usuário: " + deleteError.message }), {
        status: 500,
        headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    // 5. Audit log (non-blocking)
    supabaseAdmin.from("audit_logs").insert({
      actor_id: userData.user.id,
      action: "delete_user",
      target_id: userToDelete.id,
      details: { email, deleted_by: userData.user.email },
    }).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, message: `Usuário ${email} deletado com sucesso` }),
      { status: 200, headers: { ...hdrs, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("admin-delete-user error:", error);
    return new Response(JSON.stringify({ error: "Erro interno: " + (error as Error).message }), {
      status: 500,
      headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }
});
