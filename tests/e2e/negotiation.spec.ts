import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

test("buyer messages a seller, negotiates an offer, and reviews after acceptance", async ({ browser }) => {
  const buyerCtx = await browser.newContext();
  const sellerCtx = await browser.newContext();
  const buyer = await buyerCtx.newPage();
  const seller = await sellerCtx.newPage();

  await signIn(buyer, "buyer@naira.test");
  await buyer.goto("/search?q=leather handbag");
  await buyer.getByTestId("product-card").first().getByRole("link").first().click();
  await expect(buyer.getByRole("heading", { level: 1, name: /Leather handbag/ })).toBeVisible();

  // Save + follow
  const saved = buyer.getByRole("button", { name: "Remove from saved" }).first();
  const save = buyer.getByRole("button", { name: "Save listing" }).first();
  await expect(saved.or(save)).toBeVisible();
  if (await save.isVisible()) await save.click();
  await expect(saved).toBeVisible();
  await expect(saved).toBeEnabled(); // server round-trip finished
  await buyer.goto("/favourites");
  await expect(buyer.getByTestId("product-card").filter({ hasText: "Leather handbag" })).toHaveCount(1);
  await buyer.goBack();
  await expect(buyer.getByRole("heading", { level: 1, name: /Leather handbag/ })).toBeVisible();
  await expect(buyer.getByRole("link", { name: "Continue conversation" }).or(buyer.getByLabel(/Message Chioma/))).toBeVisible();

  // Message the seller (or continue an existing conversation from an earlier run)
  const cont = buyer.getByRole("link", { name: "Continue conversation" });
  if (await cont.isVisible()) {
    await cont.click();
    await buyer.getByRole("textbox", { name: "Message", exact: true }).fill("Hello again, still available?");
    await buyer.getByRole("button", { name: "Send" }).click();
  } else {
    await buyer.getByLabel(/Message Chioma/).fill("Hi, is this still available?");
    await buyer.getByRole("button", { name: "Send message" }).click();
  }
  await expect(buyer).toHaveURL(/\/messages\//);
  const convUrl = buyer.url();

  // Withdraw any pending offer left from an earlier run, then make an offer from the listing page
  await expect(buyer.getByTestId("message-list")).toBeVisible();
  const withdraw = buyer.getByRole("button", { name: "Withdraw offer" });
  if (await withdraw.isVisible()) { await withdraw.click(); await expect(withdraw).toHaveCount(0); }
  await buyer.goBack();
  await buyer.goto(convUrl.replace(/\/messages\/.*/, "/search?q=leather handbag"));
  await buyer.getByTestId("product-card").first().getByRole("link").first().click();
  await buyer.getByLabel(/Your offer/).fill("30000");
  await buyer.getByRole("button", { name: "Make an offer" }).click();
  await expect(buyer).toHaveURL(convUrl);
  await expect(buyer.getByText("Your offer of ₦30,000 is waiting for a reply.")).toBeVisible();

  // Seller sees it and counters
  await signIn(seller, "chioma@naira.test");
  await seller.goto("/dashboard/offers");
  await expect(seller.getByRole("cell", { name: "₦30,000" }).first()).toBeVisible();
  await seller.goto(convUrl);
  await expect(seller.getByText("Offer of ₦30,000 is waiting for your reply.")).toBeVisible();
  await seller.getByRole("button", { name: "Counter" }).click();
  await seller.getByLabel(/Counter-offer/).fill("33000");
  await seller.getByRole("button", { name: "Send counter-offer" }).click();
  await expect(seller.getByText("Your offer of ₦33,000 is waiting for a reply.")).toBeVisible();

  // Buyer accepts the counter (live update or reload)
  await buyer.reload();
  await expect(buyer.getByText("Offer of ₦33,000 is waiting for your reply.")).toBeVisible();
  await buyer.getByRole("button", { name: "Accept" }).click();
  await expect(buyer.getByTestId("offer-status").last()).toHaveText("accepted");
  await expect(buyer.getByText(/Accepted the offer/).last()).toBeVisible();

  await expect(buyer.getByTestId("offer-actions")).toHaveCount(0);
  // Review becomes available, labelled as unverified agreed price
  await expect(buyer.getByText(/Review Chioma|Your review of Chioma/)).toBeVisible();
  const submit = buyer.getByRole("button", { name: "Submit review" });
  await expect(async () => {
    if (!(await submit.isVisible())) await buyer.getByText(/Your review of Chioma/).click(); // edit an earlier review
    await submit.click({ timeout: 3000 });
    await expect(buyer.getByText("Thanks for your review.")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20000 });

  // Seller's unread/notification state
  await seller.goto("/notifications");
  await expect(seller.getByText(/Offer update|New message/).first()).toBeVisible();

  // Report the listing
  await buyer.goto(convUrl.replace(/\/messages\/.*/, "/search?q=leather handbag"));
  await buyer.getByTestId("product-card").first().getByRole("link").first().click();
  await buyer.getByText("Report listing").click();
  await buyer.locator("#reason-listing").selectOption("misleading");
  await buyer.getByRole("button", { name: "Submit report" }).click();
  await expect(buyer.getByText(/moderators will review/)).toBeVisible();

  await buyerCtx.close();
  await sellerCtx.close();
});

test("a third user cannot open someone else's conversation", async ({ page, browser }) => {
  const ctx = await browser.newContext();
  const buyer = await ctx.newPage();
  await signIn(buyer, "buyer@naira.test");
  await buyer.goto("/messages");
  await buyer.getByTestId("conversation").first().click();
  await buyer.waitForURL(/\/messages\/[0-9a-f-]{36}/);
  const url = buyer.url();
  await ctx.close();

  await signIn(page, "kwame@naira.test");
  // (streamed pages report 200, so assert on content: nothing from the conversation is rendered)
  await page.goto(url);
  await expect(page.getByText("We couldn't find that page")).toBeVisible();
  await expect(page.getByTestId("message-list")).toHaveCount(0);
});
