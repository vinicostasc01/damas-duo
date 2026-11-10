import { proxyGame } from "@/lib/proxy";
export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
export async function GET(request: Request, context: Context) {
  return proxyGame(request, (await context.params).code);
}
export async function POST(request: Request, context: Context) {
  return proxyGame(request, (await context.params).code);
}
