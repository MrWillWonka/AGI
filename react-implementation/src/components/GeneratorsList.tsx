import React, { useMemo } from 'react';
import styled from 'styled-components';
import { useGameStore } from '../store/gameStore';
import GeneratorComponent from './Generator';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Title = styled.h3`
  color: var(--secondary-color);
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--panel-border);
`;

const GeneratorsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  width: 100%;
  align-items: stretch;
`;

const LockedTitle = styled(Title)`
  margin-top: 1.5rem;
  font-size: 1rem;
  color: var(--text-muted);
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
      {/* Render unlocked generators in grid */}
      <GeneratorsGrid>
        {unlockedGenerators.map((generator) => (
          <GeneratorComponent key={generator.id} generator={generator} />
        ))}
      </GeneratorsGrid>

      {/* Show locked generators section if there are any */}
      {lockedGenerators.length > 0 && (
        <>
          <LockedTitle>Locked Generators</LockedTitle>
          <GeneratorsGrid>
            {lockedGenerators.map((generator) => (
              <GeneratorComponent key={generator.id} generator={generator} />
            ))}
          </GeneratorsGrid>
        </>
      )}
    </Container>
  );
};

export default GeneratorsList; 