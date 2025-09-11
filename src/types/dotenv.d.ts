declare module 'dotenv' {
  export interface DotenvConfigOptions {
    path?: string;
    encoding?: string;
    debug?: boolean | string;
  }

  export interface DotenvConfigOutput {
    error?: Error;
    parsed?: { [key: string]: string };
  }

  export function config(options?: DotenvConfigOptions): DotenvConfigOutput;
  export function parse(src: string | Buffer): { [key: string]: string };
  export function load(): void;
}
