/** Read a Next.js server-action response without depending on the flight protocol. */
export function interpretActionBody(
  text: string,
  status: number,
  redirectHeader: string | null,
): { ok: boolean; title: string } {
  if (redirectHeader || text.includes("NEXT_REDIRECT")) {
    return { ok: true, title: "Done" };
  }
  if (status >= 400) return { ok: false, title: "Something went wrong" };

  const okFalse = /"ok"\s*:\s*false/.test(text);
  const okTrue = /"ok"\s*:\s*true/.test(text);
  const err = text.match(/"error"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const msg = text.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const decode = (value?: string) =>
    value
      ? value.replace(/\\"/g, '"').replace(/\\n/g, " ").slice(0, 180)
      : "";

  if (okFalse) {
    return { ok: false, title: decode(err?.[1]) || "Something went wrong" };
  }
  if (err && !okTrue) return { ok: false, title: decode(err[1]) };
  if (text.includes('"digest"') && !okTrue) {
    return { ok: false, title: "Something went wrong" };
  }
  if (okTrue) return { ok: true, title: decode(msg?.[1]) || "Saved" };
  return { ok: true, title: "Saved" };
}
