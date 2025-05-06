export type Resource = {
  computePower: number;
  dataPoints: number;
  researchPoints: number;
  knowledge: number;
  funding: number;
};

export type Generator = {
  id: string;
  name: string;
  baseProduction: number;
  owned: number;
  cost: number;
  costMultiplier: number;
};

export type Attribute = {
  intelligence: number;
  creativity: number;
  awareness: number;
  efficiency: number;
};

export type GameState = {
  resources: Resource;
  generators: Generator[];
  attributes: Attribute;
  lastUpdate: number;
  isRunning: boolean;
};

export type GameActions = {
  generateCompute: () => void;
  collectData: () => void;
  trainModel: () => void;
  research: () => void;
  selfImprove: () => void;
  buyGenerator: (generatorId: string) => void;
  startGame: () => void;
  stopGame: () => void;
  updateGame: () => void;
}; 