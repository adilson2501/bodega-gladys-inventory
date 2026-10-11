import { getAuth } from "@/lib/auth/server";
import { isPublicSignUpPath } from "@/lib/auth/bootstrap-rules";

export function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return getAuth().handler().GET(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;

  if (isPublicSignUpPath(path)) {
    return new Response(null, { status: 404 });
  }

  return getAuth().handler().POST(request, context);
}
