/** 電梯請求類型 */
enum RequestType {
    PickupPassenger = 'pickup',    // 接乘客請求
    DeliverPassenger = 'deliver'   // 送乘客請求
}

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
    setFloorFlow(fromFloor: number, toFloor: number, value: number) {
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
    setFloorFlowMatrix(flowMatrix: number[][]) {
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
    getFloorFlowMatrix(): number[][] {
        // 直接返回內部矩陣，因為現在索引已經與樓層對應
        return this.floorFlow;
    }

    // 20250522 Ella 修改：處理乘客請求
    requestCar(startFloor: number, goingUp: boolean, destFloor?: number, requestType: RequestType = RequestType.PickupPassenger, rider?: any) {
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
        const existingRequest = this.carCallQueue.find(request => 
            request.floor === startFloor && 
            request.goingUp === goingUp && 
            request.requestType === requestType &&
            !request.rider  // 只檢查非乘客綁定的請求
        );
        
        if (!existingRequest) {
            this.carCallQueue.push({
                floor: startFloor,
                goingUp: goingUp,
                destFloor: destFloor, // 新增目標樓層資訊
                requestTime: Date.now(),
                requestType: requestType,  // 新增請求類型
                rider: rider  // 20250522 Ella 新增：綁定請求發起的乘客
            });

            const typeMsg = requestType === RequestType.PickupPassenger ? '接乘客' : '送乘客';
            const riderMsg = rider ? `（乘客ID: ${rider.constructor.name}）` : '';
            console.log(`新增${typeMsg}請求：${this.floorNumberToString(startFloor)} 樓${
                destFloor !== undefined ? ` 到 ${this.floorNumberToString(destFloor)} 樓` : ''
            }，方向：${goingUp ? '向上' : '向下'}${riderMsg}`);
            console.log(`可用電梯：${eligibleCars.map(car => car.getCarNumber()).join(', ')}號`);
        }
    }

    // 20250522 Ella 新增：為特定乘客請求電梯，繞過重複檢查
    requestCarForSpecificRider(startFloor: number, goingUp: boolean, destFloor: number, rider: any, excludeCar?: any, requestType: RequestType = RequestType.PickupPassenger) {
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
            specificRider: rider,  // 標記特定乘客
            excludeCar: excludeCar,  // 記錄要排除的電梯
            requestType: requestType  // 新增請求類型
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
                } else {
                    // 如果沒有合適的電梯，請求重新入隊
                    this.carCallQueue.push(request);
                    console.log(`請求重新入隊：${this.floorNumberToString(request.floor)} 樓，因為沒有最佳電梯`);
                }
            }
        }
    }

    // 20250522 Ella 新增：智能電梯選擇邏輯
    private selectBestElevator(eligibleCars: any[], request: any): any {
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
                score += 50;  // 閒置電梯加50分
            } else if (car.state === CarState.Moving) {
                score += 20;  // 移動中電梯加20分
            }
            
            // 3. 方向相符性評分（改進版）
            if (car.state === CarState.Idle || car.state === CarState.Moving) {
                const requestDirection = request.goingUp;
                const elevatorDirection = car.goingUp;
                
                if (requestDirection === elevatorDirection) {
                    score += 30;  // 方向相同加30分
                    
                    // 4. 行徑路線評分（電梯是否會經過請求樓層）
                    if (car.state === CarState.Moving) {
                        const isOnRoute = this.isElevatorOnRoute(car, request.floor, currentFloor);
                        if (isOnRoute) {
                            score += 40;  // 在行徑路線上加40分
                        }
                    }
                } else {
                    // 方向不同時，檢查電梯是否即將改變方向
                    const hasRequestsInCurrentDirection = car.destFloors.some(f => {
                        if (elevatorDirection) {
                            return f > currentFloor && car.canStopAt(f);  // 向上方向有請求
                        } else {
                            return f < currentFloor && car.canStopAt(f);  // 向下方向有請求
                        }
                    });
                    
                    // 如果電梯在當前方向沒有更多請求，即將改變方向
                    if (!hasRequestsInCurrentDirection) {
                        score += 15;  // 即將改變方向加15分
                    }
                }
            }
            
            // 5. 目標樓層方向評分（如果有目標樓層）
            if (request.destFloor !== undefined) {
                const requestedDirection = request.destFloor > request.floor;
                if (requestedDirection === request.goingUp) {
                    score += 20;  // 請求方向一致加20分
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
        } else {
            // 多個電梯分數相同，選擇距離最近的
            const closestCar = bestCars.reduce((closest, current) => 
                current.distance < closest.distance ? current : closest
            );
            console.log(`多個電梯評分相同 (${bestScore.toFixed(1)})，選擇最近的 ${closestCar.car.getCarNumber()} 號電梯`);
            return closestCar.car;
        }
    }
    
    // 20250522 Ella 新增：檢查電梯是否在前往請求樓層的路線上
    private isElevatorOnRoute(car: any, requestFloor: number, currentFloor: number): boolean {
        if (car.goingUp) {
            return requestFloor > currentFloor;  // 向上行駛且請求樓層在上方
        } else {
            return requestFloor < currentFloor;  // 向下行駛且請求樓層在下方
        }
    }

    // 20250522 Ella 修改：新增輔助方法
    private assignElevator(car: Car, request: any) {
        const typeMsg = request.requestType === RequestType.PickupPassenger ? '接乘客' : '送乘客';
        
        if (request.requestType === RequestType.PickupPassenger) {
            // 接乘客請求：電梯去指定樓層接乘客
            car.goTo(request.floor);
            console.log(`分配 ${car.getCarNumber()} 號電梯去 ${this.floorNumberToString(request.floor)} 樓接乘客`);
        } else if (request.requestType === RequestType.DeliverPassenger) {
            // 送乘客請求：電梯去目標樓層送乘客
            if (request.destFloor !== undefined) {
                car.goTo(request.destFloor);
                console.log(`分配 ${car.getCarNumber()} 號電梯送乘客到 ${this.floorNumberToString(request.destFloor)} 樓`);
            } else {
                console.log(`警告：送乘客請求缺少目標樓層資訊`);
                return;
            }
        }
        
        console.log(`等待時間：${((Date.now() - request.requestTime) / 1000).toFixed(1)} 秒`);
    }

    // 20250522 Ella 修改：樓層號碼轉換為顯示文字
    private floorNumberToString(floor: number): string {
        return floor === -1 ? 'B1' : floor.toString();
    }

    // 20250522 Ella 修改：檢查電梯是否可以前往目標樓層
    private canCarGoToFloor(car: Car, floor: number): boolean {
        return car.canStopAt(floor);
    }

    // 20250522 Ella 修改：獲取電梯可停靠樓層資訊
    public getElevatorInfo(): string {
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
            if (i === 1) continue; // 👈 如果你已經上面處理過 index 1（Lobby），這裡略過
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
    private selectDestinationFloor(sourceFloor: number): number {
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
        }, new Set<number>());

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
        const accessibleFloorsArray = Array.from(accessibleFloors) as number[];
        return accessibleFloorsArray[Math.floor(p.random(accessibleFloorsArray.length))];
    }

    // 20250522 Ella 新增：專用送乘客請求方法
    requestDelivery(car: any, destFloor: number, rider: any) {
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
    private assignRequestToMovingElevators(request: any): boolean {
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
            if (car.state !== CarState.Moving) return false;
            if (!car.canStopAt(request.floor)) return false;
            if (request.destFloor !== undefined && !car.canStopAt(request.destFloor)) return false;
            
            // 檢查電梯方向是否與請求方向相符
            if (car.goingUp !== request.goingUp) return false;
            
            // 檢查電梯是否會經過請求樓層
            if (request.goingUp) {
                // 向上請求：電梯目前位置要在請求樓層下方
                return car.y < requestFloorY;
            } else {
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
    private cleanupCompletedRequests() {
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
    private hasWaitingRidersOnFloor(floor: number): boolean {
        return this.riders.some(rider => 
            rider.startFloor === floor && 
            (rider.state === RiderState.Waiting || rider.state === RiderState.ArrivedAndCalling)
        );
    }
}
