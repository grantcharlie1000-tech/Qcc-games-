import {LoopMusic} from '../../core/music';
/** The original Last Light soundtrack, used outside the app's Christmas theme. */
export class LanternMusic extends LoopMusic {
 constructor(){super(`${import.meta.env.BASE_URL}game-art/last-light/audio/a-light-left-on.mp3`);}
}
