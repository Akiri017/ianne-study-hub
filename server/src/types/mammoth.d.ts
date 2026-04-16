/**
 * Minimal type declaration for mammoth.
 * The mammoth package ships no .d.ts files, and @types/mammoth does not exist.
 * Only the methods used by parser.ts are declared here.
 */
declare module 'mammoth' {
  interface ExtractRawTextResult {
    value: string
    messages: unknown[]
  }

  interface PathInput {
    path: string
  }

  function extractRawText(input: PathInput): Promise<ExtractRawTextResult>
}
