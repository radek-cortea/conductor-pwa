import { expect, it } from "vitest";
import { organizationName } from "@/lib/organization";

it("prefers an explicit organization name, never the user's name", () => {
  expect(
    organizationName({ name: "Ada", organizationName: "Acme Labs" }, [
      "https://github.com/cortea/repo",
    ]),
  ).toBe("Acme Labs");
  expect(organizationName({ name: "Ada", organization: { name: "Acme" } }, [])).toBe("Acme");
  expect(organizationName({ name: "Ada", organizationId: "org-1" }, [])).toBeUndefined();
});
it("uses a consistent repository organization when the public API omits its name", () => {
  expect(
    organizationName({}, ["git@github.com:cortea/one.git", "https://github.com/cortea/two"]),
  ).toBe("cortea");
  expect(
    organizationName({}, ["https://github.com/one/repo", "https://github.com/two/repo"]),
  ).toBeUndefined();
});
