import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useGameStore } from './store/gameStore';
import ResourceDisplay from './components/ResourceDisplay';
import AttributesDisplay from './components/AttributesDisplay';
import ActionButtons from './components/ActionButtons';
import GenerateComputeButton from './components/GenerateComputeButton';
import GeneratorsList from './components/GeneratorsList';
import GameLog from './components/GameLog';
import PhaseDisplay from './components/PhaseDisplay';
import TrainingMaterials from './components/TrainingMaterials';
import ModelCapabilities from './components/ModelCapabilities';
import AchievementsPanel from './components/AchievementsPanel';

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
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1rem;
  display: grid;
  grid-template-columns: 300px 1fr 300px;
  gap: 1.5rem;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.div`
  background-color: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
  transition: transform 0.3s ease, box-shadow 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
  }
`;

const PanelTitle = styled.h2`
  font-size: 1.5rem;
  color: var(--primary-color);
  margin: 0 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--panel-border);
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const SidePanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const App: React.FC = () => {
  const incrementTime = useGameStore((state) => state.incrementTime);
  
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    const interval = setInterval(() => {
      incrementTime(1);
    }, 1000);
    
    intervalRef.current = interval as unknown as number;
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [incrementTime]);

  return (
    <AppContainer>
      <Header>
        <Title>The Path to AGI</Title>
        <Subtitle>Your journey from narrow AI to artificial general intelligence... and beyond!</Subtitle>
      </Header>
      <Container>
        {/* Left Panel - Resources & Core Stats */}
        <SidePanel>
          <Panel>
            <PanelTitle>Resources</PanelTitle>
            <ResourceDisplay />
          </Panel>
          <Panel>
            <PanelTitle>Attributes</PanelTitle>
            <AttributesDisplay />
          </Panel>
          <Panel>
            <PanelTitle>Current Phase</PanelTitle>
            <PhaseDisplay />
          </Panel>
        </SidePanel>

        {/* Main Content - Actions & Game Progress */}
        <MainContent>
          <Panel>
            <PanelTitle>Main Actions</PanelTitle>
            <GenerateComputeButton />
            <ActionButtons />
          </Panel>
          <Panel>
            <PanelTitle>Generators & Upgrades</PanelTitle>
            <GeneratorsList />
          </Panel>
          <Panel>
            <PanelTitle>Training & Research</PanelTitle>
            <TrainingMaterials />
          </Panel>
          <Panel>
            <PanelTitle>Game Log</PanelTitle>
            <GameLog />
          </Panel>
        </MainContent>

        {/* Right Panel - Progress & Achievements */}
        <SidePanel>
          <Panel>
            <PanelTitle>Model Capabilities</PanelTitle>
            <ModelCapabilities />
          </Panel>
          <Panel>
            <PanelTitle>Achievements</PanelTitle>
            <AchievementsPanel />
          </Panel>
        </SidePanel>
      </Container>
    </AppContainer>
  );
};

export default App;
