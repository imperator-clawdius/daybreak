export function purchaseTermsCopy(checkoutReady: boolean, priceUsd: number): string {
  if (checkoutReady) {
    return `Daybreak is sold for $${priceUsd} as a one-time purchase for the Windows app and included v1 maintenance updates. No subscription is charged for this v1 release.`;
  }

  return `The planned launch price is $${priceUsd} as a one-time purchase for the Windows app and included v1 maintenance updates. No subscription is planned for this v1 release.`;
}

export function refundTermsCopy(checkoutReady: boolean): string {
  if (checkoutReady) {
    return "The stated refund policy is 14 days, no questions asked. Refund requests should be sent to founder@daybreak.rest from the purchase email.";
  }

  return "The stated refund policy is 14 days, no questions asked. Refund requests should be sent to founder@daybreak.rest from the purchase email once checkout is live.";
}
