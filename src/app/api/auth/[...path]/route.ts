import { getAuth } from "@/lib/auth/server";

export function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return getAuth().handler().GET(request, context);
}

export function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return getAuth().handler().POST(request, context);
}
