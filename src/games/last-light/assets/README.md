# Last Light district artwork

`district-vistas.png` is an original generated pixel-art background sheet created with OpenAI image generation on 9 November 2026 for this game. An initial original environment concept guided a second asset-generation pass; no external game artwork or screenshots were used as image inputs.

The 512×768 sheet contains three 512×256 native-pixel panels: Mossworks conservatory, Frostline monastery/ravine, and Afterglow observatory. The generation output was sampled with nearest-neighbor scaling. `district-vistas.ts` caches the panels, applies district-colored atmospheric separation, and draws them without smoothing. These images are background scenery, not collision surfaces. World-space masonry, support columns and foreground deck materials remain code-drawn and tied to the actual level geometry.
