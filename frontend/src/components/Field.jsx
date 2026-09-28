export default function Field({ label, helper, error, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <span className="mt-1 block">{children}</span>
      {helper && !error && <span className="mt-1 block text-xs text-zinc-500">{helper}</span>}
      {error && (
        <span className="mt-1 block text-xs text-red-700" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100";
