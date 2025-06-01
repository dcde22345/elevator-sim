enum CarState {Idle, Moving, Opening, Open, Closing, DirectionChanging}

class Car {
    private readonly p: any;
    private settings: any;
    private stats: any;
    private readonly carNumber: number;
    private readonly doorDims: any;
    private readonly carHorizontalSpacing: number;
    private readonly carLeftMargin: number;
    private goingUp: boolean;
    private doorOpenFraction: number;
    private destFloors: any[];
    private riders: any[];
    private readonly pan: number;
    private sound: MotorSound;
    private readonly active: boolean;
    private state: CarState;
    private openSince: number;
    private lastMoveTime: number;
    private speed: number;
    private maxMaxSpeed: number;
    private maxSpeed: number;
    private accel: number;
    private startY: number;
    private endY: number;
    private absTrip: number;
    private accelDistance: number;
    private doorOpStarted: number;
    private y: number;

    private allowedFloors: number[];  // 20250522 Ella 新增：可停靠樓層列表
    private needsDirectionChange: boolean;  // 20250522 Ella 新增：標記是否需要改變方向
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
        this.doorOpenFraction = 0;  // 0…1 = closed…open
        this.destFloors = [];
        this.riders = [];
        this.pan = settings.numCars === 1 ? 0 : p.map(carNumber, 1, settings.numCars, -0.8, 0.8);
        this.sound = new MotorSound(this.pan);
        this.active = false;
        this.state = CarState.Idle;
        this.needsDirectionChange = false;  // 20250522 Ella 新增：初始化方向改變標記

        this.allowedFloors = this.initAllowedFloors(carNumber);// 20250522 Ella 修改：初始化各電梯可停靠樓層
    }
    // 20250522 Ella 修改：初始化各電梯可停靠樓層
    private initAllowedFloors(carNumber: number): number[] {
        // B1樓層用-1表示
        switch(carNumber) {
            case 1: 
                // 第一部電梯：停靠所有樓層（B1～12）
                return [-1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
            case 2:
                // 第二部電梯：僅停靠（B1、1、6、7、8、9、10、11、12）
                return [-1, 1, 2, 7, 8, 9, 10, 11, 12, 13];
            case 3:
                // 第三部電梯：僅停靠（1、4、6、8、10、12）
                return [1,2, 4, 6, 8, 10, 12, 13];
            case 4:
                // 第四部電梯：僅停靠（1、3、5、7、9、11）
                return [1,2, 3, 5, 7, 9, 11, 13];
            default:
                return [1]; // 預設情況
        }
    }
    
    // 20250522 Ella 修改：檢查電梯是否可停靠指定樓層
    public canStopAt(floor: number): boolean {
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
    public getAllowedFloors(): number[] {
        return [...this.allowedFloors];
    }

    // 20250522 Ella 修改：獲取電梯編號
    public getCarNumber(): number {
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
                    } else {
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
                    if (!this.canStopAt(floor)) continue;
                    
                    const floorY = p.yFromFloor(floor);
                    const distance = Math.abs(this.y - floorY);
                    
                    if (this.goingUp) {
                        // 向上時：找更高且最近的樓層
                        if (floorY > this.y && distance < bestDistance) {
                            nextDest = floor;
                            bestDistance = distance;
                        }
                    } else {
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
                        if (!this.canStopAt(floor)) continue;
                        
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
                    this.accelDistance = Math.min(this.absTrip / 2,
                        (this.maxSpeed * this.maxSpeed) / (2 * this.accel));
                } else {
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
                    this.goingUp = true;   // 只有上層請求時向上
                } else if (hasLowerFloors && !hasUpperFloors) {
                    this.goingUp = false;  // 只有下層請求時向下
                } else if (hasUpperFloors && hasLowerFloors) {
                    // 兩個方向都有請求時，保持當前方向或選擇較近的
                    // 這裡可以保持當前方向，或者選擇距離較近的方向
                }
            }
            
            // 1. 先根據當前方向找尋目標樓層
            let nextDest = null;
            let bestDistance = Infinity;
            
            // 在當前方向上找最近的目標樓層
            for (const floor of this.destFloors) {
                if (!this.canStopAt(floor)) continue;
                
                const floorY = p.yFromFloor(floor);
                const distance = Math.abs(this.y - floorY);
                
                if (this.goingUp) {
                    // 向上時：找更高且最近的樓層
                    if (floorY > this.y && distance < bestDistance) {
                        nextDest = floor;
                        bestDistance = distance;
                    }
                } else {
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
                this.accelDistance = Math.min(this.absTrip / 2,
                    (this.maxSpeed * this.maxSpeed) / (2 * this.accel));
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
        } else if (this.decelerating()) {
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
                const hasDownwardRequests = this.destFloors.some(f => 
                    f < 1 && this.canStopAt(f)
                );
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

    hasRoom(): boolean {
        return this.riders.length < this.settings.maxRidersPerCar;
    }

    decelerating(): boolean {
        return Math.abs(this.y - this.endY) < this.accelDistance && this.speed > 0;
    }

    accelerating(): boolean {
        return Math.abs(this.y - this.startY) < this.accelDistance && this.speed < this.maxSpeed;
    }

    removeCurrentFloorFromDest() {
        this.destFloors = this.destFloors.filter(f => this.p.yFromFloor(f) !== this.y);
    }

    goTo(floor, manual=false) {
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
                return a - b;  // 向上時按升序排列
            } else {
                return b - a;  // 向下時按降序排列
            }
        });
        
        this.destFloors = validDestinations;
    }
}
