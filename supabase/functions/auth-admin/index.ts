import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );

  try {
    const body = await req.json();
    const { action, ...payload } = body;

    // ─── LIST ALL USERS FROM usuarios_farmacia (bypass RLS via service_role) ───
    if (action === "list-users") {
      console.log("[auth-admin] list-users: fetching all users from usuarios_farmacia");

      try {
        const { data: rows, error: dbError } = await supabaseAdmin
          .from("usuarios_farmacia")
          .select("*")
          .order("nombre");

        if (dbError) {
          console.error("[auth-admin] list-users DB error:", dbError.message);
          return new Response(
            JSON.stringify({ success: false, error: dbError.message }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const users = (rows || []).map((row: any) => ({
          id: row.id,
          nombre: row.nombre || "",
          email: row.email || "",
          rol: row.rol || "cajero",
          username: row.username || null,
          password_hash: row.password_hash || null,
          codigo_acceso: row.codigo_acceso || null,
          sucursal_id: row.sucursal_id || null,
          activo: row.activo !== false,
          avatar_url: row.avatar_url || null,
          codigo_cajero: row.codigo_cajero || null,
          created_at: row.created_at || null,
        }));

        console.log("[auth-admin] list-users: returned", users.length, "users");
        return new Response(
          JSON.stringify({ success: true, users }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (innerErr: any) {
        console.error("[auth-admin] list-users internal error:", innerErr.message);
        return new Response(
          JSON.stringify({ success: false, error: innerErr.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── CREATE USER ───
    if (action === "create-user") {
      const { email, password, nombre, rol } = payload;
      if (!email || !password) throw new Error("email and password are required");

      console.log("[auth-admin] create-user request:", { email, nombre, rol });

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre, rol },
      });

      if (createError) {
        console.error("[auth-admin] createUser error:", createError.message);
        
        if (createError.message?.includes("already been registered") || createError.message?.includes("already exists")) {
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
          const existing = (users || []).find(
            (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
          );
          if (existing) {
            await supabaseAdmin.auth.admin.updateUserById(existing.id, {
              password,
              email_confirm: true,
            }).catch(() => {});
            console.log("[auth-admin] Existing user updated:", existing.id);
            return new Response(
              JSON.stringify({ success: true, user_id: existing.id, email, already_exists: true }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        
        throw new Error(`createUser: ${createError.message}`);
      }

      console.log(`[auth-admin] User created: ${email} (${newUser.user.id})`);
      return new Response(
        JSON.stringify({ success: true, user_id: newUser.user.id, email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ENSURE USER EXISTS + RETURN USER_ID (for fallback auth when signInWithPassword has DB issues) ───
    if (action === "ensure-user") {
      const { email, password, nombre, rol } = payload;
      if (!email || !password) throw new Error("email and password are required");

      console.log("[auth-admin] ensure-user:", { email, nombre, rol });

      try {
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw new Error(`listUsers: ${listError.message}`);

        const target = (users || []).find(
          (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
        );

        let userId: string;
        let wasCreated = false;

        if (target) {
          userId = target.id;
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            email,
            password,
            email_confirm: true,
            user_metadata: { nombre, rol },
          }).catch((e: any) => console.warn("[auth-admin] ensure-user updateUserById:", e.message));
          console.log(`[auth-admin] ensure-user: existing user updated ${email} (${userId})`);
        } else {
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { nombre, rol },
          });

          if (createError) {
            console.error("[auth-admin] ensure-user createUser error:", createError.message);
            return new Response(
              JSON.stringify({ success: false, error: createError.message }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          userId = newUser.user.id;
          wasCreated = true;
          console.log(`[auth-admin] ensure-user: new user created ${email} (${userId})`);
        }

        await supabaseAdmin
          .from("usuarios_farmacia")
          .upsert({
            id: userId,
            nombre: nombre || email.split("@")[0],
            email,
            rol: rol || "cajero",
            activo: true,
          }, { onConflict: "id" })
          .catch((e: any) => console.warn("[auth-admin] ensure-user usuarios_farmacia sync:", e.message));

        return new Response(
          JSON.stringify({ success: true, user_id: userId, email, was_created: wasCreated }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (innerErr: any) {
        console.error("[auth-admin] ensure-user internal error:", innerErr.message);
        return new Response(
          JSON.stringify({ success: false, error: innerErr.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── LOOKUP USER IN usuarios_farmacia (fallback when Auth is broken) ───
    if (action === "lookup-user") {
      const { email } = payload;
      if (!email) throw new Error("email is required");

      console.log("[auth-admin] lookup-user:", { email });

      try {
        const { data: row, error: dbError } = await supabaseAdmin
          .from("usuarios_farmacia")
          .select("id, nombre, email, rol, activo")
          .eq("email", email)
          .maybeSingle();

        if (dbError) {
          console.error("[auth-admin] lookup-user DB error:", dbError.message);
          return new Response(
            JSON.stringify({ success: false, error: dbError.message }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!row) {
          console.log("[auth-admin] lookup-user: user not found for", email);
          return new Response(
            JSON.stringify({ success: false, reason: "not_found", email }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log("[auth-admin] lookup-user: found", row.id, row.nombre);
        return new Response(
          JSON.stringify({ success: true, user_id: row.id, nombre: row.nombre, email: row.email, rol: row.rol, activo: row.activo }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (innerErr: any) {
        console.error("[auth-admin] lookup-user internal error:", innerErr.message);
        return new Response(
          JSON.stringify({ success: false, error: innerErr.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── SYNC USER INTO usuarios_farmacia (bypass RLS via service_role) ───
    if (action === "sync-user-db") {
      const { user_id, nombre, email, rol, username, password_hash, codigo_acceso, sucursal_id, activo, avatar_url, codigo_cajero } = payload;
      if (!user_id || !nombre || !email || !rol) throw new Error("user_id, nombre, email, rol are required");

      console.log("[auth-admin] sync-user-db:", { user_id, email, rol });

      const { error: upsertError } = await supabaseAdmin
        .from("usuarios_farmacia")
        .upsert({
          id: user_id,
          nombre,
          email,
          rol,
          username: username || null,
          password_hash: password_hash || null,
          codigo_acceso: codigo_acceso || null,
          sucursal_id: sucursal_id || null,
          activo: activo !== undefined ? activo : true,
          avatar_url: avatar_url || null,
          codigo_cajero: codigo_cajero || null,
        }, { onConflict: "id" });

      if (upsertError) {
        console.error("[auth-admin] sync-user-db error:", upsertError.message);
        return new Response(
          JSON.stringify({ success: false, error: upsertError.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[auth-admin] User synced to usuarios_farmacia: ${email} (${user_id})`);

      await supabaseAdmin.auth.admin.updateUserById(user_id, {
        user_metadata: { nombre, rol },
      }).catch(() => {});

      return new Response(
        JSON.stringify({ success: true, user_id, email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── UPDATE USER IN usuarios_farmacia (bypass RLS via service_role) ───
    if (action === "update-user-db") {
      const { user_id, ...updates } = payload;
      if (!user_id) throw new Error("user_id is required");

      console.log("[auth-admin] update-user-db:", { user_id, updates: Object.keys(updates) });

      const dbUpdates: Record<string, unknown> = {};
      if (updates.nombre !== undefined) dbUpdates.nombre = updates.nombre;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.rol !== undefined) dbUpdates.rol = updates.rol;
      if (updates.username !== undefined) dbUpdates.username = updates.username;
      if (updates.password_hash !== undefined) dbUpdates.password_hash = updates.password_hash;
      if (updates.codigo_acceso !== undefined) dbUpdates.codigo_acceso = updates.codigo_acceso;
      if (updates.sucursal_id !== undefined) dbUpdates.sucursal_id = updates.sucursal_id;
      if (updates.activo !== undefined) dbUpdates.activo = updates.activo;
      if (updates.avatar_url !== undefined) dbUpdates.avatar_url = updates.avatar_url;
      if (updates.codigo_cajero !== undefined) dbUpdates.codigo_cajero = updates.codigo_cajero;

      const { error: updateError } = await supabaseAdmin
        .from("usuarios_farmacia")
        .update(dbUpdates)
        .eq("id", user_id);

      if (updateError) {
        console.error("[auth-admin] update-user-db error:", updateError.message);
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[auth-admin] User updated in usuarios_farmacia: ${user_id}`);
      return new Response(
        JSON.stringify({ success: true, user_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CONFIRM USER EMAIL ───
    if (action === "confirm") {
      const { email } = payload;
      if (!email) throw new Error("email is required");

      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw new Error(`listUsers: ${listError.message}`);

      const target = (users || []).find(
        (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!target) {
        return new Response(
          JSON.stringify({ success: false, reason: "user_not_found", email }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (target.email_confirmed_at) {
        console.log(`[auth-admin] User ${email} already confirmed at ${target.email_confirmed_at}`);
        return new Response(
          JSON.stringify({ success: true, already_confirmed: true, user_id: target.id, email }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        target.id,
        { email_confirm: true }
      );

      if (updateError) throw new Error(`confirmUser: ${updateError.message}`);

      console.log(`[auth-admin] User ${email} (${target.id}) confirmed successfully`);
      return new Response(
        JSON.stringify({ success: true, user_id: target.id, email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── RESET PASSWORD + CONFIRM EMAIL ───
    if (action === "reset-password") {
      const { email, password } = payload;
      if (!email || !password) throw new Error("email and password are required");

      console.log("[auth-admin] reset-password request:", { email });

      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw new Error(`listUsers: ${listError.message}`);

      const target = (users || []).find(
        (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!target) {
        return new Response(
          JSON.stringify({ success: false, reason: "user_not_found", email }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        target.id,
        { password, email_confirm: true }
      );

      if (updateError) throw new Error(`resetPassword: ${updateError.message}`);

      console.log(`[auth-admin] Password reset + confirmed for ${email} (${target.id})`);
      return new Response(
        JSON.stringify({ success: true, user_id: target.id, email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── DELETE USER ───
    if (action === "delete-user") {
      const { email } = payload;
      if (!email) throw new Error("email is required");

      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw new Error(`listUsers: ${listError.message}`);

      const target = (users || []).find(
        (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!target) {
        return new Response(
          JSON.stringify({ success: false, reason: "user_not_found", email }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(target.id);
      if (deleteError) throw new Error(`deleteUser: ${deleteError.message}`);

      console.log(`[auth-admin] User deleted: ${email} (${target.id})`);
      return new Response(
        JSON.stringify({ success: true, user_id: target.id, email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CHECK USER STATUS ───
    if (action === "status") {
      const { email } = payload;
      if (!email) throw new Error("email is required");

      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw new Error(`listUsers: ${listError.message}`);

      const target = (users || []).find(
        (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!target) {
        return new Response(
          JSON.stringify({ exists: false, email }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          exists: true,
          id: target.id,
          email: target.email,
          confirmed: !!target.email_confirmed_at,
          last_sign_in: target.last_sign_in_at || null,
          created_at: target.created_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use: list-users, create-user, ensure-user, lookup-user, sync-user-db, update-user-db, confirm, reset-password, delete-user, status" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[auth-admin] Error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
