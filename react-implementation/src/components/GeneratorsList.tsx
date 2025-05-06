import React, { useMemo } from 'react';
import styled from 'styled-components';
import { useGameStore } from '../store/gameStore';
import GeneratorComponent from './Generator';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Title = styled.h3`
  color: var(--secondary-color);
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--panel-border);
`;

const GeneratorsList: React.FC = () => {
  const generators = useGameStore((state) => state.generators);
  
  // Memoize the filtered lists based on the isUnlocked flag
  const { unlockedGenerators, lockedGenerators } = useMemo(() => {
    // Filter directly using the boolean flag
    const unlockedGenerators = generators.filter(gen => gen.isUnlocked);
    const lockedGenerators = generators.filter(gen => !gen.isUnlocked);
    
    return { unlockedGenerators, lockedGenerators };
    // Dependency is only the generators array itself
  }, [generators]);

  return (
    <Container>
      {/* Render unlocked generators */}
      {unlockedGenerators.map((generator) => (
        <GeneratorComponent key={generator.id} generator={generator} />
      ))}

      {/* Show locked generators section if there are any */}
      {lockedGenerators.length > 0 && (
        <Title style={{marginTop: '1.5rem', fontSize: '1rem', color: 'var(--text-muted)'}}>
          Locked Generators
        </Title>
      )}
      
      {/* Render locked generators */}
      {lockedGenerators.map((generator) => (
         <GeneratorComponent key={generator.id} generator={generator} />
      ))}
    </Container>
  );
};

export default GeneratorsList; 