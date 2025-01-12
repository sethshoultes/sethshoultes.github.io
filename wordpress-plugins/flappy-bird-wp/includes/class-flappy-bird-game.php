<?php
class Flappy_Bird_Game {
    private $options;

    public function __construct() {
        $this->options = get_option('flappy_bird_options', self::get_default_options());
        add_shortcode('flappy_bird', array($this, 'render_game'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_game_assets'));
    }

    /**
     * Gets the default options for the Flappy Bird game.
     *
     * @since 1.0.0
     *
     * @return array Array of default options.
     */
    public static function get_default_options() {
        return array(
            'bird_color' => '#FFE338',
            'pipe_color' => '#2ecc71',
            'background_color' => '#70c5ce',
            'canvas_width' => 480,
            'canvas_height' => 640,
            'base_speed' => 2,
            'speed_increment' => 0.1,
            'base_gap' => 160,
            'gap_decrement' => 1,
            'min_gap' => 120,
            'score_threshold' => 5,
            'gravity' => 0.39,
            'jump_force' => -7
        );
    }

    /**
     * Enqueues the CSS and JavaScript assets for the Flappy Bird game.
     *
     * This function is hooked into `wp_enqueue_scripts`.
     *
     * @since 1.0.0
     */
    public function enqueue_game_assets() {
        wp_enqueue_style(
            'flappy-bird-game',
            FLAPPY_BIRD_PLUGIN_URL . 'assets/css/game.css',
            array(),
            FLAPPY_BIRD_VERSION
        );

        wp_enqueue_script(
            'flappy-bird-game',
            FLAPPY_BIRD_PLUGIN_URL . 'assets/js/game.js',
            array('jquery'),
            FLAPPY_BIRD_VERSION,
            true
        );

        wp_localize_script(
            'flappy-bird-game',
            'flappyBirdSettings',
            $this->options
        );
    }

    /**
     * Renders the Flappy Bird game.
     *
     * This function is used by the [flappy_bird] shortcode.
     *
     * @since 1.0.0
     *
     * @return string The rendered game HTML.
     */
    public function render_game() {
        ob_start();
        ?>
        <div class="flappy-bird-container">
            <div class="game-controls">
                <button id="startGame" class="game-button">Start Game</button>
                <button id="resetGame" class="game-button">Reset</button>
            </div>
            <div id="gameCanvas"></div>
            <div class="game-score">
                <span>Score: <span id="currentScore">0</span></span>
                <span>High Score: <span id="highScore">0</span></span>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
}