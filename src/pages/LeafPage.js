import React from "react";
import { useParams, Link, useLocation } from "react-router-dom";

function titleFromSlug(slug = "") {
  return slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export default function LeafPage() {
  const params = useParams();
  const { pathname } = useLocation();

  // Determine parts safely
  const parts = pathname.split("/").filter(Boolean);
  const sport = parts[0] || "home";
  const section = parts[1];
  const slug = parts.slice(2).join(" / ");

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <nav className="text-sm mb-6 text-gray-500">
        <Link to="/" className="hover:underline">Home</Link>
        {section && (
          <>
            <span className="mx-2">/</span>
            <Link to={`/${sport}`} className="hover:underline">{sport.toUpperCase()}</Link>
          </>
        )}
        {slug && (
          <>
            <span className="mx-2">/</span>
            <span>{titleFromSlug(slug.replace("/", " "))}</span>
          </>
        )}
      </nav>

      <h1 className="text-3xl font-extrabold mb-4">
        {sport.toUpperCase()} — {section ? titleFromSlug(section) : ""}{" "}
        {slug ? " / " + titleFromSlug(slug) : ""}
      </h1>

      <p className="text-gray-600">
        This is a placeholder page for <code>{pathname}</code>. Hook your tool,
        projections table, optimizer, or content here.
      </p>
    </div>
  );
}
