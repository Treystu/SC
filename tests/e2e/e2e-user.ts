import type { Browser, BrowserContext, Page } from "@playwright/test";

export type E2EUser = {
  context: BrowserContext;
  page: Page;
  dbName: string;
};

export async function createIsolatedUser(
  browser: Browser,
  label: string,
): Promise<E2EUser> {
  const context = await browser.newContext();

  const dbName = `sc_e2e_${label}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;

  await context.addInitScript((name: string) => {
    (window as any).__E2E__ = true;
    (window as any).__SC_DB_NAME__ = name;
  }, dbName);

  const page = await context.newPage();

  return { context, page, dbName };
}
