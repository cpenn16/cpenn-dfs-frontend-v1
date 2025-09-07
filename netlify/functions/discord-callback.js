// /.netlify/functions/discord-callback
// Node 18+ global fetch
const { createClient } = require("@supabase/supabase-js");

const CLIENT_ID      = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET  = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI   = process.env.DISCORD_REDIRECT_URI;
const SB_URL         = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Optional bot/roles
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID  = process.env.GUILD_ID;
const ROLE_MAP = {
  free:  process.env.ROLE_ID_DISCORD_ONLY,
  basic: process.env.ROLE_ID_ALL_ACCESS_LITE,
  pro:   process.env.ROLE_ID_ALL_ACCESS_PRO,
  NFL_LITE:  process.env.ROLE_ID_NFL_LITE,
  NFL_PRO:   process.env.ROLE_ID_NFL_PRO,
  MLB_LITE:  process.env.ROLE_ID_MLB_LITE,
  MLB_PRO:   process.env.ROLE_ID_MLB_PRO,
  NBA_LITE:  process.env.ROLE_ID_NBA_LITE,
  NBA_PRO:   process.env.ROLE_ID_NBA_PRO,
  NASCAR_LITE: process.env.ROLE_ID_NASCAR_LITE,
  NASCAR_PRO:  process.env.ROLE_ID_NASCAR_PRO,
};

// tiny cookie reader (optional CSRF check)
function getCookie(header, name) {
  const raw = header || "";
  const parts = raw.split(/; */).map(s => s.split("="));
  return parts.find(([k]) => k === name)?.[1];
}

exports.handler = async (event) => {
  const debug = new URLSearchParams(event.rawQuery || "").get("debug") === "1";
  const dbg = {}; // will return if debug=1

  try {
    // --- sanity checks ---
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return resp(500, "Missing Discord env vars", debug, dbg);
    }
    if (!SB_URL || !SB_SERVICE_KEY) {
      return resp(500, "Missing Supabase env vars", debug, dbg);
    }

    const qs = new URLSearchParams(event.rawQuery || "");
    const code = qs.get("code");
    const stateB64 = qs.get("state");
    dbg.qs = Object.fromEntries(qs.entries());
    if (!code || !stateB64) return resp(400, "Missing code/state", debug, dbg);

    // Optional CSRF check
    const cookieState = getCookie(event.headers?.cookie, "discord_oauth_state");
    dbg.cookieState = cookieState;
    if (cookieState && cookieState !== stateB64) {
      return resp(400, "State mismatch", debug, dbg);
    }

    // Decode state => { uid, t }
    let uid;
    try {
      const parsed = JSON.parse(Buffer.from(stateB64, "base64url").toString("utf8"));
      uid = parsed?.uid;
      dbg.stateParsed = parsed;
    } catch (e) {
      dbg.stateDecodeError = e?.message;
      return resp(400, "Bad state", debug, dbg);
    }
    if (!uid) return resp(400, "No UID in state", debug, dbg);

    // Exchange code → token
    const form = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI
    });

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });
    const tokenText = await tokenRes.text();
    dbg.tokenStatus = tokenRes.status;
    dbg.tokenRaw = maybeTrim(tokenText);
    if (!tokenRes.ok) {
      return resp(500, `Token error`, debug, dbg);
    }
    const tok = safeJson(tokenText);
    dbg.token = { scope: tok?.scope, expires_in: tok?.expires_in, token_type: tok?.token_type };

    // Get Discord user
    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tok.access_token}` }
    });
    const meText = await meRes.text();
    dbg.meStatus = meRes.status;
    dbg.meRaw = maybeTrim(meText);
    if (!meRes.ok) return resp(500, "Failed to fetch Discord user", debug, dbg);
    const me = safeJson(meText);
    dbg.me = { id: me?.id, username: me?.username, global_name: me?.global_name };

    // Update profiles
    const sb = createClient(SB_URL, SB_SERVICE_KEY);
    const { data: updated, error: upErr } = await sb
      .from("profiles")
      .update({
        discord_id: me.id,
        discord_username: me.username,
        discord_connected_at: new Date().toISOString()
      })
      .eq("id", uid)
      .select("id, email, plan, discord_id, discord_username, discord_connected_at")
      .single();

    dbg.updateError = upErr?.message || null;
    dbg.updated = updated || null;
    if (upErr) {
      return resp(500, `Profile update error`, debug, dbg);
    }
    if (!updated) {
      return resp(404, "Profile not found for UID", debug, { ...dbg, uid });
    }

    // Optional: auto-join guild + assign role by plan
    if (BOT_TOKEN && GUILD_ID) {
      const plan = updated?.plan || "free";
      const roleId = ROLE_MAP[plan];
      dbg.rolePlan = plan;
      dbg.rolePicked = roleId || null;

      // ensure member exists (OAuth join)
      const joinRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${me.id}`, {
        method: "PUT",
        headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: tok.access_token })
      });
      dbg.joinStatus = joinRes.status;

      if (roleId) {
        const roleRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${me.id}/roles/${roleId}`, {
          method: "PUT",
          headers: { Authorization: `Bot ${BOT_TOKEN}` }
        });
        dbg.roleStatus = roleRes.status;
      }
    }

    if (debug) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, dbg }, null, 2),
      };
    }

    // Success → back to account
    return {
      statusCode: 302,
      headers: { Location: "https://www.cpenn-dfs.com/account?discord=linked" }
    };
  } catch (e) {
    return resp(500, `callback error: ${e.message}`, debug, dbg);
  }
};

// helpers
function resp(code, msg, debug, dbg) {
  console.log(`[discord-callback] ${msg}`, dbg);
  if (debug) {
    return {
      statusCode: code,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, message: msg, dbg }, null, 2),
    };
  }
  return { statusCode: code, body: msg };
}
function safeJson(txt) {
  try { return JSON.parse(txt); } catch { return null; }
}
function maybeTrim(s, max = 400) {
  if (!s) return s;
  return s.length > max ? s.slice(0, max) + " …(trimmed)" : s;
}
