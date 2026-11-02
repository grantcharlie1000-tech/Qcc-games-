# Shared floating game controls

`GameContext.dock` is optional, so every existing context/game remains compatible. The app owns DOM, glass bindings and disposal; games keep their actions, score/save calls and input timing. No game directory changed in this run.

```ts
context.dock?.setStats([{label:'Level',value:level + 1}]);
context.dock?.setActions([
 {id:'undo',label:'Undo',icon:'undo',disabled:!canUndo,onPress:undo},
 {id:'hint',label:'Hint',icon:'hint',disabled:!canHint,onPress:hint}
]);
context.dock?.setPlacement('top-left');
```

- `setStats(DockStats)`: a readonly tuple of1–3 `{label:string,value:string|number}`. Calling it takes ownership of chip presentation; the legacy caption mirror stops overwriting it. Continue existing `setScore`/`setLevel` calls for the menu/state; this presentation API never writes scores or saves.
- `setActions(DockActions)`: a readonly tuple of0–2 `{id,label,icon,onPress,disabled?,pressed?}`. IDs remain stable across updates. Updating callbacks/disabled/pressed keeps DOM identity and keyboard focus. `setActions([])` removes the slots. The order is Games → action1 → HUD → action2 → Menu. An overflowing chip moves to its own compact second line.
- Icons come from the trusted `UiIcon` set (`undo`, `hint`, `star`, `trophy` and the existing navigation icons). Crossy's star uses `icon:'star'`; its size/rim/material come from the same control class.
- Placement is `top-left` (default) or `top-center`. Neon Coil uses the default leading placement. Scene/HUD integrations can consume `--game-dock-top`, `--game-dock-bottom`, `--game-dock-inline-size`, `--game-dock-inline-end` on `.game-view`, plus global `--floating-control-height`. The controls-sweep owner moves the Neon Coil leaderboard, using the first/top variable for a level top-right alignment and inline-end to avoid the cluster.
- Control height is64px normally,52px below360px,48px in landscape shorter than481px. The section bar/Menu circle consumes the same geometry token; every dock object shares that height. The cluster overlays the scene and uses its leading free margin. Only measured collisions request local headroom; the wrapper paints/reserves no full-width row.

Factory callers retain `createGameDock({backHref,backIcon,menuIcon,pointerLock?})` and `{root,back,hud,menu}`. New optional options are `title` and `placement`; new methods are `setStats`, `setActions`, `setPlacement`, `mirrorStats`, `bind`, `dispose`. Append before `bind()`. Call `dispose()` once before removing the view. Do not also bind its children separately. The app now owns those bindings centrally.

The Menu glyph is a menu, and its existing action still pauses/opens the game sheet. Accessible names stay Games/Menu. PC actions are icon circles as well, retaining the Games/Menu accessible names. The leading default keeps the centre of portrait scenes and wide desktop boards clear; the layout verifier checks all21 games at320/390/844×390/1366. Full-bleed game renderers keep their exact canvas/input mapping; their foreground HUD remains game-owned. No material recipe is forked.

The read-only adapter keeps each game’s existing live information, including Ball Run’s mode/record captions; multiword captions can wrap within the chip while values share a baseline. All21 current surfaces are classified before binding, including Block Fill’s brighter upper surface using the existing light variant. No tint/blur/refraction/shadow recipe value changes. Caption/viewport/placement/shape changes re-evaluate collisions; shrinking the cluster releases headroom.
