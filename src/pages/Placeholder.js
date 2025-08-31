export default function Placeholder({ title = "Page" }) {
  return (
    <section className="max-w-5xl">
      <h1 className="text-3xl font-extrabold text-slate-900 mb-4">{title}</h1>
      <p className="text-slate-600 leading-relaxed">
        This is a placeholder route. Replace with your real page content, tables,
        charts, or tools.
      </p>
    </section>
  );
}
