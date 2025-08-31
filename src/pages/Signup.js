// src/pages/Signup.js
import React, { useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";

export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accept, setAccept] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  const pwdStrength = useMemo(() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s; // 0..4
  }, [password]);

  async function onSubmit(e) {
    e.preventDefault();
    setNote("");

    if (password !== confirm) return setNote("Passwords do not match.");
    if (!accept) return setNote("Please accept the Terms to continue.");

    setLoading(true);

    // 1) Create the auth user (also store username in user_metadata)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });

    if (error) {
      setLoading(false);
      return setNote(error.message);
    }

    // 2) If we already have a session (email confirmation OFF),
    //    update the profile row with the username now.
    //    If confirmations are ON, this step will run after first login instead.
    const userId = data.user?.id;
    if (userId) {
      const { error: upErr } = await supabase
        .from("profiles")
        .update({ username })
        .eq("id", userId);
      if (upErr) console.warn("Profile update error:", upErr.message);
    }

    setLoading(false);

    // 3) Navigate or prompt for email confirmation
    if (!data.session) {
      setNote("Check your inbox to confirm your email, then log in.");
    } else {
      nav("/dashboard");
    }
  }

  return (
    <div className="min-h-[70vh] grid place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-1 text-sm text-gray-500">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 hover:text-blue-700 underline">
            Log in
          </Link>
        </p>

        {note && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {note}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Username</label>
            <input
              placeholder="yourname"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-12 outline-none ring-blue-500 focus:ring-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
              >
                {showPwd ? "Hide" : "Show"}
              </button>
            </div>

            {/* strength bar */}
            <div className="mt-2 h-1.5 w-full rounded bg-gray-100">
              <div
                className={`h-1.5 rounded ${
                  pwdStrength <= 1 ? "bg-red-400 w-1/4"
                  : pwdStrength === 2 ? "bg-yellow-400 w-2/4"
                  : pwdStrength === 3 ? "bg-blue-400 w-3/4"
                  : "bg-green-500 w-full"
                }`}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Use 8+ characters with a mix of letters, numbers & symbols.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none ring-blue-500 focus:ring-2"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
            />
            I agree to the <a href="/terms" className="underline">Terms</a> &{" "}
            <a href="/privacy" className="underline">Privacy</a>.
          </label>

          <button
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            type="submit"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
