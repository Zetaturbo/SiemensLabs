import { redirect } from "next/navigation";

/** No landing page: the train map is the entry point. */
export default function Home() {
  redirect("/train");
}
