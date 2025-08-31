// src/pages/AccountPage.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";          // ✅ add Link
import { supabase } from "../supabaseClient";

function Badge({ status }) {
  const cls =
    status === "active"
      ? "bg-green-100 text-green-700 ring-green-200"
      : status === "trialing"
      ? "bg-yellow-100 text-yellow-800 ring-yellow-200"
      : status === "past_due"
      ? "bg-orange-100 text-orange-800 ring-orange-200"
      : status === "canceled"
      ? "bg-slate-100 text-slate-700 ring-slate-200"
      : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {status || "inactive"}
    </span>
  );
}

export default function AccountPage() {
  // ✅ All hooks at the top, before any conditional returns
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select(`
            username,
            plan,
            status,
            stripe_customer_id,
            created_at,
            discord_id,
            discord_username,
            discord_connected_at
          `)
          .eq("id", user.id)
          .single();
        setProfile(data || null);
      }
      setLoading(false);
    })();
  }, []);

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
      setProfile(p => p ? { ...p, discord_id: null, discord_username: null, discord_connected_at: null } : p);
    }
    setSaving(false);
  }

  if (loading) return <div className="p-6">Loading…</div>;

  if (!user) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="text-gray-600 mt-2">
          You’re not signed in. <a className="text-blue-600 underline" href="/login">Log in</a>.
        </p>
      </div>
    );
  }

  const email = user.email || "—";
  const created = user.created_at ? new Date(user.created_at).toLocaleString() : "—";
  const plan = profile?.plan ?? "free";
  const status = profile?.status ?? "inactive";
  const hasPortal = Boolean(profile?.stripe_customer_id);
  const showUpgrade = !hasPortal || status === "inactive" || plan === "free" || status === "canceled";
  const discordConnected = Boolean(profile?.discord_id);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold">Account</h1>

      {/* Profile */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-sm text-slate-600">Email</div>
          <div className="text-lg font-medium">{email}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-sm text-slate-600">Username</div>
          <div className="text-lg font-medium">{profile?.username || "—"}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-sm text-slate-600">Plan</div>
          <div className="text-lg font-medium uppercase tracking-wide">{plan}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-sm text-slate-600">Status</div>
          <div className="mt-1"><Badge status={status} /></div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-sm text-slate-600">Member Since</div>
          <div className="text-lg font-medium">{created}</div>
        </div>
      </div>

      {/* Discord */}
      <div className="mt-6 rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-600">Discord</div>
            <div className="mt-2 text-sm">
              <div className="mb-1">
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
                href={`/.netlify/functions/auth-discord?state=${user.id}`}
                className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-white font-semibold hover:bg-indigo-700"
              >
                Connect Discord
              </a>
            ) : (
              <button
                disabled={saving}
                onClick={disconnectDiscord}
                className="inline-flex items-center rounded-md border px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-60"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Connect Discord so we can automatically assign server roles based on your plan.
        </p>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {hasPortal && (
          <form method="post" action="/.netlify/functions/stripe-portal">
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700"
              title="Open billing portal"
            >
              Manage Billing
            </button>
          </form>
        )}

        {showUpgrade && (
          <Link                                    // ✅ use SPA navigation
            to="/pricing"
            className="inline-flex items-center rounded-md border px-4 py-2 font-semibold hover:bg-slate-50"
          >
            Upgrade
          </Link>
        )}
      </div>
    </div>
  );
}
