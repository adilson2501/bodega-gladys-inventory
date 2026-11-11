import type { NextRequest } from "next/server";

import { getAuth } from "@/lib/auth/server";

export default function proxy(request: NextRequest) {
  return getAuth().middleware({ loginUrl: "/auth/sign-in" })(request);
}

export const config = {
  matcher: ["/((?!api/auth|auth/sign-in|auth/setup|_next/static|_next/image|favicon.ico).*)"],
};
