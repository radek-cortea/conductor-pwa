import { Component, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { safeWebUrl } from "@/lib/safe-url";

const allowedElements = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "sup",
  "sub",
  "section",
  "span",
  "div",
  "img",
];
const components = {
  // Untrusted content must never make automatic requests to tracking/image hosts.
  img: ({ alt }: { alt?: string }) => (
    <span className="text-sm text-muted-foreground">[Image not loaded{alt ? `: ${alt}` : ""}]</span>
  ),
};
const urlTransform = (url: string, key: string) => (key === "href" ? safeWebUrl(url) : undefined);

// A malformed/unsupported Markdown block must never take down the chat route.
export class MessageMarkdown extends Component<{ text: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render(): ReactNode {
    return this.state.failed ? (
      <p className="break-words whitespace-pre-wrap">{this.props.text}</p>
    ) : (
      <Streamdown
        mode="static"
        allowedElements={allowedElements}
        components={components}
        urlTransform={urlTransform}
      >
        {this.props.text}
      </Streamdown>
    );
  }
}
