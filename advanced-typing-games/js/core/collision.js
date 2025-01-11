class CollisionSystem {
    constructor() {
        this.collisionBuffer = 20; // Buffer zone around words
    }

    checkCollision(player, word) {
        // Basic circular collision
        const dx = word.x - player.x;
        const dy = word.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if within collision range
        const collisionRange = player.size + this.collisionBuffer;
        return distance < collisionRange;
    }

    checkBoundaryCollision(object, canvas) {
        return {
            left: object.x - object.size < 0,
            right: object.x + object.size > canvas.width,
            top: object.y - object.size < 0,
            bottom: object.y + object.size > canvas.height
        };
    }

    resolveCollision(object, boundary, canvas) {
        if (boundary.left) object.x = object.size;
        if (boundary.right) object.x = canvas.width - object.size;
        if (boundary.top) object.y = object.size;
        if (boundary.bottom) object.y = canvas.height - object.size;
    }
}