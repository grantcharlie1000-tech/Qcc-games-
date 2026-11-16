# Apple Liquid Glass: design, behavior, and web implementation reference

Research snapshot: 14 November 2026. The design baseline is Apple's WWDC 2025 introduction and the 26 generation of its operating systems. Apple can change system rendering without changing application code; later documentation may describe newer SDKs. This document is research and an implementation brief. It does not change QCC application code.

## How to read the evidence

- **Apple-confirmed** means an Apple design session, guideline, API description, or support document explicitly states the point. This does not make an undocumented parameter available.
- **Observed** means a named third party measured or described a particular case. Record the capture, device, build, and control when known, and state what the source leaves unknown. It is evidence about that case, not a universal Apple specification.
- **Web proposal** means a concrete, testable starting value or engineering choice made for QCC. It is an estimate, not an Apple value or a validated pixel match.
- **Unknown** means the consulted sources do not publish or establish it. In particular, Apple does not publish the general shader, exact kernel, refraction index, universal blur radius, opacity, or spring constants for Liquid Glass.

The source links are placed next to the relevant claims and collected at the end. CSS pixels, physical display pixels, Apple points, and video pixels are different units. Do not copy numbers between them without recording the scale. Browser support is time-sensitive, so the compatibility table is dated and must be rechecked against the browsers QCC actually supports.

## Contents

1. [Design model and placement](#1-design-model-and-placement)
2. [Optical appearance](#2-optical-appearance)
3. [Translucency, adaptation, and color](#3-translucency-adaptation-and-color)
4. [Interaction and transitions](#4-interaction-and-transitions)
5. [Motion and timing](#5-motion-and-timing)
6. [Accessibility](#6-accessibility)
7. [Native performance](#7-native-performance)
8. [Apple developer APIs](#8-apple-developer-apis)
9. [Web reimplementation techniques](#9-web-reimplementation-techniques)
10. [Practical web specification](#10-practical-web-specification)
11. [Test and measurement plan](#11-test-and-measurement-plan)
12. [Sources](#12-sources)

## 1. Design model and placement

### What it is

Apple introduced Liquid Glass on 9 June 2025 as a dynamic material for controls and navigation. It combines a transparent, light-bending appearance with fluid, responsive movement. Its color and highlights are affected by context. Apple describes it as a digital material, not a physical glass simulation with disclosed physical constants. The shared design was introduced across iOS 26, iPadOS 26, macOS Tahoe 26, watchOS 26, and tvOS 26. Its spatial-design inspiration includes the existing visionOS interface. [Apple introduction](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/) | [Meet Liquid Glass, WWDC25](https://developer.apple.com/videos/play/wwdc2025/219/)

The 2025 announcement does not claim that every visionOS 26 surface received the same redesign. visionOS has its own spatial materials and widget glass textures; its widgets can also use a paper texture. Its separate `glassBackgroundEffect` provides 3D thickness, specularity, blur, and shadows, and its depth affects z-axis layout. The current availability metadata for SwiftUI `Glass` lists iOS, iPadOS, macOS, Mac Catalyst, tvOS, and watchOS 26 or later, but does not list visionOS. Do not assume that `glassEffect` or the 2D platforms' exact material behavior is available there. Check the deployment target and current SDK for each symbol. [Apple widget session](https://developer.apple.com/videos/play/wwdc2025/278/?time=931) | [Spatial glass background](https://developer.apple.com/documentation/swiftui/view/glassbackgroundeffect%28displaymode%3A%29.md) | [SwiftUI Glass availability](https://developer.apple.com/documentation/swiftui/glass.md)

The useful mental model has three roles:

```text
          Foreground: labels, symbols, and accessible controls
      +-------------------------------------------------------+
      | Functional layer: floating navigation and tools       |  glass
      +-------------------------------------------------------+
          Scroll-edge treatment where moving content meets UI
      +-------------------------------------------------------+
      | Content layer: images, games, lists, text, media       |  standard materials
      +-------------------------------------------------------+
```

The functional layer gives control surfaces a shared visual elevation while allowing content to remain the main event. A stationary screen should avoid having essential content accidentally intersect controls; scrolling underneath is a deliberate, transient relationship. Use a standard material or conventional background for content panels rather than coating every card with glass. The narrow exception is an interactive part of an in-content control, such as a slider or toggle, that temporarily takes on glass while being manipulated. [Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) | [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

### Placement by component

| Component | Apple-confirmed role and behavior | Web design implication |
| --- | --- | --- |
| Floating tab bar | Persistent navigation, above content; supported iPhone implementations can minimize when scrolling down and expand on return. | Reserve space and preserve discoverability; do not hide the current location. |
| Toolbar and buttons | Related actions share glass-backed groups; system controls already receive the material. | Group nearby controls into a small number of surfaces and keep labels readable. |
| Sidebar and inspector | Floating navigation or context in iPad and Mac layouts; larger regions respond to nearby color and remain legible. | Use a larger, quieter surface with appropriate content separation, not a row of separate glass cards. |
| Partial-height sheet | iOS 26 sheets can be inset with glass and nested corners; an explicitly configured zoom transition can connect a sheet to its source button. | Treat the sheet as one elevated surface. Keep dialog focus and dismissal behavior intact. |
| Menu and alert | A menu or in-place alert can grow from the action that opened it. | Preserve spatial origin and accessible focus; visual continuity is subordinate to a usable menu. |
| Slider, switch, segmented selection | Interactive portions can acquire glass while active. | Resting controls can be quiet; expose state without relying on transparency or animation. |
| Lock Screen and system widgets | Apple uses glass in time, notifications, and layered icon or widget treatments. | These are platform-specific examples, not a reason to apply glass to all app content. |
| watchOS surfaces | Apple identifies Smart Stack widgets and hints, notifications, Control Center, Photos watch-face numerals, and in-app controls. | Adapt to small screens and watch input; do not assume identical rendering or behavior across platforms. |
| tvOS focus | Standard controls or image views can acquire glass on focus. | Keyboard and gamepad focus need a strong visible state independent of hover. |

Sources: [Apple newsroom](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/), [watchOS 26 announcement](https://www.apple.com/newsroom/2025/06/watchos-26-delivers-more-personalized-ways-to-stay-active-and-connected/), [Build a SwiftUI app with the new design](https://developer.apple.com/videos/play/wwdc2025/323/), [Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/), and [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials). Apple says watchOS design changes are relatively small and standard toolbar and button APIs pick up the appearance. [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)

### Rules that matter for a web reconstruction

1. Prefer one distinct navigation and controls layer. The content layer can be rich, but glass controls need clear grouping and safe spacing.
2. Avoid putting custom glass on top of another glass surface. Use a simple fill, transparent overlay, or vibrant foreground for controls that live inside an existing glass container. A temporary system interaction can have special behavior; it is not permission to stack custom glass everywhere. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
3. Use glass sparingly. Reuse system-native controls when making native apps and treat custom glass as an exception, not a default card style. [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
4. Keep rounding visually concentric with its parent or screen. On Apple platforms, system corner APIs can provide this relationship. There is no evidence for a single universal radius. [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
5. Keep persistent navigation separate from actions that only belong to one piece of content. [Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)

## 2. Optical appearance

### Lensing, shape, and refraction

Apple identifies lensing as a principal visual cue. Background light is bent and concentrated, making the surface recognizable while the content remains perceptible. This is an active, context-dependent system, not merely a rounded rectangle with a uniform blur. Its silhouette and edge response communicate thickness and elevation. Apple does not publish the refraction equation, glass thickness, index of refraction, or edge profile. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

A useful **web approximation**, not an Apple implementation claim, is a rounded rectangle with a flat or gently curved center and a convex edge ramp. The ramp changes its surface normal rapidly near the perimeter, so background features bend more near the boundary than in the center. A two-dimensional displacement field can use the gradient of a height field or a rounded-rectangle signed distance field. A lens can compress, bend, or magnify parts of an image depending on its shape and sampling direction. Do not assume every system glass element magnifies everything behind it.

```text
Cross-section, conceptual only, not a measurement

                 soft highlight
                       v
             _________/ \_________
          __/  thickened edge ramp  \__       glass surface
         /_____________________________\
             )                     (          edge-directed sampling
       background: straight line under the control
       perceived:  line bends most near its edges
```

One independent reconstruction reports unscaled 3x iPhone screenshots of a held Phone tab-bar selection lens. It estimates the bar's hairline is displaced about 11 physical pixels, or 3.7 points, at one edge. It concludes that the rim samples outward in that example and could not establish whether the central image magnifies. Its capture is a single control under particular conditions; the exact iPhone model and iOS build are not identified. It does not establish an Apple-wide refraction magnitude or direction. The author reports differences between the video and screenshots. [Third-party reference measurements](https://github.com/shayann07/liquidglass/blob/main/docs/research/reference-measurements.md)

### Highlights, light, and depth

Apple describes an environment with light sources that produce highlights responsive to a material's geometry. Light can move around a silhouette during transitions such as locking and unlocking. In **some cases**, lighting also responds to device motion. This is not a promise that all highlights use device motion, a real ambient-light sensor, or a physically measured light direction. On interaction, the surface can brighten from within and reflect onto nearby glass. [Meet Liquid Glass, principles](https://developer.apple.com/videos/play/wwdc2025/219/?time=631)

A convincing edge is directional and curved with the shape, rather than a uniform bright stroke. Its exact width, color, location, and intensity vary with size, environment, state, and platform. Ambient color can spill into the surface and shadow of large sidebars. As text scrolls behind a control, its shadow can strengthen to keep the control distinguishable; over a plain light background, it can become lighter. Larger expanded surfaces can have deeper shadows, stronger refraction, and softer light scattering than their smaller starting controls. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

For the web, a narrow inner highlight, a soft outside shadow, and a dimmer opposing edge are cheap cues. These are approximations. A single white outline, a strong permanent drop shadow, and a rainbow rim do not reproduce all of Apple's adaptive behavior. Shadows and rims are decorative; they must not be the only visible focus or state cue.

### Chromatic effects and magnification

Apple's introductory session describes light bending and reflection but does not publish a general chromatic-dispersion or rainbow-fringe parameter. The third-party Phone tab capture above reports red and blue separation around a held lens; the same analysis reports no fringe at the resting indicator. Treat this as an observation of one state, not proof that every Apple glass edge has RGB splitting. Add no persistent rainbow by default. If a controlled comparison justifies dispersion, enable a very small, bounded channel offset only where the reference shows it and evaluate text legibility. [Apple session](https://developer.apple.com/videos/play/wwdc2025/219/) | [Third-party capture analysis](https://github.com/shayann07/liquidglass/blob/main/docs/research/reference-measurements.md)

## 3. Translucency, adaptation, and color

### Regular and clear materials

| Native material | Apple-confirmed characteristics | Appropriate use |
| --- | --- | --- |
| `Glass.regular` | Versatile default. Adapts to background, size, appearance, and accessibility settings; tries to preserve legibility. | General navigation and controls over varied content. |
| `Glass.clear` | More transparent and does not have the regular variant's same automatic background adaptation. It needs legibility support. | Controls over visually rich media, with bright, bold foreground content and a compatible darkened or already dark backdrop. |
| `Glass.identity` | No glass is applied; content remains unaffected. It is an API identity value, not a third visible material. | Conditional use or animation between a material and no effect. |

Apple's 2025 session says not to mix regular and clear variants in the same design context. The HIG says to use clear for visually rich backgrounds and consider a **35% opacity dark dimming layer** if the content is bright; sufficiently dark content and AVKit controls with their own dimming need no additional layer. The SwiftUI clear API shows a **30% black** background as an example. These are context-specific legibility guidance and sample code, not the opacity of the glass or a universal guarantee of sufficient contrast. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) | [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials) | [Glass.clear](https://developer.apple.com/documentation/swiftui/glass/clear)

Do not confuse the `Glass.clear` API variant with the iPhone's later user-facing **Clear** appearance setting. The API selects a material variant in application code; the setting expresses a user preference about the system's appearance. Nor is the **Tinted** system preference the same as applying an accent tint to a primary action.

### Adaptive color, blur, and size

Apple says regular glass uses multiple layers whose tint, dynamic range, highlights, and shadow respond to the surrounding content. Small controls and their foreground symbols can switch light or dark as the background changes. Large elements such as menus and sidebars also adapt to their environment but do not simply flip between the small-control light and dark styles. Enlarging a control into a menu makes it look more substantial, with more scattering, richer shadow, and stronger lensing. Apple does not publish a numeric blur radius or a universal percentage of background transmission. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) | [Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/)

**Observed, narrow case:** the independent Phone tab-bar analysis estimates transmission and brightness over black for a dark bar in one video. Its screenshots produce a different brightness, potentially because settings, build, or capture conditions differ. This is useful evidence that one fixed alpha does not describe all cases. It is not proof of Apple's internal compositing formula. [Capture analysis](https://github.com/shayann07/liquidglass/blob/main/docs/research/reference-measurements.md)

The glass layer and the **scroll edge effect** are separate. As moving content passes beneath pinned UI, a soft edge treatment can dissolve or blur content into the background, keeping the functional layer legible. A harder style is used where a clearer boundary is needed. Apple recommends one consistent effect for a view and warns against stacking effects. A scroll edge treatment is not a substitute for sufficient foreground contrast. [Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/) | [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

### Tint and emphasis

Native tint maps an intended color through a range of tones influenced by underlying brightness. It maintains the glass character more effectively than replacing the material with an opaque colored fill. Use tint selectively to emphasize a primary action, and test the selected color in light, dark, and increased-contrast contexts. Foreground vibrancy is also part of the system's legibility treatment; CSS `saturate()` by itself is not an equivalent. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) | [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)

## 4. Interaction and transitions

Apple designs the appearance and motion together. A control can respond immediately to touch with illumination and a flexible, gel-like change of form. On release it can settle back. Some controls become glass temporarily only while active. Materializing or dematerializing a glass surface changes its lensing rather than simply fading a translucent rectangle. Menus can expand from their source button; navigation elements can change shape across a transition. These are descriptions of system behavior, not guaranteed universal timings. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) | [Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/)

| Input or state | Native behavior confirmed by Apple | Web implication |
| --- | --- | --- |
| Touch or press | Interactive glass can flex, brighten, and give a scale or bounce response. | Give immediate feedback on pointer down; preserve click, keyboard, and cancel behavior. |
| Drag | A pliable interactive element can track the gesture. | Keep response attached to the input; do not put a long animation between pointer and control. |
| Hover or focus | Platform and control behavior varies; tvOS standard controls show glass on focus. | Provide hover only on hover-capable devices and a separate visible keyboard/gamepad focus state. |
| Nearby controls | A glass container can blend shapes as they approach, according to spacing. | Merge only related peers; prevent collisions with unrelated content or overlapping controls. |
| Button to menu | The larger material can morph from the source and become more substantial. | Preserve the button-to-menu relationship and normal focus management. |
| Scroll | Eligible tab bars minimize as content scrolls down and expand again on return; edge effects support clarity. | Implement only for suitable navigation. Maintain a reliable way to reopen and never lose navigation access. |

Do not infer an actual measured pressure sensor, a specific mesh deformation, or uniform response on all platforms. For keyboard users, honor normal native `Enter` and `Space` activation and focus semantics. For reduced motion, retain immediate state changes while removing elastic motion.

Apple also demonstrates an explicitly configured sheet transition from a toolbar button. In SwiftUI, the example marks the button with `.matchedTransitionSource(id:in:)` and gives the sheet `.navigationTransition(.zoom(sourceID:in:))` using the same namespace and ID. This opt-in zoom links the source and destination; it is not a claim that every sheet automatically morphs from its button. As a partial sheet grows to full height, Apple's example transitions its background toward an opaque surface anchored to the screen edge. [SwiftUI sheet example](https://developer.apple.com/videos/play/wwdc2025/323/?time=430)

## 5. Motion and timing

### What Apple establishes

Apple describes immediate visual feedback, flexible movement, transitions that preserve spatial continuity, and an effect-specific materialization. UIKit's guidance is to animate the effect itself when adding or removing glass rather than merely animating the effect view's alpha. This allows the system to perform its materialization. Apple does not provide a universal Liquid Glass spring `stiffness`, `damping`, mass, response, damping fraction, or press duration in the cited material. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) | [Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/) | [SwiftUI custom glass](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)

An independent project's measurements of one Phone tab-bar capture report a held lens formed within two frames of a roughly 30 fps recording, at most about 67 ms, and subsided over 10 to 14 frames, about 333 to 467 ms. The video was compressed and scaled; timestamps are quantized to frames. This is a **third-party observation for one control**, not a published Apple spring. [Capture method and measurements](https://github.com/shayann07/liquidglass/blob/main/docs/research/reference-measurements.md)

Another reconstruction reports approximate response settings for its iOS 26.4-inspired tab control, including 0.38 s expansion, 0.30 s finger-follow, and 0.36 s settling. These values belong to that implementation's fit, not Apple. Its animation parameters do not by themselves establish the total visual duration. [adaptive_liquid_glass changelog](https://pub.dev/packages/adaptive_liquid_glass/versions/0.2.5/changelog)

For QCC's proposed testable starting values, see [section 10](#10-practical-web-specification). Motion should end; avoid continuous movement that consumes resources or competes with gameplay. Browser implementations may animate geometry and highlights as a substitute for materialization, but should not claim to recreate Apple's native shader.

## 6. Accessibility

| Setting | What Apple says changes | Required web interpretation |
| --- | --- | --- |
| Reduce Transparency | Liquid Glass becomes frostier and obscures more of the content behind it. | Use an opaque or near-opaque accessible surface and preserve controls. Respond to `prefers-reduced-transparency: reduce` where supported and offer an explicit in-app choice where it is not. |
| Increase Contrast | The material becomes predominantly black or white with a contrasting border. | Strengthen surface and state contrast. Honor `prefers-contrast: more` and `forced-colors` where available; retain a manual high-contrast option. |
| Reduce Motion | The intensity of some effects is reduced and elastic properties are disabled. | Disable bounce, drag wobble, device-driven highlights, and decorative morphs under `prefers-reduced-motion: reduce`; update state immediately. |
| iOS 26.1 Clear/Tinted preference | Tinted increases opacity of material in apps and Lock Screen notifications. | Treat it as a system appearance preference, not an API glass variant. Web pages do not have a reliable standard query for this exact iOS setting. |

Apple's iPhone guide places the Clear/Tinted choice under Settings, Display & Brightness, Liquid Glass. It says Reduce Transparency or Increase Contrast must be turned off to change that look. The preference is distinct from accent tint applied to an action. [Apple iOS 26.1 release notes](https://support.apple.com/en-au/123075) | [Apple iPhone display settings](https://support.apple.com/en-asia/guide/iphone/iphd6804774e/ios) | [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

`prefers-reduced-transparency` has limited browser availability. Lack of a matching media query must not be interpreted as proof that a person wants transparent effects. A visible, persistent in-app accessibility or appearance option is a practical fallback. Make color, state, action labels, focus, and keyboard access understandable with effects disabled. [MDN reduced transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-transparency) | [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)

For contrast, WCAG 2.2 AA specifies at least 4.5:1 for ordinary text and 3:1 for qualifying large text. Required visual boundaries, states, and graphical objects generally need 3:1 against adjacent colors, subject to the criterion's exceptions. Do not count a decorative highlight as an adequate focus indicator without testing the actual adjacent colors. An opaque fallback should be available where dynamic backgrounds cannot be made reliably legible. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)

## 7. Native performance

Apple says `GlassEffectContainer` renders nearby glass shapes together, improving rendering performance and enabling nearby shapes to interact and morph. It does not publish exact GPU passes, sample-region dimensions, or performance improvement percentages for its implementation. It is reasonable to think about shared effect work and sampling regions, but do not assert a specific Apple render graph without evidence. [GlassEffectContainer](https://developer.apple.com/documentation/swiftui/glasseffectcontainer)

Grouping everything into one container is not automatically optimal. Apple's rendering-efficiency guidance says grouping spatially distant views can increase unnecessary updates: a change in the large region between controls can cause both to update. Keep groups local, profile their actual extent, and inspect updated regions. Apple also notes that changing content around or beneath glass causes extra work, advises avoiding unnecessarily overlapping redraws, and suggests simple backgrounds when complex effects are not required. [Improving rendering efficiency](https://developer.apple.com/documentation/xcode/improving-your-app-s-rendering-efficiency)

The same guidance says unnecessary redraws and complex updates can increase CPU and GPU energy use and cause hitches. High frame rates use more power; animations should stop after they communicate a state change. It does not quantify Liquid Glass battery drain, temperatures, throttling, or a per-control GPU cost. Profile the target device, OS, content, screen brightness, and duration before making such claims. Do not attribute transient post-update indexing, whole-app energy use, or unrelated SwiftUI list benchmarks to the material. [Apple rendering efficiency](https://developer.apple.com/documentation/xcode/improving-your-app-s-rendering-efficiency) | [Apple Safari Web Inspector](https://developer.apple.com/safari/tools/)

## 8. Apple developer APIs

This section describes native APIs for reference. The snippets are illustrative documentation, not a change to QCC's web application. Availability is taken from current Apple symbol metadata and can differ by symbol. Always compile against the intended SDK and guard older OS versions.

### SwiftUI

Apple lists `Glass`, `glassEffect`, `GlassEffectContainer`, and the related transition APIs on iOS, iPadOS, macOS, Mac Catalyst, tvOS, and watchOS 26.0 and later. The metadata does not list visionOS. visionOS has a separate `glassBackgroundEffect` available since visionOS 1.0; do not assume it has identical Liquid Glass semantics. [Glass availability](https://developer.apple.com/documentation/swiftui/glass.md) | [glassEffect availability](https://developer.apple.com/documentation/swiftui/view/glasseffect%28_%3Ain%3A%29.md) | [visionOS glass background](https://developer.apple.com/documentation/swiftui/view/glassbackgroundeffect%28displaymode%3A%29.md)

| API | Purpose and important distinction |
| --- | --- |
| `.glassEffect(_:in:)` | Applies glass behind the view with associated foreground effects. Default is regular glass in a capsule. The shape follows view bounds, including padding. Apply it after modifiers affecting the view's appearance. |
| `.regular`, `.clear`, `.identity` | Regular is the adaptive default; clear is the special media-oriented variant; identity applies no glass effect. |
| `.tint(color)` | Configures a glass tint. This is separate from the user's Clear/Tinted preference. |
| `.interactive()` | Adds interactive visual behavior to a custom glass effect. It does not create a button, action, keyboard interaction, or accessibility semantics. |
| `GlassEffectContainer(spacing:)` | Renders nearby effects together and supports proximity blending. Greater spacing starts blending earlier. The SwiftUI documentation does not specify a numeric default for `nil`. |
| `.glassEffectID(_:in:)` | Associates an effect with an identity in a namespace for transitions. Apple says effects should have unique IDs; geometry and spacing affect the morph. |
| `.glassEffectTransition(...)` | Controls how an effect appears or disappears. `matchedGeometry` is the documented default within spacing; `materialize` provides a material transition without matching geometry. |
| `.glassEffectUnion(id:namespace:)` | Treats effects with the same union identifier as a combined shape. Follow Apple's requirements for matching shape and variant. |
| `.buttonStyle(.glass)` and `.buttonStyle(.glassProminent)` | Standard styles for actual buttons. Prefer these to reimplementing behavior or placing an extra glass effect over an already glass-styled button. |
| `.tabBarMinimizeBehavior(.onScrollDown)` | An available behavior for a suitable `TabView`, rather than a mandate to minimize every tab bar. |

Sources: [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views), [glassEffect](https://developer.apple.com/documentation/swiftui/view/glasseffect%28_%3Ain%3A%29), [GlassEffectContainer](https://developer.apple.com/documentation/swiftui/glasseffectcontainer), and [SwiftUI session](https://developer.apple.com/videos/play/wwdc2025/323/).

For example, these are two separate patterns. The first decorates a custom view, while the second gives an actual button system semantics and style:

```swift
// Custom appearance only; add appropriate action and accessibility semantics.
Label("Filter", systemImage: "line.3.horizontal.decrease")
    .padding(12)
    .glassEffect(.regular.tint(.blue).interactive(), in: Capsule())

// An actual button receives the system button style and interaction behavior.
Button("Save") { save() }
    .buttonStyle(.glassProminent)
```

A container's visual blend is not the same thing as a matched transition. For transitions, apply stable, distinct glass effect IDs in a common namespace and animate a state change. For an intentionally unified collection of shapes, use the union API where appropriate. Avoid assigning the same ID to unrelated controls or assuming that mere visual proximity creates correct accessibility order. On tvOS, the explicit glass button styles can show glass regardless of whether the button is focused, so test focus separately. The configurable `.glass(.clear)` button style is documented from 26.0; the separate `GlassButtonStyle(_:)` initializer is documented from 26.1. [Custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views) | [Button style](https://developer.apple.com/documentation/swiftui/primitivebuttonstyle/glass%28_%3A%29) | [Initializer availability](https://developer.apple.com/documentation/swiftui/glassbuttonstyle/init%28_%3A%29.md)

### UIKit

`UIGlassEffect` is a `UIVisualEffect` for iOS, iPadOS, Mac Catalyst, and tvOS 26.0 or later. Use it through a `UIVisualEffectView`, and place foreground labels or images in that view's `contentView`. The effect has a style, `tintColor`, and `isInteractive`. `UIGlassContainerEffect` combines multiple glass elements; its spacing influences proximity interactions. Use system button configurations such as `glass()` and `prominentGlass()` when they fit the control. [UIGlassEffect](https://developer.apple.com/documentation/uikit/uiglasseffect.md) | [UIGlassContainerEffect](https://developer.apple.com/documentation/uikit/uiglasscontainereffect.md) | [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)

Apple's UIKit session shows creating an effect and setting the effect view's `effect` in an animation. It recommends animating the effect property, including setting it to `nil` to remove the material, instead of merely changing the effect view's alpha. This allows the system's materialization to occur. Dynamic foreground colors and the effect view's content treatment contribute to legibility. [Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/)

### AppKit

`NSGlassEffectView` and `NSGlassEffectContainerView` are available on macOS 26 and later. The glass view has a `contentView`, style, corner radius, and tint; embed the content in the effect view so it receives the intended treatment. Its container's `spacing` defaults to **zero**, which Apple says allows batch processing without proximity merging. This documented AppKit default must not be assumed to be the SwiftUI container default. [NSGlassEffectView](https://developer.apple.com/documentation/appkit/nsglasseffectview.md) | [AppKit container spacing](https://developer.apple.com/documentation/appkit/nsglasseffectcontainerview/spacing.md) | [AppKit WWDC session](https://developer.apple.com/videos/play/wwdc2025/310/)

A current documentation trap: `NSGlassEffectView.effectIsInteractive` is documented as available from **macOS 27**, not macOS 26, and defaults to false. Check availability before using it. `NSButton.BezelStyle.glass` is a separate system button option from macOS 26. [effectIsInteractive availability](https://developer.apple.com/documentation/appkit/nsglasseffectview/effectisinteractive.md) | [Glass button bezel](https://developer.apple.com/documentation/appkit/nsbutton/bezelstyle-swift.enum/glass)

### Native design review checklist

- Use regular glass for general controls; reserve clear for the media conditions Apple describes.
- Remove redundant custom backgrounds from system bars and inspect safe areas and scroll edges after rebuilding with the new SDK.
- Keep controls and content distinct, use glass sparingly, and avoid nested glass.
- Group only related nearby effects; measure update regions instead of assuming one huge container is faster.
- Use system controls, dynamic colors, accessibility settings, and platform input conventions.
- Check platform and OS availability for each symbol, including older supported devices. Apple says tvOS Liquid Glass effects require Apple TV 4K second generation or newer; older devices retain their prior appearance. [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)

## 9. Web reimplementation techniques

The browser offers several ways to approximate parts of the appearance. None automatically reproduces the system material, its dynamic foreground vibrancy, or all of its accessibility behavior. Start with readable controls, then progressively enhance only where the actual rendering and performance have been tested.

### Technique A: CSS blur and saturation

`backdrop-filter` processes pixels behind an element. A transparent or translucent fill lets the result show through. A CSS blur, modest saturation adjustment, inset highlight, and soft shadow create a serviceable frosted surface without true refraction. The element must have a meaningful background and foreground even when filtering is unavailable. [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)

```css
/* Illustrative fallback, not a complete accessibility solution. */
.glass-surface {
  color: #102030;
  background: rgb(245 248 255 / 0.94);
  border: 1px solid rgb(255 255 255 / 0.38);
  border-radius: 24px;
}

@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .glass-surface {
    background: rgb(245 248 255 / 0.68);
    -webkit-backdrop-filter: blur(16px) saturate(1.15);
    backdrop-filter: blur(16px) saturate(1.15);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .glass-surface {
    background: #f5f8ff;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
```

These sample numbers are **web proposals**, not Apple values. A real control needs a dark appearance, focus treatment, and contrast tests over every supported backdrop. `blur()` spreads light but does not bend it; `saturate()` is a color matrix operation, not Apple's native vibrancy. Property support does not prove that every stacking context, composited video, canvas, iframe, or animated backdrop will render as intended. Compare pixels and frame timing on target browsers. Ancestors with filters, transforms, opacity, isolation, and other backdrop-root or stacking behavior can change what is sampled; inspect the actual layout. [Filter Effects Level 2 draft](https://drafts.fxtf.org/filter-effects-2/#BackdropRoot) | [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)

### Technique B: SVG displacement of a live backdrop

An SVG `feDisplacementMap` takes a source image and a second image whose color channels encode sampling offsets. When the browser supports an SVG filter referenced by `backdrop-filter: url(#...)`, the source can be the captured backdrop. An author-generated map can vary the offset at the edges of a rounded shape; gradients or a precomputed image can approximate a lens normal. The map is not Apple's shader. [Filter Effects specification](https://www.w3.org/TR/filter-effects-1/#feDisplacementMapElement) | [Kube's SVG experiment](https://kube.io/blog/liquid-glass-css-svg/)

The normative relation, using normalized channel values in the range 0 to 1, is:

```text
out(x, y) = source(x + scale * (mapX(x, y) - 0.5),
                   y + scale * (mapY(x, y) - 0.5))
```

Therefore `scale = 16` with a fully red X channel yields a maximum positive 8-unit X sample offset, not 16. A channel near 0.5 is neutral; in an 8-bit map 127.5 is mathematically neutral and 128 is only approximately so. With an 8-bit encoded `R` or `G`, substitute `channel / 255` for the normalized value. `scale` uses filter coordinates, so its mapping to CSS pixels depends on primitive units and transforms. Use the chosen color space consistently; `color-interpolation-filters="sRGB"` can prevent a numeric sRGB map from being unexpectedly interpreted as linear RGB. The source and map are separate inputs: reversing them changes the result and may trigger browser restrictions.

```html
<!-- A constant displacement test, not a lens or production fallback. -->
<svg width="0" height="0" aria-hidden="true" focusable="false">
  <filter id="offset-test" color-interpolation-filters="sRGB">
    <feFlood flood-color="rgb(255, 128, 0)" result="offsetMap" />
    <feDisplacementMap in="SourceGraphic" in2="offsetMap" scale="16"
                       xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>
<!-- Apply backdrop-filter: url(#offset-test) to a translucent test element. -->
```

The constant map above is for diagnosing whether a particular filter graph visibly shifts a high-contrast background edge. A real lens requires a neutral center, smoothly varying edge vectors, a mask, adequate filter bounds, and calibration for resizing and device pixel ratio. The filter region may clip displaced or blurred pixels if it is too small. Fully transparent map pixels, channel premultiplication, color-space conversion, and interpolation can also affect results. Measure the resulting image rather than trusting an encoded map or a `CSS.supports()` result alone.

### Technique C: WebGL or WebGPU with an owned backdrop

A shader can sample a known texture, calculate a rounded-rectangle signed distance field, derive a normal or edge ramp, offset texture coordinates, and apply a directional rim and tint. A controlled rendering pipeline can combine neighboring shapes using smooth-minimum distance fields or a mask. For a canvas game, render the game or chosen background to a texture once, then sample it under each control. For image or video input, update the texture when the source changes. Avoid an unnecessary readback from GPU to CPU.

A shader is not a general API for reading arbitrary pixels from the browser compositor. If the content is ordinary DOM, it must be represented in a texture or separately reconstructed. Options include controlled duplication of known HTML, a DOM rasterizer, or a browser-specific feature. A duplicate must track scroll, geometry, fonts, transforms, animation, focus, and state; it can drift or accidentally duplicate accessible content. Rasterizers reconstruct DOM from supported features and are not guaranteed screenshots of the compositor. Cross-origin image and canvas restrictions also apply. [html2canvas limitations](https://html2canvas.hertzen.com/documentation) | [MDN canvas and cross-origin images](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image)

Chrome 157 introduced HTML-in-Canvas on stable in October 2026. It can draw opted-in HTML descendants into 2D, WebGL, or WebGPU contexts under its documented structure and security constraints. It does **not** establish general cross-browser access to arbitrary backdrop pixels. A write-up created before that release may still describe the feature as flag-only; treat that as historical. [Chrome HTML-in-Canvas](https://developer.chrome.com/blog/html-in-canvas)

A useful shader pipeline is:

```text
owned image, video, or game texture
  -> optional low-resolution blur pass
  -> sample at a displaced UV inside the rounded shape
  -> apply adaptive tint, directional highlight, and shadow
  -> composite behind real, semantic DOM controls
```

The sampling radius and texture boundaries must account for displacement and blur padding. Texture upload, memory bandwidth, multiple full-screen passes, high device pixel ratio, and continuous updates can dominate the cost. A canvas overlay must not steal pointer events or replace accessible text and controls. WebGPU is a rendering option, not a guarantee of better performance or broad availability; test it and keep a fallback.

### Browser support and failure modes, checked 14 November 2026

| Browser or engine | Ordinary `backdrop-filter` | SVG URL displacement as a backdrop | Practical conclusion |
| --- | --- | --- | --- |
| Chromium desktop and Android | Modern versions support common filter functions. | The common independently generated `in2` map has worked in Chromium, but exact graph and release matter. Chromium added restrictions for a tainted or backdrop-derived displacement-map input. | Pixel-test the precise graph and target build. A syntactic feature test is insufficient. |
| Safari and WebKit on macOS/iOS | Common blur and color functions are supported in modern releases; older versions can require the prefixed property. | WebKit's long-standing bug for SVG `url()` backdrop filters including `feDisplacementMap` remained open in the checked issue. | Ship a tested blur/tint or opaque fallback. Do not assume an SVG URL lens will work merely because the declaration parses. |
| Firefox desktop and Android | Modern Firefox supports ordinary backdrop filters. | A prior SVG URL regression was fixed on the Firefox 121/122 branches. A later report for a turbulence/displacement graph was closed as incomplete, so the report is not proof of a current general failure or fix. | Test the actual graph on the versions and devices QCC supports. Do not claim SVG backdrop filters are categorically Chromium-only. |
| iOS browsers and embedded views | Behavior depends on the actual browser engine and OS build. Many commonly encountered configurations use WebKit. | The WebKit limitation applies to WebKit-based configurations; alternative engines and regional availability can differ. | Verify on real iPhone and iPad devices, including the embedded context QCC uses. Do not assume desktop emulation is sufficient. |

Sources: [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter), [WebKit bug 245510](https://bugs.webkit.org/show_bug.cgi?id=245510), [Firefox regression 1868479](https://bugzilla.mozilla.org/show_bug.cgi?id=1868479), [Firefox report 2018607](https://bugzilla.mozilla.org/show_bug.cgi?id=2018607), and [Chromium test change](https://github.com/web-platform-tests/wpt/pull/64056/files).

The Chromium security change is narrower than a blanket ban. The patch checks whether the displacement map input, `in2`, is tainted or derived from the backdrop and can make that primitive pass through. It does not by itself establish that a separate, untainted author-generated map with `in="SourceGraphic"` is disabled. During this research, a minimal `feFlood` map plus `SourceGraphic` test visibly shifted a red/blue edge in Linux headless Chrome 156.0.8078.47. That is **one local observation**, not a support promise for Chrome 157, other platforms, other graphs, or future releases. [Chromium patch](https://chromium-review.googlesource.com/changes/8395606/revisions/current/patch) | [WPT change](https://github.com/web-platform-tests/wpt/pull/64056/files)

To reproduce the local observation, save this complete fixture as `glass-offset.html`:

```html
<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 0; }
  .row { position: absolute; left: 32px; width: 240px; height: 48px;
         background: linear-gradient(to right, red 0 50%, blue 50% 100%); }
  #reference { top: 32px; }
  #test { top: 112px; }
  #test::after { content: ""; position: absolute; inset: 0;
                 background: rgb(255 255 255 / 0.001);
                 backdrop-filter: url(#shift); }
</style>
<svg width="0" height="0" aria-hidden="true">
  <filter id="shift" color-interpolation-filters="sRGB">
    <feFlood flood-color="rgb(255,128,0)" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="40"
                       xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>
<div class="row" id="reference"></div>
<div class="row" id="test"></div>
```

The local run used headless Chrome 156.0.8078.47 on Linux, a 600 x 350 screenshot at device scale factor 1, and the flags `--disable-gpu --hide-scrollbars --force-device-scale-factor=1`. At screenshot coordinate `(142, 50)` the reference row was red `(255, 0, 0)`; at `(142, 130)` the filtered row was blue `(0, 0, 255)`. The first blue pixel moved from x=152 to x=132, a 20 px shift. For example, replace the file path and run `google-chrome --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=600,350 --screenshot=glass-offset.png file:///absolute/path/glass-offset.html`; inspect the two pixels in the output PNG. In this container the run also required `--no-sandbox`. This checks output pixels for this graph only and is not a GPU performance benchmark.

A prior Safari regression report described approximately 15 seconds before first paint for a specific `blur(200px)` reproduction in Safari 26.0 and 26.5. A WebKit engineer attributed the problem to an extremely large blur and linked a fix on WebKit main. This is a historical, scoped bug report, not a measured cost for a 16 px blur or a claim about every current iPhone. [WebKit bug 316769](https://bugs.webkit.org/show_bug.cgi?id=316769)

### Examples worth studying

| Source | Technique and scope | Cost or licensing note |
| --- | --- | --- |
| [Kube CSS/SVG article](https://kube.io/blog/liquid-glass-css-svg/) | Rounded surface, derived refraction field, displacement and highlights; the author calls it an approximation. | Its live-backdrop demo is described as Chrome-only. Do not use its older browser claim as a substitute for current testing. Use the specification for the displacement equation. |
| [jbbixler/liquid-glass](https://github.com/jbbixler/liquid-glass) | Generates rounded-rectangle SDF-based SVG maps for elements. | Repository includes an MIT license. Check the exact files and revision before reuse. |
| [simple-liquid-glass](https://github.com/lucaperullo/simple-liquid-glass) | SVG, WebGL paths, shared scenes, and a CSS fallback, with published performance experiments. | MIT-licensed project; different backdrops, pane counts, and DPR have different costs. |
| [liquidGL](https://github.com/naughtyduk/liquidGL) | Uses a shared rendering canvas with WebGPU, WebGL, and CSS fallback paths and a captured or reconstructed background. | Its [license](https://github.com/naughtyduk/liquidGL/blob/main/LICENSE) limits MIT permission to specified code directories; demo assets are excluded. Check the actual revision and dependencies. |
| [Aave: Building Glass for the Web](https://aave.com/design/building-glass-for-the-web) | Uses aligned copies of controlled content and an SVG filter, plus a WebGL example for a canvas. | Duplicating known content is not general compositor backdrop capture. The article's older feature-status table predates Chrome 157's stable HTML-in-Canvas release. |
| [shayann07/liquidglass measurements](https://github.com/shayann07/liquidglass/blob/main/docs/research/reference-measurements.md) | Independent measurements of one native Phone tab bar and held selection lens. | A useful narrow reference, not a disclosure of Apple's implementation. Its conflicting captures are explicitly acknowledged. |

### Measured examples and performance tradeoffs

The authors of [simple-liquid-glass](https://github.com/lucaperullo/simple-liquid-glass/blob/main/CHANGELOG.md) report the following for **their own implementation and test scenes**, not for Apple Liquid Glass or QCC:

| Workload | Reported before | Reported after | Interpretation |
| --- | --- | --- | --- |
| Galaxy A54, Android 16, Chrome 156, DPR 2.625, 48 panes over one moving canvas, `blur=12` | 8.7 to 9.2 fps | 42 to 43 fps | Sharing one blur can help a dense set of panes. The authors use a crossover threshold in their implementation; it is not a universal threshold. |
| Apple M5, headless WebKit 26.6, 1280 x 800 at 2x, 48 panes over an animated 2560 x 1600 canvas, median of five runs | 25.1 fps, p95 interval 55 ms | 50.0 fps, p95 interval 23 ms | Sharing one texture upload instead of 48 helped this particular canvas case. It is not a physical iPhone Safari measurement. |

The same report notes a shared full-canvas upload can move more bytes than a few cropped uploads. Group by shared source and local extent, benchmark realistic pane counts, and include the underlying moving content. Texture size grows with the square of DPR: a 400 x 100 CSS px surface at DPR 3 is 1200 x 300 device pixels before blur padding or additional passes. An uncompressed RGBA8 buffer at that size alone is about 1.44 MB, excluding extra buffers and driver overhead. This is arithmetic, not a measurement of a browser's memory allocation.

For basic CSS `backdrop-filter`, MDN's compatibility data records unprefixed support from Chrome 76, Firefox 103, and Safari 18; Safari had prefixed support from version 9. Firefox before 123 had an additional limitation on systems with an unknown GPU vendor. These versions describe the CSS property, not the SVG displacement graph or every compositing case. [MDN browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/css/properties/backdrop-filter.json)

## 10. Practical web specification

### Status and calibration

The following is a **proposed QCC starting profile**, not an Apple specification, an observed Apple measurement, or a claim of pixel parity. It makes the research actionable while preserving uncertainty. It must be calibrated against actual captures and tested with the content, browsers, and devices QCC ships. Any value can be reduced or replaced when contrast or performance requires it. Except where explicitly stated, lengths are CSS pixels at 100% zoom, opacity values are unitless alpha, and times are milliseconds.

The reference fixture is a 240 x 64 px floating rounded control on a light or dark content canvas. It is useful for comparison, not a requirement that every control have those dimensions. Use a pill radius of 32 px for that fixture, and adapt the radius to the control's actual height and surrounding geometry. The examples below describe a single functional glass layer; content and foreground text remain separate.

### Visual targets

| Property | Starting target | Evidence and status | How to check |
| --- | --- | --- | --- |
| Regular blur | `blur(12px)` to `blur(20px)`, start at 16 px for a small bar. For a larger menu, try 18 to 28 px. | **Estimate.** Apple confirms adaptive scattering and a thicker appearance for larger surfaces, not these radii. CSS blur radius is not measured Apple blur. | Capture against sharp alternating stripes and a photo. Verify the background remains identifiable and text stays readable. |
| Clear-style blur | 2 to 6 px or none for a visually rich, darkened media background. | **Estimate.** Apple describes a more transparent clear variant, not a CSS blur value. | Compare a high-detail photo with regular and clear profiles; test contrast at the brightest frame. |
| Saturation | `saturate(1.05)` to `saturate(1.25)`, start at 1.15. | **Estimate.** It supplies mild color presence but is not native vibrancy. | Compare a color chart and skin tones for clipping or exaggerated color. |
| Regular surface tint | Light surface: white or near-white fill at alpha 0.55 to 0.70, start 0.65. Dark surface: near-black fill at alpha 0.55 to 0.75, start 0.65. Raise opacity when needed. | **Estimate.** Apple adapts tint and dynamic range; no universal alpha is published. Alpha here is the CSS fill contribution, not total optical transmission. | Compute contrast against the actual composited backdrop. Do not accept the default range if text or controls fail. |
| Clear media dimmer | If bright media needs it, begin at black alpha 0.35 behind the control or relevant media area. If already dark enough, use no extra dimmer. | **Apple guidance for bright content**, not a required glass opacity. Apple also shows 0.30 in a code example. | Measure contrast with and without the layer, including the brightest video frame. Avoid double-dimming. |
| Primary accent tint | Try accent fill alpha 0.08 to 0.18 over the regular base. | **Estimate.** Apple recommends selective tint and adaptive mapping, not a fixed alpha. | Check selected and unselected states in both appearances and under increased contrast. |
| Rim width and light | About 1 CSS px, with a directional white highlight at alpha 0.18 to 0.45; a much weaker opposite edge. | **Estimate.** Apple confirms geometry-dependent highlights, not width or opacity. Alpha is before compositing. | Capture on black, gray, white, and saturated backgrounds; do not let the rim form an opaque full ring. |
| Shadow | Start `0 8px 24px rgb(0 0 0 / 0.12)` for a bar; tune or reduce for light/dark context. | **Estimate.** Apple describes adaptive shadows; the CSS shadow is a simplification. | Check for separation over both flat white and moving text without a floating black halo. |
| Edge displacement | For the 240 x 64 px fixture, start with a maximum sample offset of 2 to 4 CSS px in an 8 to 14 px edge band. Fade smoothly toward zero inside. | **Estimate informed by one observation.** One held Phone lens showed about 3.7 Apple points of line displacement; points are not CSS pixels and it was an active lens, not a universal bar value. | Use a stationary 1 px grid. Measure the maximum apparent line shift against the unfiltered frame and confirm the center remains stable. |
| RGB dispersion | Default 0. If matching a captured active lens that visibly has color splitting, trial a channel separation no greater than 0.5 CSS px at the extreme edge. | **Estimate.** One third-party capture reports splitting in a held Phone lens; Apple publishes no general dispersion value. | Compare neutral black/white lines and small text. Remove the effect if color fringing harms legibility. |
| Disabled filter fallback | Opaque or near-opaque themed surface; no refraction or required animation. | **Web proposal** based on accessibility and browser limits. | Disable CSS filters, enable forced colors, and test keyboard and screen reader operation. |

[Apple optical and adaptive behavior](https://developer.apple.com/videos/play/wwdc2025/219/) | [HIG dimmer guidance](https://developer.apple.com/design/human-interface-guidelines/materials) | [Third-party measured capture](https://github.com/shayann07/liquidglass/blob/main/docs/research/reference-measurements.md)

The suggested regular profile is deliberately more conservative than a transparent hero effect. It cannot guarantee contrast over arbitrary content. Contrast is the acceptance gate, not an optional refinement. Increase the surface alpha, alter the foreground color, add a localized scrim, or use an opaque surface when the gate fails. Avoid repeatedly flipping foreground colors during minor video or scroll changes; a web implementation that explicitly samples known content can use hysteresis, but arbitrary page pixels are not generally available to JavaScript.

### Interaction and motion targets

| Property | Starting target | Evidence and status | How to check |
| --- | --- | --- | --- |
| Press feedback | Initial visual response within 1 rendered frame after the pointer event; optional scale to 0.97 over 50 to 80 ms. | **Web proposal.** Apple confirms prompt feedback, not this scale. The measured Phone lens is a different control and grows while held. | Record at the device's actual capture rate and verify down, cancel, and release. |
| Held selection lens | If a separate selection lens is appropriate, try 1.08 to 1.13 times its resting height, centered on its bar. Do not scale the entire toolbar by this amount. | **Estimate informed by one case.** The Phone analysis measured a held lens at about 1.135 times the bar height. | Compare the selection lens against a named control reference and make sure adjacent items remain usable. |
| Release spring | Mass 1, stiffness 250, damping 22 as an initial physical spring; approximate damping ratio 0.70 and 2% settling estimate about 0.36 s. | **Web proposal**, not Apple constants. A third-party 30 fps video estimated about 0.33 to 0.47 s for one lens to subside. | Measure actual scale or position over time; accept settling within 0.30 to 0.50 s with no sustained oscillation. |
| Menu morph | 220 to 320 ms with a short, well-damped settle, originating visually from its activating control. | **Estimate.** Apple confirms continuity and material changes, not a duration. | Verify focus moves to the open menu immediately and the origin remains clear. |
| Hover and highlight | Respond in 80 to 120 ms; stop decorative movement when interaction stops. | **Estimate.** Device-motion lighting is only confirmed for some native cases. | Test pointer enter, exit, focus, and reduced motion; no repeated animation at rest. |
| Drag | Track pointer movement on each available animation frame; bound deformation to the control and avoid changing the hit target. | **Web proposal.** Apple describes fluid response but publishes no lag budget. | Record pointer coordinates and visual position; investigate persistent multi-frame lag. |
| Reduced motion | No elastic overshoot, wobble, device-tilt response, or decorative morph; state change can be immediate. | **Apple-confirmed principle plus web proposal.** | Emulate or set the preference and verify functional parity. |

For the spring row, `m = 1`, `k = 250`, and `c = 22` imply `zeta = c / (2 * sqrt(k * m))`, or approximately 0.696. The simple 2% settling approximation `4 / (zeta * sqrt(k / m))` is about 0.36 seconds. An implementation's integration method, initial velocity, stop threshold, and interrupted transitions affect its real duration. CSS cubic-bezier easing is not itself a physical spring. Calibrate measured output rather than treating the equation as proof of native motion.

### A robust layering and state contract

1. **Base:** render accessible text and controls over a known themed fill. The component works with all effects off.
2. **Regular enhancement:** add one clipped backdrop blur/saturation and a restrained directional highlight. Select a foreground and surface that pass contrast for the actual content.
3. **Optional refraction:** enable only after the exact SVG or shader path passes a visual feature test and a performance budget on the target device. If it fails, keep the regular layer.
4. **Interaction:** use a press or drag state tied to the real control. Do not create extra glass layers for each label or icon. Keep hit areas, focus, and content position stable during decorative deformation.
5. **Accessibility:** increased contrast or reduced transparency may select an opaque material; reduced motion removes elasticity. User overrides persist and take precedence over visual enhancement.
6. **Resource control:** pause animation and backdrop updates when hidden or idle, and turn down or disable optional effects if profiling shows unacceptable hitches. Do not guess a user's thermal state from frame rate alone.

For a 240 x 64 fixture, start with one surface, not 24 individual sampled controls. A shader-backed game should share an owned background texture among nearby controls when the measurements support it; sparse controls over a huge backdrop may favor smaller crops. The choice is workload-dependent, as Apple's grouping advice and the web performance measurements both show. [Apple rendering guidance](https://developer.apple.com/documentation/xcode/improving-your-app-s-rendering-efficiency) | [Project benchmarks](https://github.com/lucaperullo/simple-liquid-glass/blob/main/CHANGELOG.md)

## 11. Test and measurement plan

The purpose of this plan is to determine whether a future QCC implementation is readable, responsive, stable, and consistent across actual environments. It does not claim those tests were run against QCC in this research-only task.

### Fixtures and matrix

Create controlled test scenes that hold the control and foreground content constant while changing the backdrop:

| Scene | Purpose |
| --- | --- |
| Solid black, white, and mid-gray | Finds disappearing boundaries, excessive halos, and worst-case text contrast. |
| Saturated red, blue, and mixed hues | Finds tint shifts, clipping, and weak colored actions. |
| High-frequency 1 px and 4 px grids, plus fine text | Makes blur, refraction direction, clipping, and scroll-edge separation measurable. |
| Bright photo, dark photo, and busy photo with faces or fine detail | Tests natural content and clear-style dimming. |
| Moving text, canvas gameplay, and video with a bright frame | Tests invalidation, contrast through changing content, and frame timing. |
| No backdrop filter, transparent preference, high contrast, forced colors | Tests the complete fallback and semantics. |

Run the supported desktop and mobile browser matrix, recording exact browser, engine, OS build, device model, viewport, DPR, zoom, color scheme, accessibility preferences, and refresh rate. Include actual Safari on iPhone and iPad, a Chromium Android device, Firefox, and at least one lower-powered device. Test the app's actual embedded or standalone environment if applicable. Test light/dark mode, portrait/landscape, 200% text zoom, keyboard, touch, and gamepad where used. Do not infer a device result from an emulated desktop viewport.

### Screenshots and optical measurements

1. Pin each fixture, font, viewport, DPR, browser version, animation time, and scroll position. Capture the untouched backdrop and the same scene with the glass surface. Capture idle, pressed, held, dragged, released, menu open, and reduced-motion states.
2. For a lens test, identify a straight grid line crossing the edge. Compare its position inside and outside the surface in CSS px after accounting for DPR. For the proposed 240 x 64 fixture, target 2 to 4 px maximum displacement and a smooth falloff across the 8 to 14 px edge band. Verify no abrupt clipping at the filter boundary. The plain CSS fallback has no displacement and should not be marked broken for that reason.
3. Measure the rim's width and intensity against the unfiltered surrounding area. A 1 px highlight at DPR 2 can span roughly two physical pixels before antialiasing. Check top, bottom, sides, corners, and both light and dark scenes. The highlight should not replace a focus outline.
4. For regression testing, compare against an approved baseline from the **same rendering environment**. As an initial team policy, investigate more than 1% of fixture pixels differing by more than 8/255 in any channel outside known animation or antialias masks. This is a **proposed regression threshold**, not an Apple similarity score. It can be tightened after observing normal CI noise. Native screenshots taken on a different OS, display scale, font renderer, or material setting are visual references, not automatic pixel-perfect goldens.
5. Record several time points for transitions. Compare shape bounds, displacement, and foreground contrast as well as the final frame. Review the images by eye for false color, uneven edges, double blur, and content that looks detached from its source.

### Contrast and semantic accessibility

- Compute WCAG relative luminance for the actual foreground and composited background, using the lighter and darker luminances in `(L1 + 0.05) / (L2 + 0.05)`. The **minimum is 4.5:1** for ordinary text, or **3:1** for qualifying large text. Required non-text visual information, including control boundaries and states, generally needs **3:1** against adjacent colors. Apply the WCAG exceptions as written; do not round 4.49 up to 4.5. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | [W3C contrast understanding](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)
- With variable backgrounds, sample the composited background behind the text's occupied region over all fixture states and moving frames. Use the specified foreground color rather than anti-aliased edge pixels as the text color. Also inspect real thin glyphs visually, since antialiasing can reduce apparent contrast. A single average background color does not prove that the worst local area passes.
- Verify a visible keyboard focus indicator, correct labels and roles, selected and disabled states, normal tab order, `Enter` and `Space`, and screen reader names. Check focus management when a menu opens and closes. Pointer cancellation and drag outside must not accidentally trigger the action.
- Test Reduce Motion, Reduce Transparency, Increase Contrast, and forced colors individually and in combination. Where the browser cannot expose a preference, exercise the manual override. The appearance preference must not remove state information. A separate accessible setting can be useful even on browsers that do expose the query.
- For touch, adopt a project target of at least 44 x 44 CSS px for common controls where practical. This is a **QCC proposal**, not Apple's measured Liquid Glass size. WCAG 2.2's target-size minimum is 24 x 24 CSS px subject to its spacing and other exceptions. [WCAG 2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum)

### Frame timing, energy, and stability

1. Use the same 20 to 30 second scripted scroll and interaction sequence with effects off, CSS-only, and each optional refraction path. Repeat at least three times after warm-up, and record browser version, screen refresh, power mode, device temperature conditions, viewport, DPR, content, and active pane count. Keep the background workload identical.
2. Record frame intervals, p50, p95, and p99, worst long frame, and dropped-frame or hitch counts using browser performance tools or a reliable frame trace. `requestAnimationFrame` intervals are useful scheduling evidence but are not a complete GPU-time measurement. Inspect paint, compositing layers, memory, and texture uploads with the browser's profiler. [Apple Web Inspector tools](https://developer.apple.com/safari/tools/)
3. As an initial **project performance budget**, on a 60 Hz test device aim for p95 frame interval at or below 20 ms and p99 at or below 33 ms during the test. On a sustained 120 Hz device, use 10 ms and 20 ms respectively. The effect-on p95 should add no more than 3 ms to the matching effects-off baseline. If the baseline already fails, record that separately rather than declaring the effect acceptable. These are project targets, not Apple measurements or guarantees on every device.
4. Run a longer 10 minute representative session on battery with realistic gameplay and idle periods. Compare effects-on and effects-off runs at comparable brightness, battery state, and ambient conditions. Record system energy and thermal metrics if available. A single battery percentage or frame-rate drop cannot isolate the material's cost.
5. Inspect that idle surfaces stop unnecessary animation and background recapture. Test a hidden tab and an offscreen view. Exercise resizing, orientation change, device-pixel-ratio change, background/foreground transition, and recovery after GPU context loss where applicable.

### Browser fallback and release gates

A release candidate passes only when:

- Regular and opaque fallback controls meet the contrast and semantic checks in every supported browser.
- The Safari/WebKit path remains usable when SVG URL backdrop displacement is absent or produces no visual change.
- A pixel test proves the exact optional displacement graph works where it is enabled; `@supports` alone does not count.
- A failure to initialize WebGL/WebGPU, a cross-origin input, or a lost context falls back without a blank or inaccessible control.
- Motion-reduced, transparency-reduced, forced-colors, and manually selected accessible appearances work without loss of actions or focus.
- The documented performance budget is met on the chosen reference devices, or a specific exception with measured evidence is accepted by the project owner.
- Screenshots and profiler traces identify the device, build, scene, configuration, and measurement method. Any comparison with Apple names the reference device and OS settings and does not present proposed values as native constants.

## 12. Sources

All sources below are publicly readable. Apple documentation and compatibility data are living resources, so availability and behavior should be checked again when an implementation begins. Links in earlier sections point directly to the relevant claims.

### Apple: primary design and platform guidance

- [Apple newsroom: new software design, 9 June 2025](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/): introduction, platforms, examples, adaptive material, controls, and system surfaces.
- [Apple newsroom: iOS 26](https://www.apple.com/newsroom/2025/06/apple-elevates-the-iphone-experience-with-ios-26/): iPhone-specific design, tabs, Lock Screen, icons, and widgets.
- [Apple newsroom: watchOS 26](https://www.apple.com/newsroom/2025/06/watchos-26-delivers-more-personalized-ways-to-stay-active-and-connected/): watch-specific surfaces and controls.
- [HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials): content versus functional layer, variants, dimming, and accessibility.
- [HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color): color, tint, and emphasis.
- [Meet Liquid Glass, WWDC25](https://developer.apple.com/videos/play/wwdc2025/219/): optics, adaptive layers, transitions, variants, tint, and accessibility.
- [Get to know the new design system, WWDC25](https://developer.apple.com/videos/play/wwdc2025/356/): navigation, grouping, scroll edges, and content-first layout.
- [Build a SwiftUI app with the new design, WWDC25](https://developer.apple.com/videos/play/wwdc2025/323/): SwiftUI structure, controls, and custom effects.
- [Build a UIKit app with the new design, WWDC25](https://developer.apple.com/videos/play/wwdc2025/284/): UIKit effects, animation, controls, and grouping.
- [Build an AppKit app with the new design, WWDC25](https://developer.apple.com/videos/play/wwdc2025/310/): Mac controls, material views, and containers.
- [What's new in SwiftUI, WWDC25](https://developer.apple.com/videos/play/wwdc2025/256/): system adoption, navigation, and profiling context. Its list-speed measurements are not Liquid Glass benchmarks.
- [What's new in widgets, WWDC25](https://developer.apple.com/videos/play/wwdc2025/278/): visionOS widget glass and paper textures.
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass): adoption checklist, standard controls, scroll edges, and platform considerations.
- [Improving your app's rendering efficiency](https://developer.apple.com/documentation/xcode/improving-your-app-s-rendering-efficiency): grouping extent, redraws, animations, and energy.
- [iOS 26 update notes](https://support.apple.com/en-au/123075): the iOS 26.1 Tinted setting.
- [iPhone display and text settings](https://support.apple.com/en-asia/guide/iphone/iphd6804774e/ios): Clear/Tinted choice and its relationship with accessibility settings.

### Apple: API details and availability

- [SwiftUI Glass and availability](https://developer.apple.com/documentation/swiftui/glass.md): material configuration, platform list, and identity.
- [SwiftUI glassEffect](https://developer.apple.com/documentation/swiftui/view/glasseffect%28_%3Ain%3A%29): defaults, bounds, and shape.
- [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views): modifiers, containers, identities, unions, and transitions.
- [GlassEffectContainer](https://developer.apple.com/documentation/swiftui/glasseffectcontainer): rendering together and spacing.
- [Glass.clear](https://developer.apple.com/documentation/swiftui/glass/clear): clear material and 30% sample dimmer.
- [SwiftUI glass button style](https://developer.apple.com/documentation/swiftui/primitivebuttonstyle/glass%28_%3A%29) and [GlassButtonStyle initializer availability](https://developer.apple.com/documentation/swiftui/glassbuttonstyle/init%28_%3A%29.md).
- [UIGlassEffect](https://developer.apple.com/documentation/uikit/uiglasseffect.md) and [UIGlassContainerEffect](https://developer.apple.com/documentation/uikit/uiglasscontainereffect.md).
- [NSGlassEffectView](https://developer.apple.com/documentation/appkit/nsglasseffectview.md), [AppKit container spacing](https://developer.apple.com/documentation/appkit/nsglasseffectcontainerview/spacing.md), and [effectIsInteractive availability](https://developer.apple.com/documentation/appkit/nsglasseffectview/effectisinteractive.md).
- [visionOS glassBackgroundEffect availability](https://developer.apple.com/documentation/swiftui/view/glassbackgroundeffect%28displaymode%3A%29.md): separate spatial background API.

### Web standards, implementation reports, and accessibility

- [Filter Effects Level 1: displacement map](https://www.w3.org/TR/filter-effects-1/#feDisplacementMapElement): normative displacement relationship.
- [Filter Effects Level 2: backdrop root](https://drafts.fxtf.org/filter-effects-2/#BackdropRoot): working draft for backdrop boundaries.
- [MDN: backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter) and [browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/css/properties/backdrop-filter.json): basic property support, separate from SVG graph support.
- [WebKit bug 245510](https://bugs.webkit.org/show_bug.cgi?id=245510): SVG reference filters in backdrop filters.
- [Firefox bug 1868479](https://bugzilla.mozilla.org/show_bug.cgi?id=1868479) and [Firefox report 2018607](https://bugzilla.mozilla.org/show_bug.cgi?id=2018607): a fixed regression and a later incomplete report.
- [Chromium displacement patch](https://chromium-review.googlesource.com/changes/8395606/revisions/current/patch) and [web-platform test](https://github.com/web-platform-tests/wpt/pull/64056/files): tainted or backdrop-derived displacement-map restrictions.
- [WebKit blur regression report](https://bugs.webkit.org/show_bug.cgi?id=316769): one historical, large-blur performance case and linked fix.
- [Chrome: HTML-in-Canvas in Chrome 157](https://developer.chrome.com/blog/html-in-canvas): opted-in DOM descendants in canvas rendering contexts.
- [html2canvas documentation](https://html2canvas.hertzen.com/documentation) and [MDN: cross-origin images in canvas](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image): reconstruction and security limits.
- [MDN: prefers-reduced-transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-transparency) and [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion): browser preference media features.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [contrast minimum understanding](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), and [non-text contrast understanding](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast): test thresholds and exceptions.
- [Safari developer tools](https://developer.apple.com/safari/tools/): timelines, layers, and graphics inspection.

### Independent measurements and projects

- [Phone tab-bar reference measurements](https://github.com/shayann07/liquidglass/blob/main/docs/research/reference-measurements.md): capture method, physical pixel measurements, and limitations.
- [Kube: Liquid Glass in the Browser](https://kube.io/blog/liquid-glass-css-svg/): educational lens and SVG displacement approximation.
- [jbbixler/liquid-glass](https://github.com/jbbixler/liquid-glass): per-element SDF and SVG technique.
- [simple-liquid-glass](https://github.com/lucaperullo/simple-liquid-glass) and its [measurement changelog](https://github.com/lucaperullo/simple-liquid-glass/blob/main/CHANGELOG.md): multiple render paths and scoped author benchmarks.
- [liquidGL](https://github.com/naughtyduk/liquidGL) and its [license](https://github.com/naughtyduk/liquidGL/blob/main/LICENSE): shader-based approach and limited license scope for demo assets.
- [Aave: Building Glass for the Web](https://aave.com/design/building-glass-for-the-web): controlled DOM and canvas techniques.
- [adaptive_liquid_glass 0.2.5 changelog](https://pub.dev/packages/adaptive_liquid_glass/versions/0.2.5/changelog): an independently fitted motion approximation.
