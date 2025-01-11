class InputManager {
    constructor(isMobile, inputCallback) {
        this.isMobile = isMobile;
        this.inputCallback = inputCallback;
        this.touchStartPos = null;
        this.movement = { w: false, a: false, s: false, d: false };
        this.cleanup = [];

        this.init();
    }

    init() {
        if (this.isMobile) {
            this.initTouchControls();
        } else {
            this.initKeyboardControls();
        }
    }

    initKeyboardControls() {
        const handleKeyDown = (e) => {
            if (!this.isGameKey(e.key)) return;
            e.preventDefault();
            
            const key = e.key.toLowerCase();
            if (key in this.movement) {
                this.movement[key] = true;
                this.inputCallback(this.movement);
            }
        };

        const handleKeyUp = (e) => {
            if (!this.isGameKey(e.key)) return;
            e.preventDefault();
            
            const key = e.key.toLowerCase();
            if (key in this.movement) {
                this.movement[key] = false;
                this.inputCallback(this.movement);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        this.cleanup.push(() => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        });
    }

    initTouchControls() {
        const handleTouchStart = (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.touchStartPos = { x: touch.clientX, y: touch.clientY };
        };

        const handleTouchMove = (e) => {
            e.preventDefault();
            if (!this.touchStartPos) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - this.touchStartPos.x;
            const deltaY = touch.clientY - this.touchStartPos.y;
            
            // Convert touch movement to WASD
            this.movement.a = deltaX < -20;
            this.movement.d = deltaX > 20;
            this.movement.w = deltaY < -20;
            this.movement.s = deltaY > 20;

            this.inputCallback(this.movement);
        };

        const handleTouchEnd = (e) => {
            e.preventDefault();
            this.touchStartPos = null;
            Object.keys(this.movement).forEach(key => this.movement[key] = false);
            this.inputCallback(this.movement);
        };

        const gameArea = document.getElementById('game-container');
        gameArea.addEventListener('touchstart', handleTouchStart, { passive: false });
        gameArea.addEventListener('touchmove', handleTouchMove, { passive: false });
        gameArea.addEventListener('touchend', handleTouchEnd, { passive: false });

        this.cleanup.push(() => {
            gameArea.removeEventListener('touchstart', handleTouchStart);
            gameArea.removeEventListener('touchmove', handleTouchMove);
            gameArea.removeEventListener('touchend', handleTouchEnd);
        });
    }

    isGameKey(key) {
        return ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(key);
    }

    destroy() {
        this.cleanup.forEach(cleanup => cleanup());
        this.cleanup = [];
    }
}