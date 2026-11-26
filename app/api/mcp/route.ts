import { handleMcpRequest } from "@/lib/mcp/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, accept, mcp-session-id, last-event-id",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

async function handle(request: Request) {
  const response = await handleMcpRequest(request);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
