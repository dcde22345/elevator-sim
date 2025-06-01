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
    CarState[CarState["DirectionChanging"] = 5] = "DirectionChanging";
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
        this.y = p.yFromFloor(2); //每部電梯的預設起始位置都是在 1 樓
        this.goingUp = false;
        this.doorOpenFraction = 0; // 0…1 = closed…open
        this.destFloors = [];
        this.riders = [];
        this.pan = settings.numCars === 1 ? 0 : p.map(carNumber, 1, settings.numCars, -0.8, 0.8);
        this.sound = new MotorSound(this.pan);
        this.active = false;
        this.state = CarState.Idle;
        this.needsDirectionChange = false; // 20250522 Ella 新增：初始化方向改變標記
        this.allowedFloors = this.initAllowedFloors(carNumber); // 20250522 Ella 修改：初始化各電梯可停靠樓層
    }
    // 20250522 Ella 修改：初始化各電梯可停靠樓層
    initAllowedFloors(carNumber) {
        // B1樓層用-1表示
        switch (carNumber) {
            case 1:
                // 第一部電梯：停靠所有樓層（B1～12）
                return [-1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
            case 2:
                // 第二部電梯：僅停靠（B1、1、6、7、8、9、10、11、12）
                return [-1, 1, 2, 7, 8, 9, 10, 11, 12, 13];
            case 3:
                // 第三部電梯：僅停靠（1、4、6、8、10、12）
                return [1, 2, 4, 6, 8, 10, 12, 13];
            case 4:
                // 第四部電梯：僅停靠（1、3、5、7、9、11）
                return [1, 2, 3, 5, 7, 9, 11, 13];
            default:
                return [1]; // 預設情況
        }
    }
    // 20250522 Ella 修改：檢查電梯是否可停靠指定樓層
    canStopAt(floor) {
        // 20250522 Ella 修改：加入額外的安全檢查
        // 3號和4號電梯不能到B1樓
        if (floor === -1 && (this.carNumber === 3 || this.carNumber === 4)) {
            console.log(`警告：${this.carNumber}號電梯不能前往B1樓`);
            return false;
        }
        const canStop = this.allowedFloors.includes(floor);
        if (!canStop) {
            console.log(`警告：${this.carNumber}號電梯不能前往${floor === -1 ? 'B1' : floor}樓`);
        }
        return canStop;
    }
    // 20250522 Ella 修改：獲取可停靠樓層列表
    getAllowedFloors() {
        return [...this.allowedFloors];
    }
    // 20250522 Ella 修改：獲取電梯編號
    getCarNumber() {
        return this.carNumber;
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
                    if (this.needsDirectionChange) {
                        // 20250522 Ella 新增：關門後處理方向改變
                        this.state = CarState.DirectionChanging;
                    }
                    else {
                        this.state = CarState.Idle;
                    }
                }
                break;
            case CarState.DirectionChanging:
                // 20250522 Ella 修改：方向已經改變，現在重新計算下一個目標並開始移動
                this.needsDirectionChange = false;
                // 重新計算在新方向上的最近目標
                let nextDest = null;
                let bestDistance = Infinity;
                const currentFloor = p.floorFromY(this.y);
                for (const floor of this.destFloors) {
                    if (!this.canStopAt(floor))
                        continue;
                    const floorY = p.yFromFloor(floor);
                    const distance = Math.abs(this.y - floorY);
                    if (this.goingUp) {
                        // 向上時：找更高且最近的樓層
                        if (floorY > this.y && distance < bestDistance) {
                            nextDest = floor;
                            bestDistance = distance;
                        }
                    }
                    else {
                        // 向下時：找更低且最近的樓層
                        if (floorY < this.y && distance < bestDistance) {
                            nextDest = floor;
                            bestDistance = distance;
                        }
                    }
                }
                // 如果沒有在新方向找到目標，找最近的任何目標
                if (!nextDest && this.destFloors.length > 0) {
                    bestDistance = Infinity;
                    for (const floor of this.destFloors) {
                        if (!this.canStopAt(floor))
                            continue;
                        const floorY = p.yFromFloor(floor);
                        const distance = Math.abs(this.y - floorY);
                        if (distance < bestDistance) {
                            nextDest = floor;
                            bestDistance = distance;
                        }
                    }
                }
                if (nextDest) {
                    // 開始移動到目標樓層
                    this.stats.addMovementCosts(Math.abs(currentFloor - nextDest), this.settings.elevSpeed);
                    this.state = CarState.Moving;
                    this.sound.osc.amp(p.map(this.settings.volume, 0, 10, 0, 0.6), 0.02);
                    console.log(`${this.carNumber}號電梯開門關門完成，移動至 ${nextDest === -1 ? 'B1' : nextDest} 樓`);
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
                else {
                    // 沒有目標，回到閒置狀態
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
            const currentFloor = p.floorFromY(this.y);
            // 20250522 Ella 修改：智能方向判斷
            // 檢查上下方向是否有目標樓層
            const hasUpperFloors = this.destFloors.some(f => f > currentFloor && this.canStopAt(f));
            const hasLowerFloors = this.destFloors.some(f => f < currentFloor && this.canStopAt(f));
            // 在1樓時的特殊處理：優先考慮實際目標方向
            if (currentFloor === 1) {
                if (hasUpperFloors && !hasLowerFloors) {
                    this.goingUp = true; // 只有上層請求時向上
                }
                else if (hasLowerFloors && !hasUpperFloors) {
                    this.goingUp = false; // 只有下層請求時向下
                }
                else if (hasUpperFloors && hasLowerFloors) {
                    // 兩個方向都有請求時，保持當前方向或選擇較近的
                    // 這裡可以保持當前方向，或者選擇距離較近的方向
                }
            }
            // 1. 先根據當前方向找尋目標樓層
            let nextDest = null;
            let bestDistance = Infinity;
            // 在當前方向上找最近的目標樓層
            for (const floor of this.destFloors) {
                if (!this.canStopAt(floor))
                    continue;
                const floorY = p.yFromFloor(floor);
                const distance = Math.abs(this.y - floorY);
                if (this.goingUp) {
                    // 向上時：找更高且最近的樓層
                    if (floorY > this.y && distance < bestDistance) {
                        nextDest = floor;
                        bestDistance = distance;
                    }
                }
                else {
                    // 向下時：找更低且最近的樓層
                    if (floorY < this.y && distance < bestDistance) {
                        nextDest = floor;
                        bestDistance = distance;
                    }
                }
            }
            // 2. 如果當前方向沒有目標，則改變方向並準備開門關門
            if (!nextDest) {
                // 20250522 Ella 修改：先改變方向，然後開門關門再移動
                this.goingUp = !this.goingUp;
                this.sortDestinations();
                this.needsDirectionChange = true;
                this.state = CarState.Opening;
                this.doorOpStarted = this.nowSecs();
                console.log(`${this.carNumber}號電梯改變方向：${this.goingUp ? '向上' : '向下'}，先開門關門再移動`);
                return; // 結束此次處理，等待門開關完成後再移動
            }
            if (nextDest) {
                this.stats.addMovementCosts(Math.abs(p.floorFromY(this.y) - nextDest), this.settings.elevSpeed);
                this.state = CarState.Moving;
                this.sound.osc.amp(p.map(this.settings.volume, 0, 10, 0, 0.6), 0.02);
                console.log(`${this.carNumber}號電梯移動至 ${nextDest === -1 ? 'B1' : nextDest} 樓，方向：${this.goingUp ? '向上' : '向下'}`);
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
            // 20250522 Ella 修改：特殊樓層處理邏輯
            const currentFloor = p.floorFromY(this.y);
            // 在一樓時，如果向下方向沒有請求，則改為向上
            if (currentFloor === 1) {
                const hasDownwardRequests = this.destFloors.some(f => f < 1 && this.canStopAt(f));
                if (!hasDownwardRequests) {
                    this.goingUp = true;
                    this.sortDestinations();
                }
            }
            // 在頂樓時強制向下
            if (currentFloor === this.settings.numFloors) {
                this.goingUp = false;
                this.sortDestinations();
            }
            // 在B1樓時強制向上
            if (currentFloor === -1) {
                this.goingUp = true;
                this.sortDestinations();
            }
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
        // 20250522 Ella 修改：檢查是否為允許停靠的樓層
        if (!this.canStopAt(floor)) {
            console.log(`警告：${this.carNumber}號電梯不能停靠 ${floor === -1 ? 'B1' : floor} 樓`);
            return;
        }
        if (manual || this.settings.controlMode === 0 /* Auto */) {
            if (!this.destFloors.find(f => f === floor)) {
                this.destFloors.push(floor);
                this.sortDestinations();
                console.log(`Car ${this.carNumber} will go to ${floor}`);
            }
        }
    }
    sortDestinations() {
        // 只排序可以停靠的樓層
        const validDestinations = this.destFloors.filter(f => this.canStopAt(f));
        // 根據方向排序
        validDestinations.sort((a, b) => {
            if (this.goingUp) {
                return a - b; // 向上時按升序排列
            }
            else {
                return b - a; // 向下時按降序排列
            }
        });
        this.destFloors = validDestinations;
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
/** 電梯請求類型 */
var RequestType;
(function (RequestType) {
    RequestType["PickupPassenger"] = "pickup";
    RequestType["DeliverPassenger"] = "deliver"; // 送乘客請求
})(RequestType || (RequestType = {}));
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
    // 20250522 Ella 修改：處理乘客請求
    requestCar(startFloor, goingUp, destFloor, requestType = RequestType.PickupPassenger, rider) {
        // 找出可以同時服務起始樓層和目標樓層的電梯
        const eligibleCars = this.activeCars().filter(car => {
            const canStopAtStart = car.canStopAt(startFloor);
            // 如果有指定目標樓層，也要檢查
            if (destFloor !== undefined) {
                return canStopAtStart && car.canStopAt(destFloor);
            }
            return canStopAtStart;
        });
        if (eligibleCars.length === 0) {
            const errorMsg = destFloor !== undefined ?
                `警告：沒有電梯可以從 ${this.floorNumberToString(startFloor)} 樓到達 ${this.floorNumberToString(destFloor)} 樓` :
                `警告：沒有電梯可以服務 ${this.floorNumberToString(startFloor)} 樓`;
            console.log(errorMsg);
            return;
        }
        // 檢查是否已有相同的請求（不包含乘客綁定的檢查）
        const existingRequest = this.carCallQueue.find(request => request.floor === startFloor &&
            request.goingUp === goingUp &&
            request.requestType === requestType &&
            !request.rider // 只檢查非乘客綁定的請求
        );
        if (!existingRequest) {
            this.carCallQueue.push({
                floor: startFloor,
                goingUp: goingUp,
                destFloor: destFloor, // 新增目標樓層資訊
                requestTime: Date.now(),
                requestType: requestType, // 新增請求類型
                rider: rider // 20250522 Ella 新增：綁定請求發起的乘客
            });
            const typeMsg = requestType === RequestType.PickupPassenger ? '接乘客' : '送乘客';
            const riderMsg = rider ? `（乘客ID: ${rider.constructor.name}）` : '';
            console.log(`新增${typeMsg}請求：${this.floorNumberToString(startFloor)} 樓${destFloor !== undefined ? ` 到 ${this.floorNumberToString(destFloor)} 樓` : ''}，方向：${goingUp ? '向上' : '向下'}${riderMsg}`);
            console.log(`可用電梯：${eligibleCars.map(car => car.getCarNumber()).join(', ')}號`);
        }
    }
    // 20250522 Ella 新增：為特定乘客請求電梯，繞過重複檢查
    requestCarForSpecificRider(startFloor, goingUp, destFloor, rider, excludeCar, requestType = RequestType.PickupPassenger) {
        // 找出可以同時服務起始樓層和目標樓層的電梯，排除無法服務的電梯
        const eligibleCars = this.activeCars().filter(car => {
            // 排除指定的電梯
            if (excludeCar && car === excludeCar) {
                return false;
            }
            return car.canStopAt(startFloor) && car.canStopAt(destFloor);
        });
        if (eligibleCars.length === 0) {
            const excludeMsg = excludeCar ? `（已排除 ${excludeCar.getCarNumber()} 號電梯）` : '';
            console.log(`警告：沒有電梯可以從 ${this.floorNumberToString(startFloor)} 樓到達 ${this.floorNumberToString(destFloor)} 樓${excludeMsg}`);
            return;
        }
        // 強制添加請求，不檢查重複
        this.carCallQueue.push({
            floor: startFloor,
            goingUp: goingUp,
            destFloor: destFloor,
            requestTime: Date.now(),
            specificRider: rider, // 標記特定乘客
            excludeCar: excludeCar, // 記錄要排除的電梯
            requestType: requestType // 新增請求類型
        });
        const typeMsg = requestType === RequestType.PickupPassenger ? '接乘客' : '送乘客';
        const excludeMsg = excludeCar ? `（排除 ${excludeCar.getCarNumber()} 號電梯）` : '';
        console.log(`為特定乘客重新${typeMsg}請求：${this.floorNumberToString(startFloor)} 樓到 ${this.floorNumberToString(destFloor)} 樓${excludeMsg}`);
        console.log(`可用電梯：${eligibleCars.map(car => car.getCarNumber()).join(', ')}號`);
    }
    // 20250522 Ella 修改：主要處理邏輯
    process() {
        this.processRiders();
        // 20250522 Ella 新增：定期清理無效請求
        this.cleanupCompletedRequests();
        if (this.settings.controlMode === 0 /* Auto */) {
            const request = this.carCallQueue.shift();
            if (request) {
                // 20250522 Ella 新增：檢查請求是否仍然有效
                if (request.rider) {
                    // 如果乘客已經上車或離開，則跳過此請求
                    if (request.rider.state === RiderState.Boarding ||
                        request.rider.state === RiderState.Riding ||
                        request.rider.state === RiderState.Exiting ||
                        request.rider.state === RiderState.Exited) {
                        console.log(`跳過無效請求：${this.floorNumberToString(request.floor)} 樓（乘客已上車或已離開）`);
                        return; // 跳過此請求
                    }
                }
                // 檢查樓層是否還有等待的乘客
                if (!this.hasWaitingRidersOnFloor(request.floor)) {
                    console.log(`跳過無乘客請求：${this.floorNumberToString(request.floor)} 樓（該樓層沒有等待的乘客）`);
                    return; // 跳過此請求
                }
                // 優先嘗試動態分配給移動中的電梯
                if (this.assignRequestToMovingElevators(request)) {
                    return; // 成功分配給移動中的電梯，處理完成
                }
                const floorY = this.p.yFromFloor(request.floor);
                // 找出可以同時停靠起始和目標樓層的電梯
                const eligibleCars = this.activeCars().filter(car => {
                    // 如果有要排除的電梯，先排除
                    if (request.excludeCar && car === request.excludeCar) {
                        return false;
                    }
                    const canStopAtStart = car.canStopAt(request.floor);
                    // 如果有目標樓層，也要檢查是否可停靠
                    if (request.destFloor !== undefined) {
                        return canStopAtStart && car.canStopAt(request.destFloor);
                    }
                    return canStopAtStart;
                });
                if (eligibleCars.length === 0) {
                    // 沒有合適的電梯，請求重新入隊
                    this.carCallQueue.push(request);
                    console.log(`請求重新入隊：${this.floorNumberToString(request.floor)} 樓，因為沒有可用電梯`);
                    return;
                }
                // 20250522 Ella 新增：智能電梯選擇邏輯
                const bestCar = this.selectBestElevator(eligibleCars, request);
                if (bestCar) {
                    this.assignElevator(bestCar, request);
                }
                else {
                    // 如果沒有合適的電梯，請求重新入隊
                    this.carCallQueue.push(request);
                    console.log(`請求重新入隊：${this.floorNumberToString(request.floor)} 樓，因為沒有最佳電梯`);
                }
            }
        }
    }
    // 20250522 Ella 新增：智能電梯選擇邏輯
    selectBestElevator(eligibleCars, request) {
        const floorY = this.p.yFromFloor(request.floor);
        // 計算每台電梯的評分
        const carScores = eligibleCars.map(car => {
            let score = 0;
            const distance = Math.abs(car.y - floorY);
            const currentFloor = this.p.floorFromY(car.y);
            // 1. 距離評分（距離越近分數越高，最大100分）
            const maxDistance = Math.abs(this.p.yFromFloor(this.settings.numFloors) - this.p.yFromFloor(-1));
            score += (1 - distance / maxDistance) * 100;
            // 2. 狀態評分
            if (car.state === CarState.Idle) {
                score += 50; // 閒置電梯加50分
            }
            else if (car.state === CarState.Moving) {
                score += 20; // 移動中電梯加20分
            }
            // 3. 方向相符性評分（改進版）
            if (car.state === CarState.Idle || car.state === CarState.Moving) {
                const requestDirection = request.goingUp;
                const elevatorDirection = car.goingUp;
                if (requestDirection === elevatorDirection) {
                    score += 30; // 方向相同加30分
                    // 4. 行徑路線評分（電梯是否會經過請求樓層）
                    if (car.state === CarState.Moving) {
                        const isOnRoute = this.isElevatorOnRoute(car, request.floor, currentFloor);
                        if (isOnRoute) {
                            score += 40; // 在行徑路線上加40分
                        }
                    }
                }
                else {
                    // 方向不同時，檢查電梯是否即將改變方向
                    const hasRequestsInCurrentDirection = car.destFloors.some(f => {
                        if (elevatorDirection) {
                            return f > currentFloor && car.canStopAt(f); // 向上方向有請求
                        }
                        else {
                            return f < currentFloor && car.canStopAt(f); // 向下方向有請求
                        }
                    });
                    // 如果電梯在當前方向沒有更多請求，即將改變方向
                    if (!hasRequestsInCurrentDirection) {
                        score += 15; // 即將改變方向加15分
                    }
                }
            }
            // 5. 目標樓層方向評分（如果有目標樓層）
            if (request.destFloor !== undefined) {
                const requestedDirection = request.destFloor > request.floor;
                if (requestedDirection === request.goingUp) {
                    score += 20; // 請求方向一致加20分
                }
            }
            return { car, score, distance };
        });
        // 按評分排序，分數高的在前
        carScores.sort((a, b) => b.score - a.score);
        // 如果最高分有多個，選擇距離最近的
        const bestScore = carScores[0].score;
        const bestCars = carScores.filter(cs => cs.score === bestScore);
        if (bestCars.length === 1) {
            console.log(`選擇 ${bestCars[0].car.getCarNumber()} 號電梯，評分：${bestScore.toFixed(1)}`);
            return bestCars[0].car;
        }
        else {
            // 多個電梯分數相同，選擇距離最近的
            const closestCar = bestCars.reduce((closest, current) => current.distance < closest.distance ? current : closest);
            console.log(`多個電梯評分相同 (${bestScore.toFixed(1)})，選擇最近的 ${closestCar.car.getCarNumber()} 號電梯`);
            return closestCar.car;
        }
    }
    // 20250522 Ella 新增：檢查電梯是否在前往請求樓層的路線上
    isElevatorOnRoute(car, requestFloor, currentFloor) {
        if (car.goingUp) {
            return requestFloor > currentFloor; // 向上行駛且請求樓層在上方
        }
        else {
            return requestFloor < currentFloor; // 向下行駛且請求樓層在下方
        }
    }
    // 20250522 Ella 修改：新增輔助方法
    assignElevator(car, request) {
        const typeMsg = request.requestType === RequestType.PickupPassenger ? '接乘客' : '送乘客';
        if (request.requestType === RequestType.PickupPassenger) {
            // 接乘客請求：電梯去指定樓層接乘客
            car.goTo(request.floor);
            console.log(`分配 ${car.getCarNumber()} 號電梯去 ${this.floorNumberToString(request.floor)} 樓接乘客`);
        }
        else if (request.requestType === RequestType.DeliverPassenger) {
            // 送乘客請求：電梯去目標樓層送乘客
            if (request.destFloor !== undefined) {
                car.goTo(request.destFloor);
                console.log(`分配 ${car.getCarNumber()} 號電梯送乘客到 ${this.floorNumberToString(request.destFloor)} 樓`);
            }
            else {
                console.log(`警告：送乘客請求缺少目標樓層資訊`);
                return;
            }
        }
        console.log(`等待時間：${((Date.now() - request.requestTime) / 1000).toFixed(1)} 秒`);
    }
    // 20250522 Ella 修改：樓層號碼轉換為顯示文字
    floorNumberToString(floor) {
        return floor === -1 ? 'B1' : floor.toString();
    }
    // 20250522 Ella 修改：檢查電梯是否可以前往目標樓層
    canCarGoToFloor(car, floor) {
        return car.canStopAt(floor);
    }
    // 20250522 Ella 修改：獲取電梯可停靠樓層資訊
    getElevatorInfo() {
        return this.cars.map(car => {
            const floors = car.getAllowedFloors()
                .map(f => this.floorNumberToString(f))
                .join(', ');
            return `${car.getCarNumber()}號電梯可停靠樓層：${floors}`;
        }).join('\n');
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
                // 只有當目標樓層不等於起始樓層時才生成乘客
                if (destFloor !== i) {
                    this.riders.push(new Rider(p, this.settings, i + 1, destFloor + 1, this, this.stats, this.talker));
                }
            }
        }
    }
    // Select a destination floor based on the flow matrix probabilities
    selectDestinationFloor(sourceFloor) {
        const p = this.p;
        const numFloors = this.settings.numFloors;
        // 找出所有可以從 sourceFloor 到達的樓層
        const accessibleFloors = this.activeCars().reduce((floors, car) => {
            // 只有當電梯可以同時停靠起點和終點時，該樓層才是可達的
            if (car.canStopAt(sourceFloor)) {
                for (let floor = 0; floor < numFloors; floor++) {
                    if (floor !== sourceFloor && car.canStopAt(floor)) {
                        floors.add(floor);
                    }
                }
            }
            return floors;
        }, new Set());
        // 如果沒有可達的樓層，返回原樓層（乘客不會生成）
        if (accessibleFloors.size === 0) {
            return sourceFloor;
        }
        // 將 flow matrix 限制在可達樓層內
        let totalFlowFromSource = 0;
        for (const destFloor of accessibleFloors) {
            totalFlowFromSource += this.floorFlow[sourceFloor][destFloor];
        }
        // 在可達樓層中選擇目標
        let rand = p.random(totalFlowFromSource);
        let cumulative = 0;
        for (const destFloor of accessibleFloors) {
            cumulative += this.floorFlow[sourceFloor][destFloor];
            if (rand < cumulative) {
                return destFloor;
            }
        }
        // 如果還是沒選到，隨機選擇一個可達樓層
        const accessibleFloorsArray = Array.from(accessibleFloors);
        return accessibleFloorsArray[Math.floor(p.random(accessibleFloorsArray.length))];
    }
    // 20250522 Ella 新增：專用送乘客請求方法
    requestDelivery(car, destFloor, rider) {
        // 檢查電梯是否能到達目標樓層
        if (!car.canStopAt(destFloor)) {
            console.log(`警告：${car.getCarNumber()} 號電梯無法送乘客到 ${this.floorNumberToString(destFloor)} 樓`);
            return;
        }
        // 直接在電梯內處理送乘客請求
        car.goTo(destFloor);
        console.log(`${car.getCarNumber()} 號電梯接收送乘客請求：前往 ${this.floorNumberToString(destFloor)} 樓`);
    }
    // 20250522 Ella 新增：動態請求分配 - 讓移動中的電梯接收同方向請求
    assignRequestToMovingElevators(request) {
        // 20250522 Ella 新增：檢查請求是否仍然有效
        if (request.rider) {
            // 如果乘客已經上車或離開，則請求無效
            if (request.rider.state === RiderState.Boarding ||
                request.rider.state === RiderState.Riding ||
                request.rider.state === RiderState.Exiting ||
                request.rider.state === RiderState.Exited) {
                console.log(`跳過無效請求：${this.floorNumberToString(request.floor)} 樓（乘客已上車或已離開）`);
                return true; // 視為已處理，不重新入隊
            }
        }
        // 檢查樓層是否還有等待的乘客
        if (!this.hasWaitingRidersOnFloor(request.floor)) {
            console.log(`跳過無乘客請求：${this.floorNumberToString(request.floor)} 樓（該樓層沒有等待的乘客）`);
            return true; // 視為已處理，不重新入隊
        }
        const requestFloorY = this.p.yFromFloor(request.floor);
        // 找出正在移動且方向符合的電梯
        const suitableMovingCars = this.activeCars().filter(car => {
            if (car.state !== CarState.Moving)
                return false;
            if (!car.canStopAt(request.floor))
                return false;
            if (request.destFloor !== undefined && !car.canStopAt(request.destFloor))
                return false;
            // 檢查電梯方向是否與請求方向相符
            if (car.goingUp !== request.goingUp)
                return false;
            // 檢查電梯是否會經過請求樓層
            if (request.goingUp) {
                // 向上請求：電梯目前位置要在請求樓層下方
                return car.y < requestFloorY;
            }
            else {
                // 向下請求：電梯目前位置要在請求樓層上方
                return car.y > requestFloorY;
            }
        });
        if (suitableMovingCars.length === 0) {
            return false; // 沒有合適的移動中電梯
        }
        // 選擇距離請求樓層最近的電梯
        const closestCar = suitableMovingCars.reduce((closest, current) => {
            const closestDistance = Math.abs(closest.y - requestFloorY);
            const currentDistance = Math.abs(current.y - requestFloorY);
            return currentDistance < closestDistance ? current : closest;
        });
        // 將請求樓層加入該電梯的目標列表
        closestCar.goTo(request.floor);
        const typeMsg = request.requestType === RequestType.PickupPassenger ? '接乘客' : '送乘客';
        console.log(`動態分配：${closestCar.getCarNumber()} 號電梯（移動中）接收${typeMsg}請求 - ${this.floorNumberToString(request.floor)} 樓`);
        return true; // 成功分配給移動中的電梯
    }
    // 20250522 Ella 新增：清理已完成的請求
    cleanupCompletedRequests() {
        const initialLength = this.carCallQueue.length;
        this.carCallQueue = this.carCallQueue.filter(request => {
            // 如果請求有綁定乘客
            if (request.rider) {
                // 檢查乘客是否已經在電梯中或已離開
                if (request.rider.state === RiderState.Boarding ||
                    request.rider.state === RiderState.Riding ||
                    request.rider.state === RiderState.Exiting ||
                    request.rider.state === RiderState.Exited) {
                    console.log(`清理已完成的請求：${this.floorNumberToString(request.floor)} 樓（乘客已上車或已離開）`);
                    return false; // 移除此請求
                }
            }
            // 檢查請求是否過期（超過30秒）
            const requestAge = Date.now() - request.requestTime;
            if (requestAge > 30000) {
                console.log(`清理過期請求：${this.floorNumberToString(request.floor)} 樓（超過30秒）`);
                return false; // 移除過期請求
            }
            return true; // 保留有效請求
        });
        if (this.carCallQueue.length !== initialLength) {
            console.log(`請求清理完成：移除 ${initialLength - this.carCallQueue.length} 個無效請求`);
        }
    }
    // 20250522 Ella 新增：檢查樓層是否還有等待的乘客
    hasWaitingRidersOnFloor(floor) {
        return this.riders.some(rider => rider.startFloor === floor &&
            (rider.state === RiderState.Waiting || rider.state === RiderState.ArrivedAndCalling));
    }
}
/** Manages an elevator rider */
var RiderState;
(function (RiderState) {
    RiderState[RiderState["Arriving"] = 0] = "Arriving";
    RiderState[RiderState["ArrivedAndCalling"] = 1] = "ArrivedAndCalling";
    RiderState[RiderState["Waiting"] = 2] = "Waiting";
    RiderState[RiderState["Boarding"] = 3] = "Boarding";
    RiderState[RiderState["Riding"] = 4] = "Riding";
    RiderState[RiderState["Exiting"] = 5] = "Exiting";
    RiderState[RiderState["Exited"] = 6] = "Exited";
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
                this.followPath(this.arrivingPath, RiderState.ArrivedAndCalling, () => {
                    this.talker.speakRandom('arriving', undefined, 0.1);
                });
                break;
            case RiderState.ArrivedAndCalling:
                // 乘客已到達，現在呼叫電梯
                this.requestCar();
                this.state = RiderState.Waiting;
                break;
            case RiderState.Waiting:
                this.waitForCar();
                break;
            case RiderState.Boarding:
                const canceled = this.followPath(this.boardingPath, RiderState.Riding, () => {
                    this.stats.updateRiderStats('waiting', -1);
                    this.stats.updateRiderStats('riding', 1, this.weight);
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
        this.dispatcher.requestCar(this.startFloor, this.destFloor > this.startFloor, this.destFloor, 'pickup', this);
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
            if (suitableCar.canStopAt(this.destFloor)) {
                this.carIn = suitableCar;
                this.carIn.addRider(this);
                this.dispatcher.requestDelivery(this.carIn, this.destFloor, this);
                this.setBoardingPath(suitableCar);
                this.millisAtLastMove = this.p.millis();
                this.state = RiderState.Boarding;
            }
            else {
                // 電梯無法到達目的樓層
                // 使用新的方法重新請求電梯，排除目前無法服務的電梯
                if (this.dispatcher.requestCarForSpecificRider) {
                    this.dispatcher.requestCarForSpecificRider(this.startFloor, goingUp, this.destFloor, this, suitableCar);
                }
                else {
                    // 備用方案：延遲後重新請求
                    setTimeout(() => {
                        this.requestCar();
                    }, 100);
                }
            }
        }
        else if (suitableExceptFullEncountered) {
            this.talker.speakRandom('carFull', undefined, 0.3);
        }
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
            this.stats.updateRiderStats('riding', -1, -this.weight);
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
        const s = stats.getStats();
        const l = s => s.toLocaleString();
        const now = p.millis() / 1000;
        const waitingRiders = dispatcher.riders.filter(r => r.state === RiderState.Waiting);
        const waitSecs = waitingRiders.reduce((accum, rider) => (now - rider.arrivalTime) + accum, 0);
        const wait = s.currentWaiting ? ` (${l(Math.round(waitSecs))} sec)` : '';
        const profit = s.payments - s.costs;
        $('#score').html(l(Math.round(Math.max(0, profit / (p.millis() / 1000 / 60)))));
        $('#waiting').html(`${l(s.totalWaitingTime)} total sec (${l(s.currentWaiting)} current${wait})`);
        const weight = s.currentRiding ? ` (${l(s.currentRidingKg / 1000)} Mg)` : '';
        $('#riding').html(`${l(s.riding)} total (${l(s.currentRiding)} current${weight})`);
        $('#served').html(l(s.served));
        const curStyle = { style: 'currency', currency: 'USD' };
        $('#payments').html(s.payments.toLocaleString('en-us', curStyle));
        $('#costs').html(s.costs.toLocaleString('en-us', curStyle));
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
            totalRiding: 0,
            totalWaiting: 0,
            totalRidingKg: 0,
            totalWaitingTime: 0,
            lastUpdateTime: 0
        };
        this.costs = {
            perSec: 0.01,
            perSecPerCar: 0.01,
            perFloor: 0.1,
            operating: 0,
            totalOperating: 0
        };
        this.normalRideCost = 0.25;
        this.maxRecentRiderPayments = 150;
        this.recentRiderPayments = [];
        this.recentTripTimes = [];
        this.riders.lastUpdateTime = Date.now() / 1000;
    }
    updateWaitingTime() {
        const currentTime = Date.now() / 1000;
        const deltaTime = currentTime - this.riders.lastUpdateTime;
        this.riders.totalWaitingTime += deltaTime * this.riders.waiting;
        this.riders.lastUpdateTime = currentTime;
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
        const cost = this.costs.perFloor * (1 + speed / 10) * numFloors;
        this.costs.operating += cost;
        this.costs.totalOperating += cost;
    }
    addIdleCosts(secs, numActiveCars) {
        const baseCost = this.costs.perSec * secs;
        const carCost = this.costs.perSecPerCar * secs * numActiveCars;
        this.costs.operating += baseCost + carCost;
        this.costs.totalOperating += baseCost + carCost;
        this.updateWaitingTime();
    }
    updateRiderStats(type, change, weight = 0) {
        if (type === 'waiting') {
            const newWaiting = Math.max(0, this.riders.waiting + change);
            this.riders.waiting = newWaiting;
            if (change > 0) {
                this.riders.totalWaiting += change;
            }
        }
        else if (type === 'riding') {
            const oldRiding = this.riders.riding;
            const newRiding = Math.max(0, oldRiding + change);
            console.log(`Riding change: ${oldRiding} -> ${newRiding} (change: ${change}, weight: ${weight})`);
            this.riders.riding = newRiding;
            this.riders.ridingKg = Math.max(0, this.riders.ridingKg + weight);
            if (change > 0) {
                this.riders.totalRiding += change;
                this.riders.totalRidingKg += Math.max(0, weight);
            }
        }
    }
    getStats() {
        return {
            riding: this.riders.totalRiding,
            ridingKg: this.riders.totalRidingKg,
            waiting: this.riders.totalWaiting,
            served: this.riders.served,
            payments: this.riders.payments,
            costs: this.costs.totalOperating,
            currentRiding: this.riders.riding,
            currentWaiting: this.riders.waiting,
            totalWaitingTime: Math.round(this.riders.totalWaitingTime),
            currentRidingKg: this.riders.ridingKg
        };
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
            wrongElevator: ['wrong elevator', 'this one can\'t go there', 'need different elevator', 'can\'t reach that floor', 'wrong car']
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