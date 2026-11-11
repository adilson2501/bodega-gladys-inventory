import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getAuth } from "@/lib/auth/server";
import { isBootstrapAvailable } from "@/lib/auth/bootstrap";

import { BootstrapForm } from "./bootstrap-form";

export const instant = false;

export default async function SetupPage() {
  await connection();

  const [{ data: session }, isAvailable] = await Promise.all([
    getAuth().getSession(),
    isBootstrapAvailable(),
  ]);

  if (session?.user) {
    redirect("/");
  }

  if (!isAvailable) {
    redirect("/auth/sign-in");
  }

  return <BootstrapForm />;
}
