import { Link } from "react-router-dom";

export default function Hero() {
  return (
    <section className="relative w-full">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: "url('/img/hero.jpg')" }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-slate-900/60" />

      <div className="relative max-w-6xl mx-auto px-4 py-24 md:py-28">
        {/* CTA card floating on the right (like the example) */}
        <div className="ml-auto max-w-md rounded-2xl bg-white/90 backdrop-blur border shadow-lg p-6">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800">
            Premium DFS Content
          </h2>
          <p className="mt-2 text-blue-800 font-extrabold text-xl">#1 in value</p>

          <Link
            to="/join"
            className="mt-6 inline-flex items-center justify-center w-full rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-semibold py-3"
          >
            Join
          </Link>
        </div>
      </div>
    </section>
  );
}
