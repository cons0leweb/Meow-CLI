import React, { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Lightweight Markdown Renderer — no external deps.
 * Supports: code blocks (with lang), inline code, bold, italic,
 * headers (h1-h4), unordered lists, ordered lists, links, line breaks.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const html = useMemo(() => {
    let result = escapeHtml(content);

    // Code blocks (```lang ... ```) — must render before inline code
    result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      const trimmed = code.replace(/^\n/, '').replace(/\n$/, '');
      return `<pre><code${langClass}>${escapeHtml(trimmed)}</code></pre>`;
    });

    // Inline code (`code`)
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers (h1-h4)
    result = result.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    result = result.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    result = result.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    result = result.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold (**text** or __text__)
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic (*text* or _text_) — but not inside words
    result = result.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, '<em>$1</em>');
    result = result.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, '<em>$1</em>');

    // Strikethrough (~~text~~)
    result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Links [text](url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Unordered lists: lines starting with * or -
    result = result.replace(/^[\s]*[-*+][\s]+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> in <ul>
    result = result.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Ordered lists: lines starting with 1. 2. etc
    result = result.replace(/^[\s]*\d+\.[\s]+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> in <ol> (but avoid double-wrapping)
    result = result.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
      if (match.includes('<ul>') || match.includes('<ol>')) return match;
      return `<ol>${match}</ol>`;
    });

    // Blockquotes
    result = result.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rules
    result = result.replace(/^---$/gm, '<hr />');

    // Line breaks (double newline = paragraph, single newline = <br>)
    result = result.replace(/\n\n/g, '</p><p>');
    result = result.replace(/\n/g, '<br />');

    // Wrap in paragraph if not already wrapped
    if (!result.startsWith('<')) {
      result = `<p>${result}</p>`;
    }

    // Fix: remove empty paragraphs
    result = result.replace(/<p>\s*<\/p>/g, '');

    return result;
  }, [content]);

  return (
    <div
      className={`markdown-body ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Inline Styles for Markdown (add to CSS or use Tailwind) ────────
export const MARKDOWN_STYLES = `
.markdown-body {
  font-size: 0.8125rem;
  line-height: 1.7;
  color: #d4d4d8;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.markdown-body p {
  margin: 0.5em 0;
}
.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {
  color: #f4f4f5;
  font-weight: 600;
  margin: 0.8em 0 0.4em;
  line-height: 1.3;
}
.markdown-body h1 { font-size: 1.25rem; }
.markdown-body h2 { font-size: 1.1rem; }
.markdown-body h3 { font-size: 1rem; }
.markdown-body h4 { font-size: 0.9rem; }
.markdown-body strong { color: #f4f4f5; font-weight: 600; }
.markdown-body em { color: #a1a1aa; }
.markdown-body del { color: #52525b; }
.markdown-body code {
  background: #1f1f24;
  border: 1px solid #2a2a30;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #e4e4e7;
}
.markdown-body pre {
  background: #0e0e11;
  border: 1px solid #1f1f24;
  border-radius: 8px;
  padding: 12px 14px;
  overflow-x: auto;
  margin: 0.6em 0;
}
.markdown-body pre code {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: #d4d4d8;
}
.markdown-body a {
  color: #d97706;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.markdown-body a:hover {
  color: #f59e0b;
}
.markdown-body ul, .markdown-body ol {
  padding-left: 1.5em;
  margin: 0.4em 0;
}
.markdown-body li {
  margin: 0.2em 0;
}
.markdown-body blockquote {
  border-left: 3px solid #2a2a30;
  padding: 0.3em 1em;
  margin: 0.5em 0;
  color: #a1a1aa;
  font-style: italic;
}
.markdown-body hr {
  border: none;
  border-top: 1px solid #1f1f24;
  margin: 1em 0;
}
.markdown-body table {
  border-collapse: collapse;
  margin: 0.5em 0;
  width: 100%;
  font-size: 0.75rem;
}
.markdown-body th, .markdown-body td {
  border: 1px solid #1f1f24;
  padding: 6px 10px;
  text-align: left;
}
.markdown-body th {
  background: #16161a;
  color: #f4f4f5;
  font-weight: 600;
}
.markdown-body td {
  color: #d4d4d8;
}
`;
