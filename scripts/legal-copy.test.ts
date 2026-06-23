import { describe, expect, it } from "vitest";

import {
  purchaseTermsCopy,
  refundTermsCopy,
} from "../site/app/legal-copy";

describe("legal copy", () => {
  it("keeps purchase terms honest before and after checkout goes live", () => {
    expect(purchaseTermsCopy(false, 19)).toContain("planned launch price is $19");
    expect(purchaseTermsCopy(false, 19)).toContain("No subscription is planned");

    expect(purchaseTermsCopy(true, 19)).toContain("Daybreak is sold for $19");
    expect(purchaseTermsCopy(true, 19)).toContain("No subscription");
    expect(purchaseTermsCopy(true, 19)).not.toContain("planned launch");
  });

  it("keeps refund terms from saying checkout is not live after checkout goes live", () => {
    expect(refundTermsCopy(false)).toContain("once checkout is live");

    expect(refundTermsCopy(true)).toContain("from the purchase email");
    expect(refundTermsCopy(true)).not.toContain("once checkout is live");
  });
});
