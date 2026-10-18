// Dynamic params make this route render at request time (Next 16 prerender rule).
export const instant = false;

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">Sourcing case {caseId}</h1>
      <p className="mt-2 text-sm opacity-70">Stage rail, explorer, shortlist board, finalists, memo. Chat panel on the right.</p>
    </main>
  );
}
