import { describe, expect, it } from "vitest";
import { renderSafeMarkdown } from "@/lib/markdown";

describe("renderSafeMarkdown", () => {
  it("renders headings, emphasis, lists, and safe links", () => {
    const html = renderSafeMarkdown(
      "# Titulo\n\n- **Uno**\n- [Docs](https://example.com)\n\nTexto con `codigo`.",
    );

    expect(html).toContain("<h1>Titulo</h1>");
    expect(html).toContain("<strong>Uno</strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<code>codigo</code>");
  });

  it("escapes raw html and strips unsafe protocols", () => {
    const html = renderSafeMarkdown(
      '<script>alert("x")</script>\n[Bad](javascript:alert(1))',
    );

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:alert");
  });
});
