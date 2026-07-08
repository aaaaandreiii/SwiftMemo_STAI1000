import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check } from "lucide-react";
import "katex/dist/katex.min.css";

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  // Extract raw text for copying
  const getText = (node: ReactNode): string => {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(getText).join("");
    if (node && typeof node === "object" && "props" in (node as any))
      return getText((node as any).props.children);
    return "";
  };
  const copy = () => {
    navigator.clipboard?.writeText(getText(children).replace(/\n$/, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-black/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          snippet
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.7rem] text-muted-foreground transition-colors hover:text-[#10b981]"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-[#10b981]" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="no-scrollbar overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

interface MarkdownProps {
  children: string;
  onCite?: (id: string) => void;
}

export function Markdown({ children, onCite }: MarkdownProps) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => {
            if (href && href.startsWith("#src-")) {
              const id = href.replace("#src-", "");
              return (
                <button
                  onClick={() => onCite?.(id)}
                  className="mx-0.5 inline-flex h-4 min-w-4 translate-y-[-2px] items-center justify-center rounded-full bg-[#10b981]/25 px-1 align-super text-[0.62rem] font-semibold text-[#34d399] transition-colors hover:bg-[#10b981]/45"
                  title="View source email"
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
