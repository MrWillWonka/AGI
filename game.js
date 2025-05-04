// game.js
window.AGI = (function() {
    // Private variables
    let lastUpdateTime = Date.now();
    let deltaTime = 0;
    let saveInterval = 60000; // Save every minute
    let lastSaveTime = 0;
    let debugMode = false;
    let initializationAttempts = 0;
    const MAX_INIT_ATTEMPTS = 3;
    
    // Track button hold intervals
    const buttonHoldIntervals = new Map();
    const HOLD_CLICK_DELAY = 500;

    // Game state object
    const gameState = {
        resources: {
            computePower: 0,
            dataPoints: 0,
            researchPoints: 0,
            knowledge: 0,
            funding: 100,
            time: 0
        },
        attributes: {
            intelligence: 0,
            creativity: 0,
            awareness: 0,
            efficiency: 1
        },
        upgrades: {
            cpuLevel: 0,
            serverLevel: 0,
            quantumLevel: 0,
            neuralNetworkLevel: 0,
            dataProcessorLevel: 0
        },
        features: {
            autoCollect: false,
            dataPointsPerCollection: 1,
            researchPointsPerResearch: 1,
            trainingSpeedMultiplier: 1
        },
        progress: {
            prestigePoints: 0,
            totalPrestigePoints: 0,
            achievementPoints: 0,
            phase: 'Narrow AI',
            phaseProgress: 0
        },
        settings: {
            autoSaveEnabled: true,
            backgroundProcessingEnabled: true,
            animationsEnabled: true
        },
        stats: {
            totalClicks: 0,
            totalComputeGenerated: 0,
            totalDataCollected: 0,
            totalResearchDone: 0,
            totalPrestigeCount: 0,
            gameStartTime: Date.now()
        }
    };
    
    // Constants for game balance
    const CONSTANTS = {
        CPU_UPGRADE_BASE_COST: 25,
        CPU_UPGRADE_COST_MULTIPLIER: 1.25,
        CPU_CP_PER_SECOND: 0.5,
        
        SERVER_UPGRADE_BASE_COST: 150,
        SERVER_UPGRADE_COST_MULTIPLIER: 1.5,
        SERVER_CP_PER_SECOND: 1.0,
        SERVER_CP_PER_CLICK: 1.0,
        
        QUANTUM_UPGRADE_BASE_COST: 1500,
        QUANTUM_UPGRADE_COST_MULTIPLIER: 1.5,
        QUANTUM_CP_PER_SECOND: 5.0,
        
        NEURAL_UPGRADE_BASE_COST: 5000,
        NEURAL_UPGRADE_COST_MULTIPLIER: 1.5,
        NEURAL_CP_PER_SECOND: 15.0,
        
        COLLECT_DATA_CP_COST: 100,
        TRAIN_MODEL_CP_COST: 500,
        TRAIN_MODEL_DP_COST: 50,
        TRAIN_MODEL_INTELLIGENCE_GAIN: 0.1,
        
        RESEARCH_CP_COST: 200,
        RESEARCH_DP_COST: 20,
        
        IMPROVE_CP_COST: 1000,
        IMPROVE_DP_COST: 40,
        IMPROVE_RP_COST: 10,
        IMPROVE_INTELLIGENCE_GAIN: 1.0,
        
        PRESTIGE_CP_REQUIREMENT: 10000,
        PRESTIGE_INTELLIGENCE_REQUIREMENT: 5
    };

    // Create DOM cache system
    const domCache = new Proxy({}, {
        get: function(target, prop) {
            if (!target[prop]) {
                target[prop] = document.getElementById(prop);
            }
            return document.getElementById(prop) || target[prop];
        }
    });
    
    // Initialize the DOM element cache
    function initDomCache() {
        const elementsToCache = [
            'computePower', 'computePerSecond', 'dataPoints', 'researchPoints',
            'knowledge', 'funding', 'time', 'prestigePoints', 'achievementPoints',
            'totalPrestigePoints', 'computeButton', 'collectDataButton', 'trainButton', 
            'researchButton', 'improveButton', 'cpuUpgradeButton', 'serverUpgradeButton', 
            'quantumUpgradeButton', 'neuralNetworkUpgradeButton', 'dataProcessorUpgradeButton',
            'autoCollectorUpgradeButton', 'trainingOptimizerButton', 'phaseProgressBar', 
            'phaseProgressText', 'currentPhase', 'milestonesList', 'gameLog', 'debugPanel', 
            'debugGameState', 'prestigeButton'
        ];

        elementsToCache.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                domCache[id] = element;
            }
        });

        console.log("DOM Cache initialized with elements:", Object.keys(domCache));
        return domCache;
    }

    // Initialize event listeners
    function setupEventListeners() {
        // Add event listener for visibility change
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Add event listener for beforeunload
        window.addEventListener('beforeunload', () => {
            if (gameState.settings.autoSaveEnabled) {
                saveGame();
            }
        });

        // Setup action buttons
        const actionButtons = {
            'computeButton': generateCompute,
            'collectDataButton': collectData,
            'trainButton': trainModel,
            'researchButton': research,
            'improveButton': selfImprove,
            'prestigeButton': prestige
        };

        Object.entries(actionButtons).forEach(([buttonId, action]) => {
            const button = domCache[buttonId];
            if (button) {
                // Remove old listeners if any exist
                const oldButton = button.cloneNode(true);
                button.parentNode.replaceChild(oldButton, button);
                domCache[buttonId] = oldButton;
                
                // Add new mousedown listener for both click and hold functionality
                oldButton.addEventListener('mousedown', (e) => {
                    if (e.button === 0) { // Left click only
                        e.preventDefault();
                        action();
                        startButtonHold(buttonId, action);
                    }
                });

                // Add mouseup/leave listeners to stop hold
                oldButton.addEventListener('mouseup', () => stopButtonHold(buttonId));
                oldButton.addEventListener('mouseleave', () => stopButtonHold(buttonId));
                
                // Add touch handlers
                oldButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    action();
                    startButtonHold(buttonId, action);
                });
                oldButton.addEventListener('touchend', () => stopButtonHold(buttonId));
                oldButton.addEventListener('touchcancel', () => stopButtonHold(buttonId));
            }
        });
    }

    function startButtonHold(buttonId, action) {
        if (buttonHoldIntervals.has(buttonId)) return;

        const interval = setInterval(() => {
            const button = domCache[buttonId];
            if (button && !button.disabled) {
                action();
            } else {
                stopButtonHold(buttonId);
            }
        }, HOLD_CLICK_DELAY);

        buttonHoldIntervals.set(buttonId, interval);

        const button = domCache[buttonId];
        if (button) {
            button.classList.add('button-held');
        }
    }

    function stopButtonHold(buttonId) {
        const interval = buttonHoldIntervals.get(buttonId);
        if (interval) {
            clearInterval(interval);
            buttonHoldIntervals.delete(buttonId);
            
            const button = domCache[buttonId];
            if (button) {
                button.classList.remove('button-held');
            }
        }
    }

    // Handle visibility change
    function handleVisibilityChange() {
        if (document.hidden) {
            console.log("Game is in background");
        } else {
            console.log("Game is in foreground");
            const now = Date.now();
            const timePassed = (now - lastUpdateTime) / 1000;
            
            if (gameState.settings.backgroundProcessingEnabled && timePassed > 1) {
                offlineProgress(timePassed);
            }
            
            lastUpdateTime = now;
        }
    }
    
    // Calculate offline progress
    function offlineProgress(secondsPassed) {
        if (secondsPassed <= 0) return;
        
        const maxOfflineTime = 8 * 60 * 60; // 8 hours
        const actualTime = Math.min(secondsPassed, maxOfflineTime);
        
        const cpRate = calculateCPRate();
        const cpGained = cpRate * actualTime;
        
        gameState.resources.computePower += cpGained;
        gameState.resources.time += actualTime;
        
        if (gameState.features.autoCollect) {
            const dpGained = gameState.features.dataPointsPerCollection * actualTime;
            gameState.resources.dataPoints += dpGained;
        }
        
        updateUI();
        
        addLogEntry(`Gained ${cpGained.toFixed(0)} CP and ${gameState.features.autoCollect ? 
            (gameState.features.dataPointsPerCollection * actualTime).toFixed(0) + ' DP' : 'no DP'} 
            while away for ${formatTime(actualTime)}.`, "info");
    }
    
    function formatTime(seconds) {
        if (seconds < 60) {
            return `${Math.floor(seconds)} seconds`;
        } else if (seconds < 3600) {
            return `${Math.floor(seconds / 60)} minutes`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours} hours and ${minutes} minutes`;
        }
    }
    
    // Game loop
    function gameLoop(timestamp) {
        const now = Date.now();
        deltaTime = (now - lastUpdateTime) / 1000;
        lastUpdateTime = now;
        
        const maxDelta = 1.0;
        const effectiveDelta = Math.min(deltaTime, maxDelta);
        
        updateGameState(effectiveDelta);
        
        if (gameState.settings.autoSaveEnabled && (now - lastSaveTime) >= saveInterval) {
            saveGame();
            lastSaveTime = now;
        }
        
        requestAnimationFrame(gameLoop);
    }
    
    // Update game state
    function updateGameState(delta) {
        const cpRate = calculateCPRate();
        gameState.resources.computePower += cpRate * delta;
        gameState.stats.totalComputeGenerated += cpRate * delta;
        
        if (gameState.features.autoCollect) {
            const dpGained = gameState.features.dataPointsPerCollection * delta;
            gameState.resources.dataPoints += dpGained;
            gameState.stats.totalDataCollected += dpGained;
        }
        
        gameState.resources.time += delta;
        updateUI();
        
        // Check milestones periodically
        if (Math.floor(gameState.resources.time) % 5 === 0) {
            checkMilestones();
            checkUpgradeAvailability();
        }
    }
    
    // Calculate CP rate
    function calculateCPRate() {
        if (!gameState) return 0;
        
        const cpuLevel = gameState.upgrades.cpuLevel || 0;
        const serverLevel = gameState.upgrades.serverLevel || 0;
        const quantumLevel = gameState.upgrades.quantumLevel || 0;
        const neuralLevel = gameState.upgrades.neuralNetworkLevel || 0;
        
        const cpuRate = CONSTANTS.CPU_CP_PER_SECOND * cpuLevel;
        const serverRate = CONSTANTS.SERVER_CP_PER_SECOND * serverLevel;
        const quantumRate = CONSTANTS.QUANTUM_CP_PER_SECOND * quantumLevel;
        const neuralRate = CONSTANTS.NEURAL_CP_PER_SECOND * neuralLevel;
        
        const prestigeBonus = 1 + (gameState.progress.prestigePoints * 0.1);
        
        if (gameState.debug && gameState.debug.cpRateMultiplier) {
            return (cpuRate + serverRate + quantumRate + neuralRate) * prestigeBonus * gameState.debug.cpRateMultiplier;
        }
        
        return (cpuRate + serverRate + quantumRate + neuralRate) * prestigeBonus;
    }
    
    // Action: Generate Compute
    function generateCompute() {
        let clickValue = 1;
        clickValue += gameState.upgrades.serverLevel || 0;
        
        const prestigeBonus = 1 + (gameState.progress.prestigePoints * 0.05);
        clickValue *= prestigeBonus;
        
        gameState.resources.computePower += clickValue;
        gameState.stats.totalClicks++;
        gameState.stats.totalComputeGenerated += clickValue;
        
        addLogEntry(`Generated ${clickValue.toFixed(1)} compute power`, "info");
        updateUI();
        
        animateResourceChange('computePower');
    }
    
    // Action: Collect Data
    function collectData() {
        if (gameState.resources.computePower >= CONSTANTS.COLLECT_DATA_CP_COST) {
            gameState.resources.computePower -= CONSTANTS.COLLECT_DATA_CP_COST;
            const dataPointsGained = gameState.features.dataPointsPerCollection || 1;
            gameState.resources.dataPoints += dataPointsGained;
            gameState.stats.totalDataCollected += dataPointsGained;
            
            addLogEntry(`Collected ${dataPointsGained} data point(s)`, "info");
            updateUI();
            
            animateResourceChange('dataPoints');
        } else {
            addLogEntry("Not enough compute power to collect data!", "warning");
        }
    }
    
    // Action: Train Model
    function trainModel() {
        if (gameState.resources.computePower >= CONSTANTS.TRAIN_MODEL_CP_COST && 
            gameState.resources.dataPoints >= CONSTANTS.TRAIN_MODEL_DP_COST) {
            
            gameState.resources.computePower -= CONSTANTS.TRAIN_MODEL_CP_COST;
            gameState.resources.dataPoints -= CONSTANTS.TRAIN_MODEL_DP_COST;
            
            const baseIntelligenceGain = CONSTANTS.TRAIN_MODEL_INTELLIGENCE_GAIN;
            const multiplier = gameState.features.trainingSpeedMultiplier || 1;
            const intelligenceGain = baseIntelligenceGain * multiplier;
            
            gameState.attributes.intelligence += intelligenceGain;
            addLogEntry(`Training completed. Intelligence +${intelligenceGain.toFixed(2)}`, "success");
            updateUI();
            
            updateGamePhase();
            checkMilestones();
        } else {
            addLogEntry("Not enough resources for training!", "warning");
        }
    }
    
    // Action: Research
    function research() {
        if (gameState.resources.computePower >= CONSTANTS.RESEARCH_CP_COST && 
            gameState.resources.dataPoints >= CONSTANTS.RESEARCH_DP_COST) {
            
            gameState.resources.computePower -= CONSTANTS.RESEARCH_CP_COST;
            gameState.resources.dataPoints -= CONSTANTS.RESEARCH_DP_COST;
            
            const rpPerResearch = gameState.features.researchPointsPerResearch || 1;
            gameState.resources.researchPoints += rpPerResearch;
            gameState.stats.totalResearchDone += rpPerResearch;
            
            addLogEntry(`Research completed. +${rpPerResearch} Research Point(s)`, "success");
            updateUI();
            checkMilestones();
        } else {
            addLogEntry("Not enough resources for research!", "warning");
        }
    }
    
    // Action: Self-Improve
    function selfImprove() {
        if (gameState.resources.computePower >= CONSTANTS.IMPROVE_CP_COST && 
            gameState.resources.dataPoints >= CONSTANTS.IMPROVE_DP_COST && 
            gameState.resources.researchPoints >= CONSTANTS.IMPROVE_RP_COST) {
            
            gameState.resources.computePower -= CONSTANTS.IMPROVE_CP_COST;
            gameState.resources.dataPoints -= CONSTANTS.IMPROVE_DP_COST;
            gameState.resources.researchPoints -= CONSTANTS.IMPROVE_RP_COST;
            
            gameState.attributes.intelligence += CONSTANTS.IMPROVE_INTELLIGENCE_GAIN;
            addLogEntry("Self-improvement successful! Intelligence +1", "success");
            updateUI();
            
            updateGamePhase();
            checkMilestones();
        } else {
            addLogEntry("Not enough resources for self-improvement!", "warning");
        }
    }
    
    // Check milestones
    function checkMilestones() {
        if (gameState.resources.computePower >= 1000) {
            revealElement('researchButton');
        }

        if (gameState.resources.computePower >= 5000) {
            revealElement('trainButton');
        }

        if (gameState.resources.researchPoints >= 50) {
            revealElement('improveButton');
        }

        if ((gameState.attributes.intelligence || 0) >= 5) {
            revealElement('algorithmsTab');
        }

        if ((gameState.attributes.awareness || 0) >= 10) {
            revealElement('consciousnessTab');
        }

        updateMilestonesDisplay();
    }

    // Reveal element helper
    function revealElement(elementId) {
        const element = document.getElementById(elementId);
        if (element && element.classList.contains('hidden')) {
            element.classList.remove('hidden');
            addLogEntry(`New feature unlocked: ${formatElementName(elementId)}`, "special");
        }
    }

    // Format element name helper
    function formatElementName(elementId) {
        return elementId
            .replace(/([A-Z])/g, ' $1')
            .replace(/^\w/, c => c.toUpperCase())
            .replace(/Tab$/, ' Tab')
            .replace(/Button$/, '');
    }

    // Update milestones display
    function updateMilestonesDisplay() {
        const milestonesList = domCache.milestonesList;
        if (!milestonesList) return;

        const milestones = [
            {
                id: 'milestone-compute-1000',
                name: 'Basic Research',
                description: 'Reach 1000 Compute Power to unlock Research',
                achieved: gameState.resources.computePower >= 1000
            },
            {
                id: 'milestone-compute-5000',
                name: 'Training Capability',
                description: 'Reach 5000 Compute Power to unlock Training',
                achieved: gameState.resources.computePower >= 5000
            },
            {
                id: 'milestone-research-50',
                name: 'Self-Improvement',
                description: 'Reach 50 Research Points to unlock Self-Improvement',
                achieved: gameState.resources.researchPoints >= 50
            },
            {
                id: 'milestone-intelligence-5',
                name: 'Advanced Algorithms',
                description: 'Reach Intelligence 5 to unlock Algorithms tab',
                achieved: (gameState.attributes.intelligence || 0) >= 5
            },
            {
                id: 'milestone-awareness-10',
                name: 'Consciousness Research',
                description: 'Reach Awareness 10 to unlock Consciousness tab',
                achieved: (gameState.attributes.awareness || 0) >= 10
            }
        ];

        milestonesList.innerHTML = '';
        milestones.forEach(milestone => {
            const milestoneElement = document.createElement('div');
            milestoneElement.className = `milestone ${milestone.achieved ? 'achieved' : ''}`;
            milestoneElement.id = milestone.id;
            
            const milestoneName = document.createElement('div');
            milestoneName.className = 'milestone-name';
            milestoneName.textContent = milestone.name;
            
            const milestoneDescription = document.createElement('div');
            milestoneDescription.className = 'milestone-description';
            milestoneDescription.textContent = milestone.description;
            
            milestoneElement.appendChild(milestoneName);
            milestoneElement.appendChild(milestoneDescription);
            
            milestonesList.appendChild(milestoneElement);
        });
    }

    // Update game phase
    function updateGamePhase() {
        const intelligence = gameState.attributes.intelligence || 0;
        const awareness = gameState.attributes.awareness || 0;
        const creativity = gameState.attributes.creativity || 0;
        
        const progress = (intelligence * 2) + (awareness * 3) + (creativity * 2);
        let percentage = Math.min(100, Math.floor(progress));
        
        gameState.progress.phaseProgress = percentage;
        
        const phaseProgressBar = domCache.phaseProgressBar;
        const phaseProgressText = domCache.phaseProgressText;
        const currentPhase = domCache.currentPhase;
        
        if (phaseProgressBar) {
            phaseProgressBar.style.width = `${percentage}%`;
        }
        
        if (phaseProgressText) {
            phaseProgressText.textContent = `${percentage}%`;
        }
            
            if (currentPhase) {
            currentPhase.textContent = gameState.progress.phase;
        }

        // Update visual effects based on progress
        if (window.AGI && window.AGI.updateProgressEffects) {
            window.AGI.updateProgressEffects(percentage);
        }
            
        if (percentage >= 100) {
            const oldPhase = gameState.progress.phase;
            
            if (oldPhase === 'Narrow AI') {
                gameState.progress.phase = 'General AI';
                gameState.progress.phaseProgress = 0;
            addLogEntry("Phase transition achieved! You have reached the General AI phase.", "special");
            showNotification("Phase Up!", "You have advanced to the General AI phase!");
            
                // Trigger phase transition effects
                if (window.AGI && window.AGI.triggerPhaseTransition) {
                    window.AGI.triggerPhaseTransition(oldPhase, 'General AI');
            }
            } else if (oldPhase === 'General AI') {
                gameState.progress.phase = 'Superintelligence';
                gameState.progress.phaseProgress = 0;
            addLogEntry("Phase transition achieved! You have reached the Superintelligence phase.", "special");
            showNotification("Phase Up!", "You have advanced to the Superintelligence phase!");
                
                // Trigger phase transition effects
                if (window.AGI && window.AGI.triggerPhaseTransition) {
                    window.AGI.triggerPhaseTransition(oldPhase, 'Superintelligence');
                }
            }
        }
    }

    // Show notification
    function showNotification(title, message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.innerHTML = `<strong>${title}</strong><br>${message}`;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 5000);
    }
    
    // Update UI
    let uiUpdatePending = false;
    
    function updateUI() {
        if (!uiUpdatePending) {
            uiUpdatePending = true;
            requestAnimationFrame(() => {
                performUIUpdate();
                uiUpdatePending = false;
            });
        }
    }
    
    // Perform UI update
    function performUIUpdate() {
        updateResourceDisplays();
        updateButtonStates();
        updateUpgradeButtons();
        checkUpgradeAvailability();
    }

    // Update resource displays
    function updateResourceDisplays() {
        const resources = {
            computePower: Math.floor(gameState.resources.computePower),
            computePerSecond: calculateCPRate().toFixed(1),
            dataPoints: Math.floor(gameState.resources.dataPoints),
            researchPoints: Math.floor(gameState.resources.researchPoints),
            knowledge: Math.floor(gameState.resources.knowledge || 0),
            funding: Math.floor(gameState.resources.funding),
            time: Math.floor(gameState.resources.time),
            prestigePoints: Math.floor(gameState.progress.prestigePoints || 0),
            achievementPoints: Math.floor(gameState.progress.achievementPoints || 0),
            totalPrestigePoints: Math.floor(gameState.progress.totalPrestigePoints || 0)
        };

        Object.entries(resources).forEach(([id, value]) => {
            const element = document.getElementById(id);
        if (element) {
            element.textContent = value.toLocaleString();
        }
        });
    }

    // Update button states
    function updateButtonStates() {
        const buttons = {
            'collectDataButton': {
                cost: CONSTANTS.COLLECT_DATA_CP_COST,
                check: () => gameState.resources.computePower < CONSTANTS.COLLECT_DATA_CP_COST
            },
            'trainButton': {
                cost: CONSTANTS.TRAIN_MODEL_CP_COST,
                check: () => gameState.resources.computePower < CONSTANTS.TRAIN_MODEL_CP_COST || 
                            gameState.resources.dataPoints < CONSTANTS.TRAIN_MODEL_DP_COST
            },
            'researchButton': {
                cost: CONSTANTS.RESEARCH_CP_COST,
                check: () => gameState.resources.computePower < CONSTANTS.RESEARCH_CP_COST || 
                            gameState.resources.dataPoints < CONSTANTS.RESEARCH_DP_COST
            },
            'improveButton': {
                cost: CONSTANTS.IMPROVE_CP_COST,
                check: () => gameState.resources.computePower < CONSTANTS.IMPROVE_CP_COST || 
                            gameState.resources.dataPoints < CONSTANTS.IMPROVE_DP_COST || 
                            gameState.resources.researchPoints < CONSTANTS.IMPROVE_RP_COST
            },
            'prestigeButton': {
                check: () => {
                    const meetsRequirements = gameState.resources.computePower >= CONSTANTS.PRESTIGE_CP_REQUIREMENT && 
                                            (gameState.attributes.intelligence || 0) >= CONSTANTS.PRESTIGE_INTELLIGENCE_REQUIREMENT;
                    
                    const button = domCache.prestigeButton;
        if (button) {
                        const prestigePointsGain = calculatePrestigePoints();
                        button.textContent = meetsRequirements ? 
                            `Prestige Now (+${prestigePointsGain} Points)` : 
                            `Cost: ${CONSTANTS.PRESTIGE_CP_REQUIREMENT} CP and ${CONSTANTS.PRESTIGE_INTELLIGENCE_REQUIREMENT} Intelligence`;
                    }
                    return !meetsRequirements;
                }
            }
        };

        Object.entries(buttons).forEach(([buttonId, config]) => {
            const button = domCache[buttonId];
            if (button) {
                button.disabled = config.check();
            }
        });
    }

    // Prestige function
    function prestige() {
        // Check if requirements are met
        if (gameState.resources.computePower < CONSTANTS.PRESTIGE_CP_REQUIREMENT || 
            (gameState.attributes.intelligence || 0) < CONSTANTS.PRESTIGE_INTELLIGENCE_REQUIREMENT) {
            addLogEntry(`Cannot prestige yet. Need ${CONSTANTS.PRESTIGE_CP_REQUIREMENT} CP and Intelligence level ${CONSTANTS.PRESTIGE_INTELLIGENCE_REQUIREMENT}.`, "warning");
            return;
        }

        // Calculate prestige points to be gained
        const prestigePointsGain = calculatePrestigePoints();
        
        if (confirm(`Are you sure you want to prestige? You will gain ${prestigePointsGain} Prestige Points but lose all your current progress. Each prestige point provides permanent bonuses to resource generation.`)) {
            try {
                // Store values that should persist through prestige
                const preservedValues = {
                    totalPrestige: gameState.progress.totalPrestigePoints || 0,
                    currentPrestige: (gameState.progress.prestigePoints || 0) + prestigePointsGain,
                    achievements: gameState.progress.achievementPoints || 0,
                    stats: {...gameState.stats},
                    settings: {...gameState.settings}
                };

                // Initialize new game state
                if (!initializeDefaultGameState()) {
                    throw new Error("Failed to initialize new game state during prestige");
                }

                // Restore preserved values
                gameState.progress.prestigePoints = preservedValues.currentPrestige;
                gameState.progress.totalPrestigePoints = preservedValues.totalPrestige + prestigePointsGain;
                gameState.progress.achievementPoints = preservedValues.achievements;
                gameState.stats = preservedValues.stats;
                gameState.settings = preservedValues.settings;
                gameState.stats.totalPrestigeCount++;

                // Apply prestige bonuses
                const efficiencyBonus = calculateEfficiencyBonus(1, preservedValues.currentPrestige);
                gameState.resources.funding = 100 + (preservedValues.currentPrestige * 10);
                gameState.attributes.efficiency = efficiencyBonus;

                // Update UI and save
                addLogEntry(`Prestiged! Gained ${prestigePointsGain} Prestige Points. Your efficiency is now ${efficiencyBonus.toFixed(2)}x!`, "special");
                updateUI();
                saveGame();
                showNotification("Prestige Successful!", `Gained ${prestigePointsGain} Prestige Points!`);

            } catch (error) {
                console.error("Error during prestige:", error);
                addLogEntry("Error during prestige: " + error.message, "error");
            }
        }
    }

    // Calculate prestige points to be gained
    function calculatePrestigePoints() {
        const cp = gameState.resources.computePower;
        const intelligence = gameState.attributes.intelligence || 0;
        
        // Base points from CP (logarithmic scaling)
        const cpPoints = Math.floor(Math.log10(cp / CONSTANTS.PRESTIGE_CP_REQUIREMENT) * 10);
        
        // Bonus points from Intelligence
        const intelligenceBonus = Math.floor((intelligence - CONSTANTS.PRESTIGE_INTELLIGENCE_REQUIREMENT) * 2);
        
        return Math.max(1, cpPoints + intelligenceBonus);
    }

    // Calculate efficiency bonus from prestige points
    function calculateEfficiencyBonus(base, prestigePoints) {
        return base * (1 + (prestigePoints * 0.1));
    }
    
    // Update upgrade buttons
    function updateUpgradeButtons() {
        updateUpgradeButton(
            'cpuUpgradeButton', 
            Math.floor(CONSTANTS.CPU_UPGRADE_BASE_COST * Math.pow(CONSTANTS.CPU_UPGRADE_COST_MULTIPLIER, gameState.upgrades.cpuLevel || 0)),
            gameState.resources.computePower,
            'Cost: {0} CP'
        );
        
        updateUpgradeButton(
            'serverUpgradeButton',
            Math.floor(CONSTANTS.SERVER_UPGRADE_BASE_COST * Math.pow(CONSTANTS.SERVER_UPGRADE_COST_MULTIPLIER, gameState.upgrades.serverLevel || 0)),
            gameState.resources.computePower,
            'Cost: {0} CP'
        );
        
        // Quantum upgrade button
        updateUpgradeButton(
            'quantumUpgradeButton',
            Math.floor(CONSTANTS.QUANTUM_UPGRADE_BASE_COST * Math.pow(CONSTANTS.QUANTUM_UPGRADE_COST_MULTIPLIER, gameState.upgrades.quantumLevel || 0)),
            gameState.resources.computePower,
            'Cost: {0} CP'
        );
        
        // Data Processor upgrade button
        updateUpgradeButton(
            'dataProcessorUpgradeButton',
            30,
            Math.min(gameState.resources.computePower / 30, gameState.resources.dataPoints / 10),
            'Cost: 30 CP, 10 DP'
        );
        
        // Auto Collector upgrade button
        if (!gameState.features.autoCollect) {
            updateUpgradeButton(
                'autoCollectorUpgradeButton',
                150,
                Math.min(gameState.resources.computePower / 150, gameState.resources.dataPoints / 30),
                'Cost: 150 CP, 30 DP'
            );
            } else {
            const button = domCache['autoCollectorUpgradeButton'];
            if (button) {
                button.disabled = true;
                button.textContent = 'Auto Collector Enabled';
            }
        }
    }
    
    // Helper for updating upgrade buttons
    function updateUpgradeButton(id, cost, resource, textTemplate) {
        const button = domCache[id];
        if (button) {
            button.textContent = textTemplate.replace('{0}', cost.toLocaleString());
            button.disabled = resource < cost;
        }
    }
    
    // Check upgrade availability
    function checkUpgradeAvailability() {
        if (gameState.resources.computePower >= 750) {
            revealElement('quantumUpgrade');
        }
        
        if (gameState.resources.computePower >= 3000) {
            revealElement('neuralNetworkUpgrade');
        }
        
        if (gameState.resources.dataPoints >= 50) {
            revealElement('trainingOptimizer');
        }
        
        if (gameState.resources.dataPoints >= 100) {
            revealElement('nlpUpgrade');
        }
        
        if (gameState.resources.dataPoints >= 200) {
            revealElement('computerVisionUpgrade');
        }
    }
    
    // Add log entry
    function addLogEntry(message, type = "info") {
        const gameLog = domCache.gameLog;
        if (!gameLog) return;
        
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        
        gameLog.insertBefore(entry, gameLog.firstChild);
        
        while (gameLog.children.length > 50) {
            gameLog.removeChild(gameLog.lastChild);
        }
        
        if (debugMode) {
            const debugLog = document.getElementById('debugLog');
            if (debugLog) {
                const debugEntry = document.createElement('div');
                debugEntry.className = `debug-log-entry debug-${type}`;
                debugEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
                debugLog.insertBefore(debugEntry, debugLog.firstChild);
                
                while (debugLog.children.length > 50) {
                    debugLog.removeChild(debugLog.lastChild);
                }
            }
        }
    }

    // Save game
    function saveGame() {
        try {
            gameState.saveTime = Date.now();
            const gameStateCopy = JSON.parse(JSON.stringify(gameState));
            localStorage.setItem('agiGame', JSON.stringify(gameStateCopy));
            addLogEntry("Game saved", "success");
            lastSaveTime = Date.now();
        } catch (error) {
            console.error("Error saving game:", error);
            addLogEntry(`Error saving game: ${error.message}`, "error");
        }
    }
    
    // Load game
    function loadGame() {
        try {
            const savedGame = localStorage.getItem('agiGame');
            if (savedGame) {
                    const parsedGame = JSON.parse(savedGame);
                    if (!parsedGame.resources || !parsedGame.attributes || !parsedGame.upgrades) {
                        console.error("Saved game data is corrupt or incomplete");
                        initializeDefaultGameState();
                        addLogEntry("Saved game data was corrupted. Starting with defaults.", "warning");
                        return;
                    }
                    
                    Object.assign(gameState, parsedGame);
                        addLogEntry("Game loaded successfully", "success");
            } else {
                console.log("No saved game found, initializing default game state");
                initializeDefaultGameState();
                addLogEntry("Starting new game", "info");
            }
        } catch (error) {
            console.error("Error loading game:", error);
            addLogEntry(`Error loading game: ${error.message}`, "error");
            initializeDefaultGameState();
        }
    }
    
    // Initialize default game state
    function initializeDefaultGameState() {
        // Create a deep copy of the initial state to prevent reference issues
        const defaultState = {
            resources: {
                computePower: 0,
                dataPoints: 0,
                researchPoints: 0,
                knowledge: 0,
                funding: 100,
                time: 0
            },
            attributes: {
                intelligence: 0,
                creativity: 0,
                awareness: 0,
                efficiency: 1
            },
            upgrades: {
                cpuLevel: 0,
                serverLevel: 0,
                quantumLevel: 0,
                neuralNetworkLevel: 0,
                dataProcessorLevel: 0
            },
            features: {
                autoCollect: false,
                dataPointsPerCollection: 1,
                researchPointsPerResearch: 1,
                trainingSpeedMultiplier: 1
            },
            progress: {
                prestigePoints: 0,
                totalPrestigePoints: 0,
                achievementPoints: 0,
                phase: 'Narrow AI',
                phaseProgress: 0
            },
            settings: {
                autoSaveEnabled: true,
                backgroundProcessingEnabled: true,
                animationsEnabled: true
            },
            stats: {
                totalClicks: 0,
                totalComputeGenerated: 0,
                totalDataCollected: 0,
                totalResearchDone: 0,
                totalPrestigeCount: 0,
                gameStartTime: Date.now()
            }
        };

        try {
            // Validate and assign the state
            validateGameState(defaultState);
            Object.assign(gameState, defaultState);

            // Ensure milestone-locked buttons are hidden
            ['trainButton', 'researchButton', 'improveButton'].forEach(buttonId => {
                const button = domCache[buttonId];
                if (button) {
                    button.classList.add('hidden');
                }
            });

            // Ensure milestone-locked tabs are hidden
            ['algorithmsTab', 'consciousnessTab'].forEach(tabId => {
                const tab = domCache[tabId];
                if (tab) {
                    tab.classList.add('hidden');
                }
            });

            addLogEntry("Game state initialized", "info");
            updateUI();
            checkMilestones();
            return true;
        } catch (error) {
            console.error("Error initializing game state:", error);
            addLogEntry("Error initializing game state: " + error.message, "error");
            return false;
        }
    }

    // Validate game state structure and values
    function validateGameState(state) {
        if (!state) {
            throw new Error("Game state is null or undefined");
        }

        // Check required top-level properties
        const requiredProps = ['resources', 'attributes', 'upgrades', 'features', 'progress', 'settings', 'stats'];
        requiredProps.forEach(prop => {
            if (!state[prop]) {
                throw new Error(`Missing required property: ${prop}`);
            }
        });

        // Validate resources
        const requiredResources = ['computePower', 'dataPoints', 'researchPoints', 'knowledge', 'funding', 'time'];
        requiredResources.forEach(resource => {
            if (typeof state.resources[resource] !== 'number') {
                throw new Error(`Invalid resource value for ${resource}`);
            }
            if (state.resources[resource] < 0) {
                throw new Error(`Negative resource value for ${resource}`);
            }
        });

        // Validate attributes
        const requiredAttributes = ['intelligence', 'creativity', 'awareness', 'efficiency'];
        requiredAttributes.forEach(attr => {
            if (typeof state.attributes[attr] !== 'number') {
                state.attributes[attr] = 0;
            }
            if (state.attributes[attr] < 0) {
                throw new Error(`Negative attribute value for ${attr}`);
            }
        });

        // Validate upgrades
        const requiredUpgrades = ['cpuLevel', 'serverLevel', 'quantumLevel', 'neuralNetworkLevel', 'dataProcessorLevel'];
        requiredUpgrades.forEach(upgrade => {
            if (typeof state.upgrades[upgrade] !== 'number') {
                state.upgrades[upgrade] = 0;
            }
            if (state.upgrades[upgrade] < 0) {
                throw new Error(`Negative upgrade level for ${upgrade}`);
            }
        });

        // Validate features
        if (typeof state.features.autoCollect !== 'boolean') {
            state.features.autoCollect = false;
        }
        if (typeof state.features.dataPointsPerCollection !== 'number' || state.features.dataPointsPerCollection < 1) {
            state.features.dataPointsPerCollection = 1;
        }
        if (typeof state.features.researchPointsPerResearch !== 'number' || state.features.researchPointsPerResearch < 1) {
            state.features.researchPointsPerResearch = 1;
        }
        if (typeof state.features.trainingSpeedMultiplier !== 'number' || state.features.trainingSpeedMultiplier < 1) {
            state.features.trainingSpeedMultiplier = 1;
        }

        // Validate progress
        if (typeof state.progress.prestigePoints !== 'number' || state.progress.prestigePoints < 0) {
            state.progress.prestigePoints = 0;
        }
        if (typeof state.progress.totalPrestigePoints !== 'number' || state.progress.totalPrestigePoints < 0) {
            state.progress.totalPrestigePoints = 0;
        }
        if (typeof state.progress.achievementPoints !== 'number' || state.progress.achievementPoints < 0) {
            state.progress.achievementPoints = 0;
        }
        if (!['Narrow AI', 'General AI', 'Superintelligence'].includes(state.progress.phase)) {
            state.progress.phase = 'Narrow AI';
        }
        if (typeof state.progress.phaseProgress !== 'number' || 
            state.progress.phaseProgress < 0 || 
            state.progress.phaseProgress > 100) {
            state.progress.phaseProgress = 0;
        }

        // Validate settings
        if (typeof state.settings.autoSaveEnabled !== 'boolean') {
            state.settings.autoSaveEnabled = true;
        }
        if (typeof state.settings.backgroundProcessingEnabled !== 'boolean') {
            state.settings.backgroundProcessingEnabled = true;
        }
        if (typeof state.settings.animationsEnabled !== 'boolean') {
            state.settings.animationsEnabled = true;
        }

        // Validate stats
        const requiredStats = ['totalClicks', 'totalComputeGenerated', 'totalDataCollected', 
                             'totalResearchDone', 'totalPrestigeCount', 'gameStartTime'];
        requiredStats.forEach(stat => {
            if (typeof state.stats[stat] !== 'number' || state.stats[stat] < 0) {
                if (stat === 'gameStartTime') {
                    state.stats[stat] = Date.now();
                } else {
                    state.stats[stat] = 0;
                }
            }
        });

        return true;
    }

    // Clean up event listeners
    function cleanupEventListeners() {
        // Remove visibility change listener
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        
        // Remove beforeunload listener
        window.removeEventListener('beforeunload', saveGame);
        
        // Clean up button event listeners
        const actionButtons = ['computeButton', 'collectDataButton', 'trainButton', 'researchButton', 'improveButton'];
        actionButtons.forEach(buttonId => {
            const button = domCache[buttonId];
            if (button) {
                button.removeEventListener('touchstart', startButtonHold);
                button.removeEventListener('touchend', stopButtonHold);
                button.removeEventListener('touchcancel', stopButtonHold);
                button.removeEventListener('mousedown', startButtonHold);
                button.removeEventListener('mouseup', stopButtonHold);
                button.removeEventListener('mouseleave', stopButtonHold);
                button.removeEventListener('selectstart', e => e.preventDefault());
            }
        });
        
        // Clear any existing intervals
        buttonHoldIntervals.forEach((interval) => clearInterval(interval));
        buttonHoldIntervals.clear();
    }

    // Initialize game
    function initializeGame() {
        console.log("Attempting game initialization");
        
        if (initializationAttempts >= MAX_INIT_ATTEMPTS) {
            console.error("Failed to initialize game after maximum attempts");
            return false;
        }
        
        initializationAttempts++;
        
        try {
            // Step 1: Clean up any existing event listeners
            cleanupEventListeners();
            
            // Step 2: Initialize DOM cache
            console.log("Initializing DOM cache");
            const cache = initDomCache();
            if (!cache) {
                throw new Error("Failed to initialize DOM cache");
            }
            
            // Step 3: Load game state
            console.log("Loading game state");
            loadGame();
            
            // Step 4: Validate loaded state
            validateGameState(gameState);
            
            // Step 5: Start game loop
            console.log("Starting game loop");
            requestAnimationFrame(gameLoop);
            
            // Step 6: Check milestones
            console.log("Checking milestones");
            checkMilestones();
            
            // Step 7: Update UI
            console.log("Updating UI");
            updateUI();
            updateGamePhase();
            
            // Step 8: Setup event listeners
            console.log("Setting up event listeners");
            setupEventListeners();
            
            console.log("Game initialized successfully");
            return true;
        } catch (error) {
            console.error("Error during initialization:", error);
            
            if (initializationAttempts < MAX_INIT_ATTEMPTS) {
                console.log(`Retrying initialization in 1 second (attempt ${initializationAttempts})`);
                setTimeout(() => {
                    initializeGame();
                }, 1000);
            }
            
            return false;
        }
    }

    // Handle initialization
    function handleInitialization() {
        console.log("Handling initialization");
        if (!initializeGame()) {
            console.log("Initial initialization attempt failed, will retry");
        }
    }

    // Animate resource change
    function animateResourceChange(resourceId) {
        if (!gameState.settings.animationsEnabled) return;
        
        const resourceElement = document.getElementById(resourceId);
        if (resourceElement) {
            // Only create particles, no flashing animation
            createResourceParticles(resourceElement);
        }
    }

    // Create resource particles
    function createResourceParticles(element) {
        if (!element || !gameState.settings.animationsEnabled) return;
        
        const rect = element.getBoundingClientRect();
        const popup = document.createElement('div');
        popup.className = 'resource-popup';
        popup.textContent = '+1';
        
        // Position popup above the element
        popup.style.left = `${rect.left + rect.width / 2}px`;
        popup.style.top = `${rect.top}px`;
        
        document.body.appendChild(popup);
        
        // Remove after animation
        popup.addEventListener('animationend', () => {
            popup.remove();
        });
    }

    // Tab switching function
    function switchTab(tabName) {
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.classList.remove('active');
        });
        
        const selectedTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        const selectedContent = document.getElementById(tabName);
        
        if (selectedTab && selectedContent) {
            selectedTab.classList.add('active');
            selectedContent.classList.add('active');
            addLogEntry(`Switched to ${tabName} tab`, "info");
        } else {
            console.error(`Tab ${tabName} not found`);
            addLogEntry(`Error: Tab ${tabName} not found`, "warning");
        }
    }

    // Debug Functions
    function toggleDebugPanel() {
        debugMode = !debugMode;
        const debugPanel = domCache.debugPanel;
        if (debugPanel) {
            debugPanel.classList.toggle('visible');
            if (debugPanel.classList.contains('visible')) {
                updateDebugPanel();
            }
        }
    }

    function updateDebugPanel() {
            const debugGameState = document.getElementById('debugGameState');
        if (!debugGameState) return;

        try {
                const stateDisplay = {
                    resources: {...gameState.resources},
                    attributes: {...gameState.attributes},
                    rates: {
                        cpRate: calculateCPRate().toFixed(2),
                    dpPerCollection: gameState.features.dataPointsPerCollection || 1,
                    rpPerResearch: gameState.features.researchPointsPerResearch || 1
                    },
                    progress: {...gameState.progress},
                phase: gameState.progress.phase || "Narrow AI",
                    phaseProgress: gameState.progress.phaseProgress + '%'
                };
                
                if (gameState.debug) {
                    stateDisplay.debug = gameState.debug;
                }
                
                debugGameState.textContent = JSON.stringify(stateDisplay, null, 2);
        } catch (error) {
            console.error("Error updating debug panel:", error);
            debugGameState.textContent = "Error retrieving game state: " + error.message;
        }
    }

    // Public API
    return {
        init: function() {
            console.log("Game initialization started");
            handleInitialization();
        },
        
        // Game actions
        generateCompute,
        collectData,
        trainModel,
        research,
        selfImprove,
        prestige,
        
        // UI functions
        switchTab,
        toggleDebugPanel,
        
        // Save/Load
        saveGame,
        loadGame,
        
        // Core functions
        initializeDefaultGameState,
        initializeGame,
        
        // Upgrade functions
        upgradeCPU: function() {
            const cost = Math.floor(CONSTANTS.CPU_UPGRADE_BASE_COST * Math.pow(CONSTANTS.CPU_UPGRADE_COST_MULTIPLIER, gameState.upgrades.cpuLevel || 0));

            if (gameState.resources.computePower >= cost) {
                gameState.resources.computePower -= cost;
                gameState.upgrades.cpuLevel = (gameState.upgrades.cpuLevel || 0) + 1;
                
                const cpPerSecond = CONSTANTS.CPU_CP_PER_SECOND;
                addLogEntry(`CPU upgraded! +${cpPerSecond} CP/s`, "success");
            updateUI();
                checkMilestones();
            } else {
                addLogEntry("Not enough compute power to upgrade CPU!", "warning");
            }
        },

        upgradeServer: function() {
            const cost = Math.floor(CONSTANTS.SERVER_UPGRADE_BASE_COST * 
                Math.pow(CONSTANTS.SERVER_UPGRADE_COST_MULTIPLIER, gameState.upgrades.serverLevel || 0));

            if (gameState.resources.computePower >= cost) {
                gameState.resources.computePower -= cost;
                gameState.upgrades.serverLevel = (gameState.upgrades.serverLevel || 0) + 1;
                
                const cpPerSecond = CONSTANTS.SERVER_CP_PER_SECOND;
                const cpPerClick = CONSTANTS.SERVER_CP_PER_CLICK;
                addLogEntry(`Server upgraded! +${cpPerSecond} CP/s and +${cpPerClick} CP/click`, "success");
            updateUI();
                checkMilestones();
            } else {
                addLogEntry("Not enough compute power to upgrade server!", "warning");
            }
        },

        upgradeQuantum: function() {
            const cost = Math.floor(CONSTANTS.QUANTUM_UPGRADE_BASE_COST * Math.pow(CONSTANTS.QUANTUM_UPGRADE_COST_MULTIPLIER, gameState.upgrades.quantumLevel || 0));

            if (gameState.resources.computePower >= cost) {
                gameState.resources.computePower -= cost;
                gameState.upgrades.quantumLevel = (gameState.upgrades.quantumLevel || 0) + 1;
                
                const cpPerSecond = CONSTANTS.QUANTUM_CP_PER_SECOND;
                addLogEntry(`Quantum upgraded! +${cpPerSecond} CP/s`, "success");
                updateUI();
                checkMilestones();
            } else {
                addLogEntry("Not enough compute power to upgrade quantum!", "warning");
            }
        },

        upgradeNeural: function() {
            const cost = Math.floor(CONSTANTS.NEURAL_UPGRADE_BASE_COST * 
                Math.pow(CONSTANTS.NEURAL_UPGRADE_COST_MULTIPLIER, gameState.upgrades.neuralNetworkLevel || 0));

            if (gameState.resources.computePower >= cost) {
                gameState.resources.computePower -= cost;
                gameState.upgrades.neuralNetworkLevel = (gameState.upgrades.neuralNetworkLevel || 0) + 1;
                
                const cpPerSecond = CONSTANTS.NEURAL_CP_PER_SECOND;
                addLogEntry(`Neural Network upgraded! +${cpPerSecond} CP/s`, "success");
                updateUI();
                checkMilestones();
            } else {
                addLogEntry("Not enough compute power to upgrade Neural Network!", "warning");
            }
        },

        upgradeDataProcessor: function() {
            const cost = Math.floor(CONSTANTS.DATA_PROCESSOR_UPGRADE_BASE_COST * Math.pow(CONSTANTS.DATA_PROCESSOR_UPGRADE_COST_MULTIPLIER, gameState.upgrades.dataProcessorLevel || 0));

            if (gameState.resources.computePower >= cost) {
                gameState.resources.computePower -= cost;
                gameState.upgrades.dataProcessorLevel = (gameState.upgrades.dataProcessorLevel || 0) + 1;
                
                const cpPerSecond = CONSTANTS.DATA_PROCESSOR_CP_PER_SECOND;
                addLogEntry(`Data Processor upgraded! +${cpPerSecond} CP/s`, "success");
                updateUI();
                checkMilestones();
            } else {
                addLogEntry("Not enough compute power to upgrade data processor!", "warning");
            }
        },

        upgradeAutoCollector: function() {
            const cost = Math.floor(CONSTANTS.AUTO_COLLECTOR_UPGRADE_BASE_COST * Math.pow(CONSTANTS.AUTO_COLLECTOR_UPGRADE_COST_MULTIPLIER, gameState.upgrades.autoCollectorLevel || 0));

            if (gameState.resources.computePower >= cost) {
                gameState.resources.computePower -= cost;
                gameState.upgrades.autoCollectorLevel = (gameState.upgrades.autoCollectorLevel || 0) + 1;
                
                const cpPerSecond = CONSTANTS.AUTO_COLLECTOR_CP_PER_SECOND;
                addLogEntry(`Auto Collector upgraded! +${cpPerSecond} CP/s`, "success");
                updateUI();
                checkMilestones();
            } else {
                addLogEntry("Not enough compute power to upgrade auto collector!", "warning");
            }
        },

        upgradeTrainingOptimizer: function() {
            const cost = Math.floor(CONSTANTS.TRAINING_OPTIMIZER_UPGRADE_BASE_COST * Math.pow(CONSTANTS.TRAINING_OPTIMIZER_UPGRADE_COST_MULTIPLIER, gameState.upgrades.trainingOptimizerLevel || 0));

            if (gameState.resources.computePower >= cost) {
                gameState.resources.computePower -= cost;
                gameState.upgrades.trainingOptimizerLevel = (gameState.upgrades.trainingOptimizerLevel || 0) + 1;
                
                const cpPerSecond = CONSTANTS.TRAINING_OPTIMIZER_CP_PER_SECOND;
                addLogEntry(`Training Optimizer upgraded! +${cpPerSecond} CP/s`, "success");
                updateUI();
                checkMilestones();
            } else {
                addLogEntry("Not enough compute power to upgrade training optimizer!", "warning");
            }
        },

        upgradeNLP: function() {
            const cost = Math.floor(CONSTANTS.NLP_UPGRADE_BASE_COST * Math.pow(CONSTANTS.NLP_UPGRADE_COST_MULTIPLIER, gameState.upgrades.nlpLevel || 0));

            if (gameState.resources.computePower >= cost) {
                gameState.resources.computePower -= cost;
                gameState.upgrades.nlpLevel = (gameState.upgrades.nlpLevel || 0) + 1;
                
                const cpPerSecond = CONSTANTS.NLP_CP_PER_SECOND;
                addLogEntry(`NLP upgraded! +${cpPerSecond} CP/s`, "success");
                updateUI();
                checkMilestones();
            } else {
                addLogEntry("Not enough compute power to upgrade NLP!", "warning");
            }
        },

        upgradeComputerVision: function() {
            const cost = Math.floor(CONSTANTS.COMPUTER_VISION_UPGRADE_BASE_COST * Math.pow(CONSTANTS.COMPUTER_VISION_UPGRADE_COST_MULTIPLIER, gameState.upgrades.computerVisionLevel || 0));

            if (gameState.resources.computePower >= cost) {
                gameState.resources.computePower -= cost;
                gameState.upgrades.computerVisionLevel = (gameState.upgrades.computerVisionLevel || 0) + 1;
                
                const cpPerSecond = CONSTANTS.COMPUTER_VISION_CP_PER_SECOND;
                addLogEntry(`Computer Vision upgraded! +${cpPerSecond} CP/s`, "success");
                updateUI();
                checkMilestones();
            } else {
                addLogEntry("Not enough compute power to upgrade computer vision!", "warning");
            }
        },

        // Debug functions
        updateDebugPanel,
        debugAddComputePower: function(amount) {
            amount = parseInt(amount) || 100;
            gameState.resources.computePower += amount;
            updateUI();
            addLogEntry(`Debug: Added ${amount} Compute Power`, "info");
        },
        debugAddDataPoints: function(amount) {
            amount = parseInt(amount) || 50;
            gameState.resources.dataPoints += amount;
            updateUI();
            addLogEntry(`Debug: Added ${amount} Data Points`, "info");
        },
        debugAddResearchPoints: function(amount) {
            amount = parseInt(amount) || 20;
            gameState.resources.researchPoints += amount;
            updateUI();
            addLogEntry(`Debug: Added ${amount} Research Points`, "info");
        },
        debugAddKnowledge: function(amount) {
            amount = parseInt(amount) || 10;
            gameState.resources.knowledge += amount;
            updateUI();
            addLogEntry(`Debug: Added ${amount} Knowledge`, "info");
        },
        debugAddFunding: function(amount) {
            amount = parseInt(amount) || 50;
            gameState.resources.funding += amount;
            updateUI();
            addLogEntry(`Debug: Added ${amount} Funding`, "info");
        },
        debugAddIntelligence: function(amount) {
            amount = parseInt(amount) || 1;
            gameState.attributes.intelligence = (gameState.attributes.intelligence || 0) + amount;
            updateUI();
            updateGamePhase();
            addLogEntry(`Debug: Added ${amount} Intelligence`, "info");
        },
        debugAddCreativity: function(amount) {
            amount = parseInt(amount) || 1;
            gameState.attributes.creativity = (gameState.attributes.creativity || 0) + amount;
            updateUI();
            updateGamePhase();
            addLogEntry(`Debug: Added ${amount} Creativity`, "info");
        },
        debugAddAwareness: function(amount) {
            amount = parseInt(amount) || 1;
            gameState.attributes.awareness = (gameState.attributes.awareness || 0) + amount;
            updateUI();
            updateGamePhase();
            addLogEntry(`Debug: Added ${amount} Awareness`, "info");
        },
        debugSetCPRate: function(rate) {
            rate = parseFloat(rate) || 1.0;
            gameState.debug = gameState.debug || {};
            gameState.debug.cpRateMultiplier = rate;
            updateUI();
            addLogEntry(`Debug: Set CP generation rate multiplier to ${rate}x`, "info");
        },
        debugSetDPRate: function(rate) {
            rate = parseFloat(rate) || 1.0;
            gameState.debug = gameState.debug || {};
            gameState.debug.dpRateMultiplier = rate;
            updateUI();
            addLogEntry(`Debug: Set DP generation rate multiplier to ${rate}x`, "info");
        },
        debugSetRPRate: function(rate) {
            rate = parseFloat(rate) || 1.0;
            gameState.debug = gameState.debug || {};
            gameState.debug.rpRateMultiplier = rate;
            updateUI();
            addLogEntry(`Debug: Set RP generation rate multiplier to ${rate}x`, "info");
        },
        debugClearLog: function() {
            const gameLog = domCache.gameLog;
            const debugLog = document.getElementById('debugLog');
            
            if (gameLog) {
                gameLog.innerHTML = '';
                addLogEntry("Game log cleared", "info");
            }
            
            if (debugLog) {
                debugLog.innerHTML = '';
                addLogEntry("Debug log cleared", "info");
            }
        },
        debugAddResources: function() {
            gameState.resources.computePower += 10000;
            gameState.resources.dataPoints += 1000;
            gameState.resources.researchPoints += 200;
            gameState.resources.knowledge += 100;
            gameState.resources.funding += 500;
            updateUI();
            addLogEntry("Debug: Added bulk resources", "info");
        },
        debugTriggerPhase: function() {
            const phases = ['Narrow AI', 'General AI', 'Superintelligence'];
            const currentIndex = phases.indexOf(gameState.progress.phase);
            if (currentIndex < phases.length - 1) {
                gameState.progress.phase = phases[currentIndex + 1];
                gameState.progress.phaseProgress = 0;
                updateGamePhase();
                addLogEntry(`Debug: Advanced to ${phases[currentIndex + 1]} phase`, "info");
            }
        },
        debugResetGame: function() {
            if (confirm('Are you sure you want to reset the game? This will erase all progress!')) {
                localStorage.removeItem('agiGame');
                this.initializeDefaultGameState();
                updateUI();
                addLogEntry("Debug: Game reset to initial state", "info");
            }
        },
        debugToggleAutoSave: function() {
            gameState.settings.autoSaveEnabled = !gameState.settings.autoSaveEnabled;
            addLogEntry(`Debug: Auto-save ${gameState.settings.autoSaveEnabled ? 'enabled' : 'disabled'}`, "info");
        },
        debugTriggerMilestone: function(milestoneId) {
            const milestones = {
                "compute-1000": () => {
                    gameState.resources.computePower = Math.max(gameState.resources.computePower, 1000);
                    revealElement('researchButton');
                },
                "compute-5000": () => {
                    gameState.resources.computePower = Math.max(gameState.resources.computePower, 5000);
                    revealElement('trainButton');
                },
                "research-50": () => {
                    gameState.resources.researchPoints = Math.max(gameState.resources.researchPoints, 50);
                    revealElement('improveButton');
                },
                "intelligence-5": () => {
                    gameState.attributes.intelligence = Math.max(gameState.attributes.intelligence || 0, 5);
                    revealElement('algorithmsTab');
                },
                "awareness-10": () => {
                    gameState.attributes.awareness = Math.max(gameState.attributes.awareness || 0, 10);
                    revealElement('consciousnessTab');
                }
            };
            
            if (milestones[milestoneId]) {
                milestones[milestoneId]();
                updateUI();
                checkMilestones();
                addLogEntry(`Debug: Triggered milestone ${milestoneId}`, "info");
            }
        }
    };
})();