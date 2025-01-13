<?php
class Flappy_Bird_Game {
    private $options;
    private $table_name;

    public function __construct() {
        global $wpdb;
        $this->table_name = $wpdb->prefix . 'flappy_bird_scores';
        $this->options = get_option('flappy_bird_options', self::get_default_options());
        add_shortcode('flappy_bird', array($this, 'render_game'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_game_assets'));
        add_action('rest_api_init', array($this, 'register_rest_routes'));
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
        // Enqueue styles
        wp_enqueue_style(
            'flappy-bird-game',
            FLAPPY_BIRD_PLUGIN_URL . 'assets/css/game.css',
            array(),
            FLAPPY_BIRD_VERSION
        );
    
        // Enqueue script
        wp_enqueue_script(
            'flappy-bird-game',
            FLAPPY_BIRD_PLUGIN_URL . 'assets/js/game.js',
            array('jquery'),
            FLAPPY_BIRD_VERSION,
            true
        );
    
        // Add settings and REST configuration to script
        wp_localize_script(
            'flappy-bird-game',
            'flappyBirdSettings',
            $this->get_default_options()
        );

        // Add REST API configuration
        wp_localize_script(
            'flappy-bird-game',
            'flappyBirdWPRest',
            array(
                'nonce' => wp_create_nonce('wp_rest'),
                'enabled' => is_user_logged_in()
            )
        );
    }

    public function verify_assets() {
        $js_path = FLAPPY_BIRD_PLUGIN_DIR . 'assets/js/game.js';
        $css_path = FLAPPY_BIRD_PLUGIN_DIR . 'assets/css/game.css';
        
        if (!file_exists($js_path)) {
            error_log('Flappy Bird WP: game.js not found at ' . $js_path);
        }
        
        if (!file_exists($css_path)) {
            error_log('Flappy Bird WP: game.css not found at ' . $css_path);
        }
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
        static $game_instance = 0;
        $game_instance++;
    
        $container_id = 'flappy-bird-' . $game_instance;
        
        ob_start();
        ?>
        <div id="<?php echo esc_attr($container_id); ?>" class="flappy-bird-container">
            <canvas id="gameCanvas-<?php echo esc_attr($game_instance); ?>" 
                    class="game-canvas"></canvas>
            <div class="game-controls">
                <button id="startGame-<?php echo esc_attr($game_instance); ?>" 
                        class="game-button">Start Game</button>
                <button id="resetGame-<?php echo esc_attr($game_instance); ?>" 
                        class="game-button">Reset</button>
            </div>
            <div class="game-score">
                <span>Score: <span id="currentScore-<?php echo esc_attr($game_instance); ?>">0</span></span>
                <span>High Score: <span id="highScore-<?php echo esc_attr($game_instance); ?>">0</span></span>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    
        /**
         * Creates the table used to store high scores.
         *
         * This function is a callback for the `plugins_loaded` action and is used to create the
         * table in the database when the plugin is activated.
         *
         * @since 1.0.0
         */
       public function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE IF NOT EXISTS {$this->table_name} (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            score int(11) NOT NULL,
            game_duration int(11) NOT NULL,
            pipes_passed int(11) NOT NULL,
            timestamp datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            KEY user_id (user_id),
            KEY score (score)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }
    
    public function register_rest_routes() {
        register_rest_route('flappy-bird/v1', '/save-score', array(
            'methods' => 'POST',
            'callback' => array($this, 'save_score'),
            'permission_callback' => function() {
                return is_user_logged_in();
            },
            'args' => array(
                'score' => array(
                    'required' => true,
                    'type' => 'integer',
                    'sanitize_callback' => 'absint',
                ),
                'game_duration' => array(
                    'required' => true,
                    'type' => 'integer',
                    'sanitize_callback' => 'absint',
                ),
                'pipes_passed' => array(
                    'required' => true,
                    'type' => 'integer',
                    'sanitize_callback' => 'absint',
                ),
            ),
        ));
        
        register_rest_route('flappy-bird/v1', '/leaderboard', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_leaderboard'),
            'permission_callback' => '__return_true',
        ));
    }
    
    public function save_score($request) {
        global $wpdb;
        
        $user_id = get_current_user_id();
        if (!$this->check_rate_limit($user_id)) {
            return new WP_Error(
                'rate_limit',
                'Too many score submissions',
                array('status' => 429)
            );
        }
        $score = $request['score'];
        $game_duration = $request['game_duration'];
        $pipes_passed = $request['pipes_passed'];
        if (!$this->validate_score($score, $duration, $pipes_passed)) {
            return new WP_Error(
                'invalid_score',
                'Invalid score detected',
                array('status' => 400)
            );
        }
        
        $result = $wpdb->insert(
            $this->table_name,
            array(
                'user_id' => $user_id,
                'score' => $score,
                'game_duration' => $game_duration,
                'pipes_passed' => $pipes_passed,
            ),
            array('%d', '%d', '%d', '%d')
        );
        
        if ($result === false) {
            return new WP_Error('db_error', 'Could not save score', array('status' => 500));
        }
        
        return new WP_REST_Response(array(
            'message' => 'Score saved successfully',
            'score_id' => $wpdb->insert_id
        ), 200);
    }
    
    public function get_leaderboard($request) {
        global $wpdb;
        $cache_key = 'flappy_bird_leaderboard_' . 
                 $request['limit'] . '_' . 
                 $request['offset'];
    
        $cached_data = wp_cache_get($cache_key);
        if ($cached_data !== false) {
            return new WP_REST_Response($cached_data, 200);
        }
        
        $limit = isset($request['limit']) ? absint($request['limit']) : 10;
        $offset = isset($request['offset']) ? absint($request['offset']) : 0;
        
        $scores = $wpdb->get_results($wpdb->prepare(
            "SELECT s.*, u.display_name 
            FROM {$this->table_name} s
            JOIN {$wpdb->users} u ON s.user_id = u.ID
            ORDER BY s.score DESC
            LIMIT %d OFFSET %d",
            $limit,
            $offset
        ));
        wp_cache_set($cache_key, $scores, '', 300); // Cache for 5 minutes
        return new WP_REST_Response($scores, 200);
    }
    // Add rate limiting for score submission
    private function check_rate_limit($user_id) {
        $submissions = get_transient('flappy_bird_submissions_' . $user_id);
        if ($submissions >= 10) { // Max 10 submissions per minute
            return false;
        }
        set_transient('flappy_bird_submissions_' . $user_id, ($submissions ? $submissions + 1 : 1), 60);
        return true;
    }

    // Add score validation
    private function validate_score($score, $duration, $pipes_passed) {
        // Basic validation: Check if score matches pipes passed
        if ($score > $pipes_passed) {
            return false;
        }
        // Check if average speed is realistic
        $avg_pipes_per_second = $pipes_passed / $duration;
        if ($avg_pipes_per_second > 2) { // Max 2 pipes per second
            return false;
        }
        return true;
    }
}