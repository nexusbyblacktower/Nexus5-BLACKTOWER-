import React, { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <div className="my-3.5 rounded-xl overflow-hidden border border-white/[0.09] bg-[#06070b]/90 shadow-lg">
      <div className="flex items-center justify-between px-3.5 py-2 bg-white/[0.04] border-b border-white/[0.07] text-xs text-slate-400">
        <div className="flex items-center gap-2 font-mono">
          <Terminal className="w-3.5 h-3.5 text-violet-400" />
          <span>{language || 'code'}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.09] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-[13px] leading-relaxed font-mono text-slate-200 overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Renders inline formatting safely without dangerouslySetInnerHTML
 */
function renderInlineTokens(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 text-[12.5px] font-mono rounded bg-violet-500/15 text-violet-200 border border-violet-500/25"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content) return null;

  // Split by fenced code blocks first
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 text-[15px] leading-[1.65] text-slate-200 break-words">
      {segments.map((segment, segIdx) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          const firstLineEnd = segment.indexOf('\n');
          const lang =
            firstLineEnd !== -1 ? segment.slice(3, firstLineEnd).trim() : 'plaintext';
          const codeBody =
            firstLineEnd !== -1
              ? segment.slice(firstLineEnd + 1, -3).replace(/\n$/, '')
              : segment.slice(3, -3);
          return <CodeBlock key={segIdx} language={lang} code={codeBody} />;
        }

        const lines = segment.split('\n');
        const elements: React.ReactNode[] = [];
        let listItems: { ordered: boolean; text: string }[] = [];

        const flushList = (keyPrefix: string) => {
          if (listItems.length === 0) return;
          const isOrdered = listItems[0].ordered;
          if (isOrdered) {
            elements.push(
              <ol
                key={`${keyPrefix}-ol`}
                className="list-decimal list-inside space-y-1.5 my-2 pl-1 text-slate-200"
              >
                {listItems.map((item, i) => (
                  <li key={i} className="leading-relaxed">
                    {renderInlineTokens(item.text)}
                  </li>
                ))}
              </ol>
            );
          } else {
            elements.push(
              <ul
                key={`${keyPrefix}-ul`}
                className="list-disc list-inside space-y-1.5 my-2 pl-1 text-slate-200"
              >
                {listItems.map((item, i) => (
                  <li key={i} className="leading-relaxed">
                    {renderInlineTokens(item.text)}
                  </li>
                ))}
              </ul>
            );
          }
          listItems = [];
        };

        lines.forEach((rawLine, lineIdx) => {
          const line = rawLine.trimEnd();
          if (!line.trim()) {
            flushList(`${segIdx}-${lineIdx}`);
            return;
          }

          // Headings
          if (line.startsWith('### ')) {
            flushList(`${segIdx}-${lineIdx}`);
            elements.push(
              <h3
                key={`${segIdx}-${lineIdx}`}
                className="text-base font-semibold text-white mt-4 mb-1 tracking-tight"
              >
                {renderInlineTokens(line.slice(4))}
              </h3>
            );
            return;
          }
          if (line.startsWith('## ')) {
            flushList(`${segIdx}-${lineIdx}`);
            elements.push(
              <h2
                key={`${segIdx}-${lineIdx}`}
                className="text-lg font-semibold text-white mt-4 mb-1.5 tracking-tight"
              >
                {renderInlineTokens(line.slice(3))}
              </h2>
            );
            return;
          }
          if (line.startsWith('# ')) {
            flushList(`${segIdx}-${lineIdx}`);
            elements.push(
              <h1
                key={`${segIdx}-${lineIdx}`}
                className="text-xl font-bold text-white mt-4 mb-2 tracking-tight"
              >
                {renderInlineTokens(line.slice(2))}
              </h1>
            );
            return;
          }

          // Horizontal divider
          if (/^---+$/.test(line.trim())) {
            flushList(`${segIdx}-${lineIdx}`);
            elements.push(
              <hr key={`${segIdx}-${lineIdx}`} className="border-white/[0.08] my-3" />
            );
            return;
          }

          // Bullet list item
          const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);
          if (bulletMatch) {
            if (listItems.length > 0 && listItems[0].ordered) {
              flushList(`${segIdx}-${lineIdx}`);
            }
            listItems.push({ ordered: false, text: bulletMatch[1] });
            return;
          }

          // Ordered list item
          const orderedMatch = line.match(/^\s*\d+\.\s+(.+)/);
          if (orderedMatch) {
            if (listItems.length > 0 && !listItems[0].ordered) {
              flushList(`${segIdx}-${lineIdx}`);
            }
            listItems.push({ ordered: true, text: orderedMatch[1] });
            return;
          }

          flushList(`${segIdx}-${lineIdx}`);
          elements.push(
            <p key={`${segIdx}-${lineIdx}`} className="leading-[1.65]">
              {renderInlineTokens(line)}
            </p>
          );
        });

        flushList(`${segIdx}-end`);
        return <React.Fragment key={segIdx}>{elements}</React.Fragment>;
      })}
    </div>
  );
};
