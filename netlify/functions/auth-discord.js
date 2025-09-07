// /.netlify/functions/auth-discord
const { createClient } = require("@supabase/supabase-js");

const CLIENT_ID  = process.env.DISCORD_CLIENT_ID;
const REDIRECT   = process.env.DISCORD_REDIRECT_URI;
const SB_URL     = process.env.SUPABASE_URL;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  try {
    // --- sanity ---
    if (!CLIENT_ID || !REDIRECT) {
      return { statusCode: 500, body: "Missing Discord env vars" };
    }
    if (!SB_URL || !SB_SERVICE) {
      return { statusCode: 500, body: "Missing Supabase env vars" };
    }

    // Supabase access token from the client
    const sbToken = new URLSearchParams(event.rawQuery || "").get("sb");
    if (!sbToken) return { statusCode: 401, body: "Missing Supabase token" };

    // Verify token → get user
    const sb = createClient(SB_URL, SB_SERVICE);
    const { data: { user }, error } = await sb.auth.getUser(sbToken);
    if (error || !user) return { statusCode: 401, body: "Invalid Supabase token" };

    // Pack uid + short timestamp into OAuth state (URL-safe base64)
    const payload = { uid: user.id, t: Date.now() };
    const state = Buffer.from(JSON.stringify(payload)).toString("base64url");

    // Build Discord authorize URL
    const url = new URL("https://discord.com/api/oauth2/authorize");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify guilds.join");
    url.searchParams.set("redirect_uri", REDIRECT);
    url.searchParams.set("state", state);

    // Optional: also set cookie for extra CSRF protection
    return {
      statusCode: 302,
      headers: {
        Location: url.toString(),
        "Set-Cookie": `discord_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`
      }
    };
  } catch (e) {
    return { statusCode: 500, body: `auth-discord error: ${e.message}` };
  }
};
