declare const p5;

// 直接擴展Window接口
interface Window {
    dispatcher: any;
    setNumFloors: any;
    getRandomFloorFlow: any;
}

// 宣告全局函數
declare function testFloorFlowMatrix(numFloors: number): number[][];
declare function getRandomFloorFlow(numFloors: number, maxFlowValue?: number, lobbyFactor?: number, p?: any): number[][];

new p5(p => {
    const passengerLoadTypes =
        ['Varying', 'Very Light', 'Light', 'Moderate', 'Heavy', 'Very Heavy', 'Insane'];

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
                scaleMetersTo3dUnits: 16,  // Some objects are defined with metric dimensions
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

    p.preload = function() {
        p.dingSound = p.loadSound('assets/ding.wav');
    };

    p.setup = function() {
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
            window.getRandomFloorFlow = (numFloors, maxFlowValue, lobbyFactor) => 
                getRandomFloorFlow(numFloors || settings.numFloors, maxFlowValue, lobbyFactor, p);
            
            controls.createKnobs(passengerLoadTypes);
            controls.activeCarsChange = () => dispatcher.updateCarActiveStatuses();
            controls.volumeChange = v => talker.volume(v);
            ready = true;
        });
    };

    function setCanvasSize() {
        const m = $('#main');
        settings.geom.canvas = p.createVector(m.width() * 0.95, p.windowHeight * 0.92);  // todo Remove these magic numbers
    }

    p.windowResized = function() {
        setCanvasSize();
        p.resizeCanvas(settings.geom.canvas.x, settings.geom.canvas.y);
    };

    p.mouseMoved = function() {
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

    p.mousePressed = function() {
        manuallySummon();
    };

    p.mouseDragged = function() {
        manuallySummon();
    };

    p.pushed = function(block) {
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
        const curStyle: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD' };
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
        } else {
            p.perspective();
            if (settings.controlMode === 0 /* Auto */) {
                const avgCarY = cars.map(car => car.y).reduce((a, b) => a + b, 0) / cars.length;
                p.camera(0, -avgCarY, (p.height / 2.0) / p.tan(p.PI * 30.0 / 180.0), 0, 0, 0, 0, 1, 0);
            } else setDefault();
        }
    }

    let lastDrawTimeSecs = p.millis() / 1000;

    p.draw = function () {
        if (! ready) return;
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
    window.setNumFloors = function(floors) {
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
        } else {
            console.error("Number of floors must be a positive integer greater than 1");
            return settings.numFloors;
        }
    };
});
