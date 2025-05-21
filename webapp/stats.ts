class Stats {
    private riders = {
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
    private costs = {
        perSec: 0.01,
        perSecPerCar: 0.01,
        perFloor: 0.1,
        operating: 0,
        totalOperating: 0
    };
    private normalRideCost = 0.25;
    private maxRecentRiderPayments = 150;
    private recentRiderPayments = [];
    private recentTripTimes = [];

    constructor() {
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

    updateRiderStats(type: 'waiting' | 'riding', change: number, weight: number = 0) {
        if (type === 'waiting') {
            const newWaiting = Math.max(0, this.riders.waiting + change);
            this.riders.waiting = newWaiting;
            if (change > 0) {
                this.riders.totalWaiting += change;
            }
        } else if (type === 'riding') {
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
            totalWaitingTime: Math.round(this.riders.totalWaitingTime)
        };
    }
}
