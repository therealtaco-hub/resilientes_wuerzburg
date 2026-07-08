import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from 'react-i18next'
// Einzige Quelle: docs/Dokumentation.md im Repo-Root (Raw-Import via Vite).
// server.fs.allow: ['..'] in vite.config.js erlaubt den Zugriff eine Ebene ueber frontend/.
import docDe from '../../../docs/Dokumentation.md?raw'
import docEn from '../../../docs/Dokumentation.en.md?raw'

const slug = (children) =>
  String(children)
    .toLowerCase()
    .replace(/[^\wäöüß\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

const textOf = (children) => {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textOf).join('')
  if (children?.props?.children) return textOf(children.props.children)
  return ''
}

const STATUS_RULES = [
  { re: /nicht angewendet|bewusst nicht|nicht validiert|hinterlegt|schätzung|ausstehend|geplant|nicht in v1|not applied|deliberately not|not validated|stored|estimate|pending|planned|not computed|for v2/i, tone: 'amber' },
  { re: /angewendet|gültig|validiert|aktiv|applied|valid|validated|active/i, tone: 'green' },
]
const TONE = {
  green: { color: 'var(--green)', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.28)' },
  amber: { color: 'var(--amber)', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.28)' },
}

function StatusBadge({ tone, children }) {
  const t = TONE[tone]
  return (
    <span
      className="inline-block font-mono text-[11px] px-1.5 py-0.5 rounded"
      style={{ color: t.color, background: t.bg, border: '1px solid ' + t.border }}
    >
      {children}
    </span>
  )
}

const components = {
  h1: ({ children }) => (
    <h1
      id={slug(textOf(children))}
      className="text-fg-0 text-[26px] font-semibold tracking-tight mt-10 mb-3 scroll-mt-16 first:mt-0"
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      id={slug(textOf(children))}
      className="flex items-center gap-2.5 text-fg-0 text-[20px] font-semibold tracking-tight mt-11 mb-4 pb-2 border-b border-border scroll-mt-16"
    >
      <span className="w-[5px] h-5 rounded-sm shrink-0" style={{ background: 'var(--green)' }} aria-hidden="true" />
      <span>{children}</span>
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      id={slug(textOf(children))}
      className="flex items-center gap-2 text-fg-0 text-[16px] font-semibold mt-7 mb-2 scroll-mt-16"
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'rgba(34,197,94,0.55)' }} aria-hidden="true" />
      <span>{children}</span>
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-accent-green/90 text-[13.5px] font-semibold uppercase tracking-wide mt-5 mb-1.5">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-fg-2 text-[14px] leading-[1.7] my-3">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-3 space-y-1.5 text-fg-2 text-[14px] leading-[1.6] pl-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 my-3 space-y-1.5 text-fg-2 text-[14px] leading-[1.6] marker:text-accent-green/70 marker:font-mono">
      {children}
    </ol>
  ),
  li: ({ children, ordered }) =>
    ordered ? (
      <li className="pl-1">{children}</li>
    ) : (
      <li className="relative pl-5 before:content-[''] before:absolute before:left-1 before:top-[9px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-accent-green/50">
        {children}
      </li>
    ),
  strong: ({ children }) => <strong className="text-fg-0 font-semibold">{children}</strong>,
  em: ({ children }) => <em className="text-fg-1 italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="text-accent-green underline decoration-accent-green/40 underline-offset-2 hover:decoration-accent-green transition-colors"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-9 border-0 border-t border-border" />,
  blockquote: ({ children }) => (
    <div
      className="my-4 rounded-lg pl-4 pr-4 py-2.5 text-[13px] leading-[1.6]"
      style={{ background: 'rgba(245,158,11,0.06)', borderLeft: '3px solid var(--amber)', color: 'var(--text-1)' }}
    >
      {children}
    </div>
  ),
  code: ({ inline, children }) =>
    inline ? (
      <code
        className="font-mono text-[12.5px] px-1.5 py-0.5 rounded"
        style={{ background: 'var(--bg-2)', color: 'var(--green)', border: '1px solid var(--border)' }}
      >
        {children}
      </code>
    ) : (
      <code className="font-mono text-[12px] leading-[1.75] text-fg-1">{children}</code>
    ),
  pre: ({ children }) => (
    <pre
      className="my-4 p-4 overflow-x-auto rounded-lg"
      style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderLeft: '3px solid rgba(34,197,94,0.5)' }}
    >
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  th: ({ children }) => (
    <th
      className="text-left font-semibold text-fg-1 px-3 py-2 border-b border-border align-top"
      style={{ background: 'var(--bg-2)' }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => {
    const text = textOf(children).trim()
    if (text && text.length <= 46) {
      for (const rule of STATUS_RULES) {
        if (rule.re.test(text)) {
          return (
            <td className="px-3 py-2 border-b border-border-soft align-top">
              <StatusBadge tone={rule.tone}>{children}</StatusBadge>
            </td>
          )
        }
      }
    }
    return (
      <td className="text-fg-2 px-3 py-2 border-b border-border-soft align-top leading-[1.5]">
        {children}
      </td>
    )
  },
  tr: ({ children }) => <tr className="even:bg-white/[0.015]">{children}</tr>,
}

export default function Dokumentation() {
  const { i18n } = useTranslation()
  const md = i18n.resolvedLanguage === 'en' ? docEn : docDe
  return (
    <div className="px-4 lg:px-8 py-6 lg:py-10">
      <div className="max-w-[900px] mx-auto">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {md}
        </ReactMarkdown>
      </div>
    </div>
  )
}
