/**
 * Improved Debug Panel for AGI: The Path to AGI
 * Enhances the debug experience with draggable, collapsible, and minimizable interface
 */

// Create namespace for Debug Panel functionality
window.AGIDebug = (function() {
    // State variables
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let sectionStates = {}; // Tracks collapsed state of sections
    let isMinimized = false;
    
    // Initialize the debug panel
    function init() {
        console.log("Initializing enhanced debug panel");
        
        // Create new panel structure if it doesn't exist yet
        createDebugPanelStructure();
        
        // Set up event listeners
        setupEventListeners();
        
        // Register with main game if available
        if (window.AGI && typeof window.AGI.registerDebugPanel === 'function') {
            window.AGI.registerDebugPanel(updateDebugPanel);
        } else {
            console.log("AGI object not available yet, debug panel will use polling");
            // Fallback: poll for changes
            setInterval(updateDebugPanelIfVisible, 1000);
        }
        
        console.log("Debug panel initialization complete");
    }
    
    // Create the debug panel structure
    function createDebugPanelStructure() {
        // Check if panel already exists
        let existingPanel = document.getElementById('debugPanel');
        
        if (existingPanel) {
            // If panel exists but hasn't been enhanced, enhance it
            if (!existingPanel.querySelector('.debug-header')) {
                enhanceExistingPanel(existingPanel);
            }
            return;
        }
        
        // Create new panel from scratch
        const panel = document.createElement('div');
        panel.id = 'debugPanel';
        panel.className = 'debug-panel';
        
        // Add panel structure
        panel.innerHTML = `
            <div class="debug-header">
                <h3>Debug Panel</h3>
                <div class="debug-controls">
                    <button class="debug-button" id="debugMinimizeButton" title="Minimize">-</button>
                    <button class="debug-button" id="debugCloseButton" title="Close">×</button>
                </div>
            </div>
            <div class="debug-content">
                <!-- Resource Controls Section -->
                <div class="debug-section" id="resourceControlsSection">
                    <div class="section-header">
                        <h4>Resource Controls</h4>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="section-content">
                        <div class="debug-resource-grid">
                            <div class="debug-resource-control">
                                <label>Compute Power:</label>
                                <input type="number" id="debugCPAmount" value="100" min="1" max="10000">
                                <button class="debug-button" onclick="AGI.debugAddComputePower(document.getElementById('debugCPAmount').value)">Add CP</button>
                            </div>
                            <div class="debug-resource-control">
                                <label>Data Points:</label>
                                <input type="number" id="debugDPAmount" value="50" min="1" max="5000">
                                <button class="debug-button" onclick="AGI.debugAddDataPoints(document.getElementById('debugDPAmount').value)">Add DP</button>
                            </div>
                            <div class="debug-resource-control">
                                <label>Research Points:</label>
                                <input type="number" id="debugRPAmount" value="20" min="1" max="1000">
                                <button class="debug-button" onclick="AGI.debugAddResearchPoints(document.getElementById('debugRPAmount').value)">Add RP</button>
                            </div>
                            <div class="debug-resource-control">
                                <label>Knowledge:</label>
                                <input type="number" id="debugKnowledgeAmount" value="10" min="1" max="1000">
                                <button class="debug-button" onclick="AGI.debugAddKnowledge(document.getElementById('debugKnowledgeAmount').value)">Add Knowledge</button>
                            </div>
                            <div class="debug-resource-control">
                                <label>Funding:</label>
                                <input type="number" id="debugFundingAmount" value="50" min="1" max="1000">
                                <button class="debug-button" onclick="AGI.debugAddFunding(document.getElementById('debugFundingAmount').value)">Add Funding</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Attribute Controls Section -->
                <div class="debug-section" id="attributeControlsSection">
                    <div class="section-header">
                        <h4>Attribute Controls</h4>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="section-content">
                        <div class="debug-resource-grid">
                            <div class="debug-resource-control">
                                <label>Intelligence:</label>
                                <input type="number" id="debugIntelligenceAmount" value="1" min="1" max="20">
                                <button class="debug-button" onclick="AGI.debugAddIntelligence(document.getElementById('debugIntelligenceAmount').value)">Add Int</button>
                            </div>
                            <div class="debug-resource-control">
                                <label>Creativity:</label>
                                <input type="number" id="debugCreativityAmount" value="1" min="1" max="20">
                                <button class="debug-button" onclick="AGI.debugAddCreativity(document.getElementById('debugCreativityAmount').value)">Add Cre</button>
                            </div>
                            <div class="debug-resource-control">
                                <label>Awareness:</label>
                                <input type="number" id="debugAwarenessAmount" value="1" min="1" max="20">
                                <button class="debug-button" onclick="AGI.debugAddAwareness(document.getElementById('debugAwarenessAmount').value)">Add Awa</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Rate Multipliers Section -->
                <div class="debug-section" id="rateMultipliersSection">
                    <div class="section-header">
                        <h4>Resource Rate Multipliers</h4>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="section-content">
                        <div class="debug-resource-grid">
                            <div class="debug-resource-control">
                                <label>CP Rate Multiplier:</label>
                                <input type="number" id="debugCPRateMultiplier" value="1" min="0.1" max="100" step="0.1">
                                <button class="debug-button" onclick="AGI.debugSetCPRate(document.getElementById('debugCPRateMultiplier').value)">Set CP Rate</button>
                            </div>
                            <div class="debug-resource-control">
                                <label>DP Rate Multiplier:</label>
                                <input type="number" id="debugDPRateMultiplier" value="1" min="0.1" max="100" step="0.1">
                                <button class="debug-button" onclick="AGI.debugSetDPRate(document.getElementById('debugDPRateMultiplier').value)">Set DP Rate</button>
                            </div>
                            <div class="debug-resource-control">
                                <label>RP Rate Multiplier:</label>
                                <input type="number" id="debugRPRateMultiplier" value="1" min="0.1" max="100" step="0.1">
                                <button class="debug-button" onclick="AGI.debugSetRPRate(document.getElementById('debugRPRateMultiplier').value)">Set RP Rate</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Milestone Triggers Section -->
                <div class="debug-section" id="milestoneTriggersSection">
                    <div class="section-header">
                        <h4>Milestone Triggers</h4>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="section-content">
                        <select id="debugMilestoneSelect" class="debug-select">
                            <option value="compute-1000">Unlock Research (1000 CP)</option>
                            <option value="compute-5000">Unlock Training (5000 CP)</option>
                            <option value="research-50">Unlock Self-Improvement (50 RP)</option>
                            <option value="intelligence-5">Unlock Algorithms Tab (Intelligence 5)</option>
                            <option value="awareness-10">Unlock Consciousness Tab (Awareness 10)</option>
                            <option value="progress-narrow-to-general">Phase: Narrow AI → General AI</option>
                            <option value="progress-general-to-superintelligence">Phase: General AI → Superintelligence</option>
                        </select>
                        <button class="debug-button" onclick="AGI.debugTriggerMilestone(document.getElementById('debugMilestoneSelect').value)">Trigger Milestone</button>
                    </div>
                </div>
                
                <!-- Game Controls Section -->
                <div class="debug-section" id="gameControlsSection">
                    <div class="section-header">
                        <h4>Game Controls</h4>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="section-content">
                        <div class="game-controls-grid">
                            <button class="debug-button" id="debugAddResourcesButton" onclick="AGI.debugAddResources()">Add Resources</button>
                            <button class="debug-button" id="debugTriggerPhaseButton" onclick="AGI.debugTriggerPhase()">Next Phase</button>
                            <button class="debug-button" id="debugSaveGameButton" onclick="AGI.saveGame()">Save Game</button>
                            <button class="debug-button" id="debugLoadGameButton" onclick="AGI.loadGame()">Load Game</button>
                            <button class="debug-button destructive" id="debugResetGameButton" onclick="AGI.debugResetGame()">Reset Game</button>
                            <button class="debug-button" id="debugToggleAutoSaveButton" onclick="AGI.debugToggleAutoSave()">Toggle Auto-Save</button>
                        </div>
                    </div>
                </div>
                
                <!-- Game State Section -->
                <div class="debug-section" id="gameStateSection">
                    <div class="section-header">
                        <h4>Game State</h4>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="section-content">
                        <pre id="debugGameState"></pre>
                    </div>
                </div>
                
                <!-- Debug Log Section -->
                <div class="debug-section" id="debugLogSection">
                    <div class="section-header">
                        <h4>Debug Log</h4>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="section-content">
                        <button class="debug-button" id="debugClearLogButton" onclick="AGI.debugClearLog()">Clear Log</button>
                        <div class="debug-log" id="debugLog"></div>
                    </div>
                </div>
            </div>
        `;
        
        // Add to document body
        document.body.appendChild(panel);
        
        // Create toggle button if it doesn't exist
        if (!document.getElementById('debugToggleButton')) {
            const toggleButton = document.createElement('button');
            toggleButton.id = 'debugToggleButton';
            toggleButton.textContent = 'Debug';
            toggleButton.onclick = toggleDebugPanel;
            document.body.appendChild(toggleButton);
        }
    }
    
    // Enhance an existing debug panel
    function enhanceExistingPanel(panel) {
        // Save original content
        const originalContent = panel.innerHTML;
        
        // Clear panel
        panel.innerHTML = '';
        
        // Add new structure
        const header = document.createElement('div');
        header.className = 'debug-header';
        header.innerHTML = `
            <h3>Debug Panel</h3>
            <div class="debug-controls">
                <button class="debug-button" id="debugMinimizeButton" title="Minimize">-</button>
                <button class="debug-button" id="debugCloseButton" title="Close">×</button>
            </div>
        `;
        
        const content = document.createElement('div');
        content.className = 'debug-content';
        
        // Create sections from the original content
        // This is a simplified approach - in reality, you might want more complex logic
        // to properly structure the existing content
        
        const resourceSection = createSection('Resource Controls', 'resourceControlsSection');
        const attributeSection = createSection('Attribute Controls', 'attributeControlsSection');
        const rateSection = createSection('Resource Rate Multipliers', 'rateMultipliersSection');
        const milestoneSection = createSection('Milestone Triggers', 'milestoneTriggersSection');
        const gameControlsSection = createSection('Game Controls', 'gameControlsSection');
        const gameStateSection = createSection('Game State', 'gameStateSection');
        const debugLogSection = createSection('Debug Log', 'debugLogSection');
        
        // Try to extract content for each section
        // This is simplified - you would need more robust parsing in a real implementation
        
        // Add original content temporarily to parse it
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = originalContent;
        
        // Function to extract content by heading or id
        function extractContent(headingText, fallbackId) {
            const heading = Array.from(tempDiv.querySelectorAll('h4')).find(h => h.textContent.includes(headingText));
            if (heading) {
                let content = '';
                let current = heading.nextElementSibling;
                while (current && current.tagName !== 'H4') {
                    content += current.outerHTML;
                    current = current.nextElementSibling;
                }
                return content;
            }
            
            // Fallback to ID
            const element = tempDiv.querySelector(`#${fallbackId}`);
            return element ? element.outerHTML : '';
        }
        
        // Extract resource controls
        resourceSection.querySelector('.section-content').innerHTML = extractContent('Resource Controls', 'debugResourceControls');
        
        // Extract attribute controls
        attributeSection.querySelector('.section-content').innerHTML = extractContent('Attribute Controls', 'debugAttributeControls');
        
        // Extract rate multipliers
        rateSection.querySelector('.section-content').innerHTML = extractContent('Resource Rate', 'debugRateMultipliers');
        
        // Extract milestone triggers
        milestoneSection.querySelector('.section-content').innerHTML = extractContent('Milestone', 'debugMilestoneSelect');
        
        // Extract game controls
        gameControlsSection.querySelector('.section-content').innerHTML = extractContent('Game Controls', 'debugGameControls');
        
        // Extract game state
        gameStateSection.querySelector('.section-content').innerHTML = `<pre id="debugGameState">${
            tempDiv.querySelector('#debugGameState')?.innerHTML || ''}</pre>`;
        
        // Extract debug log
        debugLogSection.querySelector('.section-content').innerHTML = `
            <button class="debug-button" id="debugClearLogButton" onclick="AGI.debugClearLog()">Clear Log</button>
            <div class="debug-log" id="debugLog">${
                tempDiv.querySelector('#debugLog')?.innerHTML || ''}</div>
        `;
        
        // Add sections to content
        content.appendChild(resourceSection);
        content.appendChild(attributeSection);
        content.appendChild(rateSection);
        content.appendChild(milestoneSection);
        content.appendChild(gameControlsSection);
        content.appendChild(gameStateSection);
        content.appendChild(debugLogSection);
        
        // Add header and content to panel
        panel.appendChild(header);
        panel.appendChild(content);
    }
    
    // Helper to create a section
    function createSection(title, id) {
        const section = document.createElement('div');
        section.className = 'debug-section';
        section.id = id;
        
        section.innerHTML = `
            <div class="section-header">
                <h4>${title}</h4>
                <span class="toggle-icon">▼</span>
            </div>
            <div class="section-content"></div>
        `;
        
        return section;
    }
    
    // Set up event listeners
    function setupEventListeners() {
        const panel = document.getElementById('debugPanel');
        if (!panel) return;
        
        // Drag functionality
        const header = panel.querySelector('.debug-header');
        if (header) {
            header.addEventListener('mousedown', startDragging);
        }
        
        // Close button
        const closeBtn = document.getElementById('debugCloseButton');
        if (closeBtn) {
            closeBtn.addEventListener('click', hideDebugPanel);
        }
        
        // Minimize button
        const minimizeBtn = document.getElementById('debugMinimizeButton');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', toggleMinimize);
        }
        
        // Section toggles
        const sectionHeaders = panel.querySelectorAll('.section-header');
        sectionHeaders.forEach(header => {
            header.addEventListener('click', toggleSection);
        });
        
        // Global mouse events for dragging
        document.addEventListener('mousemove', dragPanel);
        document.addEventListener('mouseup', stopDragging);
        
        // Prevent text selection during drag
        header.addEventListener('selectstart', e => e.preventDefault());
    }
    
    // Toggle debug panel visibility
    function toggleDebugPanel() {
        const panel = document.getElementById('debugPanel');
        if (!panel) return;
        
        panel.classList.toggle('visible');
        
        // Update content if panel is now visible
        if (panel.classList.contains('visible')) {
            updateDebugPanel();
        }
    }
    
    // Hide debug panel
    function hideDebugPanel() {
        const panel = document.getElementById('debugPanel');
        if (panel) {
            panel.classList.remove('visible');
        }
    }
    
    // Toggle minimize state
    function toggleMinimize() {
        const panel = document.getElementById('debugPanel');
        if (!panel) return;
        
        isMinimized = !isMinimized;
        panel.classList.toggle('minimized', isMinimized);
        
        const minimizeBtn = document.getElementById('debugMinimizeButton');
        if (minimizeBtn) {
            minimizeBtn.textContent = isMinimized ? '+' : '-';
        }
    }
    
    // Toggle section collapse
    function toggleSection(e) {
        const header = e.currentTarget;
        const section = header.parentElement;
        const content = section.querySelector('.section-content');
        const icon = header.querySelector('.toggle-icon');
        
        if (!content || !icon) return;
        
        const sectionId = section.id;
        const isCollapsed = content.classList.toggle('collapsed');
        sectionStates[sectionId] = isCollapsed;
        
        icon.classList.toggle('collapsed', isCollapsed);
        
        // Prevent event bubbling
        e.stopPropagation();
    }
    
    // Start dragging the panel
    function startDragging(e) {
        // Only initiate drag on header, not buttons
        if (e.target.tagName === 'BUTTON') return;
        
        const panel = document.getElementById('debugPanel');
        if (!panel) return;
        
        isDragging = true;
        
        const rect = panel.getBoundingClientRect();
        dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        
        // Add a class for dragging state
        panel.classList.add('dragging');
        
        // Prevent default text selection
        e.preventDefault();
    }
    
    // Drag panel
    function dragPanel(e) {
        if (!isDragging) return;
        
        const panel = document.getElementById('debugPanel');
        if (!panel) return;
        
        // Calculate new position
        const left = e.clientX - dragOffset.x;
        const top = e.clientY - dragOffset.y;
        
        // Boundary checking to keep panel within viewport
        const maxX = window.innerWidth - panel.offsetWidth;
        const maxY = window.innerHeight - panel.offsetHeight;
        
        const boundedLeft = Math.max(0, Math.min(left, maxX));
        const boundedTop = Math.max(0, Math.min(top, maxY));
        
        // Apply new position
        panel.style.left = boundedLeft + 'px';
        panel.style.top = boundedTop + 'px';
        
        // Remove default positioning to allow manual positioning
        panel.style.right = 'auto';
    }
    
    // Stop dragging
    function stopDragging() {
        if (!isDragging) return;
        
        const panel = document.getElementById('debugPanel');
        if (panel) {
            panel.classList.remove('dragging');
        }
        
        isDragging = false;
    }
    
    // Update debug panel content if it's visible
    function updateDebugPanelIfVisible() {
        const panel = document.getElementById('debugPanel');
        if (panel && panel.classList.contains('visible')) {
            updateDebugPanel();
        }
    }
    
    // Update debug panel content
    function updateDebugPanel() {
        const gameStateElement = document.getElementById('debugGameState');
        
        if (!gameStateElement) return;
        
        // Check if AGI state is available
        if (window.AGI && window.AGI.gameState) {
            try {
                // Create a simplified version of the game state for display
                const stateDisplay = {
                    resources: {...window.AGI.gameState.resources},
                    attributes: {...window.AGI.gameState.attributes},
                    rates: {
                        cpRate: window.AGI.calculateCPRate ? window.AGI.calculateCPRate().toFixed(2) : "N/A",
                        dpPerCollection: window.AGI.gameState.features?.dataPointsPerCollection || 1,
                        rpPerResearch: window.AGI.gameState.features?.researchPointsPerResearch || 1
                    },
                    progress: {...window.AGI.gameState.progress},
                    phase: window.AGI.gameState.progress?.phase || "Narrow AI",
                    phaseProgress: (window.AGI.gameState.progress?.phaseProgress || 0) + '%'
                };
                
                // Add debug multipliers if they exist
                if (window.AGI.gameState.debug) {
                    stateDisplay.debug = window.AGI.gameState.debug;
                }
                
                // Format and display game state
                gameStateElement.textContent = JSON.stringify(stateDisplay, null, 2);
            } catch (error) {
                console.error("Error updating debug panel:", error);
                gameStateElement.textContent = "Error retrieving game state: " + error.message;
            }
        } else {
            gameStateElement.textContent = "Game state not available";
        }
        
        // Apply saved section states
        for (const [sectionId, isCollapsed] of Object.entries(sectionStates)) {
            const section = document.getElementById(sectionId);
            if (section) {
                const content = section.querySelector('.section-content');
                const icon = section.querySelector('.toggle-icon');
                
                if (content && icon) {
                    content.classList.toggle('collapsed', isCollapsed);
                    icon.classList.toggle('collapsed', isCollapsed);
                }
            }
        }
    }
    
    // Restore debug panel position from local storage
    function restoreDebugPanelPosition() {
        try {
            const savedPosition = localStorage.getItem('debugPanelPosition');
            if (savedPosition) {
                const position = JSON.parse(savedPosition);
                const panel = document.getElementById('debugPanel');
                
                if (panel && position.left !== undefined && position.top !== undefined) {
                    panel.style.left = position.left + 'px';
                    panel.style.top = position.top + 'px';
                    panel.style.right = 'auto';
                }
            }
        } catch (error) {
            console.error("Error restoring debug panel position:", error);
        }
    }
    
    // Save debug panel position to local storage
    function saveDebugPanelPosition() {
        try {
            const panel = document.getElementById('debugPanel');
            if (panel) {
                const rect = panel.getBoundingClientRect();
                const position = {
                    left: rect.left,
                    top: rect.top
                };
                
                localStorage.setItem('debugPanelPosition', JSON.stringify(position));
            }
        } catch (error) {
            console.error("Error saving debug panel position:", error);
        }
    }
    
    // Add log entry to debug log
    function addLogEntry(message, type = "info") {
        const debugLog = document.getElementById('debugLog');
        if (!debugLog) return;
        
        const entry = document.createElement('div');
        entry.className = `debug-log-entry debug-${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        
        // Add to top for better visibility
        debugLog.insertBefore(entry, debugLog.firstChild);
        
        // Limit number of entries
        while (debugLog.children.length > 50) {
            debugLog.removeChild(debugLog.lastChild);
        }
    }
    
    // Public API
    return {
        init: init,
        toggleDebugPanel: toggleDebugPanel,
        updateDebugPanel: updateDebugPanel,
        addLogEntry: addLogEntry
    };
})();

// Initialize debug panel when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Small delay to ensure the page is fully loaded
    setTimeout(function() {
        AGIDebug.init();
    }, 500);
});

// If DOMContentLoaded has already fired, initialize immediately
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(function() {
        AGIDebug.init();
    }, 100);
}