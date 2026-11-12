// src/games/last-light/story.ts
var chapter = (name, person, task, line, after, memory, outcome) => ({ name, person, task, line, after, memory, outcome });
var CHAPTERS = [
  chapter("The Window Left Open", "Nell", "The lamps are out and the black is rising in the streets. Carry Mira\u2019s lantern over the roofs to Nell\u2019s house. Her window looks onto the bell tower: go on down to its door.", "Your sister Mira went up to the engine three nights ago, when the lamps first went out. She left you her lantern. It\u2019s the last flame burning in the Quarter, so mind it. The black comes up off the canal wherever no lamp is lit, and it puts out whatever it closes over. Stay on the roofs.", "Nell opens her door. A kettle whistles. For the first time tonight, someone is expecting you.", "Mira\u2019s first map: every lit window is a home, not a number.", "A door opens"),
  chapter("A Bell Above the Rain", "Ivo", "Ivo is stuck up the bell tower and the pit under it has flooded. Climb to him, then leave by the gallery door at the top.", "That\u2019s Ivo ringing. He went up the tower to see how far the dark had come, and the stair went out from under him. He\u2019s only nine. Fetch him down, would you? There\u2019s a door onto the gallery at the top.", "Ivo follows your lantern out onto the gallery. From up here you can both see it: every street lamp dark, and the black lying in the low streets like water.", "A child\u2019s drawing of two couriers, one much taller than the other.", "Three bells answer"),
  chapter("The Last Ferry", "Ada", "The quay lamps are dead. Take the tower\u2019s outside stair down to the quay, cross the canal by the boats to Ada\u2019s ferry, and stay out of the water.", "Forty lamps on this quay and I can\u2019t light one of them. The gas comes down from the engine and tonight nothing\u2019s coming. Ada\u2019s holding the last ferry for you. Don\u2019t fall in. The black sits on the water after dark, and nobody it closes over comes back up.", "Ada casts off. Behind the ferry the quay goes dark, and your lantern is the only light on the water.", "A ferry ticket. On the back: \u201CDon\u2019t try to swim this time.\u201D", "Cast off"),
  chapter("Windows, Not Stars", "Nell", "The streets below belong to the black. Cross the market roofs to the stair-house over the east street.", "Stay up here. The streets are the black\u2019s tonight. But look behind you now and then. People see your lantern go over the roof and they light whatever they\u2019ve got. It holds the dark off a house for an hour. That\u2019s not nothing.", "You look back from the stair-house door. Every house you crossed has a window lit. Not stars. Windows.", "Mira marked a shortcut over the bakery. You used to be too small to reach it.", "The square wakes"),
  chapter("The Roof That Remembers", "Tomas", "The black is in the lane behind you and it is moving. It puts out any flame it reaches, and yours is the last. Keep ahead of it to Tomas\u2019s roof. His stair is barred, so go on down past it to the culvert steps in the lane.", "It\u2019s in the lane behind us! That lamp just went out, did you see? It\u2019s coming along the roofs now. Those old slates over the alleys won\u2019t hold you, so don\u2019t stop on them. Tomas has a stair on the far roof. Run!", "The last span drops into the alley behind you. Tomas pulls the stair door shut, and the black slides past the glass like smoke.", "A patched scarf, caught on a nail. Mira repaired the same tear twice.", "A hand at the edge"),
  chapter("Under the Sleeping City", "Oren", "Oren thinks the gas mains have failed. Cross the flooded culvert to the street stairwell. Your lantern can light the wall lamps on the way.", "I came down thinking the mains had burst. They haven\u2019t. There\u2019s gas in every pipe. What\u2019s gone is the flame at the far end that lights it. Your lantern was lit from the engine, same as the lamps were. Touch it to the wall lamps if you like. And keep out of the water down here, same as up top.", "You climb the stairwell to the street. Under your feet the mains still hold gas. All they want is a flame.", "A maintenance note: the dawn engine was built to share light, not store it.", "Something answers"),
  chapter("The Counterweight", "Tomas", "Mira rode this hoist up three nights ago. Climb the shaft, over the sheaves, to the hoist house door. The culvert\u2019s stairwell comes up in its pit.", "Mira rode this hoist three nights back. I worked the brake for her. She said the engine was failing, and she could hold it together if she drew every lamp\u2019s light back into it. That\u2019s why your street went dark. She meant it to be for one night.", "The weight drops. A long-idle lift rises, and rooftops give way to a wilderness of glass.", "Mira\u2019s glove smells of machine oil and rosemary.", "Over the wall"),
  chapter("The Quarter\u2019s Reply", "Ivo", "The bridge to the garden bank has lost its arches. Cross what is left to the garden gate. Light the bridge lamps if you want the far bank to see.", "I can see the garden gate from here! The bridge fell in the night the lamps went, and nobody\u2019s been across since. If you light the bridge lamps, they\u2019ll know over there that the Quarter\u2019s still alive. Mind the river.", "Across the bridge, three green lanterns answer. The Old Quarter has stopped waiting alone.", "A folded reply from Mira: \u201CI knew you would come. Please help them first.\u201D", "A district answers"),
  chapter("Water for the Living", "Sera", "Open the two irrigation wheels, then reach the greenhouse door.", "You\u2019re Mira\u2019s, aren\u2019t you? She came through with that same lantern. When the engine took the light it took our water too; the pumps run off the same wires. There are two wheels on the old gravity feed. Turn them if you\u2019ve time.", "Water threads through the roots. Leaves uncurl against the broken glass.", "Mira left a seed in every empty planter on her way through.", "The roots drink"),
  chapter("A Voice in the Reeds", "Pip", "Find Pip in the sunken garden and lead them to the upper bank.", "Pip went looking for the moths. Follow the reed steps down to the sunken garden, then help them climb to the bank.", "Pip emerges with a jar of moths. They open it. Small lights drift freely above the reeds.", "A jar labelled \u201CDo not keep the things you love in here.\u201D", "The jar opens"),
  chapter("The Orchard Circuit", "Sera", "Light the trellis, orchard and root arch lamps, then reach the root arch.", "Mira could never walk past a hungry tree. The orchard lamps kept these roots warm before the blackout.", "The orchard glows from the roots upward. A single white flower opens in the dark.", "Pressed blossom: you and Mira planted this tree the year the rain stopped.", "A flower after midnight"),
  chapter("A House Made of Glass", "Elian", "Climb through the greenhouse to Elian\u2019s roof shelter.", "People call this place abandoned. I\u2019ve lived here nineteen years. Leave your boots by the door.", "Elian makes room at the table. The glass roof holds a whole sky of reflected lanterns.", "A photograph: the old city had more gardens than towers.", "Room at the table"),
  chapter("Borrowed Ground", "Pip", "Cross the collapsing trellis to the stone garden gate. Keep ahead of the dark; there are no switches.", "The roots are pulling the old trellis apart, and the black is coming up the bank behind you. Don\u2019t stop on anything that creaks.", "The trellis settles into the water. Vines catch the pieces and begin making something new.", "Mira wrote: \u201CA thing can fall apart and still be alive.\u201D", "The garden makes a bridge"),
  chapter("The Rain Machine", "Sera", "Turn both pump wheels and reach the service lift. Watch the moving platforms.", "We kept waiting for rain. Mira asked why we didn\u2019t make our own.", "A sprinkler sputters, coughs, then rains over the garden. Sera laughs into the water.", "A machine diagram annotated with a very bad drawing of a raincloud.", "Rain, at last"),
  chapter("Where the Roots Go", "Elian", "Descend into the root cellar, find the lost gardener, and bring them out.", "Someone\u2019s walking about under the roots. One of our gardeners went down when the lamps failed and never came back up. Go and fetch them, would you?", "The gardener steps into the lantern glow. They have been tending the roots by touch.", "Mira\u2019s pencilled note: \u201CNobody is a side road.\u201D", "Nobody left below"),
  chapter("The Garden\u2019s Answer", "Sera", "Light the three garden signals, then meet Sera beneath the great tree.", "The engine took our warmth. It doesn\u2019t get to keep it. Let the Clockworks see we\u2019re coming.", "Moths rise over the great tree. The garden sends a living constellation toward the factories.", "A fresh sprig of rosemary, tied with Mira\u2019s red thread.", "A constellation takes flight"),
  chapter("First Shift, Last Shift", "Ren", "Release the two steam wheels, then reach the service platform.", "This works makes the light for the whole city. Then the engine started keeping it. Every lamp we feed, it draws back in. Two steam wheels are jammed open down there. Shut them if you\u2019re passing.", "Pressure falls. The great fans turn slowly, breathing for the first time in years.", "A shift card: Mira worked here before you knew what work meant.", "The factory breathes"),
  chapter("The Clock Without Hands", "Bram", "Power the three clock lamps and climb to the abandoned clock face.", "The clock\u2019s been wrong since the lamps went. It runs off the same engine. Climb to the face if you want to see how far the dark has got.", "The clock strikes a time nobody recognises. Bram calls it the beginning.", "A gear engraved with two names: MIRA and REN.", "A new hour"),
  chapter("Someone on the Night Shift", "Ren", "Find the night worker in the lower factory and escort them to the loading bay.", "One of ours is still on the lower floor. I told them we\u2019d come back for them. Please make me right.", "The worker hangs up their apron. The machines can wait; someone has made tea.", "A timesheet with the same name on every night shift for seven years.", "The shift ends"),
  chapter("Teeth of the City", "Bram", "Cross the broken conveyor bridge to the conveyor shelter. Time the steam, then keep ahead of the dark.", "The black is in the conveyor hall now. Wait for each vent to drop, then go, and don\u2019t look round.", "The conveyor grinds to a halt behind you. For once, the silence feels like relief.", "Mira scratched arrows toward a narrow ledge above the belts.", "The teeth stop"),
  chapter("The Unwinding", "Ren", "Turn the feed and return wheels, then climb to the engine hatch.", "Mira went into the engine itself. She said somebody had to hold it together. I let her go alone. I shouldn\u2019t have.", "The return wheel turns against the feed. Light begins flowing both ways.", "An unsent letter: \u201CYou do not have to be useful to deserve to come home.\u201D", "The current reverses"),
  chapter("Cargo for the Morning", "Ada", "Ring the freight bell, then board Ada\u2019s barge.", "Seeds, blankets, spare bulbs. The things a city needs are rarely the things its towers keep.", "The barge moves beneath the warm pipes. Ada gives the engines a rude wave.", "A freight manifest. Someone added \u201Chope\u201D in the weight column.", "The cargo moves"),
  chapter("A Signal Through Steel", "Bram", "Wake the three signal lamps and reach the high antenna.", "Send your name. If Mira is listening, she\u2019ll know you made it this far.", "The antenna shivers. Through the static: \u201CLittle light? Is that you?\u201D", "A radio frequency circled so often the paper has worn through.", "Her voice"),
  chapter("Let the Machines Dream", "Ren", "Restore the three marked safety lights, then reach the maintenance arch.", "We can stop the engine without stopping the city. But we need the northern lens.", "The factory floor goes quiet. Above it, a thousand small windows remain bright.", "Mira\u2019s reply: \u201CI thought if I kept the light, I could keep you safe.\u201D", "Rest, without darkness"),
  chapter("Footprints in the White", "Edda", "Find Edda on the ice bridge and lead her to the sheltered ridge. Ice carries momentum.", "Mira passed this way in a storm. Her footprints filled with snow before I could follow.", "Edda reaches the ridge. Two sets of fresh footprints continue toward the lens.", "A red thread caught in the ice. Still warm from someone\u2019s hand.", "Two sets of footprints"),
  chapter("The Frozen Intake", "Edda", "Release both frozen intake wheels, then climb to the shelter.", "The intake\u2019s frozen solid, that\u2019s all. Free the two wheels and the water will find its own way down.", "Water moves under the ice. A clear note rings through the cavern.", "A tin cup frozen into the wall, beside the words \u201CI waited.\u201D", "Water remembers"),
  chapter("The Aurora Bells", "Sol", "Light the three marked ridge signals, then climb to the bell tower.", "We used to steer home by the lights in the sky. Ring the ridge lamps and they can steer by us for once.", "Three bells ring into the snow. Above the tower, a ribbon of green answers.", "Mira\u2019s childhood wish: to hear what the sky sounds like.", "The sky sings back"),
  chapter("The Whiteout", "Edda", "Reach the storm shelter before the dark catches up. Brake on ice and time your jumps between gusts.", "The black comes up the pass with the storm. Watch the snow. When it stops blowing sideways, jump.", "The shelter door slams behind you. Snow hisses against the walls; inside, a small fire holds.", "A page from Mira\u2019s map, edges stitched back together.", "Inside the storm"),
  chapter("The Icebreaker", "Ada", "Ring the dock bell, then cross the icy platforms to the icebreaker.", "I said I would take you as far as I could. I didn\u2019t say which river.", "Ice splits beneath the bow. Ada hums a song your sister used to sing.", "A ferry ticket punched twice. Ada never asks for another fare.", "A path through ice"),
  chapter("A Warmth Beneath", "Sol", "Restore the three geothermal lights, then follow the route to the stone arch.", "The ground is warm beneath the frost. We built too high and forgot to look down.", "Steam rises gently between the stones. The first snowdrop pushes through.", "A seed from the orchard, already beginning to open.", "The first thaw"),
  chapter("The Keeper Who Stayed", "Edda", "Find the lens keeper deep in the ice caves and help them to the exit.", "Sol\u2019s brother wouldn\u2019t leave the lens hut. He\u2019s been up there on his own since the lamps went. Bring him down.", "The keeper comes out carrying an empty case. The lens has been inside your lantern all along.", "Mira\u2019s note inside the case: \u201CI left you the part that knows how to return.\u201D", "What you were carrying"),
  chapter("North Star, Nearer", "Sol", "Light the three star signals and reach the mountain observatory.", "You weren\u2019t chasing your sister\u2019s light. You were carrying half of it.", "The northern lens unfolds. A road of pale light appears above the clouds.", "The two halves of a childhood promise: always leave a light on.", "A road above the weather"),
  chapter("The City From Above", "Mira", "Cross the old sky walk to the keeper\u2019s shelter. Dash across the wider gaps.", "I can see your lantern from here. I drew every lamp\u2019s light into the engine to keep it alive. I thought I was saving them. I let the black in.", "From above, you see every window you helped open. The city was never one light.", "A map drawn from memory. Your old home is larger than all the towers.", "A thousand small lights"),
  chapter("A Sister in the Tower", "Mira", "Climb the west tower, find Mira, and bring her to the open balcony.", "I thought you would hate me for what I did. I forgot you could come here to help.", "Mira steps out of the engine\u2019s shadow. You take her hand before she can apologise again.", "The missing half of your scarf. It fits without a seam.", "A hand, not a duty"),
  chapter("All the Roads We Took", "Nell", "Reconnect the three marked sky lamps, then follow the return route to the lower sky arch.", "The routes you opened are still there. Let them carry something back to you.", "Light climbs from the Quarter, the garden, the factories, the snow. Nobody sent it alone.", "A bundle of replies from people who once thought nobody was coming.", "The city gives back"),
  chapter("When the Tower Lets Go", "Mira", "Cross the breaking sky bridge to the far bridge shelter. Keep moving; no switches block your escape.", "The engine is letting go. So am I. Keep running, little light.", "The old bridge falls into the clouds. Two couriers land on the far side.", "A page torn from the engine\u2019s rules: \u201CNo single point of failure.\u201D", "Two on the far side"),
  chapter("The Heart, Unlocked", "Ren", "Open the two final engine wheels, then climb to the heart chamber.", "No more keepers. No more one person holding up the sky. We build a return path.", "The heart opens like a door. Its light no longer points inward.", "A replacement instruction: \u201CLeave room for someone to help.\u201D", "A heart with a door"),
  chapter("Everybody Aboard", "Ada", "Ring the sky dock bell and board the last airship.", "Every crossing brought us here. This one takes us home.", "The airship rises on patched sails. Below, the city makes a harbour out of its windows.", "Ada\u2019s final ticket says only \u201CReturn.\u201D", "The homeward crossing"),
  chapter("One Last Conversation", "Mira", "Light the three observatory signals and meet Mira on the highest balcony.", "We can send the flame to every district. Or bring it home first, and teach the city to share it slowly. Either way, I\u2019m coming with you.", "The observatory turns toward the horizon. For the first time, dawn is a choice you make together.", "Your old front door key. Mira kept it all this time.", "Before the morning"),
  chapter("What We Leave Alight", "Mira", "Light the three dawn relays, then reach the final lantern. Choose what morning means.", "Whatever you choose, little light, we don\u2019t have to carry it alone anymore.", "The dawn engine releases its last breath. Every road you took becomes a way home.", "A blank page. There is room for what happens next.", "Morning belongs to everyone")
];
function rescueNameFor(stage) {
  return { 1: "Ivo", 9: "Pip", 14: "The gardener", 18: "The night worker", 24: "Edda", 30: "Sol\u2019s brother", 33: "Mira" }[stage] ?? CHAPTERS[stage].person;
}

// src/games/last-light/campaign-types.ts
var spike = (ledge, at = 0.5, width = 26) => ({ ledge, at, kind: "spikes", height: 10, width });
var steam = (ledge, at = 0.5, height = 88, offset = 0, period = 3.2, disabledBy, duty) => ({ ledge, at, kind: "steam", height, width: 18, period, offset, disabledBy, duty });
var laser = (ledge, at = 0.5, height = 110, offset = 0, period = 3.4, disabledBy, duty) => ({ ledge, at, kind: "laser", height, width: 18, period, offset, disabledBy, duty });
var press = (ledge, at = 0.5, offset = 0, period = 3.2) => ({ ledge, at, kind: "crusher", height: 112, width: 30, travel: 94, period, offset });

// src/games/last-light/feature-routes.ts
var FEATURE_ROUTES = {
  // Ada's ferry puts in at the market stairs, the landing at the top of a
  // deep-cut canal quay; the water is a long way down and a miss into it is
  // the end. A wharf crane swings a pallet out over the cut to a warehouse
  // wing; its stack is the step to the tall warehouse, and from its roof a
  // long drop crosses the cut to the first roof of the market.
  // Market roofs over four streets. Every roof is the top of its own building
  // and every street between them is a real drop. An iron fire escape climbs
  // the tenement wall from below the start to its roof (jump up through the
  // landings; Down drops). A chimney stack stands at a gable end as a solid
  // step before each street; a rook walks two of the roofs; a second and a
  // sign gantry reaches the long tenement, whose balconies cross its front to
  // a last fire escape; the route turns back along its roof to the stair-house
  // door, the way down to the east street.
  // Between the market roofs and the sign gantry is the arcade. Its lantern
  // has lost most of its glass: three cracked panes and one length of iron
  // walk are what is left over the lane, and each pane goes a moment after
  // you land on it. The bakehouse flue vents on the arcade's east flat, a
  // stack is the step before Market Street, and the corn loft's sack hoist
  // is the only way up to its roof.
  3: {
    setting: "roofs",
    goal: "relay",
    water: 1244,
    route: "24,1124,232,s;296,1048,64,l,52,1.2;440,1004,80,s;520,940,40,s,,,,64;600,924,160,s;840,1124,300,s;1188,1060,120,g;1188,996,120,g;1188,932,120,g;1188,868,120,g;1188,804,120,g;1188,740,120,g;1308,740,340,s;1648,676,48,s,,,,64;1832,772,296,s;2128,708,120,g;2128,644,120,g;2248,644,152,s;2400,580,48,s,,,,64;2656,612,160,s;2816,548,64,s,,,,64;2880,612,136,s;3112,676,136,s;3296,660,72,c,,,0.5,12;3416,660,56,g;3528,660,72,c,,,0.5,12;3664,660,72,c,,,0.5,12;3800,676,112,s;3912,612,48,s,,,,64;4160,676,120,s;4296,620,64,l,60,1.2;4376,536,160,s;4656,676,288,s;4824,612,120,g;5096,612,120,g;5264,612,120,g;5408,612,120,g;5408,548,120,g;5408,484,120,g;5408,420,120,g;5408,356,120,g;5096,356,312,s",
    branches: "1188,1124,120,g;2264,580,96,g;5296,292,96,g",
    memories: [0, 1, 2],
    stations: [],
    exit: 0.25,
    checkpoints: [4, 12, 14, 19, 22, 29, 32, 36],
    sectors: [[0, "The market stairs"], [1, "The wharf crane"], [2, "Warehouse roofs"], [5, "The fire escape"], [12, "The rook\u2019s ridge"], [14, "Market roofs"], [19, "Across the street"], [22, "The arcade lantern"], [28, "Market Street"], [29, "The corn loft"], [33, "The sign gantry"], [34, "The long tenement"], [41, "The east street stair"]],
    hazards: [spike(14, 0.6, 22), spike(41, 0.72, 22), steam(27, 0.5, 88, 0, 2.8)],
    enemies: [{ ledge: 12, at: 0.55, kind: "crawler", travel: 80, period: 4.2 }, { ledge: 32, at: 0.3, kind: "crawler", travel: 50, period: 3.6 }]
  },
  // Launch up the orchard terraces, cross the canopy to the left, then make a
  // controlled descent through the open grates into the lower greenhouse.
  10: {
    setting: "garden",
    goal: "relay",
    route: "24,1100,300,s;534,1100,100,s;658,1100,95,b;963,972,130,s;1243,908,280,s;1703,844,100,c,,,0.56;1827,844,95,b;2132,716,120,s;2422,652,280,s;2142,588,100,g;2018,588,100,s;1508,524,300,s;1188,588,140,c,,,0.56;868,652,140,g;528,716,180,s;188,780,140,b;468,652,110,g;768,588,110,c,,,0.56;1078,524,140,b;1408,396,340,s",
    branches: "704,1172,64,s;2262,780,100,s;996,716,100,s",
    memories: [0, 1, 2],
    stations: [[4, "Orchard lamp"], [8, "Canopy lamp"], [14, "Glasshouse lamp"]],
    checkpoints: [4, 8, 11, 14],
    sectors: [[0, "Root-level launch"], [4, "The spring canopy"], [8, "Across the treetops"], [11, "Through the greenhouse"], [15, "The final spring"]],
    hazards: [spike(3, 0.75, 22), steam(7, 0.75, 96, 1, 3), spike(10, 0.25, 22), spike(12, 0.25, 22), spike(17, 0.75, 22)],
    enemies: [{ ledge: 8, at: 0.78, kind: "crawler", travel: 26, period: 3.5 }, { ledge: 13, at: 0.5, kind: "moth", travel: 27, period: 3.8 }]
  },
  // A press floor opens into a lift shaft; the return runs above the machines
  // before falling into a conveyor intake with a visible landing beneath it.
  18: {
    setting: "factory",
    goal: "relay",
    route: "24,1064,360,s;574,1000,300,s;1054,944,120,>;1198,944,100,g;1508,880,120,l,24,1.1;1798,816,300,s;2338,816,100,c,,,0.56;2462,816,100,g;2822,752,130,s;3192,688,320,s;2832,624,120,g;2688,624,120,s;2148,560,300,s;1828,624,120,c,,,0.56;1478,688,120,g;1158,624,150,s;828,560,140,>;498,496,320,s;168,432,100,b;448,304,120,g;718,240,160,s;1048,176,360,s",
    branches: "948,1064,100,s;2522,880,100,s;1642,944,84,s",
    memories: [0, 1, 2],
    stations: [[5, "Workshop relay"], [12, "Upper feed relay"], [17, "Intake relay"]],
    checkpoints: [1, 5, 9, 12, 17],
    sectors: [[0, "The first press"], [2, "Lift shaft"], [9, "Upper pressure walk"], [12, "Over the machines"], [17, "Conveyor intake"]],
    hazards: [press(1, 0.6, 0.3, 3.4), spike(2, 0.75, 22), laser(8, 0.75, 104, 0.4, 3), press(9, 0.6, 1, 3.2), spike(11, 0.75, 22), steam(15, 0.75, 96, 0.8, 3), spike(20, 0.75, 22)],
    enemies: [{ ledge: 5, at: 0.73, kind: "crawler", travel: 26, period: 3.5 }, { ledge: 14, at: 0.5, kind: "moth", travel: 24, period: 3.4 }]
  },
  // Alternating shelves wrap around a frozen hollow: climb, reverse, drop into
  // its middle, then leap back out through the right-hand ice chute.
  26: {
    setting: "cavern",
    goal: "signal",
    route: "24,1080,360,s;574,1080,100,i;698,1080,110,g;1018,1016,120,s;1318,952,280,s;1778,888,100,i;1902,888,100,c,,,0.5;2212,824,120,g;2512,760,300,s;2202,696,100,i;2058,696,120,g;1548,632,300,s;1248,696,120,g;948,760,140,i;618,824,180,s;278,760,160,g;588,696,120,s;898,632,140,i;1218,568,100,c,,,0.5;1498,504,120,b;1808,376,140,b;2148,248,340,s",
    branches: "704,1144,100,s;2034,936,64,s;1058,824,100,s",
    memories: [0, 1, 2],
    stations: [[4, "Lower lens"], [11, "Hollow lens"], [14, "Return lens"]],
    checkpoints: [4, 8, 11, 15],
    sectors: [[0, "The frozen hollow"], [4, "Ascending shelves"], [8, "Over the crevasse"], [11, "The inside turn"], [15, "Ice chute"]],
    hazards: [steam(3, 0.75, 100, 0.3, 2.9), spike(5, 0.75, 22), spike(10, 0.25, 22), steam(13, 0.75, 100, 1, 2.9), spike(17, 0.75, 22), spike(20, 0.75, 22)],
    enemies: [{ ledge: 8, at: 0.73, kind: "crawler", travel: 28, period: 3.2 }, { ledge: 16, at: 0.5, kind: "moth", travel: 24, period: 3.4 }],
    wind: -12
  },
  // Two towers share an air bridge. The route goes up one, down the inside,
  // then spring-launches onto the other instead of repeating a flat sky run.
  34: {
    setting: "sky",
    goal: "relay",
    route: "24,1100,320,s;534,1100,96,i;830,1036,96,g;950,1036,100,l,18,1.15;1260,972,260,s;1690,908,80,c,,,0.5;1980,844,96,g;2100,844,110,b;2420,716,300,s;2100,652,96,g;1810,588,110,i;1676,588,110,s;1186,524,280,s;886,556,110,c,,,0.5;576,620,120,g;246,684,160,b;526,556,100,g;826,492,110,i;1136,428,96,c,,,0.5;1412,364,110,g;1712,300,130,s;2042,236,340,s",
    branches: "970,1138,64,b;1590,972,100,s;1902,364,100,s",
    memories: [0, 1, 2],
    stations: [[4, "South tower lamp"], [12, "Air bridge lamp"], [8, "North tower lamp"]],
    checkpoints: [4, 8, 12, 16],
    sectors: [[0, "The south tower"], [4, "The outside ascent"], [8, "Air bridge"], [11, "Inside the tower"], [15, "North tower launch"]],
    hazards: [spike(1, 0.75, 22), laser(6, 0.75, 108, 0.6, 3), spike(10, 0.75, 22), steam(13, 0.75, 108, 1, 3), spike(17, 0.75, 22), spike(20, 0.75, 22)],
    enemies: [{ ledge: 8, at: 0.75, kind: "crawler", travel: 24, period: 3.2 }, { ledge: 12, at: 0.8, kind: "moth", travel: 20, period: 3 }],
    wind: 24
  }
};
var ENCOUNTER_ADDITIONS = {
  6: { presses: [press(2, 0.5, 0.4, 3.6), press(6, 0.2, 1.1, 3.4), press(20, 0.3, 0.2, 3.2)] },
  12: { enemies: [{ ledge: 15, at: 0.72, kind: "moth", travel: 26, period: 3.7 }] },
  14: { presses: [press(5, 0.73, 0.5, 3.4)] },
  16: { presses: [press(11, 0.72, 0.5, 3.2)] },
  20: { enemies: [{ ledge: 17, at: 0.73, kind: "crawler", travel: 28, period: 3.4 }] },
  23: { enemies: [{ ledge: 17, at: 0.72, kind: "moth", travel: 24, period: 3.2 }] },
  24: { enemies: [{ ledge: 11, at: 0.75, kind: "crawler", travel: 26, period: 3.2 }] },
  29: { enemies: [{ ledge: 17, at: 0.73, kind: "moth", travel: 26, period: 3.4 }] },
  32: { enemies: [{ ledge: 19, at: 0.73, kind: "crawler", travel: 28, period: 3 }] },
  36: { presses: [press(13, 0.73, 0.7, 3)] }
};

// src/games/last-light/campaign-opening.ts
var OPENING_ROUTES = [
  // 01 · The Window Left Open
  // One terrace to Nell’s window, then Bell Lane to the tower's door. Alleys teach the run-up jump over lean-tos and a
  // back yard; a dormer eave then rewards a short hop (a full jump clips its
  // edge and drops you into the yard, which only climbs back toward roof 5).
  // The first tooth and the only lethal drops wait across the street.
  {
    setting: "roofs",
    goal: "shelter",
    // Past Nell's window is Bell Lane. Her gable stack is a held jump up; the
    // lane is one long jump down onto the bakehouse roof, short of its ridge
    // tooth; the sexton's lean-to is the low point; the forecourt's gate pier
    // is a narrow held jump back up, and the forecourt and the tower door are
    // across the head of its steps. The lane under all of it is the black's.
    route: "24,440,300,s;372,440,180,s;616,440,200,s;912,440,160,s;1184,408,180,s;1484,408,140,s;1720,408,200,s;1992,344,300,s;2420,344,96,s;2628,344,200,s;2892,344,340,s;3232,280,48,s,,,,64;3440,376,168,s;3690,440,96,s;3850,392,56,s,,,,64;3906,456,300,s",
    branches: "300,500,140,s;520,500,140,s;828,488,72,s;912,500,452,s;1364,468,60,s;1424,500,496,s;1688,321,172,e;1920,452,160,s",
    memories: [1, 2, 6],
    stations: [],
    checkpoints: [2, 5, 7, 10, 12],
    sectors: [[0, "Our roof"], [2, "Washing lines"], [5, "Low eaves"], [7, "The street"], [10, "Nell\u2019s window"], [11, "Bell Lane"], [14, "The tower forecourt"]],
    hazards: [spike(7, 0.5, 22), spike(9, 0.72, 22), spike(9, 0.89, 22), spike(12, 0.7, 22)]
  },
  // 02 · A Bell Above the Rain
  // The inside of the bell tower, climbed floor by floor. Each floor is oak
  // let into the walls; the stair between floors has lost most of its treads
  // (open treads: jump up through them, Down drops). Ropes and clock weights
  // hang down one open well through every floor into the flooded pit, so a
  // miss on a stair costs a flight and a miss over the well costs the run.
  // The clock room's broken floor is the first dash; frame beams cross the
  // well under the bells to Ivo's landing, and the first of them is rotten.
  {
    setting: "tower",
    goal: "rescue",
    // Past Ivo the belfry goes on up, and the gallery door is across the top
    // of it. From the bell loft a rotten plank on the bell cage crosses the
    // well to the frame's west post; a wall tread and the west loft are held
    // jumps; staging on the tie beams and on the spire's first collars climbs
    // inside the spire, where the collar was cut away to pass the bell hoist.
    // The hoist's pallet still swings across that gap on its rope, with the
    // whole height of the tower under it. The east staging comes down to the
    // east loft and the gallery door.
    route: "24,1400,240,s;120,1340,56,g;40,1280,56,g;184,1224,80,s;384,1224,160,s;472,1164,56,g;552,1104,56,g;384,1048,80,s;24,1048,240,s;96,988,80,g;24,928,64,g;168,872,96,s;456,872,168,s;512,812,56,g;568,752,56,g;384,696,96,s;24,696,240,s;120,636,56,g;40,576,56,g;184,520,80,s;300,488,48,c,,,0.6,12;400,456,48,g;496,424,128,s;400,364,56,g;464,304,160,s;276,264,72,c,,,0.55,12;168,220,64,g;52,156,56,g;24,88,60,s;120,16,88,s,,,,12;64,-56,64,s,,,,12;292,-40,64,m,90,1.2,,12;520,-56,64,s,,,,12;320,16,88,s,,,,12;424,120,200,s",
    branches: "384,1400,240,s;480,1340,56,g;568,1280,56,g;104,812,56,g;568,248,56,g",
    memories: [2, 3, 4],
    stations: [[22, "Ivo"]],
    exit: 0.62,
    checkpoints: [4, 8, 11, 16, 22, 24, 28],
    sectors: [[0, "Bell stair"], [4, "The ringing floor"], [8, "The clock room"], [12, "Under the bells"], [22, "Ivo\u2019s landing"], [24, "The bell loft"], [25, "Over the bells"], [28, "The west loft"], [29, "Inside the spire"], [31, "The bell hoist"], [34, "The gallery door"]],
    hazards: [],
    water: 1500
  },
  // 03 · The Last Ferry
  // It starts where level 2 ended: on the gallery outside the bell tower's
  // door, at the top. The tower stands with its foot in the canal, and its
  // outside stair is iron flights bolted to the face, most treads gone, with
  // landings on the clock hood and over the boat door. Off the stair's foot a
  // bracket, the cutwater and one dolphin of piles cross open water to the
  // stone quay in two long jumps; a miss there drowns. Then the canal, as it was:
  // One canal, travelled along its near quay. Everything stood on is a quay
  // built down into the water, a cluster of mooring piles, a timber staging
  // or a boat; the water under all of it is lethal. A barge tied off the
  // first quay shows riding. Mooring piles ask for braking, the staging end
  // is the first lethal dash (onto a moored lighter), two barges out of
  // phase ask for a timed dash, a bolt stands on one pile cap, and a raft on
  // a chain crosses a basin; a fast barge, a second bolt and a dash onto the
  // coal lighter lead on. Past the lighter is the long reach: an old pontoon
  // whose rotten sections break up under you between two dolphins, then a
  // lighter sunk by the head. Its wheelhouse roof and the two crosstrees left
  // on its mast are the climb; the dash off the masthead is to a beacon's
  // stage, and a last pontoon section and a raft on its chain reach Ada's
  // quay. A stepped footbridge over the last side canal comes down, 56 px a
  // landing, to the ferry stage at the waterline.
  {
    setting: "canal",
    goal: "ferry",
    route: "24,96,256,s;304,152,48,g;192,212,64,g;56,268,104,s;200,332,48,g;304,392,48,g;200,452,56,g;24,508,128,s;216,572,48,g;280,652,120,s;540,708,44,s;750,744,300,s;1082,770,112,m,20,.9;1226,744,240,s;1534,760,56,s;1658,756,56,s;1794,770,100,m,28,1;1986,744,260,s;2306,760,120,s;2622,770,120,s;2806,760,56,s;2930,744,220,s;3222,770,100,m,20,1.1;3526,770,110,m,16,1.3;3718,760,96,s;3878,744,200,s;4150,760,56,s;4274,756,56,s;4426,770,120,m,48,.8;4674,760,56,s;4814,770,96,m,36,1.4;5066,760,96,s;5226,756,48,s;5446,770,120,s;5666,758,48,s;5786,780,56,c,,,0.45,12;5922,780,56,c,,,0.45,12;6066,780,56,c,,,0.45,12;6218,758,48,s;6386,770,72,s;6458,706,88,s,,,,64;6578,650,56,g;6578,586,56,g;6842,574,44,s;6986,780,56,c,,,0.45,12;7130,772,96,m,44,1.1;7326,744,200,s;7526,680,72,s;7598,616,160,s;7758,672,72,s;7830,728,72,s;7918,784,180,s",
    branches: "1478,772,48,s;2750,772,48,s;4354,700,44,g",
    memories: [0, 1, 2],
    stations: [],
    checkpoints: [3, 7, 13, 17, 21, 25, 31, 38, 46],
    sectors: [[0, "The gallery"], [1, "The outside stair"], [3, "The clock hood"], [7, "The tower foot"], [11, "Stone quay"], [13, "Mooring piles"], [17, "The staging"], [21, "Two barges"], [25, "The chain raft"], [31, "The coal lighter"], [34, "The old pontoon"], [39, "The wreck"], [43, "The beacon"], [46, "Ada\u2019s crossing"]],
    hazards: [spike(24, 0.78, 22), spike(31, 0.8, 22)]
  },
  // 04 · Windows, Not Stars
  {
    setting: "roofs",
    goal: "relay",
    route: "24,500,300,s;534,500,100,s;664,500,100,s;974,500,100,s;1274,428,165,s;1604,380,300,s;2089,412,100,c,,,0.62;2269,436,105,c,,,0.62;2574,404,165,s;2919,364,125,s;3214,364,300,s;3724,364,100,s;3854,364,100,s;4164,364,170,s;4514,420,125,s;4804,420,300,s;5299,372,120,s;5499,372,100,c,,,0.62;5799,372,165,s;6154,332,145,s;6474,332,300,s;6924,284,340,s",
    branches: "1127,492,94;3494,428,94;5652,436,94",
    memories: [0, 1, 2],
    stations: [[5, "Bakery light"], [10, "Market light"], [15, "East street light"]],
    checkpoints: [5, 10, 15, 20],
    sectors: [[0, "Bakery roofs"], [5, "Laundry crossing"], [10, "Market awnings"], [15, "The east street"]],
    hazards: [spike(2, 0.27, 24), spike(2, 0.75, 24), steam(4, 0.74, 116, 0.4, 2.8), spike(8, 0.28, 26), spike(8, 0.75, 26), spike(9, 0.75, 24), spike(13, 0.28, 26), spike(13, 0.75, 26), steam(16, 0.75, 116, 1.2, 2.7), spike(18, 0.28, 26), spike(18, 0.75, 26), spike(19, 0.75, 26)]
  },
  // 05 · The Roof That Remembers
  // The black is in the lane behind you, and the old roofs over the alleys
  // are failing. Every cracked span is slate on builders' shoring with the
  // alley under it: it drops a moment after you land and stays down, so a
  // fall costs the run. Chimney stacks are steps at the gable ends, a fire
  // escape climbs the tall house mid-way, a dash leaves the last stack for a
  // span that is already going, and Tomas's stair-house is on the far roof.
  // It opens at the east street stair-house where level 4 ended. Tomas's
  // stair is barred, so the run goes on with the black still behind it: his
  // wash-house, the linemen's stages on two wire poles, a shored span, and
  // the brewery's fire escape straight up its end wall. The copper vents on
  // the brewery roof; its stack is the step for a dash over Brewery Yard
  // onto a span that is already going; and the malthouse, the pump house
  // and two more shored spans come down the lane to the culvert steps in
  // its headwall, the mouth level 6 starts inside.
  {
    setting: "roofs",
    goal: "escape",
    route: "24,620,300,s;324,620,104,c,,,0.9;428,620,180,s;636,620,100,c,,,0.7;766,620,96,c,,,0.7;892,588,170,s;1062,524,48,s,,,,64;1190,572,100,c,,,0.6;1340,572,150,s;1560,668,216,s;1776,604,120,g;1776,540,120,g;1896,540,140,s;2064,540,96,c,,,0.6;2190,540,96,c,,,0.6;2316,508,96,c,,,0.6;2452,476,160,s;2612,412,48,s,,,,64;2860,476,100,c,,,0.55;2990,476,140,s;3160,476,96,c,,,0.55;3290,444,96,c,,,0.55;3430,412,360,s;3864,476,112,s;4040,524,40,g;4168,524,40,g;4296,540,96,c,,,0.55;4456,556,120,g;4456,492,120,g;4456,428,120,g;4456,364,120,g;4576,300,260,s;4836,236,48,s,,,,64;5104,364,96,c,,,0.5;5230,396,120,s;5414,460,96,c,,,0.55;5560,540,80,s;5704,604,96,c,,,0.55;5860,668,200,s",
    branches: "468,556,96,g;1776,668,120,g;3020,412,80,g",
    memories: [0, 1, 2],
    stations: [],
    exit: 0.3,
    checkpoints: [2, 5, 9, 16, 22, 31, 34],
    sectors: [[0, "The east street stair"], [1, "The first crack"], [2, "Falling tiles"], [5, "The shored alley"], [9, "The tall house"], [16, "The lane"], [22, "Tomas\u2019s chimney"], [23, "The wire poles"], [27, "The brewery escape"], [31, "The brewery roof"], [33, "Brewery Yard"], [36, "Down to the culvert"]],
    hazards: [spike(12, 0.45, 22), spike(19, 0.5, 22), steam(31, 0.55, 88, 0.3, 2.4)],
    pressure: 88
  },
  // 06 · Under the Sleeping City
  // It opens in the lane where level 5 ended, at the culvert's mouth: the
  // gate in the headwall gives onto the outfall shaft, and a dog-leg stair of
  // landings and one hung grating goes down it to the water. A miss in the
  // shaft is the flood at its foot. Then the culvert, as it was:
  // The service culvert under the street: one brick vault, flooded, and the
  // water is lethal. Brick benches rise out of it, lengths of iron main turn
  // down into it, gratings hang from the vault. Steam leaves joints on the
  // mains: one to watch, one at the far end of a landing, a pair out of
  // phase past the stopped pumps, one in the lower duct under a grating. A
  // broken flange and a dash to a venting main lead to the sluice chamber.
  // Past it the inspection walk has rusted through: three lengths of it are
  // left hanging over the water, each good for a moment, with the sluice
  // gate's frame standing between them. A venting main, two hung gratings
  // and a dash to the pipe bridge cross the junction, and a ladder of
  // gratings climbs the shaft to the street stairwell. Three wall lamps are
  // optional.
  {
    setting: "cavern",
    goal: "signal",
    water: 700,
    route: "24,380,192,s;264,436,96,s;408,500,80,g;264,564,72,s;408,628,96,s;584,660,260,s;900,632,240,s;1200,632,150,s;1420,660,200,s;1676,604,96,g;1820,548,96,g;1980,548,180,s;2230,580,120,s;2410,612,120,g;2410,676,300,s;2790,660,180,s;3040,620,110,s;3230,572,100,s;3420,540,96,g;3716,540,160,s;3960,596,200,s;4230,596,72,c,,,0.5,12;4366,596,72,c,,,0.5,12;4510,572,48,s,,,,128;4640,596,72,c,,,0.5,12;4790,580,150,s;5010,524,96,g;5176,468,96,g;5502,500,110,s;5690,596,200,s;5930,548,110,g;5930,484,110,g;5930,420,110,g;6090,372,300,s",
    branches: "908,568,80,g;2570,612,100,g;5930,356,110,g",
    memories: [0, 1, 2],
    stations: [[8, "Culvert lamp"], [15, "Duct lamp"], [20, "Shaft lamp"]],
    checkpoints: [3, 8, 15, 20, 25, 29, 33],
    sectors: [[0, "The culvert mouth"], [1, "The outfall stair"], [5, "The water main"], [8, "Sleeping pumps"], [13, "The lower duct"], [15, "The broken flange"], [20, "The sluice chamber"], [21, "The rusted walk"], [25, "The junction"], [28, "The pipe bridge"], [29, "Street foundations"]],
    hazards: [steam(6, 0.5, 96, 0, 3.2), steam(7, 0.8, 96, 0.8, 3), steam(11, 0.5, 96, 0, 3), steam(12, 0.5, 96, 1.5, 3), steam(14, 0.7, 80, 0.4, 3), spike(17, 0.8, 22), steam(19, 0.75, 96, 1, 3), steam(25, 0.62, 96, 0.5, 2.8)]
  },
  // 07 · The Counterweight
  // The hoist tower: one brick shaft, two lift wells, the pit under both.
  // Cages ride guide rails on cables from the crown (their phase follows
  // platform id and a 3.6 s cycle, so each is low when boarded and high when
  // left). Landings are iron floors on girders across the shaft; ladders are
  // gratings on the side walls. A counterweight drops through two landings
  // on a telegraphed cycle (ENCOUNTER_ADDITIONS[6]) and is harmless raised.
  // Three dashes cross a well with nothing under them. Each brake wheel
  // shuts one steam vent further up.
  {
    setting: "tower",
    goal: "shelter",
    stationKind: "valve",
    // The culvert's stairwell comes up into the pit at the start. Past the
    // crown landing the climb goes on over the sheaves to the hoist house,
    // and the way out is the door in its wall, on its floor: no lift. A loose
    // plate lies on the trimmers of the east well; the east ladder climbs to
    // the sheave deck, a dash across that well; the last counterweight drops
    // through the deck; a second loose plate is the step for the jump over
    // the west well to the hatchway ladder, which comes up through the hoist
    // house floor beside the winding drums.
    route: "24,1500,208,s;242,1400,100,l,100,1.745;352,1300,240,s;712,1300,176,s;760,1236,128,g;760,1172,128,g;352,1140,240,s;242,1040,100,l,100,1.745;24,940,208,s;72,876,128,g;72,812,128,g;352,780,240,s;602,700,100,l,80,1.745;712,620,176,s;760,556,128,g;760,492,128,g;352,460,240,s;640,412,56,c,,,0.5,12;760,364,128,g;760,300,128,g;472,300,104,s,,,,12;352,300,72,c,,,0.5,12;72,252,128,g;72,188,128,g;200,124,688,s",
    branches: "24,1300,208,s;24,1140,208,s;352,620,240,s",
    memories: [0, 1, 2],
    stations: [[6, "Lower brake wheel"], [11, "Upper brake wheel"]],
    exit: 0.68,
    checkpoints: [2, 3, 6, 8, 11, 13, 16, 19, 22],
    sectors: [[0, "The lift pit"], [2, "Counterweight walk"], [4, "The ladder"], [6, "The brake room"], [8, "The west landing"], [11, "The machine room"], [13, "Under the winding gear"], [16, "The lift crown"], [17, "Over the sheaves"], [20, "The sheave deck"], [22, "The hatchway"], [24, "The hoist house"]],
    hazards: [steam(13, 0.5, 96, 0.4, 2.8, 0), steam(16, 0.8, 96, 0, 3, 1)]
  },
  // 08 · The Quarter’s Reply
  // It opens at the door out of the hoist house, the top of the hoist tower
  // standing at the bridgehead. The approach arches come first: a pier stump
  // where an arch fell, a cracked plank on a trestle, the toll house and its
  // stack, then the approach roadway as it was.
  // The old bridge to the garden bank, with its arches gone and the river
  // under all of it. Each length of roadway is the top of its pier; bridge
  // houses stand on theirs, with a chimney stack as a step at the gable. A
  // rook walks each house roof. The middle is the test: two trestle planks,
  // a dash to a stump, down to a cutwater, a punt on a rope, and a scaffold
  // back up to the roadway. Past the far roadway a second span is down, at
  // the mill pier: the mill's roof and stack, a long jump to a pier stump,
  // then the starlings at the waterline with a cracked plank and a second
  // punt between them, and a scaffold back up to the last span. The
  // gatehouse on the garden bank is one building and its bridge gate is
  // barred: a scaffold on its wall walk climbs to the tower top, the tool
  // house against its garden side is the way down, and the garden gate is
  // in the wall along the bank. Three bridge lamps are optional.
  {
    setting: "bridge",
    goal: "signal",
    water: 760,
    exit: 0.57,
    route: "24,560,232,s;344,600,64,s;480,560,96,c,,,0.7;640,496,160,s;800,432,48,s,,,,64;1024,560,300,s;1420,560,120,s;1636,560,240,s;1972,496,200,s;2172,432,48,s,,,,64;2300,560,160,s;2500,560,100,c,,,0.7;2630,560,96,c,,,0.7;2930,560,96,s;3080,656,96,s;3236,716,110,m,30,1;3436,700,96,s;3436,636,96,g;3436,572,96,g;3566,560,240,s;3902,560,96,s;4070,496,150,s;4220,432,48,s,,,,64;4488,560,56,s;4610,668,90,s;4760,700,56,c,,,0.5;4876,716,96,m,34,1.1;5066,668,90,s;5066,604,90,g;5066,540,90,g;5186,560,200,s;5482,496,180,s;5662,432,48,s,,,,64;5806,496,310,s;6006,432,110,g;6006,368,110,g;6132,320,244,s;6392,424,104,s;6384,560,520,s",
    branches: "1556,656,72,s;1556,608,72,g;3700,700,96,s;6006,304,110,g",
    memories: [1, 2, 3],
    stations: [[7, "Quarter lamp"], [19, "Bridge lamp"], [33, "Garden gate lamp"]],
    checkpoints: [3, 7, 10, 13, 19, 24, 30, 33, 36],
    sectors: [[0, "The hoist house door"], [1, "The approach arches"], [3, "The toll house"], [5, "Bridge approach"], [8, "The first bridge house"], [10, "Broken middle span"], [14, "Down at the piers"], [19, "The far roadway"], [20, "The mill pier"], [24, "The starlings"], [30, "The last span"], [33, "The gatehouse"], [37, "The garden side"], [38, "The garden gate"]],
    hazards: [spike(6, 0.8, 22), spike(10, 0.5, 22)],
    enemies: [{ ledge: 8, at: 0.5, kind: "crawler", travel: 60, period: 4.2 }, { ledge: 31, at: 0.5, kind: "crawler", travel: 50, period: 3.8 }]
  },
  // 09 · Water for the Living
  // It opens inside the garden gate level 8 ended at, on the path at the
  // foot of the garden bank, and climbs the bank's terraces to the glasshouse
  // at the top. A terrace is ground behind its retaining wall, so each step
  // up is a wall to jump. Twice the bank has slipped into the river and what
  // crosses the slip is the old irrigation launder: rotten lengths of timber
  // trough on trestles, each good for a moment, with nothing under them. The
  // cistern is dry and its inlet main crosses it, spraying from a burst
  // joint; the intake wheel on the cistern's wall shuts that off. A
  // water-balance hoist rides the high wall. The return wheel on the fifth
  // terrace shuts the jet on the glasshouse terrace. Neither wheel is needed
  // to reach the glasshouse door.
  {
    setting: "garden",
    goal: "shelter",
    stationKind: "valve",
    route: "24,1000,340,s;364,952,64,s,,,,76;428,904,260,s,,,,124;688,840,48,s,,,,188;736,776,300,s,,,,252;1100,792,72,c,,,0.55,12;1236,792,72,c,,,0.55,12;1380,760,56,s;1520,808,72,c,,,0.5,12;1660,776,56,s;1790,808,72,c,,,0.5,12;1950,840,64,s;2150,808,56,g;2150,744,56,g;2234,680,216,s,,,,364;2450,648,170,s,,,,12;2710,680,60,g;2810,680,240,s,,,,364;3066,640,64,l,60,1;3066,524,64,g;3066,460,64,g;3066,396,64,g;3156,368,220,s,,,,312;3376,304,48,s,,,,376;3424,240,200,s,,,,440;3690,256,72,c,,,0.5,12;3830,224,56,s;3960,240,72,c,,,0.5,12;4100,208,56,s;4230,224,72,c,,,0.5,12;4390,192,64,s;4670,208,200,s,,,,472;4870,144,400,s,,,,536",
    branches: "2450,916,360,s;2754,852,56,g;2754,788,56,g;2754,724,56,g;1380,696,56,g;3830,160,56,g",
    memories: [0, 4, 5],
    stations: [[14, "Garden intake wheel"], [24, "Glasshouse return wheel"]],
    exit: 0.6,
    checkpoints: [2, 4, 9, 14, 17, 22, 24, 28, 31],
    sectors: [[0, "Inside the garden gate"], [1, "Kitchen terraces"], [5, "The landslip"], [12, "The cistern rungs"], [14, "The dry cistern"], [17, "The water hoist"], [22, "The high terraces"], [25, "The broken launder"], [31, "The glasshouse terrace"]],
    hazards: [steam(15, 0.55, 88, 0.4, 2.7, 0), steam(31, 0.7, 96, 1.2, 2.7, 1)]
  },
  // 10 · A Voice in the Reeds
  // It opens on the glasshouse path where level 9 ended, at the glasshouse's
  // far end, and goes down the water stairs into the reed beds: the garden's
  // old ponds, with the bank's water lying in them. A punt on its rope, pile
  // heads and two rotten duckboards reach the eel stage; its ladder climbs to
  // the boathouse roof for a dash to a lone post, and a second punt reaches
  // the drowned willow, whose two boughs are the climb for a dash to the
  // water-gate pier and the sunken garden's wall. The sunken garden is flooded to its coping:
  // the pergola's beams on their columns, or the stones under them, cross to
  // the plinth and Pip's summerhouse. The fountain's two bowls are the step
  // for the dash to the east wall. Beyond it is the lily court: an urn's
  // pedestal, one more length of pergola, a third punt, and two duckboards
  // to the sluice. The cascade, dry now, climbs from there to the upper bank
  // and the orchard gate.
  {
    setting: "canal",
    goal: "rescue",
    water: 760,
    route: "24,560,300,s;388,640,80,s;540,712,64,s;684,728,96,m,30,1;890,712,56,s;1020,712,56,s;1150,716,72,c,,,0.5,12;1290,716,72,c,,,0.5,12;1430,696,120,s;1610,648,56,g;1610,584,56,g;1610,520,56,g;1666,456,180,s;2060,640,56,s;2190,712,64,s;2330,728,96,m,40,1.2;2520,712,60,s;2540,648,64,g;2540,584,64,g;2820,632,56,s;2950,680,150,s;3160,632,110,s,,,,8;3330,632,110,s,,,,8;3500,656,48,s;3620,696,260,s;3950,656,56,s;4070,600,48,s;4330,656,150,s;4560,640,48,s;4680,600,110,s,,,,8;4870,728,96,m,34,1.3;5060,712,60,s;5190,716,72,c,,,0.5,12;5330,716,72,c,,,0.5,12;5470,696,64,s;5600,640,80,s;5680,584,80,s,,,,84;5760,528,80,s,,,,140;5840,472,320,s,,,,196",
    branches: "770,656,44,g;2236,640,48,g;3190,716,56,s;3350,716,56,s;3630,632,48,g",
    memories: [0, 1, 4],
    stations: [[24, "Pip"]],
    exit: 0.6,
    checkpoints: [1, 8, 12, 16, 20, 24, 27, 31],
    sectors: [[0, "The glasshouse path"], [1, "The water stairs"], [3, "The reed beds"], [8, "The eel stage"], [12, "The boathouse"], [16, "The drowned willow"], [20, "The sunken garden"], [24, "Pip\u2019s summerhouse"], [25, "The fountain"], [27, "The east wall"], [28, "The lily court"], [35, "The cascade"], [38, "The orchard gate"]],
    hazards: []
  },
  // 11 · The Orchard Circuit
  {
    setting: "garden",
    goal: "relay",
    route: "24,560,300,s;534,560,95,s;659,560,90,c,,,0.56;959,528,100,b;1234,416,135,s;1539,416,320,s;2054,376,110,s;2244,400,85,c,,,0.56;2534,376,160,s;2889,336,120,s;3179,336,320,s;3709,336,95,s;3834,336,90,s;4134,336,170,s;4494,448,110,s;4769,408,320,s;5289,408,85,c,,,0.56;5414,368,110,s;5734,368,100,s;5864,368,95,s;6169,328,300,s;6634,280,350,s",
    branches: "1412,480,84;3479,400,84;5504,432,84",
    memories: [0, 1, 2],
    stations: [[5, "Trellis light"], [10, "Orchard light"], [15, "Root arch light"]],
    checkpoints: [5, 10, 15, 20],
    sectors: [[0, "Bending boughs"], [5, "The high orchard"], [10, "Rootward path"], [15, "The warm roots"]],
    hazards: [spike(4, 0.27, 22), spike(4, 0.76, 22), spike(6, 0.75, 24), spike(8, 0.28, 26), spike(8, 0.75, 26), steam(9, 0.75, 128, 0.6, 2.7), spike(12, 0.75, 22), steam(13, 0.74, 128, 0.8, 2.6), spike(14, 0.75, 24), steam(17, 0.75, 128, 1.5, 2.7), spike(18, 0.28, 26), spike(18, 0.75, 26), spike(19, 0.75, 24)]
  },
  // 12 · A House Made of Glass
  {
    setting: "tower",
    goal: "shelter",
    route: "24,960,300,s;484,920,100,s;614,920,100,s;914,880,170,s;1264,832,95,c,,,0.56;1529,784,300,s;1989,728,105,s;2244,664,125,s;1954,600,115,s;1684,552,120,s;1234,552,300,s;944,504,100,c,,,0.56;809,504,100,s;529,456,110,c,,,0.56;204,408,125,s;24,344,100,b;294,220,115,s;584,172,300,s;1074,172,105,s;1209,172,95,s;1504,100,115,s;1799,28,350,s",
    branches: "1125,896,90;882,568,90;820,248,90",
    memories: [0, 1, 2],
    stations: [],
    checkpoints: [5, 10, 17],
    sectors: [[0, "Glasshouse stair"], [5, "Eastern windows"], [10, "The hanging room"], [17, "Elian\u2019s roof"]],
    hazards: [spike(3, 0.28, 26), spike(3, 0.75, 26), steam(6, 0.75, 128, 0.5, 2.7), spike(8, 0.27, 24), spike(9, 0.26, 24), steam(12, 0.27, 128, 1.4, 2.6), spike(14, 0.25, 20), spike(14, 0.76, 20), spike(19, 0.75, 24), spike(20, 0.75, 24)]
  },
  // 13 · Borrowed Ground
  {
    setting: "garden",
    goal: "escape",
    route: "24,500,300,s;534,500,95,s;659,500,85,c,,,0.56;954,500,100,c,,,0.56;1259,428,165,s;1594,428,300,s;2089,460,90,c,,,0.56;2259,428,85,c,,,0.56;2544,380,155,s;2894,380,110,s;3174,340,300,s;3684,340,95,s;3809,340,90,c,,,0.56;4109,340,90,c,,,0.56;4389,300,160,s;4714,300,300,s;5214,324,85,c,,,0.56;5339,300,90,c,,,0.56;5639,300,100,s;5769,300,95,s;6074,252,300,s;6539,212,350,s",
    branches: "1114,492,84;3454,404,84;5409,364,84",
    memories: [0, 1, 2],
    stations: [],
    checkpoints: [5, 10, 15, 20],
    sectors: [[0, "Split trellis"], [5, "Pulling roots"], [10, "Stone cistern"], [15, "The new bank"]],
    hazards: [spike(1, 0.75, 24), spike(4, 0.28, 26), spike(4, 0.75, 26), spike(8, 0.27, 24), spike(8, 0.76, 24), spike(9, 0.75, 24), spike(11, 0.75, 24), spike(14, 0.28, 26), spike(14, 0.75, 26), spike(18, 0.28, 26), spike(18, 0.75, 26), spike(19, 0.75, 24)],
    pressure: 100
  },
  // 14 · The Rain Machine
  {
    setting: "factory",
    goal: "engine",
    route: "24,560,300,s;534,560,95,s;659,560,90,m,20,1.2;959,560,90,s;1244,560,120,s;1534,520,300,s;1989,520,340,s;2524,520,150,s;2754,488,90,l,24,1.15;3039,448,150,s;3364,448,300,s;3874,448,95,s;3999,448,90,m,20,1.2;4299,448,165,s;4644,448,340,s;5144,448,280,s;5634,448,100,>;5764,448,95,s;6069,408,165,s;6424,360,300,s;6894,360,120,s;7179,320,350,s",
    branches: "1104,624,84;3644,512,84;5434,512,84",
    memories: [0, 1, 2],
    stations: [[6, "Feed pump wheel"], [14, "Rain pump wheel"]],
    checkpoints: [5, 10, 15, 19],
    sectors: [[0, "Moving trays"], [5, "The feed pump"], [10, "Rain lift"], [15, "Pressure walk"]],
    hazards: [spike(3, 0.75, 24), steam(4, 0.75, 128, 0.4, 2.7), steam(7, 0.75, 128, 0.6, 2.6, 0), steam(9, 0.75, 128, 1.9, 2.7), spike(11, 0.75, 24), spike(13, 0.28, 26), spike(13, 0.75, 26), steam(16, 0.75, 128, 1.6, 2.6, 1), steam(17, 0.75, 128, 0.3, 2.7), spike(18, 0.28, 26), spike(18, 0.75, 26), spike(20, 0.75, 24)]
  },
  // 15 · Where the Roots Go
  {
    setting: "cavern",
    goal: "rescue",
    route: "24,380,300,s;534,380,95,s;659,380,95,s;964,380,100,s;1269,500,120,s;1559,548,300,s;2054,580,90,c,,,0.56;2224,620,150,s;2574,620,110,c,,,0.56;2879,652,150,s;3199,652,340,s;3749,652,95,s;3874,652,90,c,,,0.56;4174,580,165,s;4524,508,110,s;4799,492,300,s;5294,444,90,c,,,0.56;5424,404,110,s;5744,404,100,s;5874,404,95,s;6179,364,300,s;6644,316,350,s",
    branches: "1164,444,100,c,,,0.58;3519,716,84;5514,468,84;1324,612,120",
    memories: [3, 1, 2],
    stations: [[10, "The gardener"]],
    checkpoints: [5, 10, 15, 20],
    sectors: [[0, "Cellar mouth"], [5, "Deep roots"], [10, "The gardener\u2019s room"], [15, "Fresh air stair"]],
    hazards: [spike(2, 0.75, 22), spike(3, 0.75, 24), steam(4, 0.75, 128, 0.5, 2.7), steam(7, 0.75, 128, 1.2, 2.7), spike(8, 0.75, 24), spike(9, 0.27, 24), spike(9, 0.76, 24), spike(11, 0.75, 24), steam(13, 0.75, 128, 0.5, 2.6), spike(14, 0.75, 24), steam(17, 0.75, 128, 1.6, 2.7), spike(18, 0.28, 26), spike(18, 0.75, 26), spike(19, 0.75, 24)]
  },
  // 16 · The Garden’s Answer
  {
    setting: "garden",
    goal: "signal",
    route: "24,600,300,s;534,600,95,s;659,600,95,b;964,456,165,s;1329,456,120,s;1619,456,300,s;2114,480,85,c,,,0.56;2279,456,90,c,,,0.56;2569,416,155,s;2919,416,110,s;3199,376,320,s;3729,376,95,s;3854,376,90,m,20,1.2;4154,376,165,s;4504,368,110,s;4779,368,320,s;5274,392,95,b;5544,280,165,s;5919,280,100,s;6049,280,95,s;6354,320,300,s;6849,280,110,s;7039,280,155,s;7394,232,360,s",
    branches: "1187,520,84;3499,440,84;5689,344,84",
    memories: [0, 1, 2],
    stations: [[5, "Garden gate signal"], [10, "Hollow tree signal"], [15, "Crown signal"]],
    checkpoints: [5, 10, 15, 20],
    sectors: [[0, "The moth stair"], [5, "The old trellis"], [10, "Hollow branches"], [15, "The great tree"]],
    hazards: [spike(3, 0.28, 26), spike(3, 0.75, 26), steam(4, 0.75, 128, 0.4, 2.6), spike(8, 0.27, 24), spike(8, 0.76, 24), spike(9, 0.75, 24), steam(11, 0.75, 128, 1.3, 2.7), spike(13, 0.28, 26), spike(13, 0.75, 26), spike(14, 0.75, 24), spike(17, 0.28, 26), spike(17, 0.75, 26), steam(18, 0.75, 128, 1.5, 2.6), spike(19, 0.75, 24), steam(21, 0.75, 128, 1.9, 2.6), spike(22, 0.27, 24), spike(22, 0.76, 24)]
  }
];

// src/games/last-light/campaign-middle.ts
var MIDDLE_ROUTES = [
  // 17. First Shift, Last Shift — 7012px; 22 main ledges.
  {
    setting: "factory",
    goal: "engine",
    route: "24,500,400,s;614,500,112,>;946,500,88,s;1062,500,80,c,,,0.56;1362,452,108,s;1660,452,280,s;2117,404,96,<;2390,404,260,s;2747,404,116,s;3040,404,92,m,34,1.25;3309,404,104,s;3590,404,400,s;4240,456,88,>;4356,456,80,s;4656,456,260,s;5041,456,120,s;5286,456,88,c,,,0.56;5500,456,380,s;6100,400,88,s;6216,400,80,c,,,0.56;6516,400,112,s;6696,400,340,s",
    branches: "1515,506,100,s;3205,516,140,s;3417,458,100,s;5387,510,100,s",
    memories: [0, 1, 3],
    stations: [[7, "Boiler intake wheel"], [14, "Fan return wheel"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Boiler approach"], [6, "Pressure gallery"], [12, "Fan return"], [18, "Service gantry"]],
    hazards: [{ ...steam(2, 0.73, 112, 0.3, 2.8), duty: 0.6 }, { ...steam(4, 0.7, 112, 1.75, 2.8), duty: 0.6 }, { ...laser(8, 0.73, 112, 0.61, 2.8), duty: 0.6 }, { ...laser(10, 0.7, 112, 1.44, 2.8), duty: 0.6 }, { ...steam(15, 0.55, 112, 0.92, 2.8), duty: 0.6 }, { ...steam(16, 0.7, 112, 1.75, 2.8), duty: 0.6 }, spike(13, 0.52, 24), spike(20, 0.52, 24), steam(8, 0.2, 72, 0.45, 2.8, 0), steam(15, 0.2, 72, 1.1, 2.8, 1)]
  },
  // 18. The Clock Without Hands — 6892px; 22 main ledges.
  {
    setting: "tower",
    goal: "relay",
    route: "24,700,400,s;608,700,108,c,,,0.56;936,700,88,s;1052,700,80,c,,,0.56;1352,648,104,s;1640,596,280,s;2101,596,112,>;2306,544,96,s;2584,544,86,l,24,1.1;2852,544,124,s;3158,492,104,s;3444,492,400,s;4064,440,88,>;4180,440,80,s;4480,388,108,s;4781,388,120,s;5094,388,92,c,,,0.56;5380,388,380,s;5980,336,88,s;6096,336,80,c,,,0.56;6396,284,108,s;6576,284,340,s",
    branches: "776,754,100,s;4272,504,70,s;5233,442,100,s",
    memories: [0, 1, 2],
    stations: [[5, "Pendulum lamp"], [11, "Hour-wheel lamp"], [17, "Clock-face lamp"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Silent pendulum"], [6, "Hour-wheel ascent"], [12, "Empty dial"], [18, "Clock-face balcony"]],
    hazards: [{ ...laser(2, 0.73, 112, 0.47, 2.8), duty: 0.6 }, { ...laser(4, 0.7, 112, 1.92, 2.8), duty: 0.6 }, { ...steam(9, 0.73, 112, 0.78, 2.8), duty: 0.6 }, { ...steam(10, 0.7, 112, 1.61, 2.8), duty: 0.6 }, { ...laser(15, 0.73, 112, 1.09, 2.8), duty: 0.6 }, { ...laser(16, 0.7, 112, 1.92, 2.8), duty: 0.6 }, spike(7, 0.52, 24), spike(20, 0.52, 24)]
  },
  // 19. Someone on the Night Shift — 6952px; 22 main ledges.
  {
    setting: "factory",
    goal: "rescue",
    route: "24,400,400,s;594,400,108,<;922,400,88,s;1038,400,80,c,,,0.56;1368,448,112,s;1650,448,280,s;2126,500,104,<;2346,500,88,c,,,0.56;2630,500,120,s;2946,552,94,m,28,1.2;3236,552,108,s;3540,552,400,s;4160,552,88,>;4276,552,80,s;4576,500,104,c,,,0.56;4864,500,120,s;5169,500,86,c,,,0.56;5440,500,380,s;6040,448,88,s;6156,448,80,c,,,0.56;6456,448,104,s;6636,448,340,s",
    branches: "1515,502,100,s;3392,606,100,s;5298,554,100,s",
    memories: [0, 1, 2],
    stations: [[11, "Night worker \xB7 packing room"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Empty clock-in hall"], [6, "Night packing room"], [12, "Return conveyors"], [18, "Loading bay"]],
    hazards: [{ ...steam(2, 0.73, 112, 0.64, 2.8), duty: 0.6 }, { ...steam(4, 0.7, 112, 2.09, 2.8), duty: 0.6 }, { ...laser(8, 0.73, 112, 0.95, 2.8), duty: 0.6 }, { ...laser(10, 0.7, 112, 1.78, 2.8), duty: 0.6 }, { ...steam(15, 0.73, 112, 1.26, 2.8), duty: 0.6 }, { ...steam(16, 0.7, 112, 2.09, 2.8), duty: 0.6 }, spike(13, 0.52, 24), spike(20, 0.52, 24)]
  },
  // 20. Teeth of the City — 6892px; 22 main ledges.
  {
    setting: "bridge",
    goal: "escape",
    route: "24,480,400,s;612,480,110,>;942,480,88,s;1058,480,80,c,,,0.56;1358,428,94,c,,,0.56;1640,424,280,s;2110,424,104,>;2324,424,86,c,,,0.56;2600,424,120,s;2910,480,108,<;3208,480,112,s;3510,480,400,s;4130,480,88,>;4246,480,80,s;4546,480,100,>;4822,424,120,s;5118,424,86,c,,,0.56;5380,424,380,s;5980,368,88,s;6096,368,80,c,,,0.56;6396,368,110,s;6576,368,340,s",
    branches: "1270,578,100,s;1420,550,70,s;1530,490,90,s;3365,534,100,s;5242,478,100,s",
    memories: [1, 3, 4],
    stations: [],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Conveyor mouth"], [6, "Broken teeth"], [12, "Steam crossing"], [18, "Far abutment"]],
    hazards: [{ ...laser(2, 0.73, 112, 0.81, 2.8), duty: 0.6 }, { ...laser(4, 0.7, 112, 2.26, 2.8), duty: 0.6 }, { ...steam(8, 0.73, 112, 1.12, 2.8), duty: 0.6 }, { ...steam(10, 0.7, 112, 1.95, 2.8), duty: 0.6 }, { ...laser(15, 0.73, 112, 1.43, 2.8), duty: 0.6 }, { ...laser(16, 0.7, 112, 2.26, 2.8), duty: 0.6 }, spike(13, 0.52, 24), spike(20, 0.52, 24)],
    pressure: 104
  },
  // 21. The Unwinding — 7190px; 23 main ledges.
  {
    setting: "factory",
    goal: "engine",
    route: "24,620,400,s;588,620,112,>;920,620,88,s;1036,620,80,c,,,0.56;1336,568,104,s;1604,568,280,s;2056,516,108,<;2336,516,240,s;2669,516,120,s;2962,516,86,m,36,1.2;3221,464,100,s;3494,464,400,s;4114,464,88,>;4230,464,80,s;4530,412,86,c,,,0.56;4756,412,240,s;5137,412,116,s;5394,412,380,s;5994,360,88,s;6110,360,80,c,,,0.56;6438,360,96,m,28,1.15;6652,360,104,s;6874,360,340,s",
    branches: "1472,622,100,s;3358,518,100,s;6543,424,100,s",
    memories: [0, 1, 2],
    stations: [[7, "Engine feed wheel"], [15, "Upper return wheel"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Feed floor"], [6, "Light intake"], [12, "Reversing chamber"], [18, "Upper hatch"]],
    hazards: [{ ...steam(2, 0.73, 112, 0.3, 2.8), duty: 0.6 }, { ...steam(4, 0.7, 112, 1.75, 2.8), duty: 0.6 }, { ...laser(8, 0.73, 112, 0.61, 2.8), duty: 0.6 }, { ...laser(10, 0.7, 112, 1.44, 2.8), duty: 0.6 }, { ...steam(16, 0.53, 112, 0.92, 2.8), duty: 0.6 }, { ...steam(18, 0.7, 112, 1.75, 2.8), duty: 0.6 }, spike(13, 0.52, 24), spike(21, 0.52, 24), steam(8, 0.2, 72, 0.45, 2.8, 0), steam(16, 0.2, 72, 1.1, 2.8, 1)]
  },
  // 22. Cargo for the Morning — 6992px; 22 main ledges.
  {
    setting: "canal",
    goal: "ferry",
    route: "24,400,400,s;593,400,108,<;921,400,88,s;1037,400,80,c,,,0.56;1367,448,104,s;1640,448,280,s;2115,448,96,m,40,1.15;2326,448,108,<;2629,448,120,s;2944,400,90,c,,,0.56;3230,400,104,s;3530,400,400,s;4180,448,88,>;4296,448,80,s;4596,448,104,c,,,0.56;4811,448,120,s;5042,400,260,s;5414,400,380,s;6014,400,88,s;6130,400,80,c,,,0.56;6430,352,104,s;6676,352,340,s",
    branches: "1506,502,100,s;3382,454,100,s;5814,476,100,s",
    memories: [0, 1, 2],
    stations: [[16, "Freight departure bell"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Freight approach"], [6, "Warm-pipe crossing"], [12, "Bell wharf"], [18, "Ada\u2019s barge"]],
    hazards: [{ ...laser(2, 0.73, 112, 0.47, 2.8), duty: 0.6 }, { ...laser(4, 0.7, 112, 1.92, 2.8), duty: 0.6 }, { ...steam(8, 0.73, 112, 0.78, 2.8), duty: 0.6 }, { ...steam(10, 0.7, 112, 1.61, 2.8), duty: 0.6 }, { ...laser(14, 0.73, 112, 1.09, 2.8), duty: 0.6 }, { ...laser(15, 0.7, 112, 1.92, 2.8), duty: 0.6 }, spike(7, 0.52, 24), spike(20, 0.52, 24)]
  },
  // 23. A Signal Through Steel — 7126px; 23 main ledges.
  {
    setting: "tower",
    goal: "signal",
    route: "24,760,400,s;609,760,106,c,,,0.56;935,760,88,s;1051,760,80,c,,,0.56;1351,708,104,s;1640,656,280,s;2116,604,108,>;2340,604,96,s;2633,552,84,l,26,1.2;2914,552,120,s;3231,552,102,s;3530,552,400,s;4150,500,88,>;4266,500,80,s;4566,448,100,c,,,0.56;4812,448,120,s;5078,396,90,<;5314,396,380,s;5914,344,88,s;6030,344,80,c,,,0.56;6330,292,100,s;6574,240,92,c,,,0.56;6810,188,340,s",
    branches: "775,814,100,s;3382,606,100,s;6122,408,70,s",
    memories: [0, 1, 2],
    stations: [[5, "Foundry signal"], [11, "Radio-room signal"], [17, "Antenna signal"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Foundry mast"], [6, "Radio-room stairs"], [12, "Aerial supports"], [18, "High antenna"]],
    hazards: [{ ...steam(2, 0.73, 112, 0.64, 2.8), duty: 0.6 }, { ...steam(4, 0.7, 112, 2.09, 2.8), duty: 0.6 }, { ...laser(9, 0.73, 112, 0.95, 2.8), duty: 0.6 }, { ...laser(10, 0.7, 112, 1.78, 2.8), duty: 0.6 }, { ...steam(15, 0.73, 112, 1.26, 2.8), duty: 0.6 }, { ...steam(16, 0.7, 112, 2.09, 2.8), duty: 0.6 }, spike(7, 0.52, 24), spike(20, 0.52, 24)]
  },
  // 24. Let the Machines Dream — 6932px; 22 main ledges.
  {
    setting: "factory",
    goal: "relay",
    route: "24,400,400,s;618,400,108,>;946,400,88,s;1062,400,80,c,,,0.56;1362,348,104,s;1660,348,280,s;2135,348,110,<;2360,348,96,m,26,1.1;2651,348,84,c,,,0.56;2930,400,120,s;3246,400,108,s;3550,400,400,s;4200,452,88,>;4316,452,80,s;4616,452,88,c,,,0.56;4870,504,120,s;5157,504,96,<;5420,504,380,s;6050,556,88,s;6166,556,80,c,,,0.56;6466,556,108,s;6616,556,340,s",
    branches: "1513,402,100,s;3402,454,100,s;5287,558,100,s",
    memories: [0, 1, 2],
    stations: [[5, "Assembly safety light"], [11, "Inspection safety light"], [17, "Maintenance safety light"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Assembly hall"], [6, "Inspection crossing"], [12, "Quiet machines"], [18, "Maintenance arch"]],
    hazards: [{ ...laser(2, 0.73, 112, 0.81, 2.8), duty: 0.6 }, { ...laser(4, 0.7, 112, 2.26, 2.8), duty: 0.6 }, { ...steam(9, 0.73, 112, 1.12, 2.8), duty: 0.6 }, { ...steam(10, 0.7, 112, 1.95, 2.8), duty: 0.6 }, { ...laser(15, 0.73, 112, 1.43, 2.8), duty: 0.6 }, { ...laser(16, 0.7, 112, 2.26, 2.8), duty: 0.6 }, spike(13, 0.52, 24), spike(20, 0.52, 24)]
  },
  // 25. Footprints in the White — 6972px; 22 main ledges.
  {
    setting: "bridge",
    goal: "rescue",
    route: "24,500,440,s;659,500,100,i;979,500,82,s;1085,500,74,c,,,0.5;1379,452,96,s;1670,452,280,s;2156,404,94,i;2376,404,76,c,,,0.5;2658,404,108,s;2972,452,82,i;3259,452,96,s;3560,452,420,s;4200,452,82,i;4306,452,74,s;4628,404,92,m,28,1.2;4904,404,110,s;5199,404,76,c,,,0.5;5460,404,380,s;6060,352,82,i;6166,352,74,i;6460,352,94,s;6656,352,340,s",
    branches: "1523,506,100,s;2887,536,100,s;3108,560,120,s;3367,506,90,s;5318,458,100,s",
    memories: [0, 2, 4],
    stations: [[11, "Edda \xB7 broken ice bridge"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "First footprints"], [6, "Ice-bridge shelter"], [12, "Two sets of tracks"], [18, "Sheltered ridge"]],
    hazards: [{ ...steam(2, 0.73, 112, 0.3, 2.65), duty: 0.62 }, { ...steam(4, 0.7, 112, 1.6, 2.65), duty: 0.62 }, { ...laser(8, 0.73, 112, 0.61, 2.65), duty: 0.62 }, { ...laser(10, 0.7, 112, 1.44, 2.65), duty: 0.62 }, { ...steam(15, 0.73, 112, 0.92, 2.65), duty: 0.62 }, { ...steam(16, 0.7, 112, 1.75, 2.65), duty: 0.62 }, spike(13, 0.52, 22), spike(20, 0.52, 22)],
    wind: 20
  },
  // 26. The Frozen Intake — 7022px; 22 main ledges.
  {
    setting: "cavern",
    goal: "engine",
    route: "24,400,440,s;640,400,100,i;960,400,82,s;1066,400,74,c,,,0.5;1390,452,94,s;1660,452,280,s;2124,504,92,i;2400,504,260,s;2764,504,108,s;3056,556,78,l,24,1.05;3319,556,96,s;3600,556,420,s;4240,504,82,i;4346,504,74,s;4640,504,260,s;5042,504,108,s;5292,504,76,c,,,0.5;5510,504,380,s;6110,452,82,i;6216,452,74,i;6510,452,94,s;6706,452,340,s",
    branches: "1522,506,100,s;3458,610,100,s;5389,558,100,s",
    memories: [0, 1, 2],
    stations: [[7, "Frozen intake wheel"], [14, "Thaw return wheel"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Frozen mouth"], [6, "Intake chamber"], [12, "Thaw gallery"], [18, "Cavern shelter"]],
    hazards: [{ ...laser(2, 0.73, 112, 0.47, 2.65), duty: 0.62 }, { ...laser(4, 0.7, 112, 1.77, 2.65), duty: 0.62 }, { ...steam(8, 0.73, 112, 0.78, 2.65), duty: 0.62 }, { ...steam(10, 0.7, 112, 1.61, 2.65), duty: 0.62 }, { ...laser(15, 0.53, 112, 1.09, 2.65), duty: 0.62 }, { ...laser(16, 0.7, 112, 1.92, 2.65), duty: 0.62 }, spike(13, 0.52, 22), spike(20, 0.52, 22), steam(8, 0.2, 72, 0.45, 2.8, 0), steam(15, 0.2, 72, 1.1, 2.8, 1)],
    wind: 0
  },
  // 27. The Aurora Bells — 7126px; 23 main ledges.
  {
    setting: "tower",
    goal: "signal",
    route: "24,720,440,s;646,720,98,i;964,720,82,s;1070,720,74,c,,,0.5;1364,668,94,s;1640,668,280,s;2124,616,92,i;2340,616,96,s;2640,616,78,m,30,1.2;2922,564,108,s;3233,564,94,s;3530,564,420,s;4170,512,82,i;4276,512,74,s;4570,460,92,s;4816,460,108,s;5078,460,82,i;5314,460,380,s;5914,408,82,i;6020,408,74,i;6314,356,96,s;6570,356,80,i;6810,304,340,s",
    branches: "1499,722,100,s;3379,618,100,s;6440,410,100,s",
    memories: [0, 1, 2],
    stations: [[5, "Lower ridge signal"], [11, "Eastern balcony signal"], [17, "Bell-tower signal"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Cloth-wrapped bells"], [6, "Eastern balcony"], [12, "Aurora gallery"], [18, "Bell crown"]],
    hazards: [{ ...steam(2, 0.73, 112, 0.64, 2.65), duty: 0.62 }, { ...steam(4, 0.7, 112, 1.94, 2.65), duty: 0.62 }, { ...laser(9, 0.73, 112, 0.95, 2.65), duty: 0.62 }, { ...laser(10, 0.7, 112, 1.78, 2.65), duty: 0.62 }, { ...steam(15, 0.73, 112, 1.26, 2.65), duty: 0.62 }, { ...steam(16, 0.7, 112, 0.46, 2.65), duty: 0.62 }, spike(7, 0.52, 22), spike(20, 0.52, 22)],
    wind: 22
  },
  // 28. The Whiteout — 6922px; 22 main ledges.
  {
    setting: "bridge",
    goal: "escape",
    route: "24,500,440,s;658,500,98,i;976,500,82,s;1082,500,74,c,,,0.5;1376,448,90,s;1660,444,280,s;2144,388,94,i;2362,388,74,c,,,0.5;2639,388,108,s;2950,444,80,i;3233,444,94,s;3530,444,420,s;4200,500,82,i;4306,500,74,s;4600,500,90,i;4868,444,108,s;5154,444,78,c,,,0.5;5410,444,380,s;6010,388,82,i;6116,388,74,i;6410,388,94,s;6606,388,340,s",
    branches: "1513,498,100,s;3379,498,100,s;5271,498,100,s",
    memories: [0, 1, 2],
    stations: [],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Storm lip"], [6, "Lower lee"], [12, "Whiteout crossing"], [18, "Storm shelter"]],
    hazards: [{ ...laser(2, 0.73, 112, 0.81, 2.65), duty: 0.62 }, { ...laser(4, 0.7, 112, 2.11, 2.65), duty: 0.62 }, { ...steam(8, 0.73, 112, 1.12, 2.65), duty: 0.62 }, { ...steam(10, 0.7, 112, 1.95, 2.65), duty: 0.62 }, { ...laser(15, 0.73, 112, 1.43, 2.65), duty: 0.62 }, { ...laser(16, 0.7, 112, 2.26, 2.65), duty: 0.62 }, spike(13, 0.52, 22), spike(20, 0.52, 22)],
    pressure: 108,
    wind: 28
  },
  // 29. The Icebreaker — 7126px; 23 main ledges.
  {
    setting: "canal",
    goal: "ferry",
    route: "24,420,440,s;643,420,96,i;959,420,82,s;1065,420,74,c,,,0.5;1389,468,92,s;1660,468,280,s;2144,420,94,i;2362,420,96,s;2662,420,78,m,38,1.2;2944,420,108,s;3255,420,92,s;3550,420,420,s;4220,468,82,i;4326,468,74,s;4620,468,96,s;4856,468,108,s;5104,420,80,i;5324,420,380,s;5924,420,82,i;6030,420,74,i;6324,368,94,s;6574,368,80,i;6810,368,340,s",
    branches: "1521,522,100,s;2824,504,96,s;3003,528,110,s;3197,532,100,s;3380,474,86,s;6446,422,100,s",
    memories: [0, 2, 5],
    stations: [[17, "Icebreaker dock bell"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Sail-marked ice"], [6, "Frozen moorings"], [12, "Dock-bell shelter"], [18, "Icebreaker bow"]],
    hazards: [{ ...steam(2, 0.73, 112, 0.3, 2.65), duty: 0.62 }, { ...steam(4, 0.7, 112, 1.6, 2.65), duty: 0.62 }, { ...laser(9, 0.73, 112, 0.61, 2.65), duty: 0.62 }, { ...laser(10, 0.7, 112, 1.44, 2.65), duty: 0.62 }, { ...steam(15, 0.73, 112, 0.92, 2.65), duty: 0.62 }, { ...steam(16, 0.7, 112, 0.12, 2.65), duty: 0.62 }, spike(7, 0.52, 22), spike(20, 0.52, 22)],
    wind: 24
  },
  // 30. A Warmth Beneath — 6922px; 22 main ledges.
  {
    setting: "garden",
    goal: "relay",
    route: "24,460,440,s;657,460,98,i;975,460,82,s;1081,460,74,c,,,0.5;1375,408,92,s;1660,408,280,s;2145,356,94,i;2364,356,90,s;2659,356,76,c,,,0.5;2940,408,108,s;3252,408,94,s;3550,408,420,s;4220,460,82,i;4326,460,74,s;4620,460,90,i;4888,512,108,s;5174,512,78,i;5430,512,380,s;6060,564,82,i;6166,564,74,i;6460,564,92,s;6606,564,340,s",
    branches: "1514,462,100,s;3398,462,100,s;5291,566,100,s",
    memories: [0, 1, 2],
    stations: [[5, "Springhead light"], [11, "Hearthroot light"], [17, "Stone-arch light"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Snow-covered roots"], [6, "Warm springhead"], [12, "First snowdrop"], [18, "Lower stone arch"]],
    hazards: [{ ...laser(2, 0.73, 112, 0.47, 2.65), duty: 0.62 }, { ...laser(4, 0.7, 112, 1.77, 2.65), duty: 0.62 }, { ...steam(9, 0.73, 112, 0.78, 2.65), duty: 0.62 }, { ...steam(10, 0.7, 112, 1.61, 2.65), duty: 0.62 }, { ...laser(15, 0.73, 112, 1.09, 2.65), duty: 0.62 }, { ...laser(16, 0.7, 112, 0.29, 2.65), duty: 0.62 }, spike(7, 0.52, 22), spike(20, 0.52, 22)],
    wind: 24
  },
  // 31. The Keeper Who Stayed — 7176px; 23 main ledges.
  {
    setting: "cavern",
    goal: "rescue",
    route: "24,420,440,s;643,420,96,i;959,420,82,s;1065,420,74,c,,,0.5;1389,472,92,s;1660,472,280,s;2145,524,94,i;2364,524,92,s;2660,524,76,i;2940,576,108,s;3252,576,94,s;3550,576,420,s;4190,576,82,i;4296,576,74,s;4590,524,92,i;4847,524,108,s;5120,472,78,i;5364,472,380,s;5964,472,82,i;6070,472,74,i;6364,420,92,s;6618,420,80,m,32,1.3;6860,368,340,s",
    branches: "1521,526,100,s;3398,630,100,s;6487,484,100,s",
    memories: [0, 1, 2],
    stations: [[11, "Lens keeper \xB7 song chamber"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Blue-ice mouth"], [6, "Song chamber"], [12, "Keeper\u2019s return"], [18, "Open cave"]],
    hazards: [{ ...steam(2, 0.73, 112, 0.64, 2.65), duty: 0.62 }, { ...steam(4, 0.7, 112, 1.94, 2.65), duty: 0.62 }, { ...laser(9, 0.73, 112, 0.95, 2.65), duty: 0.62 }, { ...laser(10, 0.7, 112, 1.78, 2.65), duty: 0.62 }, { ...steam(15, 0.73, 112, 1.26, 2.65), duty: 0.62 }, { ...steam(16, 0.7, 112, 0.46, 2.65), duty: 0.62 }, spike(7, 0.52, 22), spike(20, 0.52, 22)],
    wind: 0
  },
  // 32. North Star, Nearer — 7180px; 24 main ledges.
  {
    setting: "sky",
    goal: "signal",
    route: "24,760,440,s;612,760,96,i;928,760,82,s;1034,760,74,c,,,0.5;1328,708,88,s;1564,708,280,s;2038,656,90,i;2242,656,84,c,,,0.5;2520,656,76,m,32,1.25;2790,604,108,s;3092,604,88,s;3374,604,420,s;4014,552,82,i;4120,552,74,s;4414,552,74,c,,,0.5;4654,500,108,s;4929,500,88,i;5184,500,380,s;5784,448,82,i;5890,448,74,i;6184,396,108,s;6457,396,76,m,30,1.3;6610,344,88,c,,,0.5;6864,344,340,s",
    branches: "1440,762,100,s;3227,658,100,s;5051,554,100,s",
    memories: [0, 1, 2],
    stations: [[5, "Ridge star signal"], [11, "Cloud-break signal"], [17, "Observatory signal"]],
    checkpoints: [5, 11, 17],
    sectors: [[0, "Last ridge"], [6, "Cloud break"], [12, "Northern lens"], [18, "Mountain observatory"]],
    hazards: [{ ...laser(2, 0.73, 112, 0.81, 2.65), duty: 0.62 }, { ...laser(4, 0.7, 112, 2.11, 2.65), duty: 0.62 }, { ...steam(9, 0.73, 112, 1.12, 2.65), duty: 0.62 }, { ...steam(10, 0.7, 112, 1.95, 2.65), duty: 0.62 }, { ...laser(15, 0.73, 112, 1.43, 2.65), duty: 0.62 }, { ...laser(16, 0.7, 112, 0.63, 2.65), duty: 0.62 }, { ...steam(20, 0.73, 112, 1.74, 2.65), duty: 0.62 }, { ...steam(22, 0.7, 112, 2.57, 2.65), duty: 0.62 }, spike(7, 0.52, 22), spike(13, 0.52, 22)],
    wind: 30
  }
];

// src/games/last-light/campaign-final.ts
var FINAL_ROUTES = [
  // 33. The City From Above
  // Four exposed gates alternate with short crumble hops, an ice dash, and a two-step ferry brake.
  {
    setting: "sky",
    goal: "shelter",
    route: "24,760,240,s;474,760,96,i;600,760,96,s;906,760,72,c,,,0.5;1154,760,84,i;1322,816,72,c,,,0.46;1510,816,280,s;1866,760,72,m,30,1.35;2014,704,88,c,,,0.52;2312,704,96,i;2438,704,96,s;2744,704,72,c,,,0.48;2916,704,280,s;3268,648,80,>;3424,592,104,s;3640,592,72,m,28,1.4;3922,592,96,i;4048,592,96,c,,,0.5;4354,592,96,s;4562,592,280,s;4918,536,72,m,22,1.4;5062,480,104,s;5346,480,72,c,,,0.46;5486,424,64,m,24,1.45;5630,424,48,i;5770,368,340,s",
    branches: "928,856,88,s;1078,920,100,s;1240,928,76,s;1378,876,64,s;2116,768,80,s;5212,544,88,s",
    memories: [1, 4, 5],
    stations: [],
    checkpoints: [6, 12, 19],
    sectors: [[0, "Old skywalk"], [7, "Cloud ferries"], [13, "The wind stairs"], [20, "Keeper\u2019s eaves"]],
    hazards: [laser(2, 0.23, 140, 0.9, 2.6, void 0, 0.66), laser(2, 0.79, 140, 0.58, 2.6, void 0, 0.66), laser(10, 0.23, 144, 1.4, 2.7, void 0, 0.66), laser(10, 0.79, 144, 1.08, 2.7, void 0, 0.66), laser(14, 0.23, 144, 0.5, 2.5, void 0, 0.66), laser(14, 0.79, 144, 0.18, 2.5, void 0, 0.66), laser(21, 0.23, 148, 1.1, 2.6, void 0, 0.66), laser(21, 0.79, 148, 0.78, 2.6, void 0, 0.66), spike(4, 0.9, 18), spike(16, 0.9, 18)],
    wind: 30
  },
  // 34. A Sister in the Tower
  // The ascent alternates belt launches and quick ferry landings; the return reverses gate timing and icy takeoffs.
  {
    setting: "tower",
    goal: "rescue",
    route: "24,1360,240,s;474,1360,96,<;600,1360,96,s;906,1360,72,i;1154,1360,80,c,,,0.5;1302,1304,64,m,20,1.3;1450,1248,280,s;1810,1192,80,>;1962,1136,72,c,,,0.48;2244,1136,96,i;2370,1136,208,s;2676,1136,104,s;2860,1080,72,c,,,0.5;3012,1024,340,s;2868,968,72,i;2688,912,104,s;2548,856,64,c,,,0.46;2242,856,96,<;2116,856,96,m,22,1.4;1606,856,300,s;1454,800,72,>;1274,744,104,s;1130,688,72,c,,,0.48;878,632,72,i;758,632,40,m,20,1.45;206,576,360,s",
    branches: "1022,1424,88,s;2048,1200,80,s;996,752,88,s",
    memories: [0, 1, 2],
    stations: [[13, "Mira"]],
    checkpoints: [6, 13, 19],
    sectors: [[0, "West tower stair"], [7, "Engine shadow"], [14, "The way together"], [20, "Open balcony"]],
    hazards: [laser(2, 0.23, 140, 0.8, 2.6, void 0, 0.66), laser(2, 0.79, 140, 0.48, 2.6, void 0, 0.66), laser(11, 0.23, 144, 1.3, 2.6, void 0, 0.66), laser(11, 0.79, 144, 0.98, 2.6, void 0, 0.66), laser(15, 0.77, 144, 1.3, 2.5, void 0, 0.66), laser(15, 0.21, 144, 0.98, 2.5, void 0, 0.66), laser(21, 0.77, 148, 1.5, 2.7, void 0, 0.66), laser(21, 0.21, 148, 1.18, 2.7, void 0, 0.66), spike(7, 0.86, 18), spike(20, 0.14, 18)],
    wind: 24
  },
  // 35. All the Roads We Took
  // The gallery climb uses quick upward hops; its descending half demands braking before narrow ice and crumble landings.
  {
    setting: "sky",
    goal: "relay",
    route: "24,872,240,s;474,872,96,i;600,872,96,s;906,872,72,c,,,0.5;1154,872,80,i;1306,816,72,>;1458,760,280,s;1814,704,72,m,26,1.35;1962,648,104,s;2138,592,72,c,,,0.5;2390,592,80,i;2680,592,96,m,22,1.4;2806,592,96,c,,,0.46;3112,592,300,s;3516,648,80,<;3692,704,64,m,24,1.45;3860,760,104,s;4068,816,72,c,,,0.5;4350,816,96,i;4476,816,96,c,,,0.46;4782,816,280,s;5166,872,72,<;5342,928,104,s;5622,928,64,m,24,1.4;5774,984,80,i;5938,1040,40,c,,,0.44;6094,1096,340,s",
    branches: "1022,936,88,s;2256,656,88,s;3596,768,104,s;3776,832,96,s;3948,880,88,s",
    memories: [0, 1, 3],
    stations: [[6, "Quarter sky lamp"], [13, "High gallery lamp"], [20, "Homeward sky lamp"]],
    checkpoints: [6, 13, 20],
    sectors: [[0, "Quarter replies"], [7, "High lantern gallery"], [14, "The returning light"], [21, "Lower sky arch"]],
    hazards: [laser(2, 0.23, 140, 0.9, 2.6, void 0, 0.66), laser(2, 0.79, 140, 0.58, 2.6, void 0, 0.66), laser(8, 0.23, 144, 1.4, 2.6, void 0, 0.66), laser(8, 0.79, 144, 1.08, 2.6, void 0, 0.66), laser(16, 0.23, 144, 0.6, 2.5, void 0, 0.66), laser(16, 0.79, 144, 0.28, 2.5, void 0, 0.66), laser(22, 0.23, 148, 1.6, 2.7, void 0, 0.66), laser(22, 0.79, 148, 1.28, 2.7, void 0, 0.66), spike(5, 0.86, 18), spike(24, 0.9, 18)],
    wind: 28
  },
  // 36. When the Tower Lets Go
  // The fracture chain interleaves timed gates, two successive dash commitments, and short collapsing steps under pursuit.
  {
    setting: "bridge",
    goal: "escape",
    route: "24,848,240,s;344,792,72,s;488,736,104,s;668,680,72,i;950,680,96,m,22,1.3;1076,680,96,c,,,0.5;1382,680,300,s;1892,680,96,i;2018,680,96,s;2324,680,64,c,,,0.56;2564,680,80,i;2816,680,72,>;2964,624,300,s;3340,568,72,s;3484,512,104,s;3664,456,72,i;3946,456,96,m,22,1.4;4072,456,96,c,,,0.52;4378,456,96,i;4586,456,300,s;4962,400,72,>;5102,344,80,c,,,0.56;5358,344,64,s;5558,288,104,s;5742,288,40,m,20,1.45;6010,232,360,s",
    branches: "754,744,80,s;2162,800,88,s;2330,808,258,s;2664,744,88,s;5226,408,88,s",
    memories: [0, 2, 4],
    stations: [],
    checkpoints: [6, 12, 19],
    sectors: [[0, "The first fracture"], [7, "Falling trusses"], [13, "Tethered spans"], [20, "Two on the far side"]],
    hazards: [laser(2, 0.23, 136, 0.6, 2.2, void 0, 0.65), laser(2, 0.79, 136, 0.28, 2.2, void 0, 0.65), laser(8, 0.23, 136, 1.2, 2.2, void 0, 0.65), laser(8, 0.79, 136, 0.88, 2.2, void 0, 0.65), laser(14, 0.23, 140, 0.4, 2.2, void 0, 0.65), laser(14, 0.79, 140, 0.08, 2.2, void 0, 0.65), laser(23, 0.23, 140, 1, 2.2, void 0, 0.65), laser(23, 0.65, 140, 0.68, 2.2, void 0, 0.65)],
    wind: 28,
    pressure: 134
  },
  // 37. The Heart, Unlocked
  // Both wheels shut down paired machinery; active pressure gates still bracket belt, crumble, and moving-ice combinations.
  {
    setting: "factory",
    goal: "engine",
    route: "24,872,240,s;474,872,96,<;600,872,96,s;906,872,72,i;1158,872,80,s;1342,928,104,s;1558,928,240,s;1870,872,64,m,24,1.35;2010,816,240,s;2354,816,104,s;2534,760,72,>;2674,704,72,c,,,0.48;2922,704,80,i;3106,760,240,s;3556,760,96,s;3682,760,96,s;3996,760,48,m,22,1.4;4120,704,72,i;4268,648,240,s;4612,648,104,s;4792,592,240,s;5242,536,48,i;5314,536,48,c,,,0.5;5576,480,180,s;5818,480,96,s;5944,480,96,c,,,0.44;6250,480,320,s",
    branches: "1024,936,88,s;2790,768,88,s;5412,608,72,s",
    memories: [0, 1, 2],
    stations: [[8, "Heart feed wheel"], [18, "Heart return wheel"]],
    checkpoints: [6, 13, 20],
    sectors: [[0, "Outer pressure hall"], [7, "Feed wheel chamber"], [14, "The return works"], [21, "Heart chamber"]],
    hazards: [laser(2, 0.23, 140, 0.7, 2.6, void 0, 0.66), laser(2, 0.79, 140, 0.38, 2.6, void 0, 0.66), laser(5, 0.23, 140, 1.2, 2.6, void 0, 0.66), laser(5, 0.79, 140, 0.88, 2.6, void 0, 0.66), steam(9, 0.23, 144, 0.4, 2.6, 0, 0.66), steam(9, 0.79, 144, 0.08, 2.6, 0, 0.66), steam(15, 0.23, 144, 0.9, 2.5, void 0, 0.66), steam(15, 0.79, 144, 0.58, 2.5, void 0, 0.66), laser(19, 0.23, 144, 0.6, 2.6, 1, 0.66), laser(19, 0.79, 144, 0.28, 2.6, 1, 0.66), laser(24, 0.23, 148, 1.4, 2.7, void 0, 0.66), laser(24, 0.79, 148, 1.08, 2.7, void 0, 0.66), spike(10, 0.88, 18), spike(23, 0.88, 18)],
    wind: 24
  },
  // 38. Everybody Aboard
  // Cargo shuttles feed a lift-and-gate crossing; the final gangway alternates a long icy leap with short moving steps.
  {
    setting: "sky",
    goal: "ferry",
    route: "24,704,240,s;474,704,96,m,24,1.3;600,704,96,s;906,704,96,i;1032,704,96,c,,,0.5;1314,648,104,s;1498,592,300,s;1874,536,72,m,24,1.35;2022,480,80,c,,,0.52;2222,480,64,l,22,1.1;2382,480,104,s;2662,480,80,i;2846,536,300,s;3250,592,64,m,24,1.4;3524,592,96,i;3650,592,208,s;3956,592,104,s;4240,592,72,i;4488,592,80,c,,,0.5;4672,592,340,s;5100,536,48,m,24,1.4;5236,480,104,s;5550,480,96,i;5676,480,96,m,20,1.45;5982,480,80,c,,,0.46;6138,424,400,s",
    branches: "1096,768,88,s;2082,592,88,s;2230,656,104,s;2394,592,76,s;2522,536,72,s;4356,656,88,s",
    memories: [0, 2, 5],
    stations: [[19, "Sky dock bell"]],
    checkpoints: [6, 12, 19],
    sectors: [[0, "Lower moorings"], [7, "Cargo ferries"], [13, "Last sky dock"], [20, "Homeward gangway"]],
    hazards: [laser(2, 0.23, 140, 0.8, 2.6, void 0, 0.66), laser(2, 0.79, 140, 0.48, 2.6, void 0, 0.66), laser(10, 0.23, 144, 1.4, 2.7, void 0, 0.66), laser(10, 0.79, 144, 1.08, 2.7, void 0, 0.66), laser(16, 0.23, 144, 0.5, 2.6, void 0, 0.66), laser(16, 0.79, 144, 0.18, 2.6, void 0, 0.66), laser(21, 0.23, 148, 1.2, 2.6, void 0, 0.66), laser(21, 0.79, 148, 0.88, 2.6, void 0, 0.66), laser(5, 0.6, 138, 1, 2.6)],
    wind: 30
  },
  // 39. One Last Conversation
  // Double-crumble risers and opposing belts lead to the signal; the return puts moving steps between reversed gates.
  {
    setting: "tower",
    goal: "signal",
    route: "24,1488,264,s;498,1488,96,>;624,1488,96,s;930,1488,72,i;1182,1488,80,c,,,0.5;1330,1432,64,c,,,0.46;1470,1376,260,s;1806,1320,72,m,24,1.35;1954,1264,104,s;2134,1208,72,i;2416,1208,96,c,,,0.5;2542,1208,96,c,,,0.46;2848,1208,260,s;3184,1152,72,<;3336,1096,280,s;3200,1040,64,i;3020,984,104,s;2888,928,64,m,22,1.4;2732,872,80,c,,,0.48;2396,816,260,s;2264,760,64,c,,,0.46;1908,704,280,s;1760,648,72,i;1454,648,96,s;1328,648,96,s;858,648,260,s;738,592,40,c,,,0.44;330,536,320,s",
    branches: "1048,1552,88,s;2220,1272,80,s;1666,712,80,s",
    memories: [0, 1, 2],
    stations: [[6, "West observatory light"], [14, "Horizon signal"], [21, "Homeward beam"]],
    checkpoints: [6, 12, 19, 25],
    sectors: [[0, "Observatory approach"], [7, "Horizon gallery"], [15, "The high return stair"], [22, "Highest balcony"]],
    hazards: [laser(2, 0.23, 140, 0.8, 2.6, void 0, 0.66), laser(2, 0.79, 140, 0.48, 2.6, void 0, 0.66), laser(8, 0.23, 144, 1.3, 2.7, void 0, 0.66), laser(8, 0.79, 144, 0.98, 2.7, void 0, 0.66), laser(16, 0.77, 144, 0.6, 2.6, void 0, 0.66), laser(16, 0.21, 144, 0.28, 2.6, void 0, 0.66), laser(24, 0.77, 148, 1.4, 2.7, void 0, 0.66), laser(24, 0.21, 148, 1.08, 2.7, void 0, 0.66), spike(13, 0.12, 18)],
    wind: 26
  },
  // 40. What We Leave Alight
  // The last relay combines all four disciplines, ending in a long moving-to-ice landing followed by two short hops home.
  {
    setting: "sky",
    goal: "dawn",
    route: "24,816,220,s;454,816,96,i;580,816,96,s;886,816,72,c,,,0.5;1138,816,80,i;1286,760,72,>;1438,704,280,s;1798,648,48,m,22,1.35;1930,592,104,s;2110,536,72,i;2358,536,80,c,,,0.5;2648,536,96,s;2774,536,96,c,,,0.46;3080,536,280,s;3464,592,72,<;3640,648,104,s;3920,648,64,l,22,1.1;4052,592,72,c,,,0.46;4192,536,72,i;4444,536,80,c,,,0.5;4628,592,280,s;5012,648,64,s;5180,704,104,s;5388,760,64,m,22,1.45;5628,816,72,i;5910,816,96,>;6036,816,96,c,,,0.44;6342,816,360,s",
    branches: "1004,880,88,s;2226,600,88,s;4310,600,88,s",
    memories: [0, 1, 2],
    stations: [[6, "Quarter dawn relay"], [13, "Garden dawn relay"], [20, "City return relay"]],
    checkpoints: [6, 13, 20],
    sectors: [[0, "The roofs remember"], [7, "A garden of replies"], [14, "The city returns"], [21, "A way home"]],
    hazards: [laser(2, 0.23, 144, 0.9, 2.6, void 0, 0.66), laser(2, 0.79, 144, 0.58, 2.6, void 0, 0.66), laser(8, 0.23, 144, 1.4, 2.6, void 0, 0.66), laser(8, 0.79, 144, 1.08, 2.6, void 0, 0.66), laser(15, 0.23, 148, 0.5, 2.5, void 0, 0.66), laser(15, 0.79, 148, 0.18, 2.5, void 0, 0.66), laser(22, 0.23, 148, 1.3, 2.6, void 0, 0.66), laser(22, 0.79, 148, 0.98, 2.6, void 0, 0.66), laser(11, 0.6, 140, 0.8, 2.6), spike(5, 0.88, 18)],
    wind: 28
  }
];

// src/games/last-light/route-build.ts
var token = (s) => {
  const { k = "s", t, v, d, h } = s.o, fields = [s.x, s.y, s.w, k, t ?? "", v ?? "", d ?? "", h ?? ""].map(String);
  while (fields.length > 4 && fields.at(-1) === "") fields.pop();
  return fields.join(",");
};
var G = { k: "g" };
var C = (d = 0.5, h = 12) => ({ k: "c", d, h });
var M = (t, v, h) => ({ k: "m", t, v, h });
var L = (t, v, h) => ({ k: "l", t, v, h });
var H = (h) => ({ h });
var T = (tag, o = {}) => ({ ...o, tag });
var Trail = class {
  main = [];
  side_ = [];
  tags = [];
  sideTags = [];
  role = "";
  next;
  memories = [];
  cps = [];
  sectors = [];
  stations = [];
  hazards = [];
  enemies = [];
  places = [];
  marks = /* @__PURE__ */ new Map();
  constructor(x, y, w, o = {}) {
    this.put(x, y, w, o);
  }
  get last() {
    return this.main.at(-1);
  }
  put(x, y, w, o) {
    if (this.next) {
      this.sectors.push([this.main.length, this.next]);
      this.next = void 0;
    }
    this.main.push({ x: Math.round(x), y: Math.round(y), w, o });
    this.tags.push(o.tag ?? this.role);
    const place = this.places.at(-1);
    if (place) place.to = this.main.length - 1;
    return this;
  }
  /** Every landing from here on is this thing, until the next call. */
  tag(role) {
    this.role = role;
    return this;
  }
  /** The next landing opens a named stretch of the route. */
  sec(name) {
    this.next = name;
    return this;
  }
  /** The next landing opens a built place the set draws as one thing. */
  place(kind, name = kind, data) {
    this.places.push({ kind, name, from: this.main.length, to: this.main.length, x0: 0, x1: 0, y0: 0, y1: 0, data });
    return this;
  }
  /** To the right of the last landing: gap between edges, rise (negative is up), width. */
  r(gap, dy, w, o = {}) {
    const p = this.last;
    return this.put(p.x + p.w + gap, p.y + dy, w, o);
  }
  /** To the left of the last landing. */
  l(gap, dy, w, o = {}) {
    const p = this.last;
    return this.put(p.x - gap - w, p.y + dy, w, o);
  }
  /** At a fixed x (a wall, a well, a column of rungs), a rise from the last landing. */
  x(x, dy, w, o = {}) {
    return this.put(x, this.last.y + dy, w, o);
  }
  /** At a fixed place in the world. */
  at(x, y, w, o = {}) {
    return this.put(x, y, w, o);
  }
  /** Rungs straight up (or down) from the last landing's column: count, rise each, width, offset. */
  rungs(count, dy, w, dx = 0, o = G) {
    const base = this.last;
    for (let i = 1; i <= count; i++) this.put(base.x + dx, base.y + dy * i, w, o);
    return this;
  }
  /** Names the stretch that begins at the last landing. */
  here(name) {
    this.sectors.push([this.main.length - 1, name]);
    return this;
  }
  cp() {
    this.cps.push(this.main.length - 1);
    return this;
  }
  mark(name) {
    this.marks.set(name, this.main.length - 1);
    return this;
  }
  id(name) {
    return name ? this.marks.get(name) : this.main.length - 1;
  }
  station(label) {
    this.stations.push([this.main.length - 1, label]);
    return this;
  }
  hz(make) {
    this.hazards.push(make(this.main.length - 1));
    return this;
  }
  enemy(kind, at, travel, period, offset) {
    this.enemies.push({ ledge: this.main.length - 1, at, kind, travel, period, offset });
    return this;
  }
  /** An optional ledge off the route, placed from the last landing's top-left corner. */
  off(dx, dy, w, o = {}, memory = false) {
    const p = this.last;
    if (memory) this.memories.push(this.side_.length);
    this.side_.push({ x: Math.round(p.x + dx), y: Math.round(p.y + dy), w, o });
    this.sideTags.push(o.tag ?? this.role);
    return this;
  }
  /** An optional ledge at a fixed place in the world. */
  side(x, y, w, o = {}, memory = false) {
    if (memory) this.memories.push(this.side_.length);
    this.side_.push({ x, y, w, o });
    this.sideTags.push(o.tag ?? this.role);
    return this;
  }
  done(rest) {
    if (this.memories.length !== 3) throw new Error(`A route carries three memories, not ${this.memories.length}`);
    for (const place of this.places) {
      const spots = this.main.slice(place.from, place.to + 1);
      place.x0 = Math.min(...spots.map((s) => s.x - (s.o.k === "m" ? s.o.t ?? 28 : 0)));
      place.x1 = Math.max(...spots.map((s) => s.x + s.w + (s.o.k === "m" ? s.o.t ?? 28 : 0)));
      place.y0 = Math.min(...spots.map((s) => s.y - (s.o.k === "l" ? s.o.t ?? 24 : 0)));
      place.y1 = Math.max(...spots.map((s) => s.y + (s.o.h ?? 28) + (s.o.k === "l" ? s.o.t ?? 24 : 0)));
    }
    return {
      route: this.main.map(token).join(";"),
      branches: this.side_.map(token).join(";"),
      memories: this.memories,
      stations: this.stations,
      checkpoints: this.cps,
      sectors: this.sectors,
      hazards: this.hazards,
      ...this.enemies.length ? { enemies: this.enemies } : {},
      tags: [...this.tags, ...this.sideTags],
      places: this.places,
      ...rest
    };
  }
};
var trail = (x, y, w, o = {}) => new Trail(x, y, w, o);

// src/games/last-light/route-01.ts
var stack = T("stack", H(64));
var pane = T("pane", C(0.6));
var board = T("board", G);
var escape = T("escape", G);
var rung = T("rung", G);
var loft = T("loft");
var cote = T("cote");
var rack = T("rack", { k: "e" });
var post = (h = 56) => T("post", H(h));
var wall = (h = 48) => T("wall", H(h));
var cowl = (h = 56) => T("cowl", H(h));
var ROUTE_01 = trail(24, 440, 300).here("Our roof").side(300, 500, 140).side(520, 500, 140, {}, true).side(828, 488, 72).at(372, 440, 180).at(616, 440, 200).here("Washing lines").cp().side(912, 500, 452).side(1364, 468, 60).side(1424, 500, 496).at(912, 440, 160).at(1184, 408, 180).at(1484, 408, 140).here("Low eaves").cp().side(1688, 321, 172, { k: "e" }).side(1920, 452, 160).at(1720, 408, 200).at(1992, 344, 300).here("The street").cp().hz((i) => spike(i, 0.5, 22)).at(2420, 344, 96).at(2628, 344, 200).hz((i) => spike(i, 0.72, 22)).hz((i) => spike(i, 0.89, 22)).at(2892, 344, 340, T("nell")).here("Nell\u2019s window").cp().at(3232, 280, 48, T("nellstack", H(64))).here("Bell Lane").sec("The bakehouse").place("bakehouse").at(3440, 376, 168).cp().hz((i) => spike(i, 0.7, 22)).r(64, -32, 330, T("flues")).hz((i) => steam(i, 0.3, 88, 0, 3.2)).hz((i) => steam(i, 0.56, 88, 1.6, 3.2)).hz((i) => steam(i, 0.82, 88, 0, 3.2)).r(72, 0, 140).r(0, -64, 48, stack).sec("Coopers\u2019 Row").place("row").r(136, 64, 180).cp().r(148, 0, 150).r(120, -32, 110).r(0, -64, 48, stack).r(140, 96, 130).r(96, -48, 96).r(110, 48, 200).hz((i) => spike(i, 0.55, 22)).r(0, -64, 48, stack).r(150, 96, 160).sec("The maltings").place("maltings").r(70, -24, 44, cowl()).r(78, -24, 44, cowl(80)).r(82, 24, 44, cowl()).r(78, -40, 44, cowl(96)).r(90, 64, 400, T("flues")).cp().hz((i) => steam(i, 0.2, 88, 0, 3.6)).hz((i) => steam(i, 0.42, 88, 1.8, 3.6)).hz((i) => steam(i, 0.64, 88, 0, 3.6)).hz((i) => steam(i, 0.86, 88, 1.8, 3.6)).r(74, -32, 44, cowl(72)).r(80, -16, 44, cowl(96)).r(84, 48, 150).sec("The roofers\u2019 hoist").place("scaffold").r(90, 0, 120, T("store")).cp().r(8, -170, 64, T("hoist", L(170, 1.2))).off(-88, 62, 72, board).off(-88, -48, 72, board, true).r(8, -174, 300, T("tall")).hz((i) => spike(i, 0.4, 22)).enemy("crawler", 0.72, 44, 4.2).cp().sec("The skylights").place("studio").r(56, 16, 64, pane).r(40, 0, 64, pane).r(40, 0, 64, pane).r(48, -16, 140).r(44, 16, 64, pane).r(40, 0, 64, pane).r(44, -16, 120).r(0, -64, 48, stack).r(150, 96, 150).cp().sec("The laundry").place("laundry").r(80, 32, 96, loft).r(180, 8, 72, T("basket", M(140, 1, 12))).r(180, -8, 120, loft).r(64, 32, 96).r(72, 32, 140).cp().sec("Chandlers\u2019 Yard").place("yard").r(24, 56, 88, escape).r(16, 56, 88, escape).l(16, 56, 88, escape).r(16, 56, 88, escape).r(16, 24, 150, T("shed")).r(60, -24, 40, wall()).r(72, 0, 40, wall()).r(72, 24, 120, T("shed")).r(84, -24, 40, wall(64)).r(90, 16, 160, T("store")).cp().sec("The brewer\u2019s stack").place("greatstack").r(40, -24, 64, rung).r(-20, -60, 64, rung).r(-108, -60, 64, rung).r(-20, -60, 64, rung).r(-108, -60, 64, rung).r(30, -36, 150, T("cap", H(40))).r(120, 88, 110).r(130, 88, 120).r(120, 64, 150, T("store")).cp().sec("The hay loft").place("hayloft").r(8, -130, 64, T("hoist", L(130, 1.5))).r(8, -134, 260, loft).enemy("crawler", 0.55, 50, 3.8).cp().sec("The pigeon lofts").place("lofts").r(70, 16, 56, cote).r(76, -24, 48, cote).r(84, 32, 56, cote).r(72, -16, 48, cote).r(80, 24, 56, cote).r(76, -32, 48, cote).r(84, 24, 56, cote).r(78, -24, 48, cote).r(82, 32, 56, cote).r(84, 16, 150).cp().sec("The drying racks").place("racks").r(56, 16, 84, rack).r(60, 16, 84, rack).r(64, 16, 84, rack).r(64, -16, 84, rack).r(60, -16, 84, rack).r(64, -16, 84, rack).r(62, 16, 84, rack).r(64, -16, 84, rack).r(60, 0, 160).cp().sec("The long gutters").place("gutters").r(24, 56, 88, escape).r(16, 56, 88, escape).l(16, 56, 88, escape).r(16, 56, 88, escape).r(60, 24, 120).r(96, 0, 200).off(-32, -87, 172, { k: "e" }).r(96, 0, 160).off(-32, -87, 150, { k: "e" }).r(110, 0, 110).r(96, 0, 180).off(-32, -87, 160, { k: "e" }).r(0, -64, 48, stack).r(150, 96, 180).cp().sec("The glazier\u2019s").place("glazier").r(48, 16, 60, pane).r(36, 0, 60, pane).r(36, -16, 44, T("mullion", H(40))).r(36, 16, 60, pane).r(36, 0, 60, pane).r(36, -16, 44, T("mullion", H(40))).r(36, 16, 60, pane).r(48, -16, 160).sec("The tenement").place("tenement").r(40, -8, 88, escape).r(-40, -60, 88, escape).r(-136, -60, 88, escape).r(-40, -60, 88, escape).r(20, -40, 220, T("tall")).hz((i) => spike(i, 0.5, 22)).cp().r(130, 48, 120).sec("Almshouse Row").place("almshouse").r(0, -64, 48, stack).r(160, 96, 140).r(120, -32, 96).r(0, -64, 48, stack).r(165, 96, 120).cp().r(110, -32, 100).r(0, -64, 48, stack).r(150, 96, 130).r(130, 32, 150).hz((i) => steam(i, 0.55, 88, 1.2, 2.8)).r(140, 0, 96).r(100, 32, 180).cp().sec("The line posts").place("posts").r(70, -24, 28, post()).r(84, -16, 28, post(72)).r(84, 16, 28, post(56)).r(90, -24, 28, post(80)).r(86, 24, 28, post(56)).r(84, -16, 28, post(72)).r(88, 16, 28, post(56)).r(84, -24, 28, post(80)).r(80, 48, 140).cp().sec("The slaters\u2019 scaffold").place("scaffold").r(20, -56, 72, board).r(-28, -60, 72, board).r(-116, -60, 72, T("cracked", C(0.6))).r(8, -70, 64, T("hoist", L(70, 1.3))).r(8, -74, 240, T("tall")).hz((i) => spike(i, 0.55, 22)).cp().r(24, 56, 88, escape).r(16, 56, 88, escape).l(16, 56, 88, escape).r(16, 56, 88, escape).l(16, 56, 88, escape).r(120, 24, 140).sec("The footbridge").place("footbridge").r(40, -16, 110, T("plank", { k: "e" })).r(28, 0, 56, T("plank", C(0.5))).r(28, 0, 110, T("plank", { k: "e" })).r(28, 0, 56, T("plank", C(0.5))).r(28, 0, 90, T("plank", { k: "e" })).r(48, 16, 150).cp().sec("The bell founder\u2019s").place("foundry").r(96, 16, 360, T("flues")).hz((i) => steam(i, 0.24, 88, 0, 3.4)).hz((i) => steam(i, 0.5, 88, 1.7, 3.4)).hz((i) => steam(i, 0.76, 88, 0.4, 3.4)).r(110, 32, 120, T("store")).r(8, -110, 64, T("hoist", L(110, 1.6))).r(8, -114, 180, loft).cp().r(130, -16, 96).sec("The chapel").place("chapel").r(110, -32, 340).hz((i) => spike(i, 0.3, 22)).hz((i) => spike(i, 0.62, 22)).enemy("crawler", 0.82, 36, 3.8).r(0, -64, 56, T("bellcote", H(64))).off(-8, -72, 72, { k: "e" }, true).r(140, 112, 140, T("vestry")).cp().sec("The sign gantry").place("gantry").r(40, 24, 72, T("gantry", G)).r(48, 16, 72, T("gantry", G)).r(48, -16, 72, T("gantry", G)).r(56, 16, 72, T("gantry", G)).r(52, -16, 72, T("gantry", G)).r(48, -16, 72, T("gantry", G)).r(56, 32, 72, T("gantry", G)).r(60, 24, 160).sec("The sexton\u2019s yard").place("yard").r(24, 56, 88, escape).r(16, 56, 88, escape).l(16, 56, 88, escape).r(16, 24, 120, T("shed")).r(64, -24, 40, wall()).r(76, -16, 40, wall(64)).r(76, 16, 40, wall()).r(72, 24, 110, T("shed")).r(70, -24, 40, wall()).r(78, -24, 40, wall(64)).r(70, 0, 160).r(0, -64, 48, stack).sec("The tower forecourt").place("forecourt").r(160, 96, 168).cp().hz((i) => spike(i, 0.7, 22)).r(82, 64, 96, T("lean")).r(64, -48, 56, T("pier", H(64))).r(0, 64, 300, T("court")).done({ setting: "roofs", goal: "shelter" });

// src/games/last-light/route-data.ts
var QUARTER = { 0: ROUTE_01 };
var CAMPAIGN_ROUTES = [...OPENING_ROUTES, ...MIDDLE_ROUTES, ...FINAL_ROUTES].map((original, id) => {
  const route = QUARTER[id] ?? FEATURE_ROUTES[id] ?? original, extra = ENCOUNTER_ADDITIONS[id];
  return extra ? { ...route, enemies: extra.enemies ?? route.enemies, hazards: [...route.hazards, ...extra.presses ?? []] } : route;
});

// src/games/last-light/challenge-data.ts
function applyChallenge(index, platforms, _mainCount) {
  const challenge = CAMPAIGN_ROUTES[index];
  const retained = /* @__PURE__ */ new Map();
  for (const h of challenge.hazards) if (platforms[h.ledge].w < 200) {
    const before = retained.get(h.ledge), direction = Math.sign(platforms[h.ledge].x - (platforms[h.ledge - 1]?.x ?? 0)) || 1;
    if (!before || direction * (h.at - before.at) > 0) retained.set(h.ledge, h);
  }
  const placements = challenge.hazards.filter((h) => platforms[h.ledge].w >= 200 || retained.get(h.ledge) === h);
  const hazards = placements.map(({ ledge, at, kind, height, width, travel, period, offset, disabledBy, duty }) => {
    const p = platforms[ledge];
    return { kind, platform: p.id, x: p.x + p.w * at - width / 2, y: p.y - height - (kind === "saw" ? 12 : 0), w: width, h: kind === "crusher" ? 18 : height, travel, period, offset, disabledBy, duty };
  });
  return { hazards, pressure: challenge.pressure, wind: challenge.wind };
}

// src/games/last-light/levels.ts
var WORLDS = [
  { name: "The Old Quarter", sky: "#202d40", far: "#2b3b52", near: "#3a4b5b", stone: "#637078", edge: "#a5b3b0", accent: "#f3c77a", glow: "#ffb76b", flora: "#779b8b" },
  { name: "Mossworks", sky: "#142f32", far: "#20423e", near: "#315d4d", stone: "#526e60", edge: "#a8bf8b", accent: "#c8df87", glow: "#d9e990", flora: "#8fbd74" },
  { name: "The Clockworks", sky: "#312833", far: "#49343e", near: "#63464b", stone: "#866d61", edge: "#d0ad7e", accent: "#f0b36f", glow: "#ffac62", flora: "#ad7e63" },
  { name: "Frostline", sky: "#202e49", far: "#2b4261", near: "#3b5976", stone: "#718fa4", edge: "#c1e3e9", accent: "#c0ebf0", glow: "#aee6ed", flora: "#9bc1c5" },
  { name: "The Afterglow", sky: "#2b294a", far: "#42395c", near: "#625071", stone: "#80748d", edge: "#c7b5d1", accent: "#ffda9e", glow: "#ffcf9a", flora: "#aaa6c6" }
];
var SURFACES = { s: "stone", e: "stone", c: "crumble", m: "moving", l: "moving", b: "spring", i: "ice", ">": "belt", "<": "belt", g: "grate" };
function parse(text, offset = 0, branch = false) {
  return text.split(";").filter(Boolean).map((row, i) => {
    const [x, y, w, code = "s", travel, speed, crumbleDelay, height] = row.split(",");
    return { id: offset + i, x: +x, y: +y, w: +w, h: height ? +height : code === "g" ? 12 : code === "e" ? 8 : 28, kind: SURFACES[code], axis: code === "l" ? "y" : "x", travel: travel ? +travel : code === "l" ? 24 : 28, speed: speed ? +speed : 0.9, direction: code === "<" ? -1 : 1, branch, crumbleDelay: crumbleDelay ? +crumbleDelay : void 0 };
  });
}
var LEVEL_COUNT = 40;
function createLevel(index) {
  if (!Number.isInteger(index) || index < 0 || index >= LEVEL_COUNT) throw new RangeError("Unknown Last Light stage");
  const authored = CAMPAIGN_ROUTES[index], { setting, goal } = authored, world = Math.floor(index / 8), chapter2 = CHAPTERS[index];
  const main = parse(authored.route), branches = parse(authored.branches, main.length, true), platforms = [...main, ...branches], end = main.at(-1);
  if (authored.tags) {
    for (const p of platforms) if (authored.tags[p.id]) p.tag = authored.tags[p.id];
  }
  if (goal === "ferry" && setting === "canal") {
    for (let i = main.length - 3; i < main.length; i++) main[i].y = main[i - 1].y + 56;
  }
  const { hazards, pressure, wind } = applyChallenge(index, platforms, main.length);
  const checkpoints = authored.checkpoints.map((id) => {
    const p = main[id];
    return { x: p.x + 28, y: p.y, platform: id };
  });
  const checkpoint = checkpoints[Math.floor(checkpoints.length / 2)] ?? { x: main[0].x + 28, y: main[0].y, platform: 0 };
  const kind = authored.stationKind ?? (goal === "rescue" ? "survivor" : goal === "engine" ? "valve" : goal === "ferry" ? "bell" : "lamp");
  const stations = authored.stations.map(([platform, label], id) => {
    const p = main[platform];
    return { id, platform, x: p.x + p.w * 0.5, y: p.y, kind, label: goal === "rescue" ? rescueNameFor(index) : label };
  });
  const enemies = (authored.enemies ?? []).map((e, id) => {
    const p = main[e.ledge];
    return { id, platform: p.id, kind: e.kind, x: p.x + p.w * e.at, y: p.y - (e.kind === "moth" ? 48 : 0), travel: e.travel, period: e.period ?? 3.4, offset: e.offset ?? 0 };
  });
  const pickups = authored.memories.map((id, number) => {
    const p = branches[id];
    return { id: number, x: p.x + p.w * 0.5, y: p.y - 30, kind: "spark" };
  });
  if (index >= 3) {
    const p = main[Math.min(4, main.length - 2)];
    pickups.push({ id: 3, x: p.x + p.w * 0.72, y: p.y - 44, kind: "dash" });
  }
  return {
    id: index,
    name: chapter2.name,
    world,
    setting,
    goal,
    platforms,
    hazards,
    enemies,
    pickups,
    stations,
    mainCount: main.length,
    checkpoint,
    checkpoints,
    sectors: authored.sectors.map(([platform, name]) => ({ platform, name })),
    ...goal === "ferry" ? { berth: { x: end.x + end.w + 66, y: end.y } } : {},
    exit: { x: goal === "ferry" ? end.x + end.w - 44 : end.x + end.w * (authored.exit ?? 0.55), y: end.y - 56, w: 38, h: 56 },
    spawn: { x: 72, y: main[0].y - 24 },
    width: Math.max(...platforms.map((p) => p.x + p.w)) + (goal === "ferry" ? 320 : 110),
    height: Math.max(600, ...platforms.map((p) => p.y + 160)),
    hint: chapter2.task,
    wind: wind ?? 0,
    water: authored.water ?? (setting === "canal" ? goal === "ferry" ? end.y + 8 : Math.max(...platforms.map((p) => p.y)) + 76 : null),
    ...pressure === void 0 ? {} : { pressure },
    ...authored.places ? { places: authored.places } : {}
  };
}
var LEVELS = Array.from({ length: LEVEL_COUNT }, (_, i) => createLevel(i));
export {
  LEVELS,
  LEVEL_COUNT,
  WORLDS,
  createLevel
};
