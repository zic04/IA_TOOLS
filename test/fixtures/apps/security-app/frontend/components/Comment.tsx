// Fixture: renders raw HTML from a prop, bypassing React's default escaping (an XSS risk).
export function Comment({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
