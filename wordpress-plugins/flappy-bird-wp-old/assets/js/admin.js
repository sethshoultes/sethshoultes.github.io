(function($) {
    'use strict';

    /**
     * Initializes the game preview within the #game-preview container.
     * Removes any existing preview and initializes a new one.
     */
    function initializePreview() {
        const previewContainer = document.getElementById('game-preview');
        if (previewContainer) {
            // Clear previous preview
            while (previewContainer.firstChild) {
                previewContainer.removeChild(previewContainer.firstChild);
            }
            
            // Initialize new preview
            try {
                window.gamePreview = new FlappyBirdGame(previewContainer, true);
            } catch (error) {
                console.error('Preview initialization failed:', error);
            }
        }
    }

    /**
     * Updates the game preview settings.
     * Gets the current values from the setting fields and updates the game preview instance with them.
     * If the preview instance doesn't exist yet, it will be initialized.
     */
    function updatePreview() {
        const settings = {
            bird_color: $('#bird_color').val(),
            pipe_color: $('#pipe_color').val(),
            background_color: $('#background_color').val(),
            canvas_width: parseInt($('#canvas_width').val()),
            canvas_height: parseInt($('#canvas_height').val()),
            base_speed: parseFloat($('#base_speed').val()),
            speed_increment: parseFloat($('#speed_increment').val()),
            base_gap: parseInt($('#base_gap').val()),
            gap_decrement: parseFloat($('#gap_decrement').val()),
            min_gap: parseInt($('#min_gap').val()),
            score_threshold: parseInt($('#score_threshold').val()),
            gravity: parseFloat($('#gravity').val()),
            jump_force: parseFloat($('#jump_force').val())
        };

        // Update preview game instance
        if (window.gamePreview) {
            try {
                window.gamePreview = new FlappyBirdGame(document.getElementById('game-preview'), true);
            } catch (error) {
                console.error('Failed to update game preview:', error);
            }
        }
    }

    $(document).ready(function() {
        // Initialize color pickers
        $('.color-picker').wpColorPicker({
            change: function() {
                updatePreview();
            }
        });

        // Add number input change handlers
        $('input[type="number"]').on('change', function() {
            updatePreview();
        });

        // Initialize preview
        initializePreview();
    });
})(jQuery);

class FlappyBirdAdmin {
    initializePreview() {
        const previewContainer = document.getElementById('game-preview');
        if (previewContainer) {
            // Clear existing preview
            while (previewContainer.firstChild) {
                previewContainer.removeChild(previewContainer.firstChild);
            }

            // Add preview controls
            const controls = document.createElement('div');
            controls.className = 'preview-controls';
            controls.innerHTML = `
                <button id="previewStart" class="button button-primary">Start Preview</button>
                <button id="previewReset" class="button">Reset Preview</button>
            `;
            previewContainer.appendChild(controls);

            // Create game container
            const gameContainer = document.createElement('div');
            gameContainer.id = 'preview-game-container';
            previewContainer.appendChild(gameContainer);

            // Initialize preview game
            this.previewGame = new FlappyBirdGame(gameContainer, true);

            // Add preview control listeners
            document.getElementById('previewStart').addEventListener('click', () => {
                if (!this.previewGame.gameState.started) {
                    this.previewGame.startGame();
                    document.getElementById('previewStart').textContent = 'Pause Preview';
                } else {
                    this.previewGame.togglePause();
                    document.getElementById('previewStart').textContent = 
                        this.previewGame.gameState.paused ? 'Resume Preview' : 'Pause Preview';
                }
            });

            document.getElementById('previewReset').addEventListener('click', () => {
                this.previewGame.resetGame();
                document.getElementById('previewStart').textContent = 'Start Preview';
            });
        }
    }
}