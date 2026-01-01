import * as Stripe from "stripe";

export interface Plan {
  name: string;
  monthlyPriceId: string;
  annualPriceId: string;
  freeTrialDays: number;
}

export type StripeService = ReturnType<typeof createStripeService>;

export function createStripeService(stripeSecretKey: string) {
  const stripe = new Stripe.Stripe(stripeSecretKey, {
    apiVersion: "2025-10-29.clover",
  });

  const getPlans = (): Promise<Plan[]> => {
    return Promise.resolve([]);
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
