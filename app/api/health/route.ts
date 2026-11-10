export async function GET() {
  return Response.json({
    status: "ok",
    service: "damas-duo",
    onlineConfigured: !!process.env.GAME_API_URL,
  });
}
