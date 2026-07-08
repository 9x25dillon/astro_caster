/** Emscripten glue for the vendored Swiss Ephemeris wasm (see README.md).
 *  MODULARIZE factory: call with a module-arg object, await the instance. */

export interface SwissEphModuleInstance {
  ccall(
    name: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[]
  ): number | string;
  getValue(ptr: number, type: string): number;
  stringToUTF8(str: string, ptr: number, maxBytes: number): void;
  UTF8ToString(ptr: number): string;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: Uint8Array): void;
  };
}

export interface SwissEphModuleArgs {
  /** Wasm bytes handed over directly — this build's Node read path is
   *  compiled out, so the factory cannot locate the file itself. */
  wasmBinary?: Uint8Array | ArrayBuffer;
  locateFile?(path: string, scriptDirectory: string): string;
}

declare function SwissEphModule(
  args?: SwissEphModuleArgs
): Promise<SwissEphModuleInstance>;

export default SwissEphModule;
