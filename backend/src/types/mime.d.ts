declare module 'mime' {
  export function lookup(path: string): string | false;
  export function define(mimes: { [key: string]: string | string[] }, force?: boolean): void;
  export function getType(path: string): string | null;
  export function getExtension(mime: string): string | null;
  export const default_type: string;
}
