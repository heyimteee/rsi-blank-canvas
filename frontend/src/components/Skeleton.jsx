export default function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-100 ${className}`} aria-hidden="true" />;
}
