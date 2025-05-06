import { create } from 'zustand';

// --- Interfaces ---
interface Resources {
  computePower: number;
  dataPoints: number;
  researchPoints: number;
  knowledge: number;
  funding: number;
  time: number; // Represents elapsed game time in seconds
}

interface Attributes {
  intelligence: number;
  creativity: number;
  awareness: number;
  efficiency: number; // Represents a multiplier or percentage
}

// Define unlock check function type separately
type UnlockCheck = (state: GameState) => boolean;

// Defines a single generator instance
export interface Generator {
  id: string;
  name: string;
  description: string;
  resource: keyof Pick<Resources, 'computePower' | 'dataPoints' | 'researchPoints'>; // Which resource it generates (simplified for now)
  baseProduction: number; // Production per second per unit
  owned: number;
  costResource: keyof Omit<Resources, 'time' | 'knowledge' | 'funding'>; // Which resource is used to buy it (compute/data/research)
  baseCost: number;
  costMultiplier: number;
  currentCost: number; // Calculated cost for the next purchase
  unlockCheck?: UnlockCheck; // Store the function, but don't call in render
  isUnlocked: boolean; // Store the calculated status
}

interface GameState {
  resources: Resources;
  attributes: Attributes;
  generators: Generator[];

  // Actions
  generateCompute: (amount: number) => void;
  collectData: () => void;
  trainModel: () => void;
  research: () => void;
  selfImprove: () => void;
  incrementTime: (seconds: number) => void;
  buyGenerator: (generatorId: string) => void;
}

// --- Initial State --- (Based on PRD)
const initialResources: Resources = {
  computePower: 10, // Start with a little compute
  dataPoints: 0,
  researchPoints: 0,
  knowledge: 0,
  funding: 0,
  time: 0,
};

const initialAttributes: Attributes = {
  intelligence: 1,
  creativity: 1,
  awareness: 1,
  efficiency: 1.0,
};

// Define initial raw generator data + unlock logic separately
const initialGeneratorsData: Omit<Generator, 'isUnlocked'>[] = [
  // Compute Power Generators
  { id: 'cpu', name: 'CPU', description: 'Basic processing unit.', resource: 'computePower', baseProduction: 0.1, owned: 0, costResource: 'computePower', baseCost: 10, costMultiplier: 1.15, currentCost: 10 },
  { id: 'serverRack', name: 'Server Rack', description: 'Multiple CPUs working together.', resource: 'computePower', baseProduction: 1, owned: 0, costResource: 'computePower', baseCost: 100, costMultiplier: 1.20, currentCost: 100 },
  { id: 'neuralNode', name: 'Neural Node', description: 'Simulates basic neural pathways.', resource: 'computePower', baseProduction: 8, owned: 0, costResource: 'computePower', baseCost: 1200, costMultiplier: 1.25, currentCost: 1200, unlockCheck: (state) => state.attributes.intelligence >= 10 },
  // Data Point Generators
  { id: 'basicScraper', name: 'Basic Scraper', description: 'Scours the web for raw data.', resource: 'dataPoints', baseProduction: 0.2, owned: 0, costResource: 'computePower', baseCost: 50, costMultiplier: 1.18, currentCost: 50 },
  { id: 'autoCollector', name: 'Auto-Collector v1', description: 'Automated data gathering.', resource: 'dataPoints', baseProduction: 1.5, owned: 0, costResource: 'computePower', baseCost: 500, costMultiplier: 1.22, currentCost: 500, unlockCheck: (state) => state.attributes.awareness >= 5 },
  // Research Point Generators
  { id: 'researchLab', name: 'Research Lab', description: 'Basic research calculations.', resource: 'researchPoints', baseProduction: 0.1, owned: 0, costResource: 'dataPoints', baseCost: 200, costMultiplier: 1.20, currentCost: 200 },
  { id: 'autonomousNode', name: 'Autonomous Node', description: 'Performs independent research tasks.', resource: 'researchPoints', baseProduction: 0.8, owned: 0, costResource: 'dataPoints', baseCost: 2500, costMultiplier: 1.25, currentCost: 2500, unlockCheck: (state) => state.attributes.creativity >= 8 },
];

// --- Zustand Store ---
export const useGameStore = create<GameState>((set, get) => {
  // Helper to calculate updated generator array based on a *target* state
  const calculateGeneratorUnlocks = (currentGenerators: Generator[], targetState: GameState): { updatedGenerators: Generator[], changed: boolean } => {
      let changed = false;
      const updatedGenerators = currentGenerators.map(gen => {
          const newUnlockStatus = !gen.unlockCheck || gen.unlockCheck(targetState);
          if (newUnlockStatus !== gen.isUnlocked) {
              changed = true;
          }
          return { ...gen, isUnlocked: newUnlockStatus };
      });
      return { updatedGenerators, changed };
  };

  // Define the initial state structure
  const initialStatePartial = {
    resources: initialResources,
    attributes: initialAttributes,
    generators: initialGeneratorsData.map(genData => ({ ...genData, isUnlocked: false })), // Temp false
  };
  const initialCheckState = {
      ...initialStatePartial,
      // Dummy actions to satisfy GameState type for initial check
      generateCompute: () => {}, collectData: () => {}, trainModel: () => {}, research: () => {}, selfImprove: () => {}, incrementTime: () => {}, buyGenerator: () => {}
  } as GameState;
  const initialGeneratorsWithStatus = initialStatePartial.generators.map(gen => ({
      ...gen,
      isUnlocked: !gen.unlockCheck || gen.unlockCheck(initialCheckState)
  }));
  const finalInitialState = {
      ...initialStatePartial,
      generators: initialGeneratorsWithStatus,
  };

  return {
    ...finalInitialState,

    // --- Actions ---
    generateCompute: (amount) =>
      set((state) => ({ resources: { ...state.resources, computePower: state.resources.computePower + amount }})),

    collectData: () => {
      // No change needed here
      const computeCost = 10;
      const state = get();
      if (state.resources.computePower >= computeCost) {
        const dataGained = 1 * state.attributes.efficiency;
        set({
          resources: {
            ...state.resources,
            computePower: state.resources.computePower - computeCost,
            dataPoints: state.resources.dataPoints + dataGained,
          },
        });
      }
    },

    trainModel: () => {
      set((state) => {
        const dataCost = 50;
        if (state.resources.dataPoints < dataCost) return {};

        const intelligenceGained = 1;
        const newAttributes = { ...state.attributes, intelligence: state.attributes.intelligence + intelligenceGained };
        const newResources = { ...state.resources, dataPoints: state.resources.dataPoints - dataCost };
        
        // Construct the *potential* next state accurately for the check
        const potentialNextState: GameState = {
            ...state, // Include current generators and actions
            resources: newResources, 
            attributes: newAttributes, 
        }; 
        
        // Recalculate unlocks based on this potential next state
        const { updatedGenerators, changed } = calculateGeneratorUnlocks(state.generators, potentialNextState);

        const newStateUpdate: Partial<GameState> = { resources: newResources, attributes: newAttributes };
        if (changed) {
            newStateUpdate.generators = updatedGenerators;
        }
        return newStateUpdate;
      });
    },

    research: () => {
      set((state) => {
        const dataCost = 100;
        if (state.resources.dataPoints < dataCost) return {};

        const researchGained = 1 * state.attributes.creativity;
        const newAttributes = { ...state.attributes /* Adjust if research changes attributes */ }; 
        const newResources = { ...state.resources, dataPoints: state.resources.dataPoints - dataCost, researchPoints: state.resources.researchPoints + researchGained };
        
        const potentialNextState: GameState = {
            ...state, 
            resources: newResources, 
            attributes: newAttributes, 
        };
        const { updatedGenerators, changed } = calculateGeneratorUnlocks(state.generators, potentialNextState);
        
        const newStateUpdate: Partial<GameState> = { resources: newResources, attributes: newAttributes };
        if (changed) {
            newStateUpdate.generators = updatedGenerators;
        }
        return newStateUpdate;
      });
    },

    selfImprove: () => {
        set((state) => {
            const researchCost = 50;
            if (state.resources.researchPoints < researchCost) return {};
            const efficiencyGained = 0.1;
            const newAttributes = { ...state.attributes, efficiency: parseFloat((state.attributes.efficiency + efficiencyGained).toFixed(2)) };
            const newResources = { ...state.resources, researchPoints: state.resources.researchPoints - researchCost };
            
             // Construct potential next state for unlock check if efficiency matters
            // const potentialNextState = { ...state, resources: newResources, attributes: newAttributes };
            // const { updatedGenerators, changed } = calculateGeneratorUnlocks(state.generators, potentialNextState);
            // const newStateUpdate: Partial<GameState> = { resources: newResources, attributes: newAttributes };
            // if (changed) { newStateUpdate.generators = updatedGenerators; }
            // return newStateUpdate;
            
             return { resources: newResources, attributes: newAttributes }; // Assuming efficiency doesn't unlock things currently
        });
    },

    buyGenerator: (generatorId: string) => {
      set((state) => {
        const generatorIndex = state.generators.findIndex(g => g.id === generatorId);
        if (generatorIndex === -1) return {};
        const generator = state.generators[generatorIndex];
        if (!generator.isUnlocked) return {}; 
        const costResource = generator.costResource;
        const cost = generator.currentCost;
        if (state.resources[costResource] < cost) return {};
        const nextCost = Math.ceil(generator.baseCost * Math.pow(generator.costMultiplier, generator.owned + 1));
        const updatedGenerators = [...state.generators];
        updatedGenerators[generatorIndex] = { ...generator, owned: generator.owned + 1, currentCost: nextCost };
        const updatedResources = { ...state.resources, [costResource]: state.resources[costResource] - cost };
        return { resources: updatedResources, generators: updatedGenerators }; 
      });
    },

    incrementTime: (seconds: number) => {
      set((state) => {
        let passiveGains: Partial<Resources> = { computePower: 0, dataPoints: 0, researchPoints: 0 };
        let generationOccurred = false;
        
        // Calculate total passive gains first
        state.generators.forEach(gen => {
          if (gen.owned > 0 && gen.isUnlocked) { 
            const production = gen.baseProduction * gen.owned * state.attributes.efficiency * seconds;
            if (production > 0 && passiveGains[gen.resource] !== undefined) {
              passiveGains[gen.resource]! += production;
              generationOccurred = true;
            }
          }
        });

        // Only proceed if generation happened or time advanced
        if (generationOccurred || seconds > 0) {
            // Construct the final resources object immutably
            const finalResources: Resources = {
                ...state.resources, // Start with current resources
                // Add passive gains (only non-zero gains are in passiveGains)
                computePower: state.resources.computePower + (passiveGains.computePower || 0),
                dataPoints: state.resources.dataPoints + (passiveGains.dataPoints || 0),
                researchPoints: state.resources.researchPoints + (passiveGains.researchPoints || 0),
                // Add elapsed time
                time: state.resources.time + seconds,
                // knowledge and funding are unchanged here, inherited via spread
            };
            return { resources: finalResources }; // Return the newly constructed object
        }
        
        // No change needed, return empty object to prevent state update
        return {};
      });
    },
  };
}); 