// Numbers of the CLI summaries (build, check, audit), in the language of the messages: "0,3 Mo" in French,
// "1 440 px", and a counted noun in the plural form of its number ("1 schéma", "2 schémas").
// The keys of the counted nouns are plurals { one, other } whose text shows the number as {count}.

/**
 * @param {{ locale: string, t: Function }} i18n  a translator (engine/i18n.mjs)
 * @returns {{ number: (x: number, options?: Intl.NumberFormatOptions) => string, count: (key: string, n: number) => string }}
 */
export function numbers(i18n) {
  const nf = new Intl.NumberFormat(i18n.locale);
  return {
    number: (x, options) => (options ? new Intl.NumberFormat(i18n.locale, options) : nf).format(x),
    count: (key, n) => i18n.t(key, { n, count: nf.format(n) }),
  };
}
