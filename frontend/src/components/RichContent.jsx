/**
 * Renders trusted HTML produced by the CMS rich-text editor.
 * Content originates from authenticated super_admin users via TipTap (sanitised editor output),
 * so we render it as-is. Tailwind `prose` provides typographic defaults; inherit colors via class overrides.
 */
export default function RichContent({ html, className = "" }) {
  if (!html) return null;
  return (
    <div
      className={`prose prose-neutral max-w-none prose-headings:font-serif prose-headings:tracking-tight prose-p:leading-relaxed prose-a:text-[var(--dojo-green)] prose-strong:text-inherit ${className}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
