/** Manages riders, and calls elevators for them. */
class Dispatcher {
    private readonly p: any;
    private readonly settings: any;
    private readonly cars: any;
    private readonly stats: any;
    private readonly talker: any;
    private carCallQueue: any[];
    private riders: any[];
    private numActiveCarsInCache: number;
    private cachedActiveCars: any[];
    private floorFlow: number[][]; // Matrix to track passenger flow between floors

    constructor(p, settings, cars, stats, talker) {
        this.p = p;
        this.settings = settings;
        this.cars = cars;
        this.stats = stats;
        this.talker = talker;

        this.carCallQueue = [];
        this.riders = [];
        
        // Initialize floor flow matrix
        this.initFloorFlow();
    }

    // Initialize the floor flow matrix based on settings
    private initFloorFlow() {
        const numFloors = this.settings.numFloors;
        this.floorFlow = Array(numFloors + 1).fill(0).map(() => Array(numFloors + 1).fill(0));
        
        // Set up default flow patterns - this could be parameterized via settings
        // Higher values for common patterns (e.g., to/from lobby)
        for (let i = 1; i <= numFloors; i++) {
            for (let j = 1; j <= numFloors; j++) {
                if (i !== j) {
                    // Default flow between any two different floors
                    this.floorFlow[i][j] = 1;

                    // Higher traffic to/from lobby (floor 1)
                    if (i === 1 || j === 1) {
                        this.floorFlow[i][j] = 3;
                    }
                }
            }
        }
    }

    /**
     * Set the flow between floors
     * @param fromFloor Source floor
     * @param toFloor Destination floor
     * @param value Flow value (higher means more traffic)
     */
    setFloorFlow(fromFloor: number, toFloor: number, value: number) {
        if (fromFloor >= 1 && fromFloor <= this.settings.numFloors &&
            toFloor >= 1 && toFloor <= this.settings.numFloors &&
            fromFloor !== toFloor) {
            this.floorFlow[fromFloor][toFloor] = value;
        }
    }

    /**
     * Set the complete floor flow matrix
     * @param flowMatrix A 2D array representing the flow between floors
     */
    setFloorFlowMatrix(flowMatrix: number[][]) {
        const numFloors = this.settings.numFloors;
        
        // Validate input matrix dimensions
        if (flowMatrix.length !== numFloors + 1) {
            console.error("Invalid flow matrix dimensions");
            return;
        }
        
        for (let i = 1; i <= numFloors; i++) {
            if (!flowMatrix[i] || flowMatrix[i].length !== numFloors + 1) {
                console.error("Invalid flow matrix dimensions at row", i);
                return;
            }
            
            // Copy valid values
            for (let j = 1; j <= numFloors; j++) {
                if (i !== j) {
                    this.floorFlow[i][j] = flowMatrix[i][j];
                }
            }
        }
    }

    /**
     * Get the current floor flow matrix
     * @returns The current floor flow matrix
     */
    getFloorFlowMatrix(): number[][] {
        return this.floorFlow;
    }

    requestCar(floor, goingUp) {
        if (! this.carCallQueue.find(request => request.floor === floor && request.goingUp === goingUp)) {
            this.carCallQueue.push({floor: floor, goingUp: goingUp});
        }
    }

    process() {
        this.processRiders();

        if (this.settings.controlMode === 0 /* Auto */) {
            const request = this.carCallQueue.shift();

            if (request) {
                const floorY = this.p.yFromFloor(request.floor);
                const activeCars = this.activeCars();
                const idleCars = activeCars.filter(car => car.state === CarState.Idle && car.goingUp === request.goingUp);
                const dist = car => Math.abs(car.y - floorY);
                const closest = cars => cars.reduce((a, b) => a && b ? dist(a) > dist(b) ? b : a : b, undefined);
                const closestIdleActiveCar = closest(idleCars);
                if (closestIdleActiveCar) {
                    closestIdleActiveCar.goTo(request.floor);
                } else {
                    const closestActiveCar = closest(activeCars);
                    if (closestActiveCar)
                        closestActiveCar.goTo(request.floor);
                    else this.carCallQueue.push(request);
                }
            }
        }
    }

    /** Returns an array of active cars, selected from the middle of the group, moving outward */
    activeCars() {
        if (this.settings.numActiveCars !== this.numActiveCarsInCache) {
            const carIndexes = [...Array(this.settings.numCars).keys()];
            const middleIndex = carIndexes[Math.floor(carIndexes.length / 2)];
            const distFromMiddle = i => Math.abs(i - middleIndex);
            carIndexes.sort((a, b) => distFromMiddle(a) - distFromMiddle(b));
            const activeCarIndexes = carIndexes.slice(0, this.settings.numActiveCars);
            this.cachedActiveCars = Array.from(activeCarIndexes, i => this.cars[i]);
            this.numActiveCarsInCache = this.settings.numActiveCars;
        }
        return this.cachedActiveCars;
    }

    isActive(car) {
        return this.activeCars().find(c => c === car) !== undefined;
    }

    updateCarActiveStatuses() {
        this.cars.forEach(car => car.active = this.isActive(car))
    }

    processRiders() {
        this.riders.forEach(rider => {
            rider.update();
            rider.draw();
        });

        this.riders = this.riders.filter(rider => rider.state !== RiderState.Exited);
        this.possiblySpawnNewRider();
    }

    // Helper function for Poisson distribution
    private poissonRandom(lambda: number): number {
        let L = Math.exp(-lambda);
        let k = 0;
        let p = 1;
        
        do {
            k++;
            p *= Math.random();
        } while (p > L);
        
        return k - 1;
    }

    possiblySpawnNewRider() {
        const p = this.p;
        const numFloors = this.settings.numFloors;
        const load = this.settings.passengerLoad;
        
        // Calculate arrival rate based on passenger load setting
        const arrivalRate = load === 0 ? 
            p.map(p.sin(p.millis() / 1e5), -1, 1, 0.1, 0.5) : 
            Math.pow(2, load - 1) * 0.1;
            
        // Calculate total flow for each source floor
        const totalFlowByFloor = Array(numFloors + 1).fill(0);
        for (let i = 1; i <= numFloors; i++) {
            for (let j = 1; j <= numFloors; j++) {
                if (i !== j) {
                    totalFlowByFloor[i] += this.floorFlow[i][j];
                }
            }
        }
        
        // Total flow across all floors
        const totalFlow = totalFlowByFloor.reduce((sum, flow) => sum + flow, 0);
        
        // Special handling for lobby (floor 1)
        if (p.random(1) < arrivalRate / p.frameRate()) {
            // Generate passengers from the lobby using a Poisson-like approach
            const numPassengers = this.poissonRandom(1) + 1; // At least 1 passenger
            
            for (let i = 0; i < numPassengers; i++) {
                // Select a destination floor from the lobby
                let destFloor = this.selectDestinationFloor(1);
                this.riders.push(new Rider(p, this.settings, 1, destFloor, this, this.stats, this.talker));
            }
        }
        
        // For other floors, probability based on flow proportion
        for (let i = 2; i <= numFloors; i++) {
            const floorSpawnProbability = (totalFlowByFloor[i] / totalFlow) * arrivalRate / p.frameRate();
            if (p.random(1) < floorSpawnProbability) {
                let destFloor = this.selectDestinationFloor(i);
                this.riders.push(new Rider(p, this.settings, i, destFloor, this, this.stats, this.talker));
            }
        }
    }
    
    // Select a destination floor based on the flow matrix probabilities
    private selectDestinationFloor(sourceFloor: number): number {
        const p = this.p;
        const numFloors = this.settings.numFloors;
        
        // Calculate total flow from this source floor
        let totalFlowFromSource = 0;
        for (let j = 1; j <= numFloors; j++) {
            if (sourceFloor !== j) {
                totalFlowFromSource += this.floorFlow[sourceFloor][j];
            }
        }
        
        // Select a destination based on flow proportions
        let rand = p.random(totalFlowFromSource);
        let cumulative = 0;
        
        for (let j = 1; j <= numFloors; j++) {
            if (sourceFloor !== j) {
                cumulative += this.floorFlow[sourceFloor][j];
                if (rand < cumulative) {
                    return j;
                }
            }
        }
        
        // Fallback - pick a random floor different from source
        let destFloor = sourceFloor;
        while (destFloor === sourceFloor) {
            destFloor = Math.floor(p.random(numFloors)) + 1;
        }
        return destFloor;
    }
}
