const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args)); // safety on older Node
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

exports.handler = async (event) => {
  try {
    const { code } = Object.fromEntries(new URLSearchParams(event.rawQuery || ""));
    if (!code) return { statusCode: 400, body: "Missing code" };

    // 1) Exchange code for token
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI
    });

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return { statusCode: 500, body: `Token error: ${err}` };
    }
    const token = await tokenRes.json();

    // 2) Get user
    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    const me = await meRes.json();

    // For now, just show success (you can redirect to /account later)
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, user: me })
    };
  } catch (e) {
    return { statusCode: 500, body: `Callback error: ${e.message}` };
  }
};
