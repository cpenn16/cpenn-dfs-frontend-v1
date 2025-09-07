// /.netlify/functions/discord-callback
// Use global fetch (Node 18+) — no node-fetch import needed
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

function getCookie(header, name) {
  const raw = header || "";
  const parts = raw.split(/; */).map(s => s.split("="));
  return parts.find(([k]) => k === name)?.[1];
}

exports.handler = async (event) => {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return { statusCode: 500, body: "Missing Discord env vars" };
    }
    if (!SB_URL || !SB_SERVICE_KEY) {
      return { statusCode: 500, body: "Missing Supabase env vars" };
    }

    const qs = new URLSearchParams(event.rawQuery || "");
    const code = qs.get("code");
    const stateB64 = qs.get("state");
    if (!code || !stateB64) return { statusCode: 400, body: "Missing code/state" };

    const cookieState = getCookie(event.headers?.cookie, "discord_oauth_state");
    if (cookieState && cookieState !== stateB64) {
      return { statusCode: 400, body: "State mismatch" };
    }

    let uid;
    try {
      const parsed = JSON.parse(Buffer.from(stateB64, "base64url").toString("utf8"));
      uid = parsed.uid;
    } catch {
      return { statusCode: 400, body: "Bad state" };
    }

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
    if (!tokenRes.ok) {
      return { statusCode: 500, body: `Token error: ${await tokenRes.text()}` };
    }
    const tok = await tokenRes.json();

    // Get Discord user
    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tok.access_token}` }
    });
    if (!meRes.ok) return { statusCode: 500, body: "Failed to fetch Discord user" };
    const me = await meRes.json();

    // Update profiles
    const sb = createClient(SB_URL, SB_SERVICE_KEY);
    const { error: upErr } = await sb
      .from("profiles")
      .update({
        discord_id: me.id,
        discord_username: me.username,
        discord_connected_at: new Date().toISOString()
      })
      .eq("id", uid);
    if (upErr) return { statusCode: 500, body: `Profile update error: ${upErr.message}` };

    // Optional: auto-join + assign role
    if (BOT_TOKEN && GUILD_ID) {
      const { data: prof } = await sb.from("profiles").select("plan").eq("id", uid).single();
      const roleId = ROLE_MAP[(prof?.plan || "free")];

      // Ensure member exists
      await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${me.id}`, {
        method: "PUT",
        headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: tok.access_token })
      });

      if (roleId) {
        await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${me.id}/roles/${roleId}`, {
          method: "PUT",
          headers: { Authorization: `Bot ${BOT_TOKEN}` }
        });
      }
    }

    return {
      statusCode: 302,
      headers: { Location: "https://www.cpenn-dfs.com/account?discord=linked" }
    };
  } catch (e) {
    return { statusCode: 500, body: `callback error: ${e.message}` };
  }
};
