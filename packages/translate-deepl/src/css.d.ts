// `client.ts` imports the stylesheet sass emits next to it in `dist`. There is no
// such file in `src`, so tsc needs to be told the import is legal.
declare module '*.css'
