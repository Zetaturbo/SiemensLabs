import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">Supplier Risk Intelligence</h1>
      <ul className="mt-4 list-disc pl-5 text-sm">
        <li><Link className="underline" href="/train">Train map</Link></li>
        <li><Link className="underline" href="/cases/case_brake_system">Brake system case</Link></li>
      </ul>
    </main>
  );
}
