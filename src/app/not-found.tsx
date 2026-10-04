import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-2 text-sm">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-zinc-500">That session doesn&apos;t exist, or it was interrupted when the server restarted.</p>
      <Link href="/" className="text-indigo-600 hover:underline">Back to Ask</Link>
    </div>
  );
}
