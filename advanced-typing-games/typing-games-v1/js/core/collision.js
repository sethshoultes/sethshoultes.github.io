class CollisionSystem {
    constructor() {
        this.spatialHash = new SpatialHash(100); // Grid size of 100 pixels
        this.collisionBuffer = 20;
    }

    update(objects) {
        this.spatialHash.clear();
        objects.forEach(obj => this.spatialHash.insert(obj));
    }

    checkCollision(player, word) {
        // Quick AABB check first
        if (!this.checkAABB(player, word)) {
            return false;
        }

        // More precise circular collision
        const dx = word.x - player.x;
        const dy = word.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return distance < (player.size + this.collisionBuffer);
    }

    checkAABB(a, b) {
        return !(
            ((a.y + a.size) < (b.y - this.collisionBuffer)) ||
            (a.y - a.size > (b.y + this.collisionBuffer)) ||
            ((a.x + a.size) < (b.x - this.collisionBuffer)) ||
            (a.x - a.size > (b.x + this.collisionBuffer))
        );
    }

    getPotentialCollisions(object) {
        return this.spatialHash.query(object);
    }
}

class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.grid = new Map();
    }

    clear() {
        this.grid.clear();
    }

    getKey(x, y) {
        const gridX = Math.floor(x / this.cellSize);
        const gridY = Math.floor(y / this.cellSize);
        return `${gridX},${gridY}`;
    }

    insert(object) {
        const key = this.getKey(object.x, object.y);
        if (!this.grid.has(key)) {
            this.grid.set(key, new Set());
        }
        this.grid.get(key).add(object);
    }

    query(object) {
        const nearby = new Set();
        const radius = object.size + 20; // collision buffer

        // Check surrounding cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = object.x + dx * this.cellSize;
                const y = object.y + dy * this.cellSize;
                const key = this.getKey(x, y);
                
                if (this.grid.has(key)) {
                    this.grid.get(key).forEach(obj => {
                        if (obj !== object) {
                            nearby.add(obj);
                        }
                    });
                }
            }
        }

        return Array.from(nearby);
    }
}