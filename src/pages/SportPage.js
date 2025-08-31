import React from "react";
import { useParams, Link } from "react-router-dom";
import { sportsNav } from "../navConfig";

export default function SportPage() {
  const { sport } = useParams();
  const node = sportsNav.find((s) => s.key === sport);

  if (!node) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-extrabold">Unknown sport</h1>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-4xl font-extrabold mb-6">{node.label}</h1>

      {/* Groups */}
      {node.groups && (
        <div className="grid md:grid-cols-3 gap-6">
          {node.groups.map((g) => (
            <div key={g.key} className="rounded-2xl shadow-sm ring-1 ring-slate-100 p-5">
              <div className="font-black text-blue-900 uppercase text-sm tracking-wide mb-3">
                {g.label}
              </div>
              <ul className="space-y-2">
                {g.links.map((l) => (
                  <li key={l.path}>
                    <Link to={l.path} className="hover:text-blue-700 font-semibold">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Flat */}
      {node.links && !node.groups && (
        <div className="grid md:grid-cols-3 gap-6">
          {node.links.map((l) => (
            <Link
              key={l.path}
              to={l.path}
              className="rounded-2xl shadow-sm ring-1 ring-slate-100 p-5 hover:shadow-md"
            >
              <div className="font-semibold">{l.label}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
