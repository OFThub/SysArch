/**
 * User text (labels, names, pin names) made safe inside a one-line comment
 * of generated code. Only visible text survives: letters, marks, digits,
 * punctuation, symbols and spaces. Everything else (line breaks, other
 * controls, the Unicode line separators, and format characters such as
 * bidi overrides that make a file read differently from how it compiles)
 * becomes a space, so the text can never end the comment and run as code.
 *
 * C needs two more steps: a backslash at the end of a line, even before
 * spaces, splices the next line into the comment, and so does its trigraph
 * spelling ??/. Backslashes become slashes and question marks never run in
 * pairs, so neither can form.
 */
export const inComment = (text: string) =>
  text
    .replace(/[^\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]+/gu, ' ')
    .replaceAll('\\', '/')
    .replace(/\?(?=\?)/g, '? ')
    .replace(/\s+/g, ' ')
    .trim();
