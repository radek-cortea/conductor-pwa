import { Component, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

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
      <Streamdown mode="static">{this.props.text}</Streamdown>
    );
  }
}
