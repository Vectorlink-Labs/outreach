import { httpApi, type Api } from "./api";
import { mockApi } from "./mockApi";

/**
 * The fake backend is the default.
 *
 * The FastAPI service does not answer yet, and every screen has to be
 * reviewable before it does. To point at the real thing:
 *
 *     # frontend/.env.local
 *     VITE_USE_MOCK=false
 */
export const USING_MOCK = import.meta.env.VITE_USE_MOCK !== "false";

export const api: Api = USING_MOCK ? mockApi : httpApi;
