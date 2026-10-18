/** Case persistence for multiplayer (later). For now the zustand store in src/lib/cases holds state client-side. */
export async function GET() {
  return Response.json({ todo: "list cases" });
}
