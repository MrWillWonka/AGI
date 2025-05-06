import React, { useEffect } from 'react';
import styled from 'styled-components';
import ResourceDisplay from './components/ResourceDisplay';
import AttributesDisplay from './components/AttributesDisplay';
import ActionButtons from './components/ActionButtons';
import GameLog from './components/GameLog';
import PhaseDisplay from './components/PhaseDisplay';
import GeneratorsList from './components/GeneratorsList';
import TrainingMaterials from './components/TrainingMaterials';
import ModelCapabilities from './components/ModelCapabilities';
import AchievementsPanel from './components/AchievementsPanel';
import TabPanel from './components/TabPanel';
import { useGameStore } from './store/gameStore';

const AppContainer = styled.div`
  min-height: 100vh;
  background-color: var(--dark-color);
  color: var(--light-color);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
`;

const Header = styled.header`
  text-align: center;
  padding: 2rem 0;
  background-color: rgba(0, 0, 0, 0.2);
  margin-bottom: 2rem;
  border-bottom: 3px solid var(--primary-color);
`;

const Title = styled.h1`
  font-size: 2.5rem;
  margin: 0;
  color: var(--primary-color);
`;

const Subtitle = styled.p`
  font-size: 1.2rem;
  color: var(--secondary-color);
  margin: 0.5rem 0 0;
`;

const Container = styled.div`
  max-width: 1920px;
  margin: 0 auto;
  padding: 0 1.5rem 1.5rem;
  display: grid;
  grid-template-columns: 300px 0.75fr 1.25fr;
  gap: 1.5rem;
  height: calc(100vh - 160px); /* Account for header height */
`;

const Panel = styled.div`
  background-color: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const PanelTitle = styled.h2`
  font-size: 1.4rem;
  color: var(--primary-color);
  margin: 0 0 1.2rem;
  padding-bottom: 0.6rem;
  border-bottom: 2px solid var(--panel-border);
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

// New Divider style
const Divider = styled.hr`
  border: none;
  border-top: 1px solid var(--panel-border);
  margin: 1rem 0; // Adjust spacing as needed
`;

// New SubHeader style for "Game Log"
const LogSubHeader = styled.h3`
  font-size: 1rem;
  font-weight: 500;
  color: var(--secondary-color); // Use a secondary color
  margin: 0 0 0.8rem 0; // Spacing below
`;

const App: React.FC = () => {
  const incrementTime = useGameStore((state) => state.incrementTime);

  useEffect(() => {
    const interval = setInterval(() => {
      incrementTime(1);
    }, 1000);
    return () => clearInterval(interval);
  }, [incrementTime]);

  const statusTabs = [
    {
      id: 'resources',
      label: 'Resources',
      content: <ResourceDisplay />
    },
    {
      id: 'attributes',
      label: 'Attributes',
      content: <AttributesDisplay />
    }
  ];

  const progressTabs = [
    {
      id: 'generators',
      label: 'Generators',
      content: <GeneratorsList />
    },
    {
      id: 'progress',
      label: 'Progress',
      content: (
        <>
          <TrainingMaterials />
          <ModelCapabilities />
        </>
      )
    },
    {
      id: 'achievements',
      label: 'Achievements',
      content: <AchievementsPanel />
    }
  ];

  return (
    <AppContainer>
      <Header>
        <Title>The Path to AGI</Title>
        <Subtitle>Your journey from narrow AI to artificial general intelligence... and beyond!</Subtitle>
      </Header>
      <Container>
        {/* Left Column */}
        <Panel>
          <TabPanel tabs={statusTabs} defaultTab="resources" />
        </Panel>

        {/* Center Column */}
        <div>
          <Panel>
            <PanelTitle>Actions</PanelTitle>
            <ActionButtons />
          </Panel>
          <Panel>
            {/* Combined Phase and Log Panel */}
            {/* PhaseDisplay now acts as the header */}
            <PhaseDisplay /> 
            {/* Add Divider */}
            <Divider /> 
            {/* Add Game Log SubHeader */}
            <LogSubHeader>Game Log</LogSubHeader> 
            {/* Render the GameLog component */}
            <GameLog />
          </Panel>
        </div>

        {/* Right Column */}
        <div>
          <Panel>
            <PanelTitle>Progress</PanelTitle>
            <TabPanel tabs={progressTabs} defaultTab="generators" />
          </Panel>
        </div>
      </Container>
    </AppContainer>
  );
};

export default App;
