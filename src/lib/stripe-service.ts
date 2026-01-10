import type { Plan } from "@/lib/domain";
import type { Stripe as StripeTypes } from "stripe";
import { invariant } from "@epic-web/invariant";
import { env } from "cloudflare:workers";
import * as Stripe from "stripe";
import * as z from "zod";
import { planData, Plan as PlanSchema } from "@/lib/domain";

type Price = StripeTypes.Price;
type PriceWithLookupKey = Price & { lookup_key: string };
const isPriceWithLookupKey = (p: Price): p is PriceWithLookupKey =>
  p.lookup_key !== null;
function assertPriceWithLookupKey(p: Price): asserts p is PriceWithLookupKey {
  invariant(p.lookup_key !== null, "Missing lookup_key");
}

export type StripeService = ReturnType<typeof createStripeService>;

export function createStripeService() {
  const stripe = new Stripe.Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-10-29.clover",
  });

  const getPlans = async (): Promise<Plan[]> => {
    const key = "stripe:plans";
    const cachedPlans = await env.KV.get(key, { type: "json" });
    if (cachedPlans) {
      const parseResult = z.array(PlanSchema).safeParse(cachedPlans);
      if (parseResult.success) {
        console.log(`stripeService: getPlans: cache hit`);
        return parseResult.data;
      }
    }
    console.log(`stripeService: getPlans: cache miss`);
    const _getPrices = async (): Promise<PriceWithLookupKey[]> => {
      const lookupKeys = planData.flatMap((plan) => [
        plan.monthlyPriceLookupKey,
        plan.annualPriceLookupKey,
      ]);
      const priceList = await stripe.prices.list({
        lookup_keys: lookupKeys,
        expand: ["data.product"],
      });
      if (priceList.data.length === 0) {
        const products = await Promise.all(
          planData.map(async (plan) => {
            const product = await stripe.products.create({
              name: plan.displayName,
              description: `${plan.displayName} plan.`,
            });
            return { plan, product };
          }),
        );
        const prices = await Promise.all(
          products.flatMap(({ plan, product }) => [
            stripe.prices.create({
              product: product.id,
              unit_amount: plan.monthlyPriceInCents,
              currency: "usd",
              recurring: { interval: "month" },
              lookup_key: plan.monthlyPriceLookupKey,
              expand: ["product"],
            }),
            stripe.prices.create({
              product: product.id,
              unit_amount: plan.annualPriceInCents,
              currency: "usd",
              recurring: { interval: "year" },
              lookup_key: plan.annualPriceLookupKey,
              expand: ["product"],
            }),
          ]),
        );
        return prices.map((price) => {
          assertPriceWithLookupKey(price);
          return price;
        });
      } else {
        const prices = priceList.data.filter(isPriceWithLookupKey);
        invariant(
          prices.length === planData.length * 2,
          `Count of prices not ${String(planData.length * 2)} (${String(prices.length)})`,
        );
        return prices;
      }
    };

    const prices = await _getPrices();
    const plans: Plan[] = planData.map((plan) => {
      const monthlyPrice = prices.find(
        (p) => p.lookup_key === plan.monthlyPriceLookupKey,
      );
      invariant(monthlyPrice, `Missing monthly price for ${plan.name}`);
      invariant(
        typeof monthlyPrice.product !== "string",
        "Product should be expanded",
      );
      const annualPrice = prices.find(
        (p) => p.lookup_key === plan.annualPriceLookupKey,
      );
      invariant(annualPrice, `Missing annual price for ${plan.name}`);
      return {
        name: plan.name,
        displayName: plan.displayName,
        description: plan.description,
        productId: monthlyPrice.product.id,
        monthlyPriceId: monthlyPrice.id,
        monthlyPriceLookupKey: plan.monthlyPriceLookupKey,
        monthlyPriceInCents: plan.monthlyPriceInCents,
        annualPriceId: annualPrice.id,
        annualPriceLookupKey: plan.annualPriceLookupKey,
        annualPriceInCents: plan.annualPriceInCents,
        freeTrialDays: plan.freeTrialDays,
      };
    });
    await env.KV.put(key, JSON.stringify(plans));
    return plans;
  };

  const ensureBillingPortalConfiguration = () => {
    console.log("ensureBillingPortalConfiguration");
    return Promise.resolve();
  };

  return {
    stripe,
    getPlans,
    ensureBillingPortalConfiguration,
  };
}
