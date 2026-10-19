# Revised SVG covers

The user's request to replace the first covers was implemented with the installed [`svg-skill`](../.agents/skills/svg-skill/SKILL.md), including its illustration scenarios and SVG validator. This was an actual local skill load, not a renamed documentation read or an external image service. Its pinned provenance is in `skills.lock.json`.

All twelve release covers were redrawn as original vectors: dimensional blocks, glass tubes and liquid highlights, expressive fruit and animals, a neon perspective track, illustrated cards and a numbered billiards rack. They depict each game's mechanics. Gradients, highlights, shadows and layered shapes replace the initial flat posters. Titles remain live HTML on the cards, preserving the reference's uppercase labels and coloured underlines.

Each cover has an explicit viewBox, accessible title/description and local geometry. There are no linked images, stock thumbnails, emoji illustrations or proprietary source assets. The supplied nine reference screenshots guided layout, card proportions, colours and density; they are not part of the distributed assets.

Reproduce and validate:

```sh
python3 scripts/generate-covers.py
bash .agents/skills/svg-skill/scripts/validate.sh public/game-art
```

The Fruit Merge authored source is preserved in `scripts/art-sources/fruit-merge.svg`; the generator writes the other authored illustrations and copies that source. These are designed SVGs, not random procedural thumbnails. See the [390px library](evidence/home-390.png), [768px library](evidence/home-768.png), [1366px library](evidence/home-1366.png) and [twelve-cover ZIP](evidence/arcade-cover-art.zip).
