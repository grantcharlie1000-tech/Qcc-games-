# Pool

Eight-ball on a 7-foot table: you against the computer (easy, medium, hard), two players passing one device, or two
devices online. Racks continue as a match; the break alternates and each player's rack wins are shown on their card.

## Rules (WPA eight-ball, simplified for casual play)

- **Rack:** fifteen balls in a tight triangle on the foot spot, the 8 in the centre, a solid and a stripe in the two back
  corners, the rest shuffled from a seed with a few tenths of a millimetre of jitter so every break differs.
- **Break:** the cue ball starts in hand behind the head string. A legal break pots a ball or drives four object balls to a
  cushion; otherwise the opponent re-breaks a fresh rack. A ball down on the break keeps the turn; the 8 on the break is
  re-spotted on the foot spot (behind it first). A scratch on the break gives ball in hand behind the head string.
- **Open table:** the table is always open after the break. Any ball but the 8 may be hit first. The first legal pot on a
  later shot decides groups (solids 1–7, stripes 9–15).
- **Fouls** (opponent gets ball in hand anywhere): the cue ball drops or leaves the table; no ball is hit; the first ball hit
  is not the shooter's group (or the 8 when on it; or the 8 on an open table); nothing drops and no ball reaches a cushion
  after contact.
- **Turn:** continues while the shooter legally pots one of their own group; passes otherwise.
- **The 8:** once a group is cleared, the 8 is the only legal target and the shooter calls its pocket (suggested from the aim
  line, changed by tapping a pocket or pressing P). Potting it in the called pocket without a foul wins. Potting it early,
  in another pocket, or on a foul loses.
- Not modelled: calling ordinary shots, safeties, jump/massé shots, three-foul rules, stalemates and the WPA re-rack option.

## Physics (`physics.ts`)

Metres and seconds, fixed 1/600 s step, deterministic. Each ball has linear velocity, a roll vector (the velocity its
top/back spin would give it, so natural roll means the two match) and side spin. Sliding friction (μ 0.13) converts slide to
roll, then rolling resistance (μ 0.015) stops the ball. Ball–ball contacts use e = 0.95 with a capped tangential impulse
(throw, μ 0.06); cushions use speed-dependent restitution (0.86 → 0.70) and a friction impulse that turns side spin into
running or reverse english. Pocket mouths (corner 11.8 cm, side 13.2 cm) are bounded by angled jaw segments; a ball drops
when its centre enters the capture circle behind the mouth. Cue strikes take a power (eased curve to 7.2 m/s) and a contact
offset up to 0.6 R for follow, draw and english. Model after Leckie & Greenspan's pool physics and Mathavan et al.'s
cushion/ball friction work, integrated with small fixed steps instead of event prediction.

## Computer (`ai.ts`)

Lists makeable pots (ghost-ball aim, clear lanes for the cue and object ball, cut angle, pocket entry angle) and plays the
best ones through the real physics at several speeds and spins, scoring pots, fouls, wins and the next shot left. Without a
pot it plays the safety that leaves the opponent the least, and kicks off a cushion when hidden. Ball in hand is placed where
the easiest shot is. Difficulty sets how much it explores and its aim/power error (seeded, so repeatable). Work runs as a
generator, a few milliseconds per frame.

## Interface

- Canvas table with cached art (walnut rails, pearl sights, cushions cut at the jaws, pocket wells), per-pixel shaded balls
  whose numbers and stripes roll with their motion, soft shadows, a drawn cue, aim line, ghost ball and object/cue-ball
  directions. Illegal first contacts show red; balls you may not hit are dimmed.
- Table turns to portrait on tall screens (head at the bottom). Controls sit beside it: spin button, power cue, fine-aim
  wheel. Player cards show group balls remaining, the 8 when on it, and rack wins. Toasts announce fouls, groups and results;
  a result card offers the next rack.
- Input: drag on the cloth to aim; fine wheel or mouse wheel to nudge; pull the power cue down and release to shoot (push it
  back up to cancel); spin picker; drag the cue ball for ball in hand; tap a pocket to call the 8; hold the table while balls
  roll to fast-forward. Keyboard covers all of it (see `rules` in `index.ts`).
- Synthesised sound for ball clicks, cushions, pockets and the cue, following the app's sound setting.
- Saves (`restoreGame` validates every field) include mid-shot states. Options in the game menu: players, computer level,
  aim guide length, Multiplayer.
