/**
 * One shared empty list for "nothing there yet", so it's the same list on every render. (A fresh
 * `[]` each time looks like a change, so anything worked out from it is worked out again and
 * effects that watch it run again.) It's frozen: adding to it by mistake fails loudly instead of
 * quietly changing every other empty list.
 */
export const EMPTY_LIST = Object.freeze([]) as never[];
