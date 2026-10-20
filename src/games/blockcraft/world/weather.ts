// STUB weather (owned by the weather agent: clear/rain/thunder cycles, rain and snow by biome,
// darker sky and light, lightning flashes and strikes, snow layers and ice, persistence). Always clear here.
import type {Game,WeatherService,WeatherState} from '../engine/contracts';

export function createWeather(_game:Game):WeatherService{
  let state:WeatherState='clear';
  return{
    get state(){return state;},intensity:0,thunder:0,flash:0,
    precipitationAt:()=>null,isRainingOn:()=>false,
    set(s){state=s;},
    reset(){state='clear';}
  };
}
