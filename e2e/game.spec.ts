import { test, expect } from "@playwright/test";
import { legalMoves } from "../lib/engine";
test("two independent browsers play, reconnect, reject intruders, draw and rematch", async ({
  browser,
  baseURL,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext(),
    outsider = await browser.newContext();
  const p1 = await a.newPage(),
    p2 = await b.newPage();
  await p1.goto(baseURL!);
  await p1.getByLabel("COMO PODEMOS CHAMAR VOCÊ?").fill("Vini");
  await p1.getByRole("button", { name: "Criar uma partida" }).click();
  await expect(
    p1.getByRole("heading", { name: "A boa companhia está a caminho." }),
  ).toBeVisible();
  const code = new URL(p1.url()).searchParams.get("sala")!;
  expect(code).toHaveLength(8);
  await p2.goto(`${baseURL}/?sala=${code}`);
  await p2.getByLabel("COMO PODEMOS CHAMAR VOCÊ?").fill("Ana");
  await p2.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    p1.getByRole("heading", { name: "Sua vez de fazer história." }),
  ).toBeVisible();
  await expect(
    p2.getByRole("heading", { name: "Vini está pensando…" }),
  ).toBeVisible();
  const invalid = await b.request.post(`/api/rooms/${code}`, {
    data: { action: "move", version: 1, path: [17, 24] },
  });
  expect(invalid.status()).toBe(400);
  const privateRoom = await outsider.request.get(
    `${baseURL}/api/rooms/${code}`,
  );
  expect(privateRoom.status()).toBe(401);
  const fullRoom = await outsider.request.post(`${baseURL}/api/rooms/${code}`, {
    data: { action: "join", name: "Intruso" },
  });
  expect(fullRoom.status()).toBe(409);
  let position = (await (await a.request.get(`/api/rooms/${code}`)).json())
    .room;
  for (let turn = 0; turn < 6; turn++) {
    const page = position.state.turn === "white" ? p1 : p2;
    const move = legalMoves(position.state)[0];
    await expect(
      page.getByRole("heading", { name: "Sua vez de fazer história." }),
    ).toBeVisible();
    for (const sq of move.path)
      await page.locator(`[data-square="${sq}"]`).click();
    await expect
      .poll(async () => {
        const res = await a.request.get(`/api/rooms/${code}`);
        return (await res.json()).room.state.history.length;
      })
      .toBe(turn + 1);
    position = (await (await a.request.get(`/api/rooms/${code}`)).json()).room;
  }
  await p1.reload();
  await expect(
    p1.getByRole("heading", { name: "Bom ter você à mesa." }),
  ).toBeVisible();
  await expect(p1.getByText("6 jogadas", { exact: true })).toBeVisible();
  await p1.getByRole("button", { name: "Propor empate" }).click();
  await expect(p2.getByText("Seu adversário propôs um empate.")).toBeVisible();
  await p2.getByRole("button", { name: "Aceitar", exact: true }).click();
  await expect(
    p1.getByRole("heading", { name: "Uma partida equilibrada." }),
  ).toBeVisible();
  await p1.getByRole("button", { name: "Jogar novamente" }).click();
  await p2.getByRole("button", { name: "Jogar novamente" }).click();
  await expect(
    p2.getByRole("heading", { name: "Sua vez de fazer história." }),
  ).toBeVisible();
  await expect(p1.getByText("Você joga com as escuras")).toBeVisible();
  await p2.getByRole("button", { name: "Desistir", exact: true }).click();
  await p2.getByRole("button", { name: "Sim, desistir" }).click();
  await expect(p1.getByRole("heading", { name: "Vini venceu!" })).toBeVisible();
  await a.close();
  await b.close();
  await outsider.close();
});
test("desktop and mobile layouts, keyboard rules, local game and no horizontal overflow", async ({
  browser,
  baseURL,
}) => {
  for (const viewport of [
    { width: 1365, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const ctx = await browser.newContext({ viewport }),
      page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL!);
    await expect(
      page.getByRole("heading", { name: "Uma boa jogada merece companhia." }),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/lobby-${viewport.width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Como jogar" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: /Jogue neste dispositivo/ }).click();
    await expect(
      page.getByRole("heading", { name: "Vez de Jogador 1" }),
    ).toBeVisible();
    await page.locator('[data-square="40"]').click();
    await page.locator('[data-square="33"]').click();
    await expect(
      page.getByRole("heading", { name: "Vez de Jogador 2" }),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/game-${viewport.width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  }
});
