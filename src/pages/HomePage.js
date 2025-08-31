import { Link } from "react-router-dom";
import { Table2, Calculator, BarChart3, FileText, ChevronRight } from "lucide-react";

function Section({ title, children, subdued = false }) {
  return (
    <section className={subdued ? "bg-gray-50" : "bg-white"}>
      <div className="max-w-6xl mx-auto px-4 py-12">
        {title && (
          <h2 className="text-3xl md:text-4xl font-extrabold text-center">
            {title}
          </h2>
        )}
        <div className={title ? "mt-8" : ""}>{children}</div>
      </div>
    </section>
  );
}

function SportCard({ name, to, logo }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl bg-white border shadow-sm hover:shadow-lg transition p-6 text-center"
    >
      {logo ? (
        <img
          src={logo}
          alt={name}
          className="h-12 w-auto mx-auto object-contain"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      ) : null}
      <div className="mt-3 text-lg font-bold">{name}</div>
      <div className="text-xs text-gray-500">DFS Tools &amp; Insights</div>
      <div className="mt-3 inline-flex items-center text-blue-700 font-medium group-hover:gap-2 transition">
        Open <ChevronRight className="w-4 h-4 ml-1" />
      </div>
    </Link>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="rounded-2xl bg-white border shadow-sm hover:shadow-lg transition p-6">
      <div className="mb-3 text-blue-800">{icon}</div>
      <div className="font-bold">{title}</div>
      <div className="text-sm text-gray-600 mt-1">{desc}</div>
    </div>
  );
}

export default function HomePage() {
  const sports = [
    { name: "NASCAR", to: "/nascar", logo: "/logos/nascar.png" },
    { name: "NFL", to: "/nfl", logo: "/logos/nfl.png" },
    { name: "MLB", to: "/mlb", logo: "/logos/mlb.png" },
    { name: "NBA", to: "/nba", logo: "/logos/nba.png" },
  ];

  const features = [
    {
      icon: <Table2 className="w-6 h-6" />,
      title: "Cheat Sheets",
      desc: "Sortable pools with projections, value, salary, and tags.",
    },
    {
      icon: <Calculator className="w-6 h-6" />,
      title: "Lineup Optimizers",
      desc: "DK & FD optimizers with locks, excludes, rules, export CSV.",
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "Simulations",
      desc: "Projections, ownership, leverage, optimal rates.",
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: "Data Hub",
      desc: "Slate specific player/game stats and data.",
    },
  ];

  return (
    <div className="bg-white">
      {/* HERO */}
      <section className="relative w-full bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700">
        <div className="max-w-6xl mx-auto px-4 py-14 text-center text-white">
          <h1 className="text-4xl md:text-6xl font-extrabold">
            CPENN DFS & Betting Data
          </h1>
          <p className="mt-4 text-blue-100 text-lg md:text-xl max-w-3xl mx-auto">
            Projections, optimizers, and betting insights across NFL, NBA, MLB,
            and NASCAR.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/nfl"
              className="px-6 py-3 rounded-xl bg-yellow-400 text-black font-semibold hover:bg-yellow-300 transition"
            >
              Explore Projections
            </Link>
            <Link
              to="/nascar"
              className="px-6 py-3 rounded-xl border border-white/80 text-white hover:bg-white/10 transition"
            >
              Try a Tool
            </Link>
          </div>
        </div>
      </section>

      {/* SPORTS */}
      <Section title="Supported Sports" subdued>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {sports.map((s) => (
            <SportCard key={s.name} {...s} />
          ))}
        </div>
      </Section>

      {/* FEATURES */}
      <Section title="Tools & Features">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {features.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </Section>

      {/* CTA BAND */}
      <Section subdued>
        <div className="rounded-2xl bg-white border shadow-sm p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-lg font-bold">Ready to dive into a slate?</div>
            <div className="text-gray-600 text-sm">
              Start with projections, then build and export lineups for DK/FD.
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              to="/nfl"
              className="px-5 py-3 rounded-xl bg-blue-900 text-white hover:bg-blue-800 transition"
            >
              Go to Projections
            </Link>
            <Link
              to="/nascar"
              className="px-5 py-3 rounded-xl border border-blue-900 text-blue-900 hover:bg-blue-50 transition"
            >
              Open a Tool
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
