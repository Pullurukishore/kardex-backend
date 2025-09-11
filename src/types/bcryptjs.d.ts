declare module 'bcryptjs' {
  export function hashSync(password: string, saltOrRounds: number | string): string;
  export function compareSync(password: string, hash: string): boolean;
  export function genSaltSync(rounds?: number): string;
  export function hash(password: string, saltOrRounds: number | string): Promise<string>;
  export function compare(password: string, hash: string): Promise<boolean>;
  export function getRounds(hash: string): number;
  
  // For backward compatibility with callback style
  export function hash(password: string, salt: string, callback: (err: Error | null, hash: string) => void): void;
  export function compare(password: string, hash: string, callback: (err: Error | null, isMatch: boolean) => void): void;
}
