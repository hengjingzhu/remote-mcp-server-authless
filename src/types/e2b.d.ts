declare module '@e2b/code-interpreter' {
  export interface ExecutionResult {
    text: string;
    results: any[];
    logs: string[];
    error?: string;
  }

  export interface SandboxOptions {
    apiKey?: string;
    template?: string;
    timeout?: number;
  }

  export interface FilesystemAPI {
    write(path: string, content: string | Buffer): Promise<void>;
    read(path: string): Promise<Buffer>;
  }

  export interface ProcessAPI {
    startAndWait(command: string): Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
    }>;
  }

  export class Sandbox {
    filesystem: FilesystemAPI;
    process: ProcessAPI;
    
    static create(options?: SandboxOptions): Promise<Sandbox>;
    runCode(code: string): Promise<ExecutionResult>;
    close(): Promise<void>;
  }
}