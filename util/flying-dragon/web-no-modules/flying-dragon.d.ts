declare namespace wasm_bindgen {
    /* tslint:disable */
    /* eslint-disable */

    export function run_wasm(): void;

}
declare type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

declare interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly main: (a: number, b: number) => number;
    readonly run_wasm: () => void;
    readonly wasm_bindgen__closure__destroy__h1636fd3da6a1da7e: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__h11c2399b4e26cebf: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__h67c41f1aab69bb31: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h9ce33b9f33515fb5: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h3af91821b120d45b: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h1b9a4154c5893414: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h22dee46d4144b010: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h22dee46d4144b010_3: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h22dee46d4144b010_4: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h22dee46d4144b010_5: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h22dee46d4144b010_6: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h22dee46d4144b010_7: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h22dee46d4144b010_8: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h22dee46d4144b010_9: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h1f9ccd87d178607a: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
declare function wasm_bindgen (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
