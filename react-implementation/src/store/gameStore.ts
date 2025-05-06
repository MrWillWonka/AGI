import { create } from 'zustand';

// --- Interfaces ---
export interface Resources {
  computePower: number;
  dataPoints: number;
  researchPoints: number;
  knowledge: number;
  funding: number;
  time: number; // Represents elapsed game time in seconds
}

export interface Attributes {
  intelligence: number;
  creativity: number;
  awareness: number;
  efficiency: number; // Represents a multiplier or percentage
}

// Define unlock check function type separately
// Returns true if unlocked, or a string describing the condition if locked
export type UnlockCheckResult = true | string;
export type UnlockCheckFn = (state: GameState) => UnlockCheckResult;

// Defines a single generator instance
export interface Generator {
  id: string;
  name: string;
  description: string;
  cost: number;
  production: number;
  owned: number;
  isUnlocked: boolean;
  resource: 'computePower' | 'dataPoints' | 'researchPoints';
  unlockCheck?: UnlockCheckFn;
}

// Forward declaration or ensure GameState is fully defined before use
export interface GameState {
  resources: Resources;
  attributes: Attributes;
  generators: Generator[];
  getUnlockCondition: (generatorId: string) => UnlockCheckResult;
  purchaseGenerator: (id: string) => void;

  // Actions
  generateCompute: (amount: number) => void;
  collectData: () => void;
  trainModel: () => void;
  research: () => void;
  selfImprove: () => void;
  incrementTime: (seconds: number) => void;
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
  { 
    id: 'cpu', name: 'CPU', description: 'Basic processing unit.', 
    cost: 10, production: 0.1, owned: 0, resource: 'computePower' 
    // No unlockCheck needed for the first generator
  },
  { 
    id: 'serverRack', name: 'Server Rack', description: 'Multiple CPUs working together.', 
    cost: 100, production: 1, owned: 0, resource: 'computePower',
    unlockCheck: (state: GameState) => (state.generators.find(g => g.id === 'cpu')?.owned ?? 0) >= 5 ? true : "Requires 5 CPUs"
  },
  { 
    id: 'neuralNode', name: 'Neural Node', description: 'Simulates basic neural pathways.', 
    cost: 1200, production: 8, owned: 0, resource: 'computePower',
    unlockCheck: (state: GameState) => (state.generators.find(g => g.id === 'serverRack')?.owned ?? 0) >= 10 && state.attributes.intelligence >= 20 ? true : "Requires 10 Server Racks & 20 Intelligence"
  },
  // Data Point Generators
  { 
    id: 'basicScraper', name: 'Basic Scraper', description: 'Scours the web for raw data.', 
    cost: 50, production: 0.2, owned: 0, resource: 'dataPoints',
    unlockCheck: (state: GameState) => state.resources.computePower >= 50 ? true : "Requires 50 Compute Power"
  },
  { 
    id: 'autoCollector', name: 'Auto-Collector v1', description: 'Automated data gathering.', 
    cost: 500, production: 1.5, owned: 0, resource: 'dataPoints',
    unlockCheck: (state: GameState) => (state.generators.find(g => g.id === 'basicScraper')?.owned ?? 0) >= 5 ? true : "Requires 5 Basic Scrapers"
  },
  // Research Point Generators
  { 
    id: 'researchLab', name: 'Research Lab', description: 'Basic research calculations.', 
    cost: 200, production: 0.1, owned: 0, resource: 'researchPoints',
    unlockCheck: (state: GameState) => state.attributes.intelligence >= 10 ? true : "Requires 10 Intelligence"
  },
  { 
    id: 'autonomousNode', name: 'Autonomous Node', description: 'Performs independent research tasks.', 
    cost: 2500, production: 0.8, owned: 0, resource: 'researchPoints',
    unlockCheck: (state: GameState) => (state.generators.find(g => g.id === 'researchLab')?.owned ?? 0) >= 3 && state.attributes.creativity >= 15 ? true : "Requires 3 Research Labs & 15 Creativity"
  }
];

// --- Zustand Store ---
export const useGameStore = create<GameState>((set, get) => {
  // Helper to calculate updated generator array based on a *target* state
  // Now returns the updated generators and whether any changed
  const checkGeneratorUnlocks = (currentGenerators: Generator[], targetState: GameState): { updatedGenerators: Generator[], changed: boolean } => {
      let changed = false;
      const updatedGenerators = currentGenerators.map(gen => {
          // If already unlocked, keep it that way permanently.
          if (gen.isUnlocked) {
              return gen;
          }

          // If currently locked, check if the unlock condition is now met.
          const checkResult = gen.unlockCheck ? gen.unlockCheck(targetState) : true;
          if (checkResult === true) {
              // It just became unlocked!
              changed = true; // Signal that *an* unlock happened in this batch
              return { ...gen, isUnlocked: true }; // Update this generator
          }
          
          // Still locked, return the generator as is (isUnlocked remains false)
          return gen;
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
      generateCompute: () => {}, collectData: () => {}, trainModel: () => {}, research: () => {}, selfImprove: () => {}, incrementTime: () => {}, purchaseGenerator: () => {},
      getUnlockCondition: (_id: string): UnlockCheckResult => "Checking..." // Ensure signature matches
  } as GameState;
  const { updatedGenerators: initialGeneratorsWithStatus } = checkGeneratorUnlocks(
      initialGeneratorsData.map(genData => ({ ...genData, isUnlocked: false })), // Start all as potentially locked
      initialCheckState
  );
  const finalInitialState = {
      ...initialStatePartial,
      generators: initialGeneratorsWithStatus,
  };

  return {
    ...finalInitialState,

    // Helper to get condition text for a specific generator
    getUnlockCondition: (generatorId: string): UnlockCheckResult => {
        const state = get(); // Get current state
        const generator = state.generators.find(g => g.id === generatorId);
        if (!generator) return "Generator not found";
        if (generator.isUnlocked) return true;
        // If locked, run the check again to get the condition text
        return generator.unlockCheck ? generator.unlockCheck(state) : true;
    },

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
        
        const potentialNextState: GameState = { ...state, resources: newResources, attributes: newAttributes }; 
        const { updatedGenerators, changed } = checkGeneratorUnlocks(state.generators, potentialNextState);

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
        const { updatedGenerators, changed } = checkGeneratorUnlocks(state.generators, potentialNextState);
        
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

    purchaseGenerator: (generatorId: string) => {
        set((state) => {
            const generator = state.generators.find(g => g.id === generatorId);
            // Cost check now needs to check the specific resource type
            if (!generator || !generator.isUnlocked || state.resources[generator.resource] < generator.cost) {
                return {}; // No change if cannot afford or locked
            }

            const cost = generator.cost;
            const resource = generator.resource;
            const newOwnedCount = generator.owned + 1;

            const newResources = {
                ...state.resources,
                [resource]: state.resources[resource] - cost, // Deduct cost from the correct resource
            };
            const updatedOwnGenerator = { ...generator, owned: newOwnedCount };
            const updatedGeneratorsList = state.generators.map(g => 
                g.id === generatorId ? updatedOwnGenerator : g
            );
            
            // Check if purchasing this generator unlocks others
            const potentialNextState: GameState = { 
                ...state, 
                resources: newResources, 
                generators: updatedGeneratorsList // Use the list *with* the new purchase
            }; 
            const { updatedGenerators: generatorsAfterUnlockCheck, changed } = checkGeneratorUnlocks(updatedGeneratorsList, potentialNextState);

            // Always update resources and the purchased generator's ownership
            const finalGenerators = changed ? generatorsAfterUnlockCheck : updatedGeneratorsList;

            return { 
                resources: newResources, 
                generators: finalGenerators
            };
        });
    },

    incrementTime: (seconds: number) => {
      set((state) => {
        let passiveGains: Partial<Resources> = { computePower: 0, dataPoints: 0, researchPoints: 0 };
        let generationOccurred = false;
        
        // Calculate total passive gains first
        state.generators.forEach(gen => {
          if (gen.owned > 0 && gen.isUnlocked) { 
            const production = gen.production * gen.owned * state.attributes.efficiency * seconds;
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
            
            // Construct potential state and check unlocks
            const potentialNextState: GameState = { ...state, resources: finalResources }; 
            const { updatedGenerators, changed } = checkGeneratorUnlocks(state.generators, potentialNextState);

            const newStateUpdate: Partial<GameState> = { resources: finalResources };
            if (changed) {
                newStateUpdate.generators = updatedGenerators;
            }
            return newStateUpdate;
        }
        
        // No change needed, return empty object to prevent state update
        return {};
      });
    },
  };
}); 