# Iron Meridian

An original grand strategy campaign in a fictional 1936 theater. Six playable nations compete across 84 provinces. Industry, equipment, political choices and logistics shape the war. This is a reconstruction of broad genre systems studied in the local HOI4 installation, with independently authored rules, tuning, geography, names and art. It does not establish full HOI4 parity.

The player chooses a nation and begins with time stopped. A daily deterministic simulation advances only through the clock controls. Player commands allocate factories, queue construction and recruitment, research technologies, choose national focuses, conduct diplomacy, set air and naval missions, and order divisions. Local AI nations use the same resources and command validation.

Victory requires the player's alliance to hold at least 60% of world victory points and three original capitals. A nation capitulates after losing its original capital and at least 60% of its original victory points. The player's capitulation ends the campaign.

Production consumes access to steel and oil and improves in efficiency over time. Civilian factories build one queued project at a time. Divisions reserve manpower and equipment when recruited, train for their specified period, then deploy. Organization, strength, terrain, entrenchment, supply, air support and naval access have simulation effects. Diplomacy provides timed war justification, bilateral relations, alliances and resource trade.

The canvas fills the screen under the app's existing floating glass dock. The game's own panels float above it. Phone controls keep clear of screen insets and the dock, while the scene continues to the edges. Semantic unit lists, province selectors and destination forms provide keyboard alternatives to map interaction. Shortcuts ignore forms and dialogs. Decorative transitions respect reduced motion.

The shell owns storage, audio and lifecycle. Pausing freezes simulation and gameplay actions. Restoring validates a versioned snapshot and stops the campaign clock. Restart returns to nation selection. Disposal cancels events, timer, observer and animation frame. No external service or additional dependency is required.

Research provenance and remaining reverse engineering work are recorded in `docs/iron-meridian/RESEARCH.md`. Exact validation is recorded in `TEST_RESULTS.md` after execution.
