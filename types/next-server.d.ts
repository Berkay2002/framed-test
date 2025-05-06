// Type definitions for next/server
declare module 'next/server' {
  export interface NextRequest extends Request {
    nextUrl: URL;
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): { name: string; value: string }[];
      set(name: string, value: string, options?: { path?: string; maxAge?: number; }): void;
      delete(name: string): void;
      has(name: string): boolean;
    };
    geo?: {
      city?: string;
      country?: string;
      region?: string;
    };
    ip?: string;
    ua?: {
      isBot: boolean;
      ua: string;
      browser: {
        name?: string;
        version?: string;
      };
      device: {
        model?: string;
        type?: string;
        vendor?: string;
      };
      engine: {
        name?: string;
        version?: string;
      };
      os: {
        name?: string;
        version?: string;
      };
      cpu: {
        architecture?: string;
      };
    };
  }

  export class NextResponse extends Response {
    constructor(body?: BodyInit | null, init?: ResponseInit);
    
    static json(body: any, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, init?: ResponseInit): NextResponse;
    static rewrite(destination: string | URL, init?: ResponseInit): NextResponse;
    static next(init?: ResponseInit): NextResponse;
    
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): { name: string; value: string }[];
      set(name: string, value: string, options?: { path?: string; maxAge?: number; }): void;
      delete(name: string): void;
      has(name: string): boolean;
    };
  }
} 