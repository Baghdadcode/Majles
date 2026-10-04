import type { CouncilDef, SeatDef } from "../core/types";
import {
  EMPIRICIST,
  FIRST_PRINCIPLES,
  PLAYER_EXPERIENCE,
  PRAGMATIST,
  SKEPTIC,
  SYSTEMS_THINKER,
} from "./definitions";

export const GAME_DEV_COUNCIL: CouncilDef = {
  id: "game-dev",
  name: "Game Dev",
  isDefault: true,
  seats: [PLAYER_EXPERIENCE, EMPIRICIST, SKEPTIC, SYSTEMS_THINKER, PRAGMATIST],
};

export const GENERAL_COUNCIL: CouncilDef = {
  id: "general",
  name: "General",
  isDefault: false,
  seats: [FIRST_PRINCIPLES, EMPIRICIST, SKEPTIC, SYSTEMS_THINKER, PRAGMATIST],
};

export const COUNCILS: CouncilDef[] = [GAME_DEV_COUNCIL, GENERAL_COUNCIL];

export const MIN_SEATS = 5;
export const MAX_SEATS = 7;

export function validateCouncil(seats: SeatDef[]): void {
  if (seats.length < MIN_SEATS || seats.length > MAX_SEATS) {
    throw new Error(`A council holds ${MIN_SEATS} to ${MAX_SEATS} seats, got ${seats.length}`);
  }
  if (new Set(seats.map((s) => s.id)).size !== seats.length) throw new Error("Duplicate seats in council");
}

export function getCouncil(id: string): CouncilDef {
  const c = COUNCILS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown council "${id}". Available: ${COUNCILS.map((x) => x.id).join(", ")}`);
  return c;
}
