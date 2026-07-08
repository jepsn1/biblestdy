import { redirect } from "react-router";

// The app IS the reader; land in Scripture.
export function clientLoader() {
  return redirect("/read/JHN/3");
}

export default function Home() {
  return null;
}
