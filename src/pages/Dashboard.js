// src/pages/Dashboard.js
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // fetch user + profile
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);

      if (user) {
        const { data, error } = await supabase
          .from("profiles")
          .select("username, plan, stripe_customer_id, created_at, discord_id, discord_username, discord_connected_at")
          .eq("id", user.id)
          .single();
        if (!error) setProfile(data);
      }
      setLoading(false);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // Build OAuth URL on the client. Your backend should have /auth/discord → redirects to Discord OAuth2.
  const connectDiscordHref = useMemo(() => {
    if (!user) return "#";
    const url = new URL("/auth/discord", window.location.origin);
    url.searchParams.set("state", user.id); // we’ll use this on callback to know which site user to store against
    return url.toString();
  }, [user]);

  // Optional: allow a manual disconnect (wipe discord fields)
  async function disconnectDiscord() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        discord_id: null,
        discord_username: null,
        discord_connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (!error) {
      setProfile(p => ({ ...p, discord_id: null, discord_username: null, discord_connected_at: null }));
    }
    setSaving(false);
  }

  if (loading) return null;

  const isPro = profile?.plan && profile.plan !== "free";
  const discordConnected = Boolean(profile?.discord_id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-sm text-gray-500">
              Welcome{profile?.username ? `, ${profile.username}` : ""}.
            </p>
          </div>
          <button
            onClick={signOut}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>

        {/* Plan badge */}
        <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
          <b>Plan:</b> {profile?.plan ?? "free"}
        </div>

        {/* Info grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {/* Account */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Account</div>
            <div className="mt-2 text-sm">
              <div><b>Email:</b> {user?.email}</div>
              <div><b>Username:</b> {profile?.username || "—"}</div>
              <div>
                <b>Member since:</b>{" "}
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString()
                  : "—"}
              </div>
            </div>
          </div>

          {/* Billing */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Billing</div>
            <div className="mt-2 text-sm">
              <div><b>Stripe Customer ID:</b> {profile?.stripe_customer_id || "—"}</div>
              <div><b>Status:</b> {isPro ? "Active (Pro)" : "Free"}</div>
              <div className="mt-3">
                <a
                  href="/pricing"
                  className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700"
                >
                  Manage / Upgrade
                </a>
              </div>
            </div>
          </div>

          {/* Discord link card */}
          <div className="rounded-lg border border-gray-200 p-4 sm:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500">Discord</div>
                <div className="mt-2 text-sm">
                  <div>
                    <b>Status:</b>{" "}
                    {discordConnected ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                        Connected{profile?.discord_username ? ` as ${profile.discord_username}` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
                        Not connected
                      </span>
                    )}
                  </div>
                  <div><b>Discord ID:</b> {profile?.discord_id || "—"}</div>
                  <div>
                    <b>Linked on:</b>{" "}
                    {profile?.discord_connected_at
                      ? new Date(profile.discord_connected_at).toLocaleString()
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!discordConnected ? (
                  <a
                    href={connectDiscordHref}
                    className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700"
                  >
                    Connect Discord
                  </a>
                ) : (
                  <button
                    disabled={saving}
                    onClick={disconnectDiscord}
                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Connecting Discord lets us give you the right roles on our server automatically based on your plan.
            </p>
          </div>
        </div>

        {/* Debug data (handy while developing) */}
        <div className="mt-6">
          <details className="rounded-lg border border-gray-200">
            <summary className="cursor-pointer select-none rounded-lg px-4 py-2 text-sm font-medium">
              Debug data
            </summary>
            <pre className="m-0 overflow-auto rounded-b-lg bg-gray-900 p-4 text-xs text-green-200">
{JSON.stringify({ user, profile }, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
