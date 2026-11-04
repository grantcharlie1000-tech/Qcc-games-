# Media pipeline benchmark

Measured with `node scripts/media-benchmark.mjs`, which calls `processImage(input,'post')` three times per fixture. Times cover the whole call: sniff, header read, the full-size WebP encode (quality ladder) and the thumbnail encode. Fixtures are generated in the script.

Machine: cloud container, not a phone. 4 vCPU, linux-x64, Node v22.23.4, sharp 0.35.5 (`sharp.concurrency(1)`, `sharp.cache(false)`). Expect a serverless function with less CPU to be slower.

| Fixture | Input bytes | Runs (ms) | Median encode (ms) | Full output | Thumb output |
| --- | --- | --- | --- | --- | --- |
| 4000x3000 noisy JPEG (blurred random noise, q90) | 2,624,973 | 490, 465, 472 | 472 | 424,072 B, 1600x1200 | 8,460 B |
| 3000x4000 screenshot-like PNG (flat panels, grid, text-like blocks) | 175,168 | 270, 271, 235 | 270 | 60,338 B, 1200x1600 | 24,778 B |

Both fixtures were accepted at the first quality step (82) of the ladder, so these are best-case encode times. A photo that needs all three steps plus the floor edge costs up to six full-size encodes.
