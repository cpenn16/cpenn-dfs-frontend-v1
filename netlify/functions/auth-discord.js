const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI; // http://localhost:8889/.netlify/functions/discord-callback

exports.handler = async () => {
  const state = Math.random().toString(36).slice(2);
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);

  return {
    statusCode: 302,
    headers: { Location: url.toString() }
  };
};
