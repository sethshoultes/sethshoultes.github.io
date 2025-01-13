<?php
if (!defined('ABSPATH')) {
    exit;
}

class Flappy_Bird_Admin {
    private $options;

    public function __construct() {
        add_action('admin_menu', array($this, 'add_plugin_page'));
        add_action('admin_init', array($this, 'page_init'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
    }

    public function enqueue_admin_assets($hook) {
        if ($hook !== 'toplevel_page_flappy-bird-settings') {
            return;
        }

        wp_enqueue_style(
            'flappy-bird-admin',
            FLAPPY_BIRD_PLUGIN_URL . 'admin/css/flappy-bird-admin.css',
            array(),
            FLAPPY_BIRD_VERSION
        );
    }

    public function add_plugin_page() {
        add_menu_page(
            'Flappy Bird Settings', // Page title
            'Flappy Bird',          // Menu title
            'manage_options',       // Capability
            'flappy-bird-settings', // Menu slug
            array($this, 'create_admin_page'), // Function to output the page content
            'dashicons-games',      // Icon
            100                     // Position
        );
    }

    public function create_admin_page() {
        // Get option values
        $this->options = get_option('flappy_bird_options');
        ?>
        <div class="wrap">
            <h1>Flappy Bird Settings</h1>
            <form method="post" action="options.php">
                <?php
                settings_fields('flappy_bird_option_group');
                do_settings_sections('flappy-bird-settings');
                submit_button();
                ?>
            </form>
        </div>
        <?php
    }

    public function page_init() {
        register_setting(
            'flappy_bird_option_group',
            'flappy_bird_options',
            array($this, 'sanitize')
        );

        add_settings_section(
            'flappy_bird_setting_section',
            'Game Settings',
            array($this, 'section_info'),
            'flappy-bird-settings'
        );

        add_settings_field(
            'gravity',
            'Gravity',
            array($this, 'gravity_callback'),
            'flappy-bird-settings',
            'flappy_bird_setting_section'
        );

        add_settings_field(
            'jump_force',
            'Jump Force',
            array($this, 'jump_force_callback'),
            'flappy-bird-settings',
            'flappy_bird_setting_section'
        );

        add_settings_field(
            'pipe_speed',
            'Pipe Speed',
            array($this, 'pipe_speed_callback'),
            'flappy-bird-settings',
            'flappy_bird_setting_section'
        );

        add_settings_field(
            'pipe_gap',
            'Pipe Gap',
            array($this, 'pipe_gap_callback'),
            'flappy-bird-settings',
            'flappy_bird_setting_section'
        );
    }

    public function sanitize($input) {
        $sanitized = array();
        
        $sanitized['gravity'] = floatval($input['gravity']);
        $sanitized['jump_force'] = floatval($input['jump_force']);
        $sanitized['pipe_speed'] = floatval($input['pipe_speed']);
        $sanitized['pipe_gap'] = intval($input['pipe_gap']);

        return $sanitized;
    }

    public function section_info() {
        echo 'Customize your Flappy Bird game settings below:';
    }

    public function gravity_callback() {
        $value = isset($this->options['gravity']) ? $this->options['gravity'] : 0.5;
        ?>
        <input type="number" step="0.1" id="gravity" 
               name="flappy_bird_options[gravity]" 
               value="<?php echo esc_attr($value); ?>" />
        <p class="description">Default: 0.5 - Higher values make the game harder</p>
        <?php
    }

    public function jump_force_callback() {
        $value = isset($this->options['jump_force']) ? $this->options['jump_force'] : -7;
        ?>
        <input type="number" step="0.1" id="jump_force" 
               name="flappy_bird_options[jump_force]" 
               value="<?php echo esc_attr($value); ?>" />
        <p class="description">Default: -7 - Lower negative values make the bird jump higher</p>
        <?php
    }

    public function pipe_speed_callback() {
        $value = isset($this->options['pipe_speed']) ? $this->options['pipe_speed'] : 3;
        ?>
        <input type="number" step="0.1" id="pipe_speed" 
               name="flappy_bird_options[pipe_speed]" 
               value="<?php echo esc_attr($value); ?>" />
        <p class="description">Default: 3 - Higher values make pipes move faster</p>
        <?php
    }

    public function pipe_gap_callback() {
        $value = isset($this->options['pipe_gap']) ? $this->options['pipe_gap'] : 150;
        ?>
        <input type="number" id="pipe_gap" 
               name="flappy_bird_options[pipe_gap]" 
               value="<?php echo esc_attr($value); ?>" />
        <p class="description">Default: 150 - Lower values make gaps smaller</p>
        <?php
    }
}