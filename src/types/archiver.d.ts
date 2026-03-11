declare module "archiver" {
  type ArchiverInstance = {
    append(source: Buffer | string, data: { name: string }): void;
    finalize(): Promise<void>;
    on(event: "error", listener: (error: Error) => void): void;
    pipe(stream: NodeJS.WritableStream): void;
  };

  export default function archiver(
    format: "zip",
    options?: { zlib?: { level?: number } },
  ): ArchiverInstance;
}
