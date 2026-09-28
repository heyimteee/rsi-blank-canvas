export default function EmptyState({ title, body }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center">
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">{body}</p>}
    </div>
  );
}
