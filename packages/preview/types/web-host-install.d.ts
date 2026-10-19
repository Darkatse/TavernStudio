// `/tauri/web-host/install.js` ships with each TauriTavern image, and
// web-host.ts imports it at run time. tsconfig.json maps the path here.
import type { WebHostOptions } from '../src/host';

export declare function installWebHost(options: WebHostOptions): {
  emit(name: string, payload: unknown): void;
};
