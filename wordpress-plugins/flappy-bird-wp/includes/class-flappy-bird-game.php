<?php
if (!defined('ABSPATH')) {
    exit;
}

class Flappy_Bird_Game {
    public function enqueue_assets() {
        // Add sound files
        wp_enqueue_script('howler-js', 'https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.3/howler.min.js');
        wp_localize_script('flappy-bird-game', 'flappyBirdSounds', array(
            'jump' => plugins_url('assets/sounds/jump.mp3', FLAPPY_BIRD_PLUGIN_FILE),
            'score' => plugins_url('assets/sounds/score.mp3', FLAPPY_BIRD_PLUGIN_FILE),
            'hit' => plugins_url('assets/sounds/hit.mp3', FLAPPY_BIRD_PLUGIN_FILE)
        ));
    }
    public function render_game() {
        ob_start();
        ?>
        <div class="flappy-bird-game">
            <div id="game-container">
                <div id="game-screen">
                    <div id="bird"></div>
                    <div id="score">0</div>
                    <div id="start-message">Press Space or Click to Start</div>
                    <div id="game-over" style="display:none;">
                        <h2>Game Over!</h2>
                        <p>Score: <span id="final-score">0</span></p>
                        <p>High Score: <span id="high-score">0</span></p>
                        <button id="restart-button">Play Again</button>
                    </div>
                    <div id="pause-screen" style="display:none;">
                        <h2>Paused</h2>
                        <p>Press ESC to resume</p>
                    </div>
                </div>
                <div class="game-controls">
                    <button id="mute-button" class="control-button">
                        <span class="dashicons dashicons-volume-up"></span>
                    </button>
                    <button id="pause-button" class="control-button">
                        <span class="dashicons dashicons-controls-pause"></span>
                    </button>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
}