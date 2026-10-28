// Measures one PR off the server's main thread, so the server can stream each stage as it ends.
// In: { n }. Out: { stage, ms } per stage, then { measured } or { error }.
import { measurePr } from "./fixtures";

declare const self: Worker;

self.onmessage = async (e: MessageEvent<{ n: number }>) => {
  try {
    const measured = await measurePr(e.data.n, (stage, ms) => postMessage({ stage, ms }));
    postMessage({ measured });
  } catch (error) {
    postMessage({ error: (error as Error).message });
  }
};
