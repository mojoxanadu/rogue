/* @ts-self-types="./flying-dragon.d.ts" */

import * as wasm from "./flying-dragon_bg.wasm";
import { __wbg_set_wasm } from "./flying-dragon_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    run_wasm
} from "./flying-dragon_bg.js";
