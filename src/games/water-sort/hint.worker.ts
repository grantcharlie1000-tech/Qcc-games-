import { hintFor } from './hint';
import type { HintInput } from './hint';

// Only this application's HintSearch posts to this dedicated worker.
self.addEventListener('message', (event: MessageEvent<HintInput>) => {
  self.postMessage(hintFor(event.data));
});
