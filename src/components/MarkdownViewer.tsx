import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  language?: string;
  value: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-lg border border-[#2a2f42] bg-[#090b10] overflow-hidden shadow-md">
      <div className="flex items-center justify-between px-3 py-1 bg-[#12141c] border-b border-[#2a2f42] text-[10px] font-mono text-gray-400">
        <span>{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center space-x-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={11} className="text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] font-mono text-cyan-200 leading-relaxed scrollbar-thin">
        <code>{value}</code>
      </pre>
    </div>
  );
};

export const MarkdownViewer: React.FC<{ content: string }> = ({ content }) => {
  return (
    <div className="markdown-body space-y-2 leading-relaxed text-xs text-gray-200">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-sm font-bold text-cyan-400 mt-3 mb-1.5 border-b border-[#2a2f42] pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs font-bold text-emerald-400 mt-2.5 mb-1 flex items-center space-x-1">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-cyan-300 mt-2 mb-1">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-2 leading-normal text-gray-200 whitespace-pre-wrap">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-cyan-300">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-emerald-300">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-1.5 pl-1 text-gray-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-1.5 pl-1 text-gray-300">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-normal">{children}</li>
          ),
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !className && !String(children).includes('\n');
            const codeString = String(children).replace(/\n$/, '');

            if (isInline) {
              return (
                <code
                  className="bg-[#090b10] border border-[#2a2f42] text-cyan-300 font-mono text-[11px] px-1.5 py-0.5 rounded"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return <CodeBlock language={match ? match[1] : ''} value={codeString} />;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
