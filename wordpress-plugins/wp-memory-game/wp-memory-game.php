<?php
/**
 * Plugin Name: WP Memory Game
 * Plugin URI: https://example.com/wp-memory-game
 * Description: A memory card matching game with high score tracking and pause functionality
 * Version: 1.0.0
 * Author: Your Name
 * Author URI: https://example.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: wp-memory-game
 */

if (!defined('ABSPATH')) {
    exit;
}

class WP_Memory_Game {
    public function __construct() {
        add_action('init', array($this, 'init'));
        add_shortcode('memory_game', array($this, 'render_game'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
    }

    public function init() {
        // Initialize plugin
        load_plugin_textdomain('wp-memory-game', false, dirname(plugin_basename(__FILE__)) . '/languages');
    }

    public function add_admin_menu() {
        add_menu_page(
            __('Memory Game Settings', 'wp-memory-game'),
            __('Memory Game', 'wp-memory-game'),
            'manage_options',
            'wp-memory-game',
            array($this, 'render_settings_page'),
            'dashicons-games'
        );
    }

    public function register_settings() {
        register_setting('wp_memory_game_options', 'wp_memory_game_options');

        // Image Size Settings Section
        add_settings_section(
            'wp_memory_game_size_section',
            __('Image Size Settings', 'wp-memory-game'),
            array($this, 'render_size_section'),
            'wp_memory_game'
        );

        add_settings_field(
            'default_image_width',
            __('Default Image Width (px)', 'wp-memory-game'),
            array($this, 'render_image_width_field'),
            'wp_memory_game',
            'wp_memory_game_size_section'
        );

        add_settings_field(
            'default_image_height',
            __('Default Image Height (px)', 'wp-memory-game'),
            array($this, 'render_image_height_field'),
            'wp_memory_game',
            'wp_memory_game_size_section'
        );

        // Timer Settings Section
        add_settings_section(
            'wp_memory_game_timer_section',
            __('Timer Settings', 'wp-memory-game'),
            array($this, 'render_timer_section'),
            'wp_memory_game'
        );

        add_settings_field(
            'timer_type',
            __('Timer Type', 'wp-memory-game'),
            array($this, 'render_timer_type_field'),
            'wp_memory_game',
            'wp_memory_game_timer_section'
        );

        add_settings_field(
            'timer_value',
            __('Timer Value (seconds)', 'wp-memory-game'),
            array($this, 'render_timer_value_field'),
            'wp_memory_game',
            'wp_memory_game_timer_section'
        );

        // Game Images Section
        add_settings_section(
            'wp_memory_game_images_section',
            __('Game Images', 'wp-memory-game'),
            array($this, 'render_images_section'),
            'wp_memory_game'
        );

        // Add 8 image upload fields
        for ($i = 1; $i <= 8; $i++) {
            add_settings_field(
                'game_image_' . $i,
                sprintf(__('Image %d', 'wp-memory-game'), $i),
                array($this, 'render_image_field'),
                'wp_memory_game',
                'wp_memory_game_images_section',
                array('image_number' => $i)
            );
            add_settings_field(
                'game_image_name_' . $i,
                sprintf(__('Image %d Name', 'wp-memory-game'), $i),
                array($this, 'render_image_name_field'),
                'wp_memory_game',
                'wp_memory_game_images_section',
                array('image_number' => $i)
            );
        }
    }

    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        wp_enqueue_media();
        ?>
        <div class="wrap">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
            <form action="options.php" method="post" enctype="multipart/form-data">
                <?php
                settings_fields('wp_memory_game_options');
                do_settings_sections('wp_memory_game');
                submit_button();
                ?>
            </form>
            <script>
            jQuery(document).ready(function($) {
                $('.upload-image-button').click(function(e) {
                    e.preventDefault();
                    var button = $(this);
                    var imageField = button.siblings('.image-url');
                    var imagePreview = button.siblings('.image-preview');

                    var frame = wp.media({
                        title: '<?php echo esc_js(__('Select or Upload Game Image', 'wp-memory-game')); ?>',
                        button: {
                            text: '<?php echo esc_js(__('Use this image', 'wp-memory-game')); ?>'
                        },
                        multiple: false
                    });

                    frame.on('select', function() {
                        var attachment = frame.state().get('selection').first().toJSON();
                        imageField.val(attachment.url);
                        imagePreview.attr('src', attachment.url).show();
                    });

                    frame.open();
                });
            });
            </script>
        </div>
        <?php
    }

    public function render_timer_section() {
        echo '<p>' . esc_html__('Configure how the game timer behaves.', 'wp-memory-game') . '</p>';
    }

    public function render_size_section() {
        echo '<p>' . esc_html__('Set the default dimensions for game images. These settings affect both uploaded and default images.', 'wp-memory-game') . '</p>';
    }

    public function render_image_width_field() {
        $options = get_option('wp_memory_game_options', array(
            'default_image_width' => 150
        ));
        ?>
        <input type="number" 
               name="wp_memory_game_options[default_image_width]" 
               value="<?php echo esc_attr($options['default_image_width']); ?>" 
               min="100" 
               max="500" 
        />
        <p class="description">
            <?php esc_html_e('Width in pixels. Recommended range: 100-500px', 'wp-memory-game'); ?>
        </p>
        <?php
    }

    public function render_image_height_field() {
        $options = get_option('wp_memory_game_options', array(
            'default_image_height' => 200
        ));
        ?>
        <input type="number" 
               name="wp_memory_game_options[default_image_height]" 
               value="<?php echo esc_attr($options['default_image_height']); ?>" 
               min="100" 
               max="500" 
        />
        <p class="description">
            <?php esc_html_e('Height in pixels. Recommended range: 100-500px', 'wp-memory-game'); ?>
        </p>
        <?php
    }

    public function render_images_section() {
        echo '<p>' . esc_html__('Upload or select images for the memory game. Each image will be used to create a matching pair.', 'wp-memory-game') . '</p>';
    }

    public function render_image_field($args) {
        $options = get_option('wp_memory_game_options', array());
        $image_key = 'game_image_' . $args['image_number'];
        $name_key = 'game_image_name_' . $args['image_number'];
        $image_url = isset($options[$image_key]) ? $options[$image_key] : '';
        $default_names = array(
            1 => __('Mike', 'wp-memory-game'),    // Image 1
            2 => __('Kathryn', 'wp-memory-game'), // Image 2
            3 => __('Wray', 'wp-memory-game'),    // Image 3
            4 => __('Seth', 'wp-memory-game'),    // Image 4
            5 => __('Seth', 'wp-memory-game'),    // Image 5
            6 => __('Wray', 'wp-memory-game'),    // Image 6
            7 => __('Kim', 'wp-memory-game'),     // Image 7
            8 => __('Fel Jun', 'wp-memory-game')  // Image 8
        );
        ?>
        <div class="image-upload-field">
            <input type="hidden" 
                   name="wp_memory_game_options[<?php echo esc_attr($image_key); ?>]" 
                   value="<?php echo esc_attr($image_url); ?>" 
                   class="image-url" />
            <button class="button upload-image-button">
                <?php esc_html_e('Upload Image', 'wp-memory-game'); ?>
            </button>
            <?php if ($image_url): ?>
                <img src="<?php echo esc_url($image_url); ?>" 
                     class="image-preview" 
                     style="max-width: 100px; max-height: 100px; margin-top: 10px; display: block;" />
            <?php else: ?>
                <img src="" class="image-preview" style="max-width: 100px; max-height: 100px; margin-top: 10px; display: none;" />
            <?php endif; ?>
        </div>
        <?php
    }
    
    public function render_image_name_field($args) {
        $options = get_option('wp_memory_game_options', array());
        $name_key = 'game_image_name_' . $args['image_number'];
        $default_names = array(
            1 => __('Nature Scene 1', 'wp-memory-game'),
            2 => __('Nature Scene 2', 'wp-memory-game'),
            3 => __('Nature Scene 3', 'wp-memory-game'),
            4 => __('Nature Scene 4', 'wp-memory-game'),
            5 => __('Nature Scene 5', 'wp-memory-game'),
            6 => __('Nature Scene 6', 'wp-memory-game'),
            7 => __('Nature Scene 7', 'wp-memory-game'),
            8 => __('Nature Scene 8', 'wp-memory-game')
        );
        $image_name = isset($options[$name_key]) ? $options[$name_key] : $default_names[$args['image_number']];
        ?>
        <input type="text" 
               name="wp_memory_game_options[<?php echo esc_attr($name_key); ?>]" 
               value="<?php echo esc_attr($image_name); ?>" 
               class="regular-text" />
        <?php
    }

    public function render_timer_type_field() {
        $options = get_option('wp_memory_game_options', array(
            'timer_type' => 'countdown',
            'timer_value' => 60
        ));
        ?>
        <select name="wp_memory_game_options[timer_type]" id="timer_type">
            <option value="countdown" <?php selected($options['timer_type'], 'countdown'); ?>>
                <?php esc_html_e('Countdown Timer', 'wp-memory-game'); ?>
            </option>
            <option value="countup" <?php selected($options['timer_type'], 'countup'); ?>>
                <?php esc_html_e('Count Up Timer', 'wp-memory-game'); ?>
            </option>
        </select>
        <?php
    }

    public function render_timer_value_field() {
        $options = get_option('wp_memory_game_options', array(
            'timer_type' => 'countdown',
            'timer_value' => 60
        ));
        ?>
        <input type="number" 
               name="wp_memory_game_options[timer_value]" 
               value="<?php echo esc_attr($options['timer_value']); ?>" 
               min="10" 
               max="300" 
        />
        <p class="description">
            <?php esc_html_e('For countdown timer: time to complete the game. For count up timer: time before game over.', 'wp-memory-game'); ?>
        </p>
        <?php
    }

    public function enqueue_assets() {
        // Only enqueue if shortcode is present
        global $post;
        if (is_a($post, 'WP_Post') && has_shortcode($post->post_content, 'memory_game')) {
            wp_enqueue_style(
                'wp-memory-game',
                plugins_url('css/style.css', __FILE__),
                array(),
                '1.0.0'
            );

            wp_enqueue_script(
                'wp-memory-game',
                plugins_url('js/game.js', __FILE__),
                array(),
                '1.0.0',
                true
            );

            // Pass WordPress URLs to JavaScript
            wp_localize_script(
                'wp-memory-game',
                'wpMemoryGame',
                array(
                    'pluginUrl' => plugins_url('', __FILE__),
                    'images' => $this->get_game_images(),
                    'imageNames' => $this->get_game_image_names(),
                    'options' => array_merge(array(
                        'timer_type' => 'countdown',
                        'timer_value' => 60,
                        'default_image_width' => 150,
                        'default_image_height' => 200
                    ), get_option('wp_memory_game_options', array()))
                )
            );
        }
    }

    private function get_game_images() {
        $options = get_option('wp_memory_game_options', array());
        $images = array();
        
        for ($i = 1; $i <= 8; $i++) {
            $image_key = 'game_image_' . $i;
            if (!empty($options[$image_key])) {
                $images[] = $options[$image_key];
            } else {
                // Fallback to default image with size parameters
                $width = isset($options['default_image_width']) ? $options['default_image_width'] : 150;
                $height = isset($options['default_image_height']) ? $options['default_image_height'] : 200;
                $images[] = "https://picsum.photos/{$width}/{$height}?random=" . $i;
            }
        }
        
        return $images;
    }
    
    private function get_game_image_names() {
        $options = get_option('wp_memory_game_options', array());
        $names = array();
        $default_names = array(
            __('Mike', 'wp-memory-game'),    // Image 1
            __('Kathryn', 'wp-memory-game'), // Image 2
            __('Wray', 'wp-memory-game'),    // Image 3
            __('Seth', 'wp-memory-game'),    // Image 4
            __('Seth', 'wp-memory-game'),    // Image 5
            __('Wray', 'wp-memory-game'),    // Image 6
            __('Kim', 'wp-memory-game'),     // Image 7
            __('Fel Jun', 'wp-memory-game')  // Image 8
        );
        
        for ($i = 1; $i <= 8; $i++) {
            $name_key = 'game_image_name_' . $i;
            $names[] = !empty($options[$name_key]) ? $options[$name_key] : $default_names[$i - 1];
        }
        
        return $names;
    }

    public function render_game() {
        ob_start();
        ?>
        <div class="wp-memory-game-container">
            <div class="container">
                <h1><?php esc_html_e('Memory Game', 'wp-memory-game'); ?></h1>
                <div class="game-info">
                    <div class="moves"><?php esc_html_e('Moves:', 'wp-memory-game'); ?> <span id="moves">0</span></div>
                    <div class="timer">
                        <span id="timer-label"><?php esc_html_e('Time:', 'wp-memory-game'); ?></span>
                        <span id="timer">0</span>s
                    </div>
                    <div class="high-score"><?php esc_html_e('Best Score:', 'wp-memory-game'); ?> <span id="high-score">-</span></div>
                    <button id="pause" class="restart-btn"><?php esc_html_e('Pause', 'wp-memory-game'); ?></button>
                </div>
                <div class="game-board" id="game-board"></div>
                <button id="restart" class="restart-btn"><?php esc_html_e('Restart Game', 'wp-memory-game'); ?></button>
                <div class="pause-overlay" id="pause-overlay">
                    <div class="pause-content">
                        <h2><?php esc_html_e('Game Paused', 'wp-memory-game'); ?></h2>
                        <button id="resume" class="restart-btn"><?php esc_html_e('Resume Game', 'wp-memory-game'); ?></button>
                    </div>
                </div>
                <div class="game-over" id="game-over">
                    <div class="game-over-content">
                        <h2><?php esc_html_e('Game Over!', 'wp-memory-game'); ?></h2>
                        <p><?php esc_html_e('Total Moves:', 'wp-memory-game'); ?> <span id="final-moves">0</span></p>
                        <p><?php esc_html_e('Pairs Found:', 'wp-memory-game'); ?> <span id="final-pairs">0</span></p>
                        <p><?php esc_html_e('Best Score:', 'wp-memory-game'); ?> <span id="final-high-score">-</span></p>
                        <button id="play-again" class="restart-btn"><?php esc_html_e('Play Again', 'wp-memory-game'); ?></button>
                    </div>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
}

// Initialize the plugin
new WP_Memory_Game();