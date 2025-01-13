<?php
class Flappy_Bird_Admin {
    private $options;

    public function __construct() {
        add_action('admin_menu', array($this, 'add_plugin_page'));
        add_action('admin_init', array($this, 'page_init'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
    }

    public function add_plugin_page() {
        add_menu_page(
            __('Flappy Bird Settings', 'flappy-bird-wp'),
            __('Flappy Bird', 'flappy-bird-wp'),
            'manage_options',
            'flappy-bird-settings',
            array($this, 'create_admin_page'),
            'dashicons-games'
        );
    }

    public function enqueue_admin_assets($hook) {
        if ('toplevel_page_flappy-bird-settings' !== $hook) {
            return;
        }

        // Enqueue game.js first
        wp_enqueue_script(
            'flappy-bird-game-core',
            FLAPPY_BIRD_PLUGIN_URL . 'assets/js/game.js',
            array('jquery'),
            FLAPPY_BIRD_VERSION,
            true
        );

        wp_enqueue_style('wp-color-picker');
        wp_enqueue_script('wp-color-picker');
        
        wp_enqueue_style(
            'flappy-bird-admin',
            FLAPPY_BIRD_PLUGIN_URL . 'assets/css/admin.css',
            array(),
            FLAPPY_BIRD_VERSION
        );

        wp_enqueue_script(
            'flappy-bird-admin',
            FLAPPY_BIRD_PLUGIN_URL . 'assets/js/admin.js',
            array('jquery', 'wp-color-picker', 'flappy-bird-game-core'),
            FLAPPY_BIRD_VERSION,
            true
        );

        // Localize settings for admin preview
        wp_localize_script(
            'flappy-bird-admin',
            'flappyBirdSettings',
            get_option('flappy_bird_options', Flappy_Bird_Game::get_default_options())
        );
    }

    public function create_admin_page() {
        $this->options = get_option('flappy_bird_options', Flappy_Bird_Game::get_default_options());
        ?>
        <div class="wrap">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
            <form method="post" action="options.php">
                <?php
                settings_fields('flappy_bird_options');
                do_settings_sections('flappy-bird-settings');
                submit_button();
                ?>
            </form>
            <div id="preview-container">
                <h2><?php _e('Preview', 'flappy-bird-wp'); ?></h2>
                <div id="game-preview"></div>
            </div>
        </div>
        <?php
    }

    public function page_init() {
        register_setting(
            'flappy_bird_options',
            'flappy_bird_options',
            array($this, 'sanitize')
        );

        // Add settings sections and fields here
        $this->add_settings_sections();
    }

    private function add_settings_sections() {
        // Visual Settings
        add_settings_section(
            'visual_settings',
            __('Visual Settings', 'flappy-bird-wp'),
            null,
            'flappy-bird-settings'
        );

        // Gameplay Settings
        add_settings_section(
            'gameplay_settings',
            __('Gameplay Settings', 'flappy-bird-wp'),
            null,
            'flappy-bird-settings'
        );

        // Add fields
        $this->add_settings_fields();
    }

    private function add_settings_fields() {
        // Visual Settings Fields
        $visual_fields = array(
            'bird_color' => array(
                'label' => __('Bird Color', 'flappy-bird-wp'),
                'type' => 'color'
            ),
            'pipe_color' => array(
                'label' => __('Pipe Color', 'flappy-bird-wp'),
                'type' => 'color'
            ),
            'background_color' => array(
                'label' => __('Background Color', 'flappy-bird-wp'),
                'type' => 'color'
            ),
            'canvas_width' => array(
                'label' => __('Canvas Width', 'flappy-bird-wp'),
                'type' => 'number'
            ),
            'canvas_height' => array(
                'label' => __('Canvas Height', 'flappy-bird-wp'),
                'type' => 'number'
            )
        );

        foreach ($visual_fields as $key => $field) {
            add_settings_field(
                $key,
                $field['label'],
                array($this, 'render_field'),
                'flappy-bird-settings',
                'visual_settings',
                array(
                    'key' => $key,
                    'type' => $field['type']
                )
            );
        }

        // Gameplay Settings Fields
        $gameplay_fields = array(
            'base_speed' => array(
                'label' => __('Base Speed', 'flappy-bird-wp'),
                'type' => 'number',
                'step' => '0.1'
            ),
            'speed_increment' => array(
                'label' => __('Speed Increment', 'flappy-bird-wp'),
                'type' => 'number',
                'step' => '0.1'
            ),
            'base_gap' => array(
                'label' => __('Base Gap', 'flappy-bird-wp'),
                'type' => 'number'
            ),
            'gap_decrement' => array(
                'label' => __('Gap Decrement', 'flappy-bird-wp'),
                'type' => 'number',
                'step' => '0.1'
            ),
            'min_gap' => array(
                'label' => __('Minimum Gap', 'flappy-bird-wp'),
                'type' => 'number'
            ),
            'score_threshold' => array(
                'label' => __('Score Threshold', 'flappy-bird-wp'),
                'type' => 'number'
            ),
            'gravity' => array(
                'label' => __('Gravity', 'flappy-bird-wp'),
                'type' => 'number',
                'step' => '0.01'
            ),
            'jump_force' => array(
                'label' => __('Jump Force', 'flappy-bird-wp'),
                'type' => 'number',
                'step' => '0.1'
            )
        );

        foreach ($gameplay_fields as $key => $field) {
            add_settings_field(
                $key,
                $field['label'],
                array($this, 'render_field'),
                'flappy-bird-settings',
                'gameplay_settings',
                array(
                    'key' => $key,
                    'type' => $field['type'],
                    'step' => isset($field['step']) ? $field['step'] : '1'
                )
            );
        }
    }

    public function render_field($args) {
        $key = $args['key'];
        $type = $args['type'];
        $step = isset($args['step']) ? $args['step'] : '1';
        $value = isset($this->options[$key]) ? $this->options[$key] : '';

        switch ($type) {
            case 'color':
                printf(
                    '<input type="color" id="%s" name="flappy_bird_options[%s]" value="%s" class="color-picker" />',
                    esc_attr($key),
                    esc_attr($key),
                    esc_attr($value)
                );
                break;
            case 'number':
                printf(
                    '<input type="number" step="%s" id="%s" name="flappy_bird_options[%s]" value="%s" class="regular-text" />',
                    esc_attr($step),
                    esc_attr($key),
                    esc_attr($key),
                    esc_attr($value)
                );
                break;
        }
    }

    public function sanitize($input) {
        $sanitized_input = array();
        $default_options = Flappy_Bird_Game::get_default_options();

        foreach ($default_options as $key => $default_value) {
            if (isset($input[$key])) {
                if (strpos($key, 'color') !== false) {
                    $sanitized_input[$key] = sanitize_hex_color($input[$key]);
                } else {
                    $sanitized_input[$key] = floatval($input[$key]);
                }
            } else {
                $sanitized_input[$key] = $default_value;
            }
        }

        return $sanitized_input;
    }
}
