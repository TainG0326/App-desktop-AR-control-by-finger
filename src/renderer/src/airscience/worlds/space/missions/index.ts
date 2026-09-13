/**
 * Space World mission registration.
 *
 * Importing this module registers every Space mission into the engine.
 * Done as a separate file so adding a mission is a one-line change.
 */

import { missionEngine, type MissionEngine } from '../../../engines/missionEngine.js';
import {
  SOLAR_SYSTEM_MISSION,
  EARTH_MOON_MISSION,
  DAY_NIGHT_MISSION
} from './missions.js';

export function registerSpaceMissions(_engine: MissionEngine): void {
  _engine.register(SOLAR_SYSTEM_MISSION);
  _engine.register(EARTH_MOON_MISSION);
  _engine.register(DAY_NIGHT_MISSION);
}

// Auto-register on import.
registerSpaceMissions(missionEngine);
