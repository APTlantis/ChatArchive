interface LocalPrism {
  languages: Record<string, unknown>;
  highlight(code: string, grammar: unknown, language: string): string;
  util: {
    encode(value: string): string;
  };
}

declare global {
  var Prism: LocalPrism;
}

declare module '*.js' {
  const value: LocalPrism;

  export default value;
}

export {};
