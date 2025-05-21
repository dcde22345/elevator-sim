/**
 * Floor flow matrix utilities
 */
namespace FloorFlowMatrix {
    /**
     * Create a test floor flow matrix with higher traffic patterns for testing
     * @param numFloors Number of floors in the building
     * @returns A matrix representing traffic flow between floors
     */
    function testFloorFlowMatrix(numFloors: number): number[][] {
        // 創建矩陣，使用索引0到numFloors-1
        const matrix: number[][] = [];
        
        for (let i = 0; i < numFloors; i++) {
            matrix[i] = [];
            for (let j = 0; j < numFloors; j++) {
                if (i !== j) {
                    matrix[i][j] = 10; // Default value
                } else {
                    matrix[i][j] = 0;  // 不會從一層到同一層
                }
            }
        }
        
        // Morning rush hour - heavy traffic from lobby (first floor, index 0) to office floors
        // Simulates people coming to work
        for (let dest = 1; dest < numFloors; dest++) {
            matrix[0][dest] = 50;
        }
        
        // Evening rush hour - heavy traffic from office floors to lobby
        // Simulates people going home
        for (let source = 1; source < numFloors; source++) {
            matrix[source][0] = 40;
        }
        
        // Lunch time traffic between office floors
        if (numFloors >= 5) {
            // Assuming floor 3 has cafeteria (index 2)
            for (let floor = 1; floor < numFloors; floor++) {
                if (floor !== 2) {
                    matrix[floor][2] = 30; // People going to lunch
                    matrix[2][floor] = 30; // People returning from lunch
                }
            }
        }
        
        return matrix;
    }

    /**
     * Generates a random floor flow matrix with realistic traffic patterns
     * @param numFloors Number of floors in the building
     * @param maxFlowValue Maximum value for flow weights (default: 10)
     * @param lobbyFactor Factor to increase lobby traffic (default: 2.5)
     * @returns A randomly generated flow matrix
     */
    function getRandomFloorFlow(numFloors: number, maxFlowValue: number = 10, lobbyFactor: number = 2.5, p?: any): number[][] {
        // If p5 instance not provided, use Math.random
        const random = p ? ((max) => p.random(max)) : ((max) => Math.random() * max);
        
        // 創建矩陣，使用索引0到numFloors-1
        const matrix: number[][] = [];
        
        // 初始化矩陣結構
        for (let i = 0; i < numFloors; i++) {
            matrix[i] = [];
            for (let j = 0; j < numFloors; j++) {
                matrix[i][j] = 0;  // 初始化為0
            }
        }
        
        // Generate random flow values between floors
        for (let i = 0; i < numFloors; i++) {
            for (let j = 0; j < numFloors; j++) {
                if (i !== j) {
                    // Base random value between 1 and maxFlowValue
                    let flowValue = Math.ceil(random(maxFlowValue));
                    
                    // Increase traffic to/from lobby (first floor, index 0)
                    if (i === 0 || j === 0) {
                        flowValue = Math.ceil(flowValue * lobbyFactor);
                    }
                    
                    // Create some popular floors (cafeteria, meeting rooms, etc.)
                    if (numFloors >= 5) {
                        // Example: make floor 3 a popular destination (cafeteria, index 2)
                        if (j === 2 && i !== 0) {
                            flowValue = Math.ceil(flowValue * 1.5);
                        }
                        
                        // Example: make floor 2 have high outbound traffic (meeting rooms, index 1)
                        if (i === 1 && j !== 0) {
                            flowValue = Math.ceil(flowValue * 1.3);
                        }
                        
                        // Example: create executive floors with less traffic
                        if (i >= numFloors - 2 && j >= numFloors - 2 && i !== j) {
                            flowValue = Math.max(1, Math.floor(flowValue * 0.6));
                        }
                    }
                    
                    // Ensure value is at least 1
                    matrix[i][j] = Math.max(1, flowValue);
                }
            }
        }
        
        // Add some randomness to total traffic patterns
        // Some floors might have higher inbound/outbound traffic in general
        const floorTrafficFactors: number[] = [];
        for (let i = 0; i < numFloors; i++) {
            // Random factor between 0.7 and 1.3
            floorTrafficFactors[i] = 0.7 + random(0.6);
        }
        
        // Apply the random factors to adjust traffic
        for (let i = 0; i < numFloors; i++) {
            for (let j = 0; j < numFloors; j++) {
                if (i !== j) {
                    // Mix of source and destination floor factors
                    const factor = (floorTrafficFactors[i] + floorTrafficFactors[j]) / 2;
                    matrix[i][j] = Math.max(1, Math.ceil(matrix[i][j] * factor));
                }
            }
        }
        
        return matrix;
    }
    
    // Expose functions to global scope
    window.testFloorFlowMatrix = testFloorFlowMatrix;
    window.getRandomFloorFlow = getRandomFloorFlow;
} 