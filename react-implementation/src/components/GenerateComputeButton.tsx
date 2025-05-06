import React from 'react';
import styled from 'styled-components';
import { useGameStore } from '../store/gameStore';

const StyledButton = styled.button`
  background: linear-gradient(135deg, var(--success-color) 0%, #2d8c00 100%);
  color: white;
  border: none;
  padding: 1rem 1.5rem;
  margin: 10px 0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: all 0.3s ease;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(56, 176, 0, 0.3);
  }

  &:active {
    transform: translateY(0);
  }

  /* Add an icon placeholder */
  &::before {
    content: '⚡'; /* Example icon */
    font-size: 1.2rem;
  }
`;

const Tooltip = styled.div`
  text-align: center;
  color: #bbb;
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
`;

const GenerateComputeButton: React.FC = () => {
  const generateComputeAction = useGameStore((state) => state.generateCompute);

  const handleClick = () => {
    // Generate 1 compute power per click (adjust amount as needed)
    generateComputeAction(1);
  };

  return (
    <>
      <Tooltip>Click to actively generate Compute Power</Tooltip>
      <StyledButton onClick={handleClick}>
        Generate Compute
      </StyledButton>
    </>
  );
};

export default GenerateComputeButton; 