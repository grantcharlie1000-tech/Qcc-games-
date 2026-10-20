// STUB sounds (owned by the audio agent: procedural Web Audio for blocks, steps, mobs, UI and
// events, positional falloff, respecting the shell's sound setting). This version maps a few
// events to the shell's shared sounds.
import type {Game,SoundService} from '../engine/contracts';

export function createSounds(game:Game):SoundService{
  return{
    play(name){if(name.startsWith('break:')||name.startsWith('place:'))game.context.sound('tap');else if(name==='levelup')game.context.sound('success');else if(name==='death')game.context.sound('lose');},
    stepSound(){}
  };
}
