import { redirect } from "react-router";
import { requireAuth } from "~/lib/require-auth";

// The app IS the reader; land in Scripture (auth required).
export async function clientLoader() {
  await requireAuth();
  return redirect("/read/JHN/3");
}

export default function Home() {
  return null;
}
