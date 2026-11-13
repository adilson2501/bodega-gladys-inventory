import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getAuth } from "@/lib/auth/server";

import { SignInForm } from "./sign-in-form";

export const instant = false;

export default async function SignInPage() {
  await connection();
  const { data: session } = await getAuth().getSession();
  if (session?.user) redirect("/");

  return <SignInForm />;
}
