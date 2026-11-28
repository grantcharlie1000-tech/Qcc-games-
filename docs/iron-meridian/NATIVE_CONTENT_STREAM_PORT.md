# Native engine stream and byte preprocessing

`native/content-stream.ts` is an import-only promotion of the independently reviewed [staged port](../../work/iron-meridian/native-content-stream/PORT.md). It implements original stream length, read, read-all, vector reserve/resize, false-mode byte conversion and stream destruction over supplied native objects. Real translated `NativeFileIo` routines execute inside the engine adapters. Individual provider, allocation and CRT primitives remain explicit dependencies.

Read-all retains the original 64-bit length while resizing from its signed low dword. It preserves partial writes and the actual boolean result. No authored read loop, rollback or replacement success behavior is added. Conversion removes CR bytes, preserves other bytes, then builds a C++ string up to its first NUL. The original final-CR branch produces an entirely empty string, even after preceding segments were copied. SSO, heap/aligned storage, callback capture/reloads and ownership transfer remain visible.

The frozen reference has 131 cases over 26 original windows, 5,640 bytes, 1,487 decoded starts and 832 visited starts. Tests compare results/stops, ordered leaf arguments, byte-write traces, objects and allocation contents. [Independent review](../../work/iron-meridian/native-content-stream-review/REVIEW.md) rebound the original bytes and all artifact identities, reviewed the instruction paths and passed the 131 cases plus six new callback mutation probes. No material defect remained within the stated contract.

Supplied stream/engine construction, true-mode conversion, byte rotation, cold TLS, diagnostic continuation, exceptional host behavior and C++ unwinding remain outside this component. Destruction can stop after native close but before clearing ownership, so stops are not retry safe. Returned C++ string allocations transfer to the caller; this API does not invent a generic disposal rule.

The actual browser loading pipeline is unchanged by this promotion. In particular, false-mode conversion is established for selection JSON; the recovered technology factory reads a raw byte vector. Inserting the converter into every text consumer would change behavior without original-caller evidence. Engine/owning-stream construction is the next separate recovery lane.

[Stream promotion](../../work/iron-meridian/native-closure-integration/stream-promotion.json) retains the source/reference hashes and import-only changes. This is component evidence, not effective content, campaign startup or full engine equivalence.
