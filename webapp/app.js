class Building {
    constructor(settings, cars) {
        this.settings = settings;
        this.cars = cars;
    }
    drawFloors(p) {
        p.noStroke();
        p.fill(0, 0, 100, 20);
        for (let floor = 1; floor <= this.settings.numFloors; ++floor) {
            const floorY = p.yFromFloor(floor);
            p.pushed(() => {
                const floorHeight = 4;
                p.translate(p.width / 2, floorY - floorHeight / 2, floor === 1 ? -this.settings.geom.floorDepthOthers / 2 : 0);
                p.box(p.width, floorHeight, floor === 1 ? this.settings.geom.floorDepthGround : this.settings.geom.floorDepthOthers);
            });
            this.cars.forEach(car => {
                p.pushed(() => {
                    const gc = this.settings.geom.car;
                    const indHeight = gc.y / 3;
                    p.translate(car.carCenterX(), floorY + gc.y + indHeight / 2, this.settings.geom.carCenterZ + gc.z / 2);
                    p.noStroke();
                    const carReady = floorY === car.y && (car.state === CarState.Opening || car.state === CarState.Open);
                    if (carReady) {
                        this.drawUpDownIndicator(p, indHeight, car.goingUp);
                    }
                });
            });
        }
    }
    drawUpDownIndicator(p, indHeight, goingUp) {
        p.stroke(125, 84);
        p.fill(255, 248);
        p.plane(14, indHeight);
        p.noStroke();
        p.fill('green');
        goingUp ?
            p.triangle(0, 5, -4, -4, 4, -4) :
            p.triangle(0, -4, -4, 5, 4, 5);
    }
}
var CarState;
(function (CarState) {
    CarState[CarState["Idle"] = 0] = "Idle";
    CarState[CarState["Moving"] = 1] = "Moving";
    CarState[CarState["Opening"] = 2] = "Opening";
    CarState[CarState["Open"] = 3] = "Open";
    CarState[CarState["Closing"] = 4] = "Closing";
})(CarState || (CarState = {}));
class Car {
    constructor(p, settings, stats, carNumber) {
        this.p = p;
        this.settings = settings;
        this.stats = stats;
        this.carNumber = carNumber;
        const gc = settings.geom.car;
        this.doorDims = p.createVector(gc.x / 4, gc.y, 5);
        const interCarSpacing = gc.x;
        this.carHorizontalSpacing = gc.x + interCarSpacing;
        const carsGroupWidth = settings.numCars * gc.x + (settings.numCars - 1) * interCarSpacing;
        const leftRightMargin = settings.geom.canvas.x - carsGroupWidth;
        this.carLeftMargin = leftRightMargin / 2;
        this.y = p.yFromFloor(1);
        this.goingUp = true;
        this.doorOpenFraction = 0; // 0…1 = closed…open
        this.destFloors = [];
        this.riders = [];
        this.pan = settings.numCars === 1 ? 0 : p.map(carNumber, 1, settings.numCars, -0.8, 0.8);
        this.sound = new MotorSound(this.pan);
        this.active = false;
        this.state = CarState.Idle;
    }
    draw() {
        this.drawRails();
        this.drawCablesAndCounterweight();
        this.drawCar();
    }
    drawRails() {
        const p = this.p;
        p.noStroke();
        p.fill(128, 16);
        const cd = this.settings.geom.car;
        const halfCarWidth = cd.x / 2;
        const halfCarDepth = cd.z / 2;
        [-halfCarWidth, halfCarWidth].forEach(xOff => {
            [-halfCarDepth, halfCarDepth].forEach(zOff => {
                p.pushed(() => {
                    p.translate(this.carCenterX() + xOff, p.height / 2, this.settings.geom.carCenterZ + zOff);
                    p.box(2, p.height, 1);
                });
            });
        });
    }
    drawCablesAndCounterweight() {
        const p = this.p;
        const geom = this.settings.geom;
        const cg = geom.car;
        const yCarTop = this.y + cg.y;
        const carToCwDist = cg.z * 0.8;
        const cWeightDepth = 5;
        const backOfCarZ = geom.carCenterZ - cg.z / 2;
        const cWeightZ = backOfCarZ - carToCwDist - cWeightDepth / 2;
        const cWeightY = p.height - this.y;
        const cWeightHeight = cg.y / 2;
        const inst = this;
        function drawCounterWeight() {
            p.stroke(220);
            p.noFill();
            p.pushed(() => {
                p.translate(inst.carCenterX(), cWeightY, cWeightZ);
                p.box(cg.x, cWeightHeight, cWeightDepth);
            });
        }
        drawCounterWeight();
        this.drawCables(p, cWeightY + cWeightHeight / 2, p.height, cWeightZ);
        this.drawCables(p, yCarTop, p.height, geom.carCenterZ);
    }
    drawCables(p, yBottom, yTop, cablesZ) {
        p.stroke(180, 32);
        p.noFill();
        const yMiddle = yBottom + (yTop - yBottom) / 2;
        [-3, 0, 3].forEach(xOff => {
            p.pushed(() => {
                p.translate(this.carCenterX() + xOff, yMiddle, cablesZ);
                p.box(1, yTop - yBottom, 1);
            });
        });
    }
    drawCar() {
        const p = this.p;
        p.stroke('silver');
        p.strokeWeight(2);
        p.fill(194, 255 * (this.active ? 0.6 : 0.3));
        p.pushed(() => {
            const gc = this.settings.geom.car;
            p.translate(this.carCenterX(), this.y + gc.y / 2, this.settings.geom.carCenterZ);
            p.box(gc.x, gc.y, gc.z);
            this.drawDoors();
        });
    }
    carCenterX() {
        return this.carLeftMargin + (this.carNumber - 1) * this.carHorizontalSpacing;
    }
    drawDoors() {
        const p = this.p;
        p.strokeWeight(1);
        p.fill(230, 255 * 0.5);
        p.pushed(() => {
            // Bring doors to front of car
            const gc = this.settings.geom.car;
            const dd = this.doorDims;
            p.translate(0, 0, gc.z / 2 - dd.z);
            const doorTravel = gc.x / 4;
            const xDoorDisplacement = gc.x / 8 + doorTravel * this.doorOpenFraction;
            [1, -1].forEach(sign => {
                p.pushed(() => {
                    p.translate(sign * xDoorDisplacement, 0, 0);
                    p.box(dd.x, dd.y, dd.z);
                });
            });
        });
    }
    update() {
        const p = this.p;
        switch (this.state) {
            case CarState.Idle:
                this.idle(p);
                break;
            case CarState.Moving:
                this.move(p);
                break;
            case CarState.Opening:
                this.doorOpenFraction = p.constrain((this.nowSecs() - this.doorOpStarted) / this.settings.doorMovementSecs, 0, 1);
                if (this.doorOpenFraction === 1) {
                    this.state = CarState.Open;
                    this.openSince = p.millis();
                }
                break;
            case CarState.Open:
                const timeToClose = this.openSince + this.settings.doorOpenMs;
                const timeToWait = timeToClose - p.millis();
                if (timeToWait <= 0) {
                    this.state = CarState.Closing;
                    this.doorOpStarted = this.nowSecs();
                }
                break;
            case CarState.Closing:
                this.doorOpenFraction = 1 - p.constrain((this.nowSecs() - this.doorOpStarted) / this.settings.doorMovementSecs, 0, 1);
                if (this.doorOpenFraction === 0) {
                    this.state = CarState.Idle;
                }
                break;
        }
    }
    nowSecs() {
        return this.p.millis() / 1000;
    }
    idle(p) {
        if (this.destFloors.length) {
            let nextDest = this.destFloors.find(f => this.goingUp ? p.yFromFloor(f) > this.y : p.yFromFloor(f) < this.y);
            if (!nextDest) {
                this.goingUp = !this.goingUp;
                this.sortDestinations();
                nextDest = this.destFloors[0];
            }
            this.stats.addMovementCosts(Math.abs(p.floorFromY(this.y) - nextDest), this.settings.elevSpeed);
            this.state = CarState.Moving;
            this.sound.osc.amp(p.map(this.settings.volume, 0, 10, 0, 0.6), 0.02);
            console.log(`Car ${this.carNumber} moving to ${nextDest} of ${this.destFloors}`);
            this.lastMoveTime = p.millis() / 1000;
            this.speed = 0;
            this.maxMaxSpeed = 1000;
            this.maxSpeed = p.map(this.settings.elevSpeed, 1, 10, 20, this.maxMaxSpeed);
            this.accel = this.maxSpeed * 2;
            this.startY = this.y;
            this.endY = p.yFromFloor(nextDest);
            this.absTrip = Math.abs(this.startY - this.endY);
            this.accelDistance = Math.min(this.absTrip / 2, (this.maxSpeed * this.maxSpeed) / (2 * this.accel));
        }
    }
    move(p) {
        const absTraveled = Math.abs(this.y - this.startY);
        const absTravelLeft = Math.abs(this.endY - this.y);
        const now = p.millis() / 1000;
        const ΔtSinceLastMove = now - this.lastMoveTime;
        this.lastMoveTime = now;
        if (this.accelerating()) {
            this.speed = Math.max(1, Math.sqrt(2 * this.accel * absTraveled));
        }
        else if (this.decelerating()) {
            this.speed = Math.sqrt(2 * this.accel * absTravelLeft);
        }
        this.sound.osc.freq(p.map(this.speed, 0, this.maxMaxSpeed, 40, 100));
        const ΔySinceLastMove = Math.min(absTravelLeft, this.speed * ΔtSinceLastMove);
        const direction = this.goingUp ? 1 : -1;
        this.y += direction * ΔySinceLastMove;
        const absTravelLeftAfterMove = Math.abs(this.endY - this.y);
        if (absTravelLeftAfterMove < 1) {
            this.y = this.endY;
            this.sound.osc.amp(0, 0.02);
            this.doorOpStarted = this.nowSecs();
            this.state = CarState.Opening;
            this.removeCurrentFloorFromDest();
            if (this.y === p.yFromFloor(1))
                this.goingUp = true;
            if (this.y === p.yFromFloor(this.settings.numFloors))
                this.goingUp = false;
            if (this.settings.volume > 0) {
                p.dingSound.pan(this.pan);
                p.dingSound.play();
            }
        }
    }
    addRider(rider) {
        this.riders.push(rider);
    }
    removeRider(rider) {
        this.riders = this.riders.filter(r => r !== rider);
    }
    hasRoom() {
        return this.riders.length < this.settings.maxRidersPerCar;
    }
    decelerating() {
        return Math.abs(this.y - this.endY) < this.accelDistance && this.speed > 0;
    }
    accelerating() {
        return Math.abs(this.y - this.startY) < this.accelDistance && this.speed < this.maxSpeed;
    }
    removeCurrentFloorFromDest() {
        this.destFloors = this.destFloors.filter(f => this.p.yFromFloor(f) !== this.y);
    }
    goTo(floor, manual = false) {
        if (manual || this.settings.controlMode === 0 /* Auto */) {
            if (!this.destFloors.find(f => f === floor)) {
                this.destFloors.push(floor);
                this.sortDestinations();
                console.log(`Car ${this.carNumber} will go to ${floor}`);
            }
        }
    }
    sortDestinations() {
        this.destFloors.sort((a, b) => this.goingUp ? a - b : b - a);
    }
}
class Controls {
    constructor(p, settings, stats) {
        this.p = p;
        this.settings = settings;
        this.stats = stats;
        this.activeCarsChange = () => { };
    }
    createKnobs(passengerLoadTypes) {
        const p = this.p;
        const settings = this.settings;
        const elevSpeed = p.select('#elevSpeed');
        elevSpeed.value(settings.elevSpeed);
        elevSpeed.changed(() => settings.elevSpeed = elevSpeed.value());
        const numCars = p.select('#numActiveCars');
        numCars.value(settings.numActiveCars);
        numCars.changed(() => {
            settings.numActiveCars = numCars.value();
            this.activeCarsChange();
        });
        const volume = p.select('#volume');
        volume.value(settings.volume);
        volume.changed(() => {
            if (p.getAudioContext().state !== 'running') { // todo Is this required?
                p.getAudioContext().resume();
            }
            settings.volume = volume.value();
            p.dingSound.setVolume(volume.value() / 100); // It’s much louder than the motors
        });
        const projection = p.createSelect();
        ['Perspective', 'Orthographic'].forEach(p => projection.option(p));
        projection.parent('#projectionParent');
        projection.changed(() => settings.projectionType = projection.elt.selectedIndex);
        const controlMode = p.createSelect();
        ['Auto', 'Manual'].forEach(p => controlMode.option(p));
        controlMode.parent('#controlModeParent');
        controlMode.changed(() => settings.controlMode = controlMode.elt.selectedIndex);
        const view = p.createSelect();
        ['Front', 'Side', 'Use Mouse'].forEach(v => view.option(v));
        view.parent('#viewParent');
        view.changed(() => settings.view = view.elt.selectedIndex);
        const passengerLoad = p.createSelect();
        passengerLoadTypes.forEach(o => passengerLoad.option(o));
        passengerLoad.parent('#passengerLoadParent');
        passengerLoad.changed(() => settings.passengerLoad = passengerLoad.elt.selectedIndex);
        this.paymentsChart = p.createGraphics(this.stats.maxRecentRiderPayments, 15).parent('#paymentsChart');
        $('#paymentsChart canvas').show();
        const speakers = p.createSelect();
        ['None', 'All', 'Native English'].forEach(p => speakers.option(p));
        speakers.parent('#speakersParent');
        speakers.changed(() => settings.speakersType = speakers.elt.selectedIndex);
    }
}
/** Manages riders, and calls elevators for them. */
class Dispatcher {
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
    initFloorFlow() {
        const numFloors = this.settings.numFloors;
        this.floorFlow = Array(numFloors).fill(0).map(() => Array(numFloors).fill(0));
        // Set up default flow patterns - this could be parameterized via settings
        // 現在索引0=一樓，索引1=二樓，依此類推
        for (let i = 0; i < numFloors; i++) {
            for (let j = 0; j < numFloors; j++) {
                if (i !== j) {
                    // Default flow between any two different floors
                    this.floorFlow[i][j] = 1;
                    // Higher traffic to/from lobby (first floor, index 0)
                    if (i === 0 || j === 0) {
                        this.floorFlow[i][j] = 3;
                    }
                }
            }
        }
    }
    /**
     * Set the flow between floors
     * @param fromFloor Source floor (1-based, 1 means first floor)
     * @param toFloor Destination floor (1-based)
     * @param value Flow value (higher means more traffic)
     */
    setFloorFlow(fromFloor, toFloor, value) {
        // 轉換1-based樓層號碼到0-based索引
        const fromIndex = fromFloor - 1;
        const toIndex = toFloor - 1;
        if (fromIndex >= 0 && fromIndex < this.settings.numFloors &&
            toIndex >= 0 && toIndex < this.settings.numFloors &&
            fromIndex !== toIndex) {
            this.floorFlow[fromIndex][toIndex] = value;
        }
    }
    /**
     * Set the complete floor flow matrix
     * @param flowMatrix A 2D array representing the flow between floors
     */
    setFloorFlowMatrix(flowMatrix) {
        const numFloors = this.settings.numFloors;
        // 檢查矩陣尺寸是否符合樓層數
        if (flowMatrix.length !== numFloors) {
            console.error(`Invalid flow matrix dimensions: expected ${numFloors} floors`);
            return;
        }
        // 重新初始化矩陣
        this.floorFlow = Array(numFloors).fill(0).map(() => Array(numFloors).fill(0));
        // 複製有效值
        for (let i = 0; i < numFloors; i++) {
            if (!flowMatrix[i] || flowMatrix[i].length !== numFloors) {
                console.error(`Invalid flow matrix dimensions at row ${i}: expected ${numFloors} columns`);
                return;
            }
            for (let j = 0; j < numFloors; j++) {
                if (i !== j) { // 忽略從一樓到一樓的流量
                    this.floorFlow[i][j] = flowMatrix[i][j];
                }
            }
        }
    }
    /**
     * Get the current floor flow matrix
     * @returns The current floor flow matrix
     */
    getFloorFlowMatrix() {
        // 直接返回內部矩陣，因為現在索引已經與樓層對應
        return this.floorFlow;
    }
    requestCar(floor, goingUp) {
        if (!this.carCallQueue.find(request => request.floor === floor && request.goingUp === goingUp)) {
            this.carCallQueue.push({ floor: floor, goingUp: goingUp });
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
                }
                else {
                    const closestActiveCar = closest(activeCars);
                    if (closestActiveCar)
                        closestActiveCar.goTo(request.floor);
                    else
                        this.carCallQueue.push(request);
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
        this.cars.forEach(car => car.active = this.isActive(car));
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
    poissonRandom(lambda) {
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
        // Calculate total flow for each source floor to leave the elevator
        /*
            example:
            floor 1: [0, 100, 200, 300, 400]
            floor 2: [100, 0, 100, 200, 300]
            floor 3: [200, 100, 0, 100, 200]
            floor 4: [300, 200, 100, 0, 100]
            floor 5: [400, 300, 200, 100, 0]
            total flow: 5000
            total flow by floor: [1000, 1000, 1000, 1000, 1000]
        */
        const totalFlowByFloor = Array(numFloors).fill(0);
        for (let i = 0; i < numFloors; i++) {
            for (let j = 0; j < numFloors; j++) {
                if (i !== j) {
                    totalFlowByFloor[i] += this.floorFlow[i][j];
                }
            }
        }
        // Total flow across all floors
        const totalFlow = totalFlowByFloor.reduce((sum, flow) => sum + flow, 0);
        // Special handling for lobby (first floor, index 0)
        if (p.random(1) < arrivalRate / p.frameRate()) {
            // Generate passengers from the lobby using a Poisson-like approach
            const numPassengers = this.poissonRandom(1) + 1; // At least 1 passenger
            for (let i = 0; i < numPassengers; i++) {
                // Select a destination floor from the lobby
                let destFloor = this.selectDestinationFloor(1);
                // 注意：Rider仍使用1-based樓層編號，所以轉換回來
                this.riders.push(new Rider(p, this.settings, 2, destFloor + 1, this, this.stats, this.talker));
            }
        }
        // For other floors, probability based on flow proportion
        for (let i = 0; i < numFloors; i++) {
            if (i === 1)
                continue; // 👈 如果你已經上面處理過 index 1（Lobby），這裡略過
            const floorSpawnProbability = (totalFlowByFloor[i] / totalFlow) * arrivalRate / p.frameRate();
            if (p.random(1) < floorSpawnProbability) {
                let destFloor = this.selectDestinationFloor(i);
                this.riders.push(new Rider(p, this.settings, i + 1, destFloor + 1, this, this.stats, this.talker));
            }
        }
    }
    // Select a destination floor based on the flow matrix probabilities
    selectDestinationFloor(sourceFloor) {
        const p = this.p;
        const numFloors = this.settings.numFloors;
        // Calculate total flow from this source floor
        let totalFlowFromSource = 0;
        for (let j = 0; j < numFloors; j++) {
            if (sourceFloor !== j) {
                totalFlowFromSource += this.floorFlow[sourceFloor][j];
            }
        }
        // Select a destination based on flow proportions
        let rand = p.random(totalFlowFromSource);
        let cumulative = 0;
        for (let j = 0; j < numFloors; j++) {
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
            destFloor = Math.floor(p.random(numFloors));
        }
        return destFloor;
    }
}
/** Manages an elevator rider */
var RiderState;
(function (RiderState) {
    RiderState[RiderState["Arriving"] = 0] = "Arriving";
    RiderState[RiderState["Waiting"] = 1] = "Waiting";
    RiderState[RiderState["Boarding"] = 2] = "Boarding";
    RiderState[RiderState["Riding"] = 3] = "Riding";
    RiderState[RiderState["Exiting"] = 4] = "Exiting";
    RiderState[RiderState["Exited"] = 5] = "Exited";
})(RiderState || (RiderState = {}));
class Rider {
    constructor(p, settings, startFloor, destFloor, dispatcher, stats, talker) {
        this.p = p;
        this.settings = settings;
        this.startFloor = startFloor;
        this.destFloor = destFloor;
        this.dispatcher = dispatcher;
        this.stats = stats;
        this.talker = talker;
        this.state = RiderState.Arriving;
        this.arrivalTime = p.millis() / 1000;
        this.carGeom = settings.geom.car;
        this.setBodyAttributes();
        const travelDirection = p.random([-1, 1]);
        const enterX = p.width / 2 - travelDirection * p.width / 2;
        this.pos = p.createVector(enterX, p.yFromFloor(startFloor), this.randomFloorZ());
        const waitX = enterX + travelDirection * p.randomGaussian(p.width / 3, p.width / 4);
        this.arrivingPath = [p.createVector(waitX, this.pos.y, this.pos.z)];
        this.carIn = undefined;
        this.color = [p.random(255), p.random(255), p.random(255)];
        this.movementPerMs = p.randomGaussian(300, 50) / 1000;
        this.destNumberDisplay = this.setUpDestNumberDisplay(p);
        ++stats.riders.waiting;
    }
    setBodyAttributes() {
        const p = this.p;
        const meanHeight = 1.7;
        const meanWeight = 85;
        this.height = p.constrain(p.randomGaussian(meanHeight, 0.5), 1, 2.2);
        this.weight = p.constrain(p.randomGaussian(meanWeight, 10), 30, 150);
        const bmi = this.weight / (this.height * this.height);
        const bmiDiffLimit = 10;
        const normalBmiDiff = p.constrain(bmi - 25, -bmiDiffLimit, bmiDiffLimit);
        const widthMultiple = p.map(normalBmiDiff, -bmiDiffLimit, bmiDiffLimit, 0.7, 2.1);
        const normalWaistDiam = .90 / Math.PI; // d = circumference / π
        this.width = normalWaistDiam * widthMultiple;
    }
    randomFloorZ() {
        return this.p.lerp(-20, 20, this.p.random(1));
    }
    update() {
        const p = this.p;
        switch (this.state) {
            case RiderState.Arriving:
                this.followPath(this.arrivingPath, RiderState.Waiting, () => {
                    this.talker.speakRandom('arriving', undefined, 0.1);
                    this.requestCar();
                });
                break;
            case RiderState.Waiting:
                this.waitForCar();
                break;
            case RiderState.Boarding:
                const canceled = this.followPath(this.boardingPath, RiderState.Riding, () => {
                    --this.stats.riders.waiting;
                    ++this.stats.riders.riding;
                    this.stats.riders.ridingKg += this.weight;
                }, () => this.carIn.state === CarState.Open);
                if (canceled) {
                    this.talker.speakRandom('tooLate', undefined, 1);
                    this.carIn.removeRider(this);
                    this.carIn = undefined;
                    this.requestCar();
                    this.state = RiderState.Waiting;
                }
                break;
            case RiderState.Riding:
                this.ride();
                break;
            case RiderState.Exiting:
                this.followPath(this.exitingPath, RiderState.Exited, () => {
                    const tripTime = p.millis() / 1000 - this.arrivalTime;
                    this.stats.chargeRider(p, tripTime);
                });
                break;
        }
    }
    requestCar() {
        this.dispatcher.requestCar(this.startFloor, this.destFloor > this.startFloor);
    }
    waitForCar() {
        const goingUp = this.destFloor > this.startFloor;
        const yThisFloor = this.p.yFromFloor(this.startFloor);
        let suitableExceptFullEncountered = false;
        const suitableCar = this.dispatcher.activeCars().find(car => {
            const allButRoom = car.state === CarState.Open && car.y === yThisFloor &&
                (this.settings.controlMode === 1 || car.goingUp === goingUp);
            if (allButRoom && !car.hasRoom())
                suitableExceptFullEncountered = true;
            return allButRoom && car.hasRoom();
        });
        if (suitableCar) {
            this.carIn = suitableCar;
            this.carIn.addRider(this);
            this.carIn.goTo(this.destFloor);
            this.setBoardingPath(suitableCar);
            this.millisAtLastMove = this.p.millis();
            this.state = RiderState.Boarding;
        }
        else if (suitableExceptFullEncountered)
            this.talker.speakRandom('carFull', undefined, 0.3);
    }
    outsideDoorPos(openCar) {
        return this.p.createVector(openCar.carCenterX() + this.fuzz(2), this.pos.y, openCar.settings.geom.carCenterZ + this.carGeom.z + this.fuzz(2));
    }
    ride() {
        const car = this.carIn;
        this.pos.y = car.y;
        if (car.state === CarState.Open && car.y === this.p.yFromFloor(this.destFloor)) {
            car.removeRider(this);
            this.setExitingPath(car);
            this.millisAtLastMove = this.p.millis();
            --this.stats.riders.riding;
            this.stats.riders.ridingKg -= this.weight;
            ++this.stats.riders.served;
            this.talker.speakRandom('leaving', undefined, 0.1);
            this.state = RiderState.Exiting;
        }
    }
    setBoardingPath(car) {
        const cg = this.carGeom;
        const insideCar = this.p.createVector(car.carCenterX() + this.fuzz(cg.x * 0.4), this.pos.y, car.settings.geom.carCenterZ + this.fuzz(cg.z * 0.4));
        this.boardingPath = [this.outsideDoorPos(car), insideCar];
    }
    setExitingPath(car) {
        const p = this.p;
        const nearDoorInsideCar = p.createVector(car.carCenterX() + this.fuzz(2), this.pos.y, car.settings.geom.carCenterZ + this.carGeom.z / 2 - 5 + this.fuzz(2));
        const outsideDoor = this.outsideDoorPos(car);
        const exitPoint = p.createVector(p.width / 2 - this.p.random([-1, 1]) * p.width / 2, this.pos.y, this.randomFloorZ());
        this.exitingPath = [nearDoorInsideCar, outsideDoor, exitPoint];
    }
    fuzz(half) {
        return this.p.map(this.p.random(1), 0, 1, -half, half);
    }
    followPath(path, nextState, onComplete, continueWhile) {
        if (continueWhile && !continueWhile())
            return true;
        const distanceToDestination = this.moveToward(path[0]);
        if (distanceToDestination === 0) {
            path.shift();
            if (!path.length) {
                this.state = nextState;
                if (onComplete)
                    onComplete();
            }
        }
    }
    moveToward(dest) {
        const now = this.p.millis();
        const millisSinceLastStep = now - (this.millisAtLastMove || now);
        this.millisAtLastMove = now;
        const pointerToDest = p5.Vector.sub(dest, this.pos);
        const distToDest = pointerToDest.mag();
        const stepMagnitude = Math.min(distToDest, this.movementPerMs * millisSinceLastStep);
        const step = p5.Vector.mult(pointerToDest.normalize(), stepMagnitude);
        this.pos.add(step);
        return p5.Vector.sub(dest, this.pos).mag();
    }
    draw() {
        if (this.state === RiderState.Exited)
            return;
        const p = this.p;
        const s = x => x * this.settings.geom.scaleMetersTo3dUnits;
        const legLength = s(this.height / 3);
        const height = s(this.height) - legLength;
        const width = s(this.width);
        p.pushed(() => {
            p.translate(this.pos.x, this.pos.y, this.pos.z);
            p.pushed(() => {
                p.translate(0, legLength + height / 2, 0);
                p.noStroke();
                p.fill(this.color[0], this.color[1], this.color[2]);
                p.ellipsoid(width / 2, height / 2, this.width / 2);
            });
            p.pushed(() => {
                p.translate(0, legLength + height + s(0.5), 0);
                p.scale(0.5, -0.5, 1); // Fix upside-down and shrink for better quality
                p.texture(this.destNumberDisplay);
                p.noStroke();
                p.plane(25);
            });
        });
    }
    setUpDestNumberDisplay(p) {
        const pg = p.createGraphics(25, 25);
        pg.stroke(100);
        pg.fill(100);
        pg.textFont('sans-serif', 24);
        pg.textAlign(p.CENTER);
        pg.text(this.destFloor, 12, 25);
        return pg;
    }
}
new p5(p => {
    const passengerLoadTypes = ['Varying', 'Very Light', 'Light', 'Moderate', 'Heavy', 'Very Heavy', 'Insane'];
    function createSettings() {
        const car = p.createVector(1, 1, 1.3).mult(50);
        const floorDepthOthers = 50;
        return {
            numCars: 4,
            doorMovementSecs: 1,
            doorOpenMs: 2500,
            maxRidersPerCar: 25,
            numActiveCars: 4,
            geom: {
                scaleMetersTo3dUnits: 16, // Some objects are defined with metric dimensions
                car: car,
                carCenterZ: -car.z / 2 - floorDepthOthers / 2,
                storyHeight: car.y * 1,
                floorDepthGround: floorDepthOthers * 2,
                floorDepthOthers: floorDepthOthers,
                canvas: undefined
            },
            controlMode: 0, // Auto
            elevSpeed: 5,
            view: 0,
            passengerLoad: 0,
            passengerLoadNumManualLevels: passengerLoadTypes.length - 1, // The first is not manual
            volume: 0,
            speakersType: 0,
            numFloors: 13, // Default number of floors
            projectionType: undefined
        };
    }
    const settings = createSettings();
    let mouseHasMoved = false;
    p.yFromFloor = floor => settings.geom.storyHeight * (floor - 1);
    p.floorFromY = y => Math.round(y / settings.geom.storyHeight + 1);
    let controls;
    let cars;
    let building;
    let stats;
    let dispatcher;
    let talker;
    let ready = false;
    p.preload = function () {
        p.dingSound = p.loadSound('assets/ding.wav');
    };
    p.setup = function () {
        const cg = settings.geom;
        setCanvasSize();
        p.createCanvas(cg.canvas.x, cg.canvas.y, p.WEBGL).parent('main');
        stats = new Stats();
        controls = new Controls(p, settings, stats);
        talker = new Talker(settings);
        talker.whenLoaded(() => {
            cars = Array.from(Array(settings.numCars).keys(), n => new Car(p, settings, stats, n + 1));
            building = new Building(settings, cars);
            dispatcher = new Dispatcher(p, settings, cars, stats, talker);
            // Apply test floor flow matrix
            const testMatrix = testFloorFlowMatrix(settings.numFloors);
            dispatcher.setFloorFlowMatrix(testMatrix);
            console.log("Applied test floor flow matrix:", testMatrix);
            // Expose dispatcher and utility functions to global scope for console access
            window.dispatcher = dispatcher;
            window.getRandomFloorFlow = (numFloors, maxFlowValue, lobbyFactor) => getRandomFloorFlow(numFloors || settings.numFloors, maxFlowValue, lobbyFactor, p);
            controls.createKnobs(passengerLoadTypes);
            controls.activeCarsChange = () => dispatcher.updateCarActiveStatuses();
            controls.volumeChange = v => talker.volume(v);
            ready = true;
        });
    };
    function setCanvasSize() {
        const m = $('#main');
        settings.geom.canvas = p.createVector(m.width() * 0.95, p.windowHeight * 0.92); // todo Remove these magic numbers
    }
    p.windowResized = function () {
        setCanvasSize();
        p.resizeCanvas(settings.geom.canvas.x, settings.geom.canvas.y);
    };
    p.mouseMoved = function () {
        mouseHasMoved = true;
    };
    function manuallySummon() {
        if (settings.controlMode === 1 && p.mouseX >= 0 && p.mouseY >= 0) {
            const dist = car => Math.abs(car.carCenterX() - p.mouseX);
            const car = dispatcher.activeCars().reduce((a, b) => a && b ? dist(a) > dist(b) ? b : a : b, undefined);
            if (car) {
                const y = p.height - p.mouseY;
                car.goTo(p.floorFromY(y), true);
            }
        }
    }
    p.mousePressed = function () {
        manuallySummon();
    };
    p.mouseDragged = function () {
        manuallySummon();
    };
    p.pushed = function (block) {
        p.push();
        block();
        p.pop();
    };
    function rotateOnY() {
        let rotY = 0;
        if (settings.view === 1)
            rotY = -p.TAU / 4;
        else if (settings.view === 2 && mouseHasMoved)
            rotY = p.map(p.mouseX, 0, p.width, -p.TAU / 8, p.TAU / 8);
        p.rotateY(rotY);
    }
    function showRiderStats() {
        const s = stats.riders;
        const l = s => s.toLocaleString();
        const now = p.millis() / 1000;
        const waitingRiders = dispatcher.riders.filter(r => r.state === RiderState.Waiting);
        const waitSecs = waitingRiders.reduce((accum, rider) => (now - rider.arrivalTime) + accum, 0);
        const wait = s.waiting ? ` (${l(Math.round(waitSecs))} secs)` : '';
        const profit = s.payments - stats.costs.operating;
        $('#score').html(l(Math.round(Math.max(0, profit / (p.millis() / 1000 / 60)))));
        $('#waiting').html(`${l(s.waiting)}${wait}`);
        const weight = s.riding ? ` (${l(s.ridingKg / 1000)} Mg)` : '';
        $('#riding').html(`${l(s.riding)}${weight}`);
        $('#served').html(l(s.served));
        const curStyle = { style: 'currency', currency: 'usd' };
        $('#payments').html(s.payments.toLocaleString('en-us', curStyle));
        $('#costs').html(stats.costs.operating.toLocaleString('en-us', curStyle));
        $('#profit').html((profit).toLocaleString('en-us', curStyle));
        const g = controls.paymentsChart;
        const yScale = g.height / stats.normalRideCost;
        stats.recentRiderPayments.forEach((a, i) => {
            const rideCost = a * yScale;
            g.stroke('white');
            g.line(i, 0, i, g.height);
            g.stroke('gray');
            g.line(i, g.height - rideCost, i, g.height);
        });
    }
    function setUpCamera() {
        function setDefault() {
            p.camera(0, 0, (p.height / 2.0) / p.tan(p.PI * 30.0 / 180.0), 0, 0, 0, 0, 1, 0);
        }
        if (settings.projectionType === 1) {
            p.ortho();
            setDefault();
        }
        else {
            p.perspective();
            if (settings.controlMode === 0 /* Auto */) {
                const avgCarY = cars.map(car => car.y).reduce((a, b) => a + b, 0) / cars.length;
                p.camera(0, -avgCarY, (p.height / 2.0) / p.tan(p.PI * 30.0 / 180.0), 0, 0, 0, 0, 1, 0);
            }
            else
                setDefault();
        }
    }
    let lastDrawTimeSecs = p.millis() / 1000;
    p.draw = function () {
        if (!ready)
            return;
        const now = (p.millis() / 1000);
        const timeSinceLastDrawSecs = now - lastDrawTimeSecs;
        lastDrawTimeSecs = now;
        stats.addIdleCosts(timeSinceLastDrawSecs, settings.numActiveCars);
        showRiderStats();
        p.background(240);
        setUpCamera();
        rotateOnY();
        inQuadrant1(() => {
            cars.forEach(car => {
                car.update();
                car.draw();
            });
            building.drawFloors(p);
            dispatcher.process();
        });
    };
    /** Places the origin at the bottom left, and makes y increase going up. */
    function inQuadrant1(block) {
        p.push();
        p.translate(-p.width / 2, p.height / 2, 0);
        p.scale(1, -1, 1);
        block();
        p.pop();
    }
    // Allow setting the number of floors from the console
    window.setNumFloors = function (floors) {
        if (Number.isInteger(floors) && floors > 1) {
            settings.numFloors = floors;
            // Reinitialize the dispatcher's floor flow matrix if it exists
            if (dispatcher) {
                dispatcher.initFloorFlow();
                // Apply test floor flow matrix
                const testMatrix = testFloorFlowMatrix(settings.numFloors);
                dispatcher.setFloorFlowMatrix(testMatrix);
                console.log("Updated floor flow matrix for", settings.numFloors, "floors");
            }
            return settings.numFloors;
        }
        else {
            console.error("Number of floors must be a positive integer greater than 1");
            return settings.numFloors;
        }
    };
});
class MotorSound {
    constructor(pan) {
        const osc = this.osc = new p5.Oscillator(0, 'triangle');
        osc.pan(pan);
        osc.amp(0);
        osc.start();
    }
}
class Stats {
    constructor() {
        this.riders = {
            riding: 0,
            ridingKg: 0,
            waiting: 0,
            served: 0,
            payments: 0,
        };
        this.costs = {
            perSec: 0.01,
            perSecPerCar: 0.01,
            perFloor: 0.1,
            operating: 0
        };
        this.normalRideCost = 0.25;
        this.maxRecentRiderPayments = 150;
        this.recentRiderPayments = [];
        this.recentTripTimes = [];
    }
    chargeRider(p, tripTime) {
        const penaltyTime = p.constrain(tripTime - 30, 0, 300);
        const rideCost = this.normalRideCost - p.map(penaltyTime, 0, 300, 0, this.normalRideCost);
        this.recentRiderPayments.push(rideCost);
        this.recentTripTimes.push(tripTime);
        if (this.recentRiderPayments.length > this.maxRecentRiderPayments) {
            this.recentRiderPayments.shift();
            this.recentTripTimes.shift();
        }
        this.riders.payments += rideCost;
    }
    addMovementCosts(numFloors, speed) {
        this.costs.operating += this.costs.perFloor * (1 + speed / 10) * numFloors;
    }
    addIdleCosts(secs, numActiveCars) {
        this.costs.operating += this.costs.perSec * secs;
        this.costs.operating += this.costs.perSecPerCar * secs * numActiveCars;
    }
}
class Talker {
    constructor(settings) {
        this.speech = speechSynthesis;
        this.utterances = {
            arriving: [
                'i would like a ride',
                'nice day for an elevator ride',
                'i hope this is fast',
                "i'm in a hurry",
                "let's get this over with",
                'how about those astros',
                'i love elevators',
                'is this real life?'
            ],
            leaving: ['thank you, elevator', 'thanks', 'bye', 'so long', 'good times', 'far out', 'namaste'],
            tooLate: ['darn it!', 'stupid elevator', 'oh, i missed it', 'i ran as fast as i could', 'bummer'],
            carFull: ['that\'s a full car', 'a lot of people', 'too crowded', 'wow, full', 'full'],
        };
        this.settings = settings;
        this.nextSpeechAllowedTime = new Date().getTime();
    }
    whenLoaded(loaded = () => { }) {
        const talker = this;
        function populateVoiceList() {
            if (typeof speechSynthesis === 'undefined' || talker.voices !== undefined) {
                return;
            }
            const unwantedVoices = new Set('Alex Daniel Fred Jorge Victoria Zosia'.split(' '));
            const allVoices = speechSynthesis.getVoices();
            if (allVoices.length) {
                talker.voices = talker.speech.getVoices().filter(v => !unwantedVoices.has(v.name));
                talker.englishVoices = talker.voices.filter(v => v.lang.startsWith('en'));
                loaded();
            }
        }
        populateVoiceList();
        if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = populateVoiceList;
        }
    }
    speakRandom(category, voiceName, probability) {
        if (Math.random() <= probability) {
            this.speak(this.randChoice(this.utterances[category]), voiceName);
        }
    }
    speak(message, voiceName) {
        if (new Date().getTime() > this.nextSpeechAllowedTime && this.voices.length && !this.speech.speaking && this.settings.speakersType > 0) {
            const utterance = new SpeechSynthesisUtterance();
            utterance.volume = this.settings.volume / 10;
            utterance.voice = voiceName ?
                this.voice(voiceName) :
                this.randChoice(this.settings.speakersType === 1 ? this.voices : this.englishVoices);
            console.log(utterance.voice);
            utterance.text = message;
            this.speech.speak(utterance);
            this.nextSpeechAllowedTime = new Date().getTime() + 5000;
        }
    }
    voice(voiceName) {
        return this.voices.find(v => v.name === voiceName);
    }
    randChoice(sequence) {
        return sequence[Math.floor(Math.random() * sequence.length)];
    }
}
/**
 * Floor flow matrix utilities
 */
var FloorFlowMatrix;
(function (FloorFlowMatrix) {
    /**
     * Create a test floor flow matrix with higher traffic patterns for testing
     * @param numFloors Number of floors in the building
     * @returns A matrix representing traffic flow between floors
     */
    function testFloorFlowMatrix(numFloors) {
        // 創建矩陣，使用索引0到numFloors-1
        const matrix = [];
        for (let i = 0; i < numFloors; i++) {
            matrix[i] = [];
            for (let j = 0; j < numFloors; j++) {
                if (i !== j) {
                    matrix[i][j] = 10; // Default value
                }
                else {
                    matrix[i][j] = 0; // 不會從一層到同一層
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
    function getRandomFloorFlow(numFloors, maxFlowValue = 10, lobbyFactor = 2.5, p) {
        // If p5 instance not provided, use Math.random
        const random = p ? ((max) => p.random(max)) : ((max) => Math.random() * max);
        // 創建矩陣，使用索引0到numFloors-1
        const matrix = [];
        // 初始化矩陣結構
        for (let i = 0; i < numFloors; i++) {
            matrix[i] = [];
            for (let j = 0; j < numFloors; j++) {
                matrix[i][j] = 0; // 初始化為0
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
        const floorTrafficFactors = [];
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
})(FloorFlowMatrix || (FloorFlowMatrix = {}));
//# sourceMappingURL=app.js.map