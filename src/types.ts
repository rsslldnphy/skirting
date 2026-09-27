export interface Wall {
  id: string;
  name: string;
  /** Length of the run of skirting in mm. */
  length: number;
}

export interface Room {
  id: string;
  name: string;
  walls: Wall[];
}

export interface StockOption {
  length: number;
  selected: boolean;
  custom?: boolean;
}

export type Goal = 'length' | 'boards';

export interface Settings {
  marginPct: number;
  marginMin: number;
  marginMax: number;
  /** Width of material lost to each saw cut, in mm. */
  kerf: number;
  stock: StockOption[];
  goal: Goal;
}

export interface AppState {
  rooms: Room[];
  settings: Settings;
}

/** One piece to cut from a board: a whole wall, or one part of a joined wall. */
export interface Piece {
  id: string;
  roomId: string;
  roomName: string;
  wallId: string;
  wallName: string;
  /** 1-based part number when a wall is made from several joined pieces. */
  part: number;
  parts: number;
  /** Length this piece covers on the wall. */
  length: number;
  margin: number;
  /** Length to cut from the board: length + margin. */
  cut: number;
}

export interface Board {
  stock: number;
  pieces: Piece[];
  /** Material consumed including saw kerfs. */
  used: number;
  offcut: number;
}

export interface PlanResult {
  boards: Board[];
  pieces: Piece[];
  order: { length: number; count: number }[];
  totalStock: number;
  totalWall: number;
  totalMargin: number;
  joins: number;
  optimal: boolean;
  errors: string[];
}
