[file name]: facilcard-recharge (2).php
[file content begin]
<?php
/**
 * Plugin Name: Fácil Card Recharge
 * Plugin URI: https://tudominio.com
 * Description: Formulario de recarga para tarjetas Fácil Card con USDT TRC20 - Todo en un solo archivo
 * Version: 1.3.2
 * Author: Tu Nombre
 * License: GPL v2 or later
 * Text Domain: facilcard-recharge
 */

// Evitar acceso directo
if (!defined('ABSPATH')) {
    exit;
}

class FacilCardRechargePlugin {
    
    private $table_name;
    private $upload_dir;
    
    public function __construct() {
        global $wpdb;
        $this->table_name = $wpdb->prefix . 'facilcard_transactions';
        $this->upload_dir = wp_upload_dir();
        
        add_action('init', array($this, 'init'));
        add_shortcode('facilcard_form', array($this, 'render_form'));
        add_action('wp_ajax_facilcard_process_recharge', array($this, 'process_recharge'));
        add_action('wp_ajax_nopriv_facilcard_process_recharge', array($this, 'process_recharge'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        register_activation_hook(__FILE__, array($this, 'activate'));
        
        // Crear directorio de uploads si no existe
        $this->create_upload_dir();
    }
    
    private function create_upload_dir() {
        $facilcard_dir = $this->upload_dir['basedir'] . '/facilcard-receipts';
        if (!file_exists($facilcard_dir)) {
            wp_mkdir_p($facilcard_dir);
        }
        
        // Crear archivo .htaccess para seguridad
        $htaccess = $facilcard_dir . '/.htaccess';
        if (!file_exists($htaccess)) {
            file_put_contents($htaccess, 'deny from all');
        }
    }
    
    public function init() {
        // Inicialización si es necesaria
    }
    
    public function activate() {
        $this->create_table();
    }
    
    private function create_table() {
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE {$this->table_name} (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            name varchar(100) NOT NULL,
            email varchar(100) NOT NULL,
            phone varchar(20) NOT NULL,
            card_number varchar(20) NOT NULL,
            card_holder varchar(100) NOT NULL,
            amount decimal(10,2) NOT NULL,
            payment_method varchar(50) NOT NULL,
            provider varchar(50) NOT NULL,
            receipt_file varchar(255) NOT NULL,
            status varchar(20) DEFAULT 'pending',
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
        
        // Verificar si hubo errores
        if (!empty($wpdb->last_error)) {
            error_log('Error creando tabla Fácil Card: ' . $wpdb->last_error);
        }
    }
    
    public function enqueue_scripts() {
        // Solo cargar en páginas que usen el shortcode
        global $post;
        if (is_a($post, 'WP_Post') && has_shortcode($post->post_content, 'facilcard_form')) {
            
            // Font Awesome
            wp_enqueue_style(
                'font-awesome',
                'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
                array(),
                '6.4.0'
            );
            
            // CSS inline
            add_action('wp_head', array($this, 'add_css'));
            
            // JavaScript
            wp_enqueue_script('jquery');
            add_action('wp_footer', array($this, 'add_js'));
            
            // Localizar script para AJAX
            wp_localize_script('jquery', 'facilcard_ajax', array(
                'ajax_url' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('facilcard_nonce'),
                'max_file_size' => 5 * 1024 * 1024 // 5MB
            ));
        }
    }
    
    public function add_css() {
        ?>
        <style>
            /* RESET ESPECÍFICO PARA WORDPRESS */
            .facil-card-container * {
                margin: 0;
                padding: 0;
                box-sizing: border-box !important;
                font-family: 'Segoe UI', system-ui, sans-serif !important;
                line-height: normal !important;
            }

            .facil-card-container {
                --primary: #000000;
                --secondary: #00f5ff;
                --accent: #8a2be2;
                --neon-blue: #00eeff;
                --neon-purple: #b967ff;
                --neon-green: #00ff88;
                --light: #e0f7ff;
                --success: #00ff88;
                --glass: rgba(255, 255, 255, 0.03);
                --glass-border: rgba(255, 255, 255, 0.08);
                --glow: 0 0 12px rgba(0, 245, 255, 0.4);
                --galapagos: #ff6b35;
                
                background: #000000 !important;
                color: var(--light) !important;
                padding: 10px;
                overflow-x: hidden;
                font-size: 14px !important;
                width: 100% !important;
            }

            .facilcard-container {
                max-width: 100% !important;
                width: 100% !important;
                padding: 0 15px !important;
                margin: 0 auto !important;
            }

            .facil-card-container header {
                text-align: center;
                padding: 15px 0 !important;
                margin-bottom: 20px !important;
            }

            .facilcard-logo {
                display: inline-flex !important;
                align-items: center;
                gap: 12px;
                padding: 12px 25px !important;
                border-radius: 16px;
                background: linear-gradient(145deg, rgba(10,10,10,0.9), rgba(0,0,0,0.9)) !important;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
                border: 1px solid rgba(255,255,255,0.05) !important;
            }

            .facilcard-logo-icon {
                width: 40px !important;
                height: 40px !important;
                background: linear-gradient(135deg, var(--neon-blue), var(--neon-purple)) !important;
                border-radius: 10px;
                display: flex !important;
                align-items: center;
                justify-content: center;
                box-shadow: var(--glow) !important;
            }

            .facilcard-logo h1 {
                font-size: 1.2rem !important;
                font-weight: 600 !important;
                background: linear-gradient(to right, var(--neon-blue), var(--neon-purple)) !important;
                -webkit-background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
                letter-spacing: 0.5px;
                margin: 0 !important;
                padding: 0 !important;
            }

            .facilcard-dashboard {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 18px !important;
                max-width: 1200px !important;
                margin: 0 auto !important;
                width: 100% !important;
            }

            .facilcard-card {
                background: linear-gradient(145deg, rgba(15,15,15,0.7), rgba(5,5,5,0.9)) !important;
                border-radius: 16px !important;
                padding: 20px !important;
                margin-bottom: 18px !important;
                border: 1px solid var(--glass-border) !important;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4) !important;
                transition: transform 0.3s ease, box-shadow 0.3s ease !important;
                width: 100% !important;
            }

            .facilcard-card:hover {
                transform: translateY(-3px) !important;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5) !important;
            }

            .facilcard-card-title {
                font-size: 0.9rem !important;
                margin-bottom: 16px !important;
                padding-bottom: 10px !important;
                border-bottom: 1px solid rgba(255,255,255,0.08) !important;
                display: flex !important;
                align-items: center;
                gap: 8px;
                color: #e0f7ff !important;
                font-weight: 500 !important;
                letter-spacing: 0.3px;
                text-transform: uppercase;
            }

            .facilcard-card-title i {
                color: var(--neon-blue) !important;
                background: rgba(0, 245, 255, 0.08) !important;
                width: 28px !important;
                height: 28px !important;
                border-radius: 7px;
                display: flex !important;
                align-items: center;
                justify-content: center;
                font-size: 0.8rem !important;
            }

            .facilcard-form-group {
                margin-bottom: 16px !important;
                width: 100% !important;
            }

            .facilcard-form-group label {
                display: block !important;
                margin-bottom: 6px !important;
                font-weight: 500 !important;
                color: #b0d0ff !important;
                font-size: 0.8rem !important;
                letter-spacing: 0.2px;
            }

            .facilcard-form-group input,
            .facilcard-form-group select {
                width: 100% !important;
                padding: 11px 14px !important;
                background: rgba(0, 0, 0, 0.4) !important;
                border: 1px solid rgba(255,255,255,0.1) !important;
                border-radius: 10px !important;
                color: var(--light) !important;
                font-size: 0.85rem !important;
                transition: all 0.3s ease !important;
                display: block !important;
            }

            .facilcard-form-group input:focus,
            .facilcard-form-group select:focus {
                outline: none !important;
                border-color: var(--neon-blue) !important;
                box-shadow: 0 0 0 2px rgba(0, 245, 255, 0.15) !important;
            }

            .facilcard-file-upload {
                border: 2px dashed rgba(255,255,255,0.2) !important;
                border-radius: 10px !important;
                padding: 20px !important;
                text-align: center;
                cursor: pointer;
                transition: all 0.3s ease !important;
                background: rgba(0, 0, 0, 0.2) !important;
            }

            .facilcard-file-upload:hover {
                border-color: var(--neon-blue) !important;
                background: rgba(0, 245, 255, 0.05) !important;
            }

            .facilcard-file-input {
                display: none !important;
            }

            .facilcard-file-name {
                margin-top: 10px !important;
                font-size: 0.8rem !important;
                color: #94a3b8 !important;
                word-break: break-all;
            }

            /* Métodos de Pago */
            .facilcard-payment-methods {
                display: grid !important;
                grid-template-columns: repeat(3, 1fr) !important;
                gap: 10px !important;
                margin-bottom: 16px !important;
            }

            .facilcard-payment-option {
                border: 2px solid rgba(255,255,255,0.1) !important;
                border-radius: 10px !important;
                padding: 15px !important;
                text-align: center;
                cursor: pointer;
                transition: all 0.3s ease !important;
                background: rgba(0, 0, 0, 0.3) !important;
                display: flex !important;
                flex-direction: column;
                align-items: center;
            }

            .facilcard-payment-option:hover {
                border-color: var(--neon-blue) !important;
                transform: translateY(-2px) !important;
            }

            .facilcard-payment-option.selected {
                border-color: var(--neon-blue) !important;
                background: rgba(0, 245, 255, 0.1) !important;
                box-shadow: 0 0 15px rgba(0, 245, 255, 0.3) !important;
            }

            .facilcard-payment-option.usdt.selected {
                border-color: #26a17b !important;
                background: rgba(38, 161, 123, 0.1) !important;
                box-shadow: 0 0 15px rgba(38, 161, 123, 0.3) !important;
            }

            .facilcard-payment-option.bank.selected {
                border-color: #3b82f6 !important;
                background: rgba(59, 130, 246, 0.1) !important;
                box-shadow: 0 0 15px rgba(59, 130, 246, 0.3) !important;
            }

            .facilcard-payment-option.galapagos.selected {
                border-color: var(--galapagos) !important;
                background: rgba(255, 107, 53, 0.1) !important;
                box-shadow: 0 0 15px rgba(255, 107, 53, 0.3) !important;
            }

            .facilcard-payment-icon {
                font-size: 1.8rem !important;
                margin-bottom: 8px !important;
            }

            .facilcard-payment-option.usdt .facilcard-payment-icon {
                color: #26a17b !important;
            }

            .facilcard-payment-option.bank .facilcard-payment-icon {
                color: #3b82f6 !important;
            }

            .facilcard-payment-option.galapagos .facilcard-payment-icon {
                color: var(--galapagos) !important;
            }

            .facilcard-payment-name {
                font-weight: 600 !important;
                font-size: 0.85rem !important;
                margin-bottom: 5px !important;
            }

            .facilcard-payment-desc {
                font-size: 0.7rem !important;
                color: #94a3b8 !important;
            }

            /* Información de Pago */
            .facilcard-payment-info {
                background: rgba(0, 0, 0, 0.3) !important;
                padding: 16px !important;
                border-radius: 12px !important;
                margin: 14px 0 !important;
                border: 1px solid rgba(255,255,255,0.05) !important;
                width: 100% !important;
                display: none;
            }

            .facilcard-payment-info.active {
                display: block !important;
                animation: fadeIn 0.3s ease;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .facilcard-payment-title {
                text-align: center;
                margin-bottom: 12px !important;
                color: var(--neon-blue) !important;
                font-size: 0.9rem !important;
                font-weight: 500 !important;
                letter-spacing: 0.3px;
            }

            .facilcard-address-container {
                display: flex !important;
                justify-content: space-between;
                align-items: center;
                background: rgba(0, 0, 0, 0.5) !important;
                padding: 10px 12px !important;
                border-radius: 10px !important;
                margin: 12px 0 !important;
                border: 1px solid rgba(255,255,255,0.08) !important;
                font-family: 'SF Mono', 'Courier New', monospace !important;
                font-size: 0.78rem !important;
                width: 100% !important;
            }

            .facilcard-bank-info {
                background: rgba(0, 0, 0, 0.5) !important;
                padding: 15px !important;
                border-radius: 10px !important;
                margin: 12px 0 !important;
                border: 1px solid rgba(59, 130, 246, 0.3) !important;
            }

            .facilcard-galapagos-info {
                background: rgba(0, 0, 0, 0.5) !important;
                padding: 15px !important;
                border-radius: 10px !important;
                margin: 12px 0 !important;
                border: 1px solid rgba(255, 107, 53, 0.3) !important;
            }

            .facilcard-bank-detail,
            .facilcard-galapagos-detail {
                margin-bottom: 10px !important;
                padding-bottom: 10px !important;
                border-bottom: 1px solid rgba(255,255,255,0.1) !important;
                display: flex !important;
                justify-content: space-between;
                align-items: flex-start;
            }

            .facilcard-bank-detail:last-child,
            .facilcard-galapagos-detail:last-child {
                margin-bottom: 0 !important;
                padding-bottom: 0 !important;
                border-bottom: none !important;
            }

            .facilcard-bank-text,
            .facilcard-galapagos-text {
                flex: 1;
            }

            .facilcard-bank-label,
            .facilcard-galapagos-label {
                font-size: 0.75rem !important;
                color: #94a3b8 !important;
                margin-bottom: 3px !important;
            }

            .facilcard-bank-value,
            .facilcard-galapagos-value {
                font-size: 0.85rem !important;
                font-weight: 500 !important;
                color: #ffffff !important;
                word-break: break-all;
            }

            .facilcard-copy-btn {
                background: rgba(59, 130, 246, 0.1) !important;
                border: 1px solid rgba(59, 130, 246, 0.3) !important;
                color: #3b82f6 !important;
                cursor: pointer;
                font-size: 0.75rem !important;
                transition: all 0.3s ease !important;
                padding: 6px 10px !important;
                border-radius: 5px;
                display: flex !important;
                align-items: center;
                justify-content: center;
                gap: 4px;
                min-width: 60px;
                margin-left: 10px;
            }

            .facilcard-copy-btn.galapagos-copy {
                background: rgba(255, 107, 53, 0.1) !important;
                border: 1px solid rgba(255, 107, 53, 0.3) !important;
                color: var(--galapagos) !important;
            }

            .facilcard-copy-btn:hover {
                background: rgba(59, 130, 246, 0.2) !important;
                transform: translateY(-1px) !important;
            }

            .facilcard-copy-btn.galapagos-copy:hover {
                background: rgba(255, 107, 53, 0.2) !important;
            }

            .facilcard-qr-container {
                display: flex !important;
                justify-content: center;
                margin: 12px 0 !important;
                width: 100% !important;
            }

            .facilcard-qr-code {
                width: 140px !important;
                height: 140px !important;
                background: white !important;
                border-radius: 10px !important;
                display: flex !important;
                align-items: center;
                justify-content: center;
                border: 2px solid var(--neon-blue) !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
            }

            .facilcard-qr-code.galapagos-qr {
                border-color: var(--galapagos) !important;
            }

            .facilcard-qr-code img {
                width: 100% !important;
                height: 100% !important;
                border-radius: 8px !important;
                object-fit: cover;
                display: block !important;
            }

            .facilcard-amount-notice {
                background: linear-gradient(135deg, rgba(245, 158, 11, 0.9), rgba(251, 191, 36, 0.9)) !important;
                color: #000000 !important;
                padding: 8px 10px !important;
                border-radius: 8px !important;
                margin: 12px 0 !important;
                text-align: center;
                font-weight: 500 !important;
                font-size: 0.78rem !important;
                width: 100% !important;
            }

            .facilcard-instructions {
                font-size: 0.8rem !important;
                line-height: 1.5 !important;
                width: 100% !important;
            }

            .facilcard-instructions ol {
                padding-left: 16px !important;
            }

            .facilcard-instructions li {
                margin-bottom: 6px !important;
                color: #c0d0e0 !important;
                font-size: 0.8rem !important;
            }

            .facilcard-notification {
                position: fixed !important;
                top: 15px !important;
                right: 15px !important;
                background: linear-gradient(145deg, rgba(20,20,20,0.9), rgba(10,10,10,0.95)) !important;
                border: 1px solid rgba(255,255,255,0.08) !important;
                border-radius: 12px !important;
                padding: 14px !important;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5) !important;
                z-index: 10000 !important;
                transform: translateX(500px);
                opacity: 0;
                transition: all 0.5s ease !important;
                max-width: 300px !important;
                border-top: 2px solid var(--neon-blue) !important;
                display: none;
            }

            .facilcard-notification.show {
                transform: translateX(0) !important;
                opacity: 1 !important;
                display: block !important;
            }

            .facilcard-notification-header {
                display: flex !important;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px !important;
            }

            .facilcard-notification-icon {
                width: 30px !important;
                height: 30px !important;
                border-radius: 50%;
                display: flex !important;
                align-items: center;
                justify-content: center;
                font-size: 0.8rem !important;
            }

            .facilcard-notification-icon.success {
                background: linear-gradient(135deg, var(--success), #00cc77) !important;
            }

            .facilcard-notification-icon.error {
                background: linear-gradient(135deg, #ff4757, #ff3742) !important;
            }

            .facilcard-notification-title {
                font-size: 0.9rem !important;
                font-weight: 500 !important;
            }

            .facilcard-notification-body {
                font-size: 0.8rem !important;
                line-height: 1.4 !important;
                color: #c0d0e0 !important;
            }

            .facilcard-info-box {
                margin-top: 14px !important;
                padding: 12px !important;
                background: rgba(245, 158, 11, 0.08) !important;
                border-radius: 8px !important;
                border-left: 3px solid #f59e0b !important;
                width: 100% !important;
            }

            .facilcard-info-box h4 {
                color: #f59e0b !important;
                margin-bottom: 6px !important;
                font-size: 0.85rem !important;
                font-weight: 500 !important;
                display: flex !important;
                align-items: center;
                gap: 6px;
            }

            .facilcard-info-box p {
                font-size: 0.75rem !important;
                color: #cbd5e1 !important;
                margin: 0 !important;
                line-height: 1.4 !important;
            }

            .facilcard-section-divider {
                margin: 20px 0 !important;
                text-align: center;
                position: relative;
            }

            .facilcard-section-divider::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 0;
                right: 0;
                height: 1px;
                background: rgba(255,255,255,0.1);
            }

            .facilcard-section-divider span {
                background: #000000;
                padding: 0 15px;
                color: #94a3b8;
                font-size: 0.7rem;
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            .facilcard-provider-options {
                display: grid !important;
                grid-template-columns: 1fr !important;
                gap: 10px !important;
                margin-top: 10px !important;
                margin-bottom: 10px !important;
            }

            .facilcard-provider-option {
                border: 2px solid rgba(255,255,255,0.1) !important;
                border-radius: 10px !important;
                padding: 15px !important;
                text-align: center;
                cursor: pointer;
                transition: all 0.3s ease !important;
                background: rgba(0, 0, 0, 0.3) !important;
            }

            .facilcard-provider-option:hover {
                border-color: var(--neon-blue) !important;
                transform: translateY(-2px) !important;
            }

            .facilcard-provider-option.selected {
                border-color: var(--neon-blue) !important;
                background: rgba(0, 245, 255, 0.1) !important;
                box-shadow: 0 0 15px rgba(0, 245, 255, 0.3) !important;
            }

            .facilcard-provider-icon {
                font-size: 1.5rem !important;
                margin-bottom: 8px !important;
                color: var(--neon-blue) !important;
            }

            .facilcard-provider-name {
                font-weight: 600 !important;
                font-size: 0.8rem !important;
                margin-bottom: 5px !important;
            }

            .facilcard-provider-desc {
                font-size: 0.7rem !important;
                color: #94a3b8 !important;
            }

            .facilcard-btn {
                background: linear-gradient(135deg, var(--neon-blue), var(--neon-purple)) !important;
                color: white !important;
                border: none !important;
                padding: 12px 18px !important;
                border-radius: 10px !important;
                font-size: 0.85rem !important;
                font-weight: 500 !important;
                cursor: pointer;
                transition: all 0.3s ease !important;
                display: flex !important;
                align-items: center;
                justify-content: center;
                gap: 8px;
                box-shadow: var(--glow) !important;
                width: 100% !important;
                letter-spacing: 0.3px;
                text-decoration: none !important;
            }

            .facilcard-btn:hover {
                transform: translateY(-2px) !important;
                box-shadow: 0 0 18px rgba(0, 245, 255, 0.6) !important;
            }

            .facilcard-btn:disabled {
                opacity: 0.6 !important;
                cursor: not-allowed !important;
                transform: none !important;
            }

            /* Botón Políticas */
            .facilcard-policies-btn {
                background: transparent !important;
                color: #94a3b8 !important;
                border: 1px solid rgba(148, 163, 184, 0.3) !important;
                padding: 8px 16px !important;
                border-radius: 8px !important;
                font-size: 0.75rem !important;
                cursor: pointer;
                transition: all 0.3s ease !important;
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                gap: 6px;
                margin-top: 15px !important;
                text-decoration: none !important;
                width: auto !important;
            }

            .facilcard-policies-btn:hover {
                background: rgba(148, 163, 184, 0.1) !important;
                color: #e0f7ff !important;
                border-color: #94a3b8 !important;
                transform: translateY(-1px) !important;
            }

            .facilcard-footer {
                text-align: center;
                margin-top: 20px !important;
                padding-top: 15px !important;
                border-top: 1px solid rgba(255,255,255,0.1) !important;
            }

            /* MEDIA QUERIES */
            @media (max-width: 768px) {
                .facilcard-dashboard {
                    grid-template-columns: 1fr !important;
                }
                
                .facilcard-payment-methods {
                    grid-template-columns: 1fr !important;
                }
                
                .facilcard-container {
                    padding: 0 10px !important;
                }
                
                .facilcard-logo {
                    flex-direction: column !important;
                    gap: 8px;
                }
                
                .facilcard-logo h1 {
                    font-size: 1.1rem !important;
                }
                
                .facilcard-card {
                    padding: 16px !important;
                }
                
                .facilcard-provider-options {
                    grid-template-columns: 1fr !important;
                }
                
                .facilcard-address-container {
                    flex-direction: column !important;
                    gap: 8px;
                }
                
                .facilcard-qr-code {
                    width: 130px !important;
                    height: 130px !important;
                }
                
                .facilcard-notification {
                    right: 10px !important;
                    left: 10px !important;
                    max-width: none !important;
                }
                
                .facilcard-bank-detail,
                .facilcard-galapagos-detail {
                    flex-direction: column !important;
                    gap: 8px;
                }
                
                .facilcard-copy-btn {
                    margin-left: 0 !important;
                    width: 100% !important;
                }
            }

            @media (max-width: 480px) {
                .facil-card-container {
                    padding: 5px !important;
                }
                
                .facilcard-container {
                    padding: 0 5px !important;
                }
                
                .facilcard-card {
                    padding: 14px !important;
                }
                
                .facilcard-qr-code {
                    width: 120px !important;
                    height: 120px !important;
                }
            }
        </style>
        <?php
    }
    
    public function add_js() {
        ?>
        <script>
        jQuery(document).ready(function($) {
            'use strict';
            
            let selectedProvider = '';
            let selectedFile = null;
            let selectedPaymentMethod = '';
            
            // Función para seleccionar método de pago
            function selectPaymentMethod(method) {
                selectedPaymentMethod = method;
                $('.facilcard-payment-option').removeClass('selected');
                $(`.facilcard-payment-option[data-method="${method}"]`).addClass('selected');
                
                // Mostrar la información correspondiente
                $('.facilcard-payment-info').removeClass('active');
                $(`.facilcard-payment-info[data-method="${method}"]`).addClass('active');
                
                // Actualizar el mensaje del monto
                updateAmountNotice();
                
                // Mostrar notificación
                if (method === 'usdt') {
                    showNotification('info', 'Pago con USDT TRC20 seleccionado');
                } else if (method === 'bank') {
                    showNotification('info', 'Transferencia Bancaria seleccionada');
                } else if (method === 'galapagos') {
                    showNotification('info', 'Galapagos Token seleccionado');
                }
            }
            
            // Actualizar el aviso del monto
            function updateAmountNotice() {
                const amount = $('#facilcard-amount').val();
                const amountNotice = $('#facilcard-amount-notice-text');
                
                if (selectedPaymentMethod === 'usdt') {
                    if (amount && amount > 0) {
                        amountNotice.text(`Envía exactamente $${amount} USDT a la dirección TRC20`);
                    } else {
                        amountNotice.text('Ingresa el monto y envía exactamente esa cantidad en USDT');
                    }
                } else if (selectedPaymentMethod === 'bank') {
                    if (amount && amount > 0) {
                        amountNotice.text(`Transferí exactamente $${amount} a la cuenta STP`);
                    } else {
                        amountNotice.text('Ingresa el monto y transferí exactamente esa cantidad');
                    }
                } else if (selectedPaymentMethod === 'galapagos') {
                    if (amount && amount > 0) {
                        amountNotice.text(`Envía exactamente $${amount} en Galapagos Token`);
                    } else {
                        amountNotice.text('Ingresa el monto y envía exactamente esa cantidad en Galapagos Token');
                    }
                }
            }
            
            // Función para copiar la dirección TRC20
            function copyAddress() {
                const address = document.getElementById('facilcard-usdt-address');
                const textArea = document.createElement('textarea');
                textArea.value = address.textContent;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                // Mostrar mensaje de confirmación
                const copyBtn = $(this);
                const originalIcon = copyBtn.html();
                copyBtn.html('<i class="fas fa-check"></i> Copiado');
                
                // Mostrar notificación
                showNotification('info', 'Dirección TRC20 copiada al portapapeles');
                
                setTimeout(() => {
                    copyBtn.html(originalIcon);
                }, 2000);
            }
            
            // Función para copiar la dirección Galapagos
            function copyGalapagosAddress() {
                const address = document.getElementById('facilcard-galapagos-address');
                const textArea = document.createElement('textarea');
                textArea.value = address.textContent;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                // Mostrar mensaje de confirmación
                const copyBtn = $(this);
                const originalIcon = copyBtn.html();
                copyBtn.html('<i class="fas fa-check"></i> Copiado');
                
                // Mostrar notificación
                showNotification('info', 'Dirección Galapagos Token copiada al portapapeles');
                
                setTimeout(() => {
                    copyBtn.html(originalIcon);
                }, 2000);
            }
            
            // Función para copiar información bancaria
            function copyBankInfo() {
                const text = $(this).data('text');
                const label = $(this).data('label');
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                // Mostrar mensaje de confirmación
                const copyBtn = $(this);
                const originalText = copyBtn.text();
                copyBtn.html('<i class="fas fa-check"></i> Copiado');
                
                // Mostrar notificación
                showNotification('info', `${label} copiado al portapapeles`);
                
                setTimeout(() => {
                    copyBtn.html(originalText);
                }, 2000);
            }
            
            // Función para mostrar notificación
            function showNotification(type, message) {
                const notification = $('#facilcard-notification');
                const icon = $('#facilcard-notification-icon');
                const title = $('#facilcard-notification-title');
                const body = $('#facilcard-notification-body');
                
                // Reset classes
                icon.attr('class', 'facilcard-notification-icon');
                title.attr('class', 'facilcard-notification-title');
                
                if (type === 'success') {
                    icon.addClass('success');
                    title.text('Recarga Enviada');
                    body.html(message || `
                        <p>Su solicitud ha sido procesada exitosamente.</p>
                        <p><strong>En 24 horas revise el estado de su transacción.</strong></p>
                    `);
                } else if (type === 'error') {
                    icon.addClass('error');
                    title.text('Error');
                    body.html(`<p>${message}</p>`);
                } else if (type === 'info') {
                    icon.addClass('success');
                    title.text('Información');
                    body.html(`<p>${message}</p>`);
                }
                
                notification.addClass('show');
                
                // Ocultar notificación después de 4 segundos
                setTimeout(() => {
                    notification.removeClass('show');
                }, 4000);
            }
            
            // Función para manejar selección de proveedor
            function selectProvider(provider) {
                selectedProvider = provider;
                $('.facilcard-provider-option').removeClass('selected');
                $(`.facilcard-provider-option[data-provider="${provider}"]`).addClass('selected');
                
                // Mostrar mensaje informativo según la selección
                if (provider === 'Recarga Directa') {
                    showNotification('info', 'Recarga directa a Fácil Card seleccionada - Procesamiento estándar');
                } else {
                    showNotification('info', `Proveedor ${provider} seleccionado`);
                }
            }
            
            // Función para manejar subida de archivo - CORREGIDA
            function handleFileSelect(event) {
                const file = event.target.files[0];
                console.log('Archivo seleccionado:', file);
                
                if (file) {
                    // Validar tamaño del archivo (5MB máximo)
                    if (file.size > facilcard_ajax.max_file_size) {
                        showNotification('error', 'El archivo es demasiado grande. Máximo 5MB permitido.');
                        $('#facilcard-receipt').val('');
                        selectedFile = null;
                        return;
                    }
                    
                    // Validar tipo de archivo - CORREGIDO
                    const fileExtension = file.name.split('.').pop().toLowerCase();
                    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'pdf'];
                    
                    if (!allowedExtensions.includes(fileExtension)) {
                        showNotification('error', 'Tipo de archivo no permitido. Solo JPG, PNG, GIF y PDF.');
                        $('#facilcard-receipt').val('');
                        selectedFile = null;
                        return;
                    }
                    
                    selectedFile = file;
                    $('#facilcard-file-name').text(file.name);
                    $('.facilcard-file-upload').addClass('selected');
                    showNotification('info', `Archivo "${file.name}" seleccionado correctamente`);
                }
            }
            
            // Función para limpiar el formulario
            function clearForm() {
                $('#facilcard-name').val('');
                $('#facilcard-email').val('');
                $('#facilcard-phone').val('');
                $('#facilcard-card-number').val('');
                $('#facilcard-card-holder').val('');
                $('#facilcard-amount').val('');
                $('#facilcard-receipt').val('');
                $('#facilcard-file-name').text('');
                $('.facilcard-file-upload').removeClass('selected');
                $('.facilcard-provider-option').removeClass('selected');
                $('.facilcard-payment-option').removeClass('selected');
                $('.facilcard-payment-info').removeClass('active');
                selectedProvider = '';
                selectedFile = null;
                selectedPaymentMethod = '';
                updateAmountNotice();
            }
            
            // Función para enviar el formulario
            function sendReceipt() {
                const name = $('#facilcard-name').val();
                const email = $('#facilcard-email').val();
                const phone = $('#facilcard-phone').val();
                const cardNumber = $('#facilcard-card-number').val();
                const cardHolder = $('#facilcard-card-holder').val();
                const amount = $('#facilcard-amount').val();
                
                if (!name || !email || !phone || !cardNumber || !cardHolder || !amount) {
                    showNotification('error', 'Por favor, completa todos los campos obligatorios.');
                    return;
                }
                
                // Validar método de pago
                if (!selectedPaymentMethod) {
                    showNotification('error', 'Por favor, selecciona un método de pago.');
                    return;
                }
                
                // Si no se selecciona proveedor, mostrar error
                if (!selectedProvider) {
                    showNotification('error', 'Por favor, selecciona un proveedor o la opción de Recarga Directa.');
                    return;
                }
                
                // Validar archivo
                if (!selectedFile) {
                    showNotification('error', 'Por favor, selecciona un comprobante de pago.');
                    return;
                }
                
                // Validar email
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    showNotification('error', 'Por favor, ingresa un email válido.');
                    return;
                }
                
                // Validar monto
                if (parseFloat(amount) <= 0) {
                    showNotification('error', 'El monto debe ser mayor a 0.');
                    return;
                }
                
                // Validar monto mínimo según método de pago
                if (selectedPaymentMethod === 'usdt' && parseFloat(amount) < 100) {
                    showNotification('error', 'El monto mínimo para pagar con USDT es 100 USDT.');
                    return;
                }
                
                if (selectedPaymentMethod === 'bank' && parseFloat(amount) < 2000) {
                    showNotification('error', 'El monto mínimo para transferencia bancaria es 2000 MXN.');
                    return;
                }
                
                if (selectedPaymentMethod === 'galapagos' && parseFloat(amount) < 100) {
                    showNotification('error', 'El monto mínimo para Galapagos Token es 100 USD.');
                    return;
                }
                
                // Crear FormData para enviar archivo
                const formData = new FormData();
                formData.append('action', 'facilcard_process_recharge');
                formData.append('nonce', facilcard_ajax.nonce);
                formData.append('name', name);
                formData.append('email', email);
                formData.append('phone', phone);
                formData.append('card_number', cardNumber);
                formData.append('card_holder', cardHolder);
                formData.append('amount', amount);
                formData.append('payment_method', selectedPaymentMethod);
                formData.append('provider', selectedProvider);
                formData.append('receipt', selectedFile);
                
                console.log('Enviando datos:', {
                    name, email, phone, cardNumber, cardHolder, amount,
                    payment_method: selectedPaymentMethod,
                    provider: selectedProvider
                });
                
                // Mostrar estado de carga
                const sendButton = $('#facilcard-send-button');
                sendButton.prop('disabled', true);
                sendButton.html('<i class="fas fa-spinner fa-spin"></i> Enviando');
                
                // Enviar datos via AJAX
                $.ajax({
                    url: facilcard_ajax.ajax_url,
                    type: 'POST',
                    data: formData,
                    processData: false,
                    contentType: false,
                    success: function(response) {
                        console.log('Respuesta recibida:', response);
                        if (response.success) {
                            showNotification('success', response.data.message);
                            setTimeout(() => {
                                clearForm();
                            }, 1000);
                        } else {
                            showNotification('error', response.data);
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error AJAX:', error, xhr.responseText);
                        showNotification('error', 'Error de conexión. Por favor, intente nuevamente.');
                    },
                    complete: function() {
                        sendButton.prop('disabled', false);
                        sendButton.html('<i class="fas fa-paper-plane"></i> Enviar Solicitud de Recarga');
                    }
                });
            }
            
            // Función para abrir políticas de uso
            function openPolicies() {
                const policiesUrl = 'https://facilec.com/politicas-de-uso';
                window.open(policiesUrl, '_blank');
            }
            
            // Event Listeners
            $('#facilcard-amount').on('input', updateAmountNotice);
            $(document).on('click', '.copy-usdt', copyAddress);
            $(document).on('click', '.copy-galapagos', copyGalapagosAddress);
            $(document).on('click', '.copy-bank', copyBankInfo);
            $(document).on('click', '.copy-galapagos-info', copyBankInfo);
            $('#facilcard-send-button').on('click', sendReceipt);
            $('#facilcard-receipt').on('change', handleFileSelect);
            $('.facilcard-policies-btn').on('click', openPolicies);
            
            // Event listeners para métodos de pago
            $('.facilcard-payment-option').on('click', function() {
                const method = $(this).data('method');
                selectPaymentMethod(method);
            });
            
            // Event listeners para proveedores
            $('.facilcard-provider-option').on('click', function() {
                const provider = $(this).data('provider');
                selectProvider(provider);
            });
            
            // Drag and drop para archivos
            $('.facilcard-file-upload').on('dragover', function(e) {
                e.preventDefault();
                $(this).addClass('dragover');
            });
            
            $('.facilcard-file-upload').on('dragleave', function(e) {
                e.preventDefault();
                $(this).removeClass('dragover');
            });
            
            $('.facilcard-file-upload').on('drop', function(e) {
                e.preventDefault();
                $(this).removeClass('dragover');
                const files = e.originalEvent.dataTransfer.files;
                if (files.length > 0) {
                    $('#facilcard-receipt')[0].files = files;
                    handleFileSelect({ target: { files: files } });
                }
            });
            
            // Click en el área de upload
            $('.facilcard-file-upload').on('click', function() {
                $('#facilcard-receipt').click();
            });
            
            // Inicializar seleccionando USDT por defecto
            selectPaymentMethod('usdt');
            
            console.log('Formulario Fácil Card cargado correctamente');
        });
        </script>
        <?php
    }
    
    public function render_form($atts) {
        ob_start();
        ?>
        <div class="facil-card-container">
            <!-- Notificación -->
            <div class="facilcard-notification" id="facilcard-notification">
                <div class="facilcard-notification-header">
                    <div class="facilcard-notification-icon success" id="facilcard-notification-icon">
                        <i class="fas fa-check"></i>
                    </div>
                    <div class="facilcard-notification-title" id="facilcard-notification-title">Recarga Enviada</div>
                </div>
                <div class="facilcard-notification-body" id="facilcard-notification-body">
                    <p>Su solicitud ha sido procesada exitosamente.</p>
                    <p><strong>En 24 horas revise el estado de su transacción.</strong></p>
                </div>
            </div>
            
            <div class="facilcard-container">
                <header>
                    <div class="facilcard-logo">
                        <div class="facilcard-logo-icon">
                            <i class="fas fa-bolt"></i>
                        </div>
                        <h1>Recarga Fácil Card</h1>
                    </div>
                </header>
                
                <div class="facilcard-dashboard">
                    <div class="facilcard-left-column">
                        <!-- Información Personal primero -->
                        <div class="facilcard-card">
                            <h2 class="facilcard-card-title"><i class="fas fa-user"></i> Información Personal</h2>
                            <div class="facilcard-form-group">
                                <label for="facilcard-name">Nombre Completo *</label>
                                <input type="text" id="facilcard-name" placeholder="Ingresa tu nombre completo" required>
                            </div>
                            <div class="facilcard-form-group">
                                <label for="facilcard-email">Correo Electrónico *</label>
                                <input type="email" id="facilcard-email" placeholder="Ingresa tu correo electrónico" required>
                            </div>
                            <div class="facilcard-form-group">
                                <label for="facilcard-phone">Teléfono *</label>
                                <input type="tel" id="facilcard-phone" placeholder="Ingresa tu número de teléfono" required>
                            </div>
                        </div>
                        
                        <!-- Datos de Tarjeta -->
                        <div class="facilcard-card">
                            <h2 class="facilcard-card-title"><i class="fas fa-credit-card"></i> Datos de Tarjeta</h2>
                            <div class="facilcard-form-group">
                                <label for="facilcard-card-number">Número de Tarjeta *</label>
                                <input type="text" id="facilcard-card-number" placeholder="1234 5678 9012 3456" required>
                            </div>
                            <div class="facilcard-form-group">
                                <label for="facilcard-card-holder">Nombre en la Tarjeta *</label>
                                <input type="text" id="facilcard-card-holder" placeholder="Como aparece en la tarjeta" required>
                            </div>
                        </div>

                        <!-- Recarga Directa -->
                        <div class="facilcard-card">
                            <h2 class="facilcard-card-title"><i class="fas fa-bolt"></i> Recarga Directa</h2>
                            <div class="facilcard-form-group">
                                <label>Selecciona Recarga Directa *</label>
                                <div class="facilcard-provider-options">
                                    <div class="facilcard-provider-option" data-provider="Recarga Directa">
                                        <div class="facilcard-provider-icon">
                                            <i class="fas fa-bolt"></i>
                                        </div>
                                        <div class="facilcard-provider-name">Recarga Directa</div>
                                        <div class="facilcard-provider-desc">Procesamiento estándar por Fácil Card</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Separador -->
                        <div class="facilcard-section-divider">
                            <span>O elige un Sub Distribuidor</span>
                        </div>

                        <!-- Sub Distribuidores -->
                        <div class="facilcard-card">
                            <h2 class="facilcard-card-title"><i class="fas fa-user-tie"></i> Sub Distribuidores</h2>
                            <div class="facilcard-form-group">
                                <label>Selecciona un Sub Distribuidor</label>
                                <div class="facilcard-provider-options">
                                    <div class="facilcard-provider-option" data-provider="La Paz Crypto Pay">
                                        <div class="facilcard-provider-icon">
                                            <i class="fas fa-user-tie"></i>
                                        </div>
                                        <div class="facilcard-provider-name">La Paz Crypto Pay</div>
                                        <div class="facilcard-provider-desc"></div>
                                    </div>
                                    
                                    <div class="facilcard-provider-option" data-provider="Master Facil">
                                        <div class="facilcard-provider-icon">
                                            <i class="fas fa-user-tie"></i>
                                        </div>
                                        <div class="facilcard-provider-name">Master Facil</div>
                                        <div class="facilcard-provider-desc"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="facilcard-right-column">
                        <div class="facilcard-card">
                            <h2 class="facilcard-card-title"><i class="fas fa-money-bill-wave"></i> Método de Pago</h2>
                            
                            <!-- Opciones de Pago -->
                            <div class="facilcard-payment-methods">
                                <div class="facilcard-payment-option usdt" data-method="usdt">
                                    <div class="facilcard-payment-icon">
                                        <i class="fab fa-usdt"></i>
                                    </div>
                                    <div class="facilcard-payment-name">USDT TRC20</div>
                                    <div class="facilcard-payment-desc">Mínimo 100 USDT</div>
                                </div>
                                
                                <div class="facilcard-payment-option bank" data-method="bank">
                                    <div class="facilcard-payment-icon">
                                        <i class="fas fa-university"></i>
                                    </div>
                                    <div class="facilcard-payment-name">Transferencia Bancaria</div>
                                    <div class="facilcard-payment-desc">2000 MXN mínimo</div>
                                </div>
                                
                                <div class="facilcard-payment-option galapagos" data-method="galapagos">
                                    <div class="facilcard-payment-icon">
                                        <i class="fas fa-coins"></i>
                                    </div>
                                    <div class="facilcard-payment-name">Galapagos Token</div>
                                    <div class="facilcard-payment-desc">Mínimo 100 USD</div>
                                </div>
                            </div>
                            
                            <div class="facilcard-form-group">
                                <label for="facilcard-amount">Monto a Recargar (USD) *</label>
                                <input type="number" id="facilcard-amount" placeholder="Ingresa el monto" step="0.01" min="1" required>
                            </div>
                            
                            <!-- Información de Pago - USDT -->
                            <div class="facilcard-payment-info" data-method="usdt">
                                <h3 class="facilcard-payment-title">Envía USDT a esta dirección TRC20</h3>
                                
                                <div class="facilcard-address-container">
                                    <span id="facilcard-usdt-address">TW6EzVqPbvBaMqhtRdwDYsnDC3HGJzsH3q</span>
                                    <button type="button" class="facilcard-copy-btn copy-usdt">
                                        <i class="fas fa-copy"></i> Copiar
                                    </button>
                                </div>
                                
                                <div class="facilcard-qr-container">
                                    <div class="facilcard-qr-code">
                                        <img id="facilcard-qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=TW6EzVqPbvBaMqhtRdwDYsnDC3HGJzsH3q" alt="QR Code USDT TRC20">
                                    </div>
                                </div>
                                
                                <div class="facilcard-amount-notice" id="facilcard-amount-notice">
                                    <i class="fas fa-exclamation-circle"></i>
                                    <span id="facilcard-amount-notice-text">Ingresa el monto y envía exactamente esa cantidad en USDT</span>
                                </div>
                            </div>
                            
                            <!-- Información de Pago - Transferencia Bancaria -->
                            <div class="facilcard-payment-info" data-method="bank">
                                <h3 class="facilcard-payment-title">Información Bancaria para Transferencia</h3>
                                
                                <div class="facilcard-bank-info">
                                    <div class="facilcard-bank-detail">
                                        <div class="facilcard-bank-text">
                                            <div class="facilcard-bank-label">Banco</div>
                                            <div class="facilcard-bank-value">STP (Sistema de Transferencias y Pagos)</div>
                                        </div>
                                        <button type="button" class="facilcard-copy-btn copy-bank" data-text="STP (Sistema de Transferencias y Pagos)" data-label="Banco">
                                            <i class="fas fa-copy"></i> Copiar
                                        </button>
                                    </div>
                                    
                                    <div class="facilcard-bank-detail">
                                        <div class="facilcard-bank-text">
                                            <div class="facilcard-bank-label">Tipo de Cuenta</div>
                                            <div class="facilcard-bank-value">Cuenta CLABE</div>
                                        </div>
                                        <button type="button" class="facilcard-copy-btn copy-bank" data-text="Cuenta CLABE" data-label="Tipo de Cuenta">
                                            <i class="fas fa-copy"></i> Copiar
                                        </button>
                                    </div>
                                    
                                    <div class="facilcard-bank-detail">
                                        <div class="facilcard-bank-text">
                                            <div class="facilcard-bank-label">Número de Cuenta CLABE</div>
                                            <div class="facilcard-bank-value">646180154507216394</div>
                                        </div>
                                        <button type="button" class="facilcard-copy-btn copy-bank" data-text="646180154507216394" data-label="Número de Cuenta CLABE">
                                            <i class="fas fa-copy"></i> Copiar
                                        </button>
                                    </div>
                                    
                                    <div class="facilcard-bank-detail">
                                        <div class="facilcard-bank-text">
                                            <div class="facilcard-bank-label">Titular de la Cuenta</div>
                                            <div class="facilcard-bank-value">Alexis Javier Contreras.</div>
                                        </div>
                                        <button type="button" class="facilcard-copy-btn copy-bank" data-text="Alexis Javier Contreras." data-label="Titular de la Cuenta">
                                            <i class="fas fa-copy"></i> Copiar
                                        </button>
                                    </div>
                                    
                                    <div class="facilcard-bank-detail">
                                        <div class="facilcard-bank-text">
                                            <div class="facilcard-bank-label">Email para Confirmación</div>
                                            <div class="facilcard-bank-value">recargas@facilec.com</div>
                                        </div>
                                        <button type="button" class="facilcard-copy-btn copy-bank" data-text="recargas@facilec.com" data-label="Email">
                                            <i class="fas fa-copy"></i> Copiar
                                        </button>
                                    </div>
                                </div>
                                
                                <div class="facilcard-amount-notice">
                                    <i class="fas fa-exclamation-circle"></i>
                                    <span>Transferí exactamente el monto indicado a la cuenta CLABE y sube el comprobante</span>
                                </div>
                            </div>
                            
                            <!-- Información de Pago - Galapagos Token -->
                            <div class="facilcard-payment-info" data-method="galapagos">
                                <h3 class="facilcard-payment-title">Envía Galapagos Token a esta dirección</h3>
                                
                                <div class="facilcard-address-container">
                                    <span id="facilcard-galapagos-address">8XY4saZkSRNJPQG2i9edJfrMe8CBezNcoRFnm9KkPi9S</span>
                                    <button type="button" class="facilcard-copy-btn copy-galapagos galapagos-copy">
                                        <i class="fas fa-copy"></i> Copiar
                                    </button>
                                </div>
                                
                                <div class="facilcard-qr-container">
                                    <div class="facilcard-qr-code galapagos-qr">
                                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=8XY4saZkSRNJPQG2i9edJfrMe8CBezNcoRFnm9KkPi9S" alt="QR Code Galapagos Token">
                                    </div>
                                </div>
                                
                                <div class="facilcard-galapagos-info">
                                    <div class="facilcard-galapagos-detail">
                                        <div class="facilcard-galapagos-text">
                                            <div class="facilcard-galapagos-label">Red</div>
                                            <div class="facilcard-galapagos-value">Solana (SOL) Network</div>
                                        </div>
                                        <button type="button" class="facilcard-copy-btn copy-galapagos-info galapagos-copy" data-text="Solana (SOL) Network" data-label="Red">
                                            <i class="fas fa-copy"></i> Copiar
                                        </button>
                                    </div>
                                    
                                    <div class="facilcard-galapagos-detail">
                                        <div class="facilcard-galapagos-text">
                                            <div class="facilcard-galapagos-label">Tipo de Token</div>
                                            <div class="facilcard-galapagos-value">Galapagos Token (SPL Token)</div>
                                        </div>
                                        <button type="button" class="facilcard-copy-btn copy-galapagos-info galapagos-copy" data-text="Galapagos Token (SPL Token)" data-label="Tipo de Token">
                                            <i class="fas fa-copy"></i> Copiar
                                        </button>
                                    </div>
                                    
                                    <div class="facilcard-galapagos-detail">
                                        <div class="facilcard-galapagos-text">
                                            <div class="facilcard-galapagos-label">Mínimo</div>
                                            <div class="facilcard-galapagos-value">100 USD en Galapagos Token</div>
                                        </div>
                                        <button type="button" class="facilcard-copy-btn copy-galapagos-info galapagos-copy" data-text="100 USD en Galapagos Token" data-label="Mínimo">
                                            <i class="fas fa-copy"></i> Copiar
                                        </button>
                                    </div>
                                </div>
                                
                                <div class="facilcard-amount-notice">
                                    <i class="fas fa-exclamation-circle"></i>
                                    <span>Envía exactamente el monto indicado en Galapagos Token y sube el comprobante</span>
                                </div>
                            </div>
                            
                            <!-- Subida de Comprobante -->
                            <div class="facilcard-form-group">
                                <label>Comprobante de Pago *</label>
                                <div class="facilcard-file-upload">
                                    <i class="fas fa-cloud-upload-alt"></i>
                                    <div>Haz clic o arrastra tu comprobante aquí</div>
                                    <div class="facilcard-file-name" id="facilcard-file-name"></div>
                                    <input type="file" id="facilcard-receipt" class="facilcard-file-input" accept=".jpg,.jpeg,.png,.gif,.pdf" required>
                                </div>
                                <small style="color: #94a3b8; font-size: 0.7rem; display: block; margin-top: 6px;">
                                    <i class="fas fa-info-circle"></i> Formatos aceptados: JPG, PNG, GIF, PDF (Máx. 5MB)
                                </small>
                            </div>
                            
                            <button type="button" class="facilcard-btn" id="facilcard-send-button">
                                <i class="fas fa-paper-plane"></i> Enviar Solicitud de Recarga
                            </button>
                            
                            <!-- Botón Políticas de Uso -->
                            <div class="facilcard-footer">
                                <a href="https://facilec.com/politicas-de-uso" target="_blank" class="facilcard-policies-btn">
                                    <i class="fas fa-file-contract"></i> Leer Políticas de Uso
                                </a>
                            </div>
                        </div>
                        
                        <div class="facilcard-card facilcard-instructions">
                            <h2 class="facilcard-card-title"><i class="fas fa-list-check"></i> Instrucciones</h2>
                            <ol>
                                <li>Completa tus datos personales y de tarjeta.</li>
                                <li><strong>Selecciona tu opción:</strong> Recarga Directa o Sub Distribuidor.</li>
                                <li><strong>Elige método de pago:</strong> USDT TRC20, Transferencia Bancaria o Galapagos Token.</li>
                                <li>Ingresa el monto que deseas recargar.</li>
                                <li>Sigue las instrucciones según el método de pago seleccionado.</li>
                                <li>Sube el comprobante de pago (captura de pantalla o PDF).</li>
                                <li>Haz clic en "Enviar Solicitud de Recarga".</li>
                            </ol>
                            
                            <div class="facilcard-info-box">
                                <h4><i class="fas fa-info-circle"></i> Información Importante</h4>
                                <p>
                                    • <strong>USDT TRC20:</strong> Mínimo 100 USDT<br>
                                    • <strong>Transferencia Bancaria:</strong> 2000 MXN mínimo<br>
                                    • <strong>Galapagos Token:</strong> 100 USD mínimo<br>
                                    • <strong>Banco:</strong> STP - Cuenta CLABE: 646180154507216394<br>
                                    • <strong>Dirección Galapagos:</strong> 8XY4saZkSRNJPQG2i9edJfrMe8CBezNcoRFnm9KkPi9S<br>
                                    • <strong>Recarga Directa:</strong> Procesamiento estándar por Fácil Card<br>
                                    • <strong>Sub Distribuidor:</strong> Procesamiento especializado<br>
                                    • * Campos obligatorios
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
    
    public function process_recharge() {
        // Verificar nonce
        if (!wp_verify_nonce($_POST['nonce'], 'facilcard_nonce')) {
            wp_send_json_error('Error de seguridad. Por favor, recarga la página.');
        }
        
        // Sanitizar datos
        $name = sanitize_text_field($_POST['name']);
        $email = sanitize_email($_POST['email']);
        $phone = sanitize_text_field($_POST['phone']);
        $card_number = sanitize_text_field($_POST['card_number']);
        $card_holder = sanitize_text_field($_POST['card_holder']);
        $amount = floatval($_POST['amount']);
        $payment_method = sanitize_text_field($_POST['payment_method']);
        $provider = sanitize_text_field($_POST['provider']);
        
        // Validar datos
        if (empty($name) || empty($email) || empty($phone) || empty($card_number) || empty($card_holder) || empty($amount) || empty($payment_method) || empty($provider)) {
            wp_send_json_error('Todos los campos son obligatorios.');
        }
        
        if (!is_email($email)) {
            wp_send_json_error('El email no es válido.');
        }
        
        if ($amount <= 0) {
            wp_send_json_error('El monto debe ser mayor a 0.');
        }
        
        // Validar monto mínimo según método de pago
        if ($payment_method === 'usdt' && $amount < 100) {
            wp_send_json_error('El monto mínimo para pagar con USDT es 100 USDT.');
        }
        
        if ($payment_method === 'bank' && $amount < 2000) {
            wp_send_json_error('El monto mínimo para transferencia bancaria es 2000 MXN.');
        }
        
        if ($payment_method === 'galapagos' && $amount < 100) {
            wp_send_json_error('El monto mínimo para Galapagos Token es 100 USD.');
        }
        
        // Procesar archivo subido - CORREGIDO
        if (!isset($_FILES['receipt']) || !is_uploaded_file($_FILES['receipt']['tmp_name'])) {
            wp_send_json_error('No se ha subido ningún archivo o hubo un error en la subida.');
        }
        
        $file = $_FILES['receipt'];
        
        // Verificar si hubo error en la subida
        if ($file['error'] !== UPLOAD_ERR_OK) {
            $error_messages = array(
                UPLOAD_ERR_INI_SIZE => 'El archivo excede el tamaño máximo permitido por el servidor.',
                UPLOAD_ERR_FORM_SIZE => 'El archivo excede el tamaño máximo permitido por el formulario.',
                UPLOAD_ERR_PARTIAL => 'El archivo solo se subió parcialmente.',
                UPLOAD_ERR_NO_FILE => 'No se seleccionó ningún archivo.',
                UPLOAD_ERR_NO_TMP_DIR => 'Falta el directorio temporal.',
                UPLOAD_ERR_CANT_WRITE => 'No se pudo escribir el archivo en el disco.',
                UPLOAD_ERR_EXTENSION => 'Una extensión de PHP detuvo la subida del archivo.'
            );
            
            $error_message = isset($error_messages[$file['error']]) 
                ? $error_messages[$file['error']] 
                : 'Error desconocido al subir el archivo.';
            
            wp_send_json_error('Error al subir el comprobante: ' . $error_message);
        }
        
        // Validar tipo de archivo - CORREGIDO
        $allowed_extensions = array('jpg', 'jpeg', 'png', 'gif', 'pdf');
        $file_extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        
        if (!in_array($file_extension, $allowed_extensions)) {
            wp_send_json_error('Tipo de archivo no permitido. Solo se permiten JPG, PNG, GIF y PDF.');
        }
        
        // Validar tamaño (5MB máximo)
        $max_size = 5 * 1024 * 1024; // 5MB en bytes
        if ($file['size'] > $max_size) {
            wp_send_json_error('El archivo es demasiado grande. El tamaño máximo es 5MB.');
        }
        
        try {
            // Guardar archivo
            $filename = 'comprobante_' . time() . '_' . wp_generate_password(8, false) . '.' . $file_extension;
            $filepath = $this->upload_dir['basedir'] . '/facilcard-receipts/' . $filename;
            
            // Asegurar que el directorio existe
            if (!file_exists(dirname($filepath))) {
                wp_mkdir_p(dirname($filepath));
            }
            
            if (!move_uploaded_file($file['tmp_name'], $filepath)) {
                throw new Exception('Error al guardar el comprobante en el servidor. Verifica los permisos del directorio.');
            }
            
            // Guardar en la base de datos
            global $wpdb;
            
            $result = $wpdb->insert(
                $this->table_name,
                array(
                    'name' => $name,
                    'email' => $email,
                    'phone' => $phone,
                    'card_number' => $card_number,
                    'card_holder' => $card_holder,
                    'amount' => $amount,
                    'payment_method' => $payment_method,
                    'provider' => $provider,
                    'receipt_file' => $filename,
                    'status' => 'pending',
                    'created_at' => current_time('mysql')
                ),
                array('%s', '%s', '%s', '%s', '%s', '%f', '%s', '%s', '%s', '%s', '%s')
            );
            
            if ($result === false) {
                // Log del error para debugging
                error_log('Error en inserción de base de datos: ' . $wpdb->last_error);
                throw new Exception('Error al guardar en la base de datos: ' . $wpdb->last_error);
            }
            
            $transaction_id = $wpdb->insert_id;
            
            // Enviar emails
            $admin_email_sent = $this->send_admin_notification_email($name, $email, $phone, $card_number, $card_holder, $amount, $payment_method, $provider, $filepath, $transaction_id);
            $client_email_sent = $this->send_client_confirmation_email($name, $email, $phone, $card_number, $card_holder, $amount, $payment_method, $provider, $filepath, $transaction_id);
            
            // Solo enviar correo al proveedor si NO es "Recarga Directa"
            $provider_email_sent = false;
            if ($provider !== 'Recarga Directa') {
                $provider_email_sent = $this->send_provider_notification_email($name, $email, $phone, $card_number, $card_holder, $amount, $payment_method, $provider, $filepath, $transaction_id);
            }
            
            wp_send_json_success(array(
                'message' => 'Solicitud de recarga procesada correctamente. Recibirás una confirmación por correo.',
                'admin_email_sent' => $admin_email_sent,
                'client_email_sent' => $client_email_sent,
                'provider_email_sent' => $provider_email_sent,
                'transaction_id' => $transaction_id
            ));
            
        } catch (Exception $e) {
            // Limpiar archivo subido si hay error
            if (isset($filepath) && file_exists($filepath)) {
                unlink($filepath);
            }
            wp_send_json_error('Error al procesar la solicitud: ' . $e->getMessage());
        }
    }
    
    private function send_admin_notification_email($name, $email, $phone, $card_number, $card_holder, $amount, $payment_method, $provider, $receipt_path, $transaction_id) {
        $to = 'recargas@facilec.com';
        $subject = 'Nueva Solicitud de Recarga - Fácil Card - ID: ' . $transaction_id;
        
        $payment_method_text = ($payment_method === 'usdt') ? 'USDT TRC20' : 
                              (($payment_method === 'bank') ? 'Transferencia Bancaria' : 'Galapagos Token');
        
        $special_info = '';
        if ($payment_method === 'bank') {
            $special_info = "\nInformación Bancaria: STP - Cuenta CLABE: 646180154507216394";
        } elseif ($payment_method === 'galapagos') {
            $special_info = "\nDirección Galapagos: 8XY4saZkSRNJPQG2i9edJfrMe8CBezNcoRFnm9KkPi9S";
        }
        
        $message = "
NUEVA SOLICITUD DE RECARGA

ID DE TRANSACCIÓN: $transaction_id

INFORMACIÓN PERSONAL:
• Nombre: $name
• Email: $email
• Teléfono: $phone

DATOS DE TARJETA:
• Número: $card_number
• Titular: $card_holder

DETALLES DE RECARGA:
• Monto: $$amount USD
• Método de Pago: $payment_method_text
• Proveedor: $provider
$special_info

Fecha: " . date('d/m/Y') . "
Hora: " . date('H:i:s') . "

---
Este es un mensaje automático, por favor no responder.
        ";
        
        $headers = array('Content-Type: text/plain; charset=UTF-8');
        
        // Adjuntar comprobante
        $attachments = array($receipt_path);
        
        return wp_mail($to, $subject, $message, $headers, $attachments);
    }
    
    private function send_client_confirmation_email($name, $email, $phone, $card_number, $card_holder, $amount, $payment_method, $provider, $receipt_path, $transaction_id) {
        $to = $email;
        $subject = 'Confirmación de Recarga - Fácil Card - ID: ' . $transaction_id;
        
        $payment_method_text = ($payment_method === 'usdt') ? 'USDT TRC20' : 
                              (($payment_method === 'bank') ? 'Transferencia Bancaria' : 'Galapagos Token');
        
        $special_details = '';
        if ($payment_method === 'bank') {
            $special_details = '<div style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; border-left: 4px solid #3b82f6;">
                <strong>Datos Bancarios:</strong><br>
                Banco: STP<br>
                Cuenta CLABE: 646180154507216394<br>
                Titular: Alexis Javier Contreras.
            </div>';
        } elseif ($payment_method === 'galapagos') {
            $special_details = '<div style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; border-left: 4px solid #ff6b35;">
                <strong>Datos Galapagos Token:</strong><br>
                Dirección: 8XY4saZkSRNJPQG2i9edJfrMe8CBezNcoRFnm9KkPi9S<br>
                Red: Solana (SOL) Network<br>
                Token: Galapagos Token (SPL Token)
            </div>';
        }
        
        $html_message = '
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Confirmación de Recarga</title>
            <style>
                @import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap");
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: "Inter", "Segoe UI", system-ui, sans-serif;
                    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 50%, #000000 100%);
                    color: #ffffff;
                    line-height: 1.6;
                }
                
                .email-container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: #ffffff;
                    border-radius: 15px;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                }
                
                .email-header {
                    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
                    padding: 40px 30px;
                    text-align: center;
                    border-bottom: 5px solid #000000;
                }
                
                .logo {
                    display: inline-flex;
                    align-items: center;
                    gap: 15px;
                    padding: 20px 35px;
                    border-radius: 20px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 2px solid rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(10px);
                }
                
                .logo-icon {
                    width: 50px;
                    height: 50px;
                    background: #ffffff;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #dc2626;
                    font-size: 1.5rem;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                }
                
                .logo-text {
                    font-size: 1.8rem;
                    font-weight: 700;
                    color: #ffffff;
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
                }
                
                .email-body {
                    padding: 40px 30px;
                    background: #ffffff;
                }
                
                .greeting {
                    font-size: 1.5rem;
                    margin-bottom: 15px;
                    color: #dc2626;
                    text-align: center;
                    font-weight: 600;
                }
                
                .message {
                    margin-bottom: 30px;
                    color: #4b5563;
                    text-align: center;
                    font-size: 1.1rem;
                }
                
                .details-card {
                    background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%);
                    border-radius: 15px;
                    padding: 30px;
                    margin: 30px 0;
                    border: 3px solid #dc2626;
                    box-shadow: 0 5px 20px rgba(220, 38, 38, 0.2);
                }
                
                .details-title {
                    font-size: 1.3rem;
                    margin-bottom: 25px;
                    color: #dc2626;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    justify-content: center;
                    font-weight: 700;
                }
                
                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 15px 0;
                    border-bottom: 2px solid #fca5a5;
                }
                
                .detail-label {
                    font-weight: 600;
                    color: #7f1d1d;
                    font-size: 1rem;
                }
                
                .detail-value {
                    font-weight: 700;
                    color: #000000;
                    font-size: 1rem;
                }
                
                .highlight {
                    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                    border-left: 6px solid #d97706;
                    padding: 20px;
                    border-radius: 10px;
                    margin: 25px 0;
                    text-align: center;
                }
                
                .status-info {
                    text-align: center;
                    padding: 25px;
                    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
                    border-radius: 15px;
                    border: 3px solid #16a34a;
                    margin: 30px 0;
                }
                
                .footer {
                    text-align: center;
                    padding: 30px;
                    background: #000000;
                    border-top: 5px solid #dc2626;
                    color: #ffffff;
                    font-size: 0.9rem;
                }
                
                .footer a {
                    color: #fecaca;
                    text-decoration: none;
                }
                
                .footer a:hover {
                    color: #ffffff;
                    text-decoration: underline;
                }
                
                .transaction-id {
                    background: #dc2626;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 25px;
                    font-weight: 600;
                    display: inline-block;
                    margin: 10px 0;
                }
                
                @media (max-width: 600px) {
                    .email-body {
                        padding: 25px 20px;
                    }
                    
                    .detail-row {
                        flex-direction: column;
                        gap: 8px;
                    }
                    
                    .logo {
                        flex-direction: column;
                        gap: 10px;
                    }
                    
                    .logo-text {
                        font-size: 1.5rem;
                    }
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <div class="logo">
                        <div class="logo-icon">
                            <i class="fas fa-bolt"></i>
                        </div>
                        <div class="logo-text">Fácil Card</div>
                    </div>
                </div>
                
                <div class="email-body">
                    <h2 class="greeting">¡Hola ' . $name . '!</h2>
                    <p class="message">Hemos recibido tu solicitud de recarga. Aquí tienes los detalles de tu transacción:</p>
                    
                    <div class="transaction-id">
                        ID de Transacción: ' . $transaction_id . '
                    </div>
                    
                    ' . $special_details . '
                    
                    <div class="details-card">
                        <h3 class="details-title">
                            <i class="fas fa-receipt"></i>
                            Detalles de la Recarga
                        </h3>
                        
                        <div class="detail-row">
                            <span class="detail-label">Monto Recargado:</span>
                            <span class="detail-value">$' . $amount . ' USD</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Método de Pago:</span>
                            <span class="detail-value">' . $payment_method_text . '</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Proveedor:</span>
                            <span class="detail-value">' . $provider . '</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Número de Tarjeta:</span>
                            <span class="detail-value">' . $card_number . '</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Titular de Tarjeta:</span>
                            <span class="detail-value">' . $card_holder . '</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Fecha y Hora:</span>
                            <span class="detail-value">' . date('d/m/Y H:i:s') . '</span>
                        </div>
                    </div>
                    
                    <div class="highlight">
                        <strong><i class="fas fa-clock"></i> Tiempo de Procesamiento:</strong><br>
                        <span style="color: #7c2d12; font-size: 1.1rem;">
                            Tu recarga será procesada en un plazo máximo de <strong>24 horas hábiles</strong>.
                        </span>
                    </div>
                    
                    <div class="status-info">
                        <h3 style="color: #166534; margin-bottom: 15px; font-size: 1.3rem;">
                            <i class="fas fa-check-circle"></i> Solicitud Recibida Exitosamente
                        </h3>
                        <p style="color: #166534; font-size: 1.1rem; font-weight: 500;">
                            Tu solicitud ha sido registrada en nuestro sistema y está siendo procesada.
                        </p>
                    </div>
                    
                    <p style="text-align: center; color: #6b7280; margin-top: 30px; font-size: 1rem;">
                        Si tienes alguna pregunta, no dudes en contactarnos.<br>
                        <strong style="color: #dc2626;">Equipo Fácil Card</strong>
                    </p>
                </div>
                
                <div class="footer">
                    <p>© ' . date('Y') . ' Fácil Card. Todos los derechos reservados.</p>
                    <p>
                        <a href="https://facilec.com/politicas-de-uso" target="_blank">Políticas de Uso</a> | 
                        <a href="https://facilec.com">Visita nuestro sitio web</a> | 
                        <a href="mailto:soporte@facilec.com">Soporte</a>
                    </p>
                    <p style="margin-top: 10px; font-size: 0.8rem;">
                        Este es un mensaje automático, por favor no responder.
                    </p>
                </div>
            </div>
        </body>
        </html>
        ';
        
        $headers = array(
            'Content-Type: text/html; charset=UTF-8',
            'From: Fácil Card <no-reply@facilec.com>'
        );
        
        // Adjuntar comprobante
        $attachments = array($receipt_path);
        
        return wp_mail($to, $subject, $html_message, $headers, $attachments);
    }
    
    private function send_provider_notification_email($name, $email, $phone, $card_number, $card_holder, $amount, $payment_method, $provider, $receipt_path, $transaction_id) {
        // Determinar el correo del proveedor
        $provider_email = '';
        if ($provider === 'La Paz Crypto Pay') {
            $provider_email = 'lapazcriptopaycargas@facilec.com';
        } elseif ($provider === 'Master Facil') {
            $provider_email = 'masterfacil@facilec.com';
        }
        
        if (empty($provider_email)) {
            return false;
        }
        
        $to = $provider_email;
        $subject = 'Nueva Solicitud de Recarga - ' . $provider . ' - ID: ' . $transaction_id;
        
        $payment_method_text = ($payment_method === 'usdt') ? 'USDT TRC20' : 
                              (($payment_method === 'bank') ? 'Transferencia Bancaria' : 'Galapagos Token');
        
        $special_info = '';
        if ($payment_method === 'bank') {
            $special_info = "\nInformación Bancaria: STP - Cuenta CLABE: 646180154507216394";
        } elseif ($payment_method === 'galapagos') {
            $special_info = "\nDirección Galapagos: 8XY4saZkSRNJPQG2i9edJfrMe8CBezNcoRFnm9KkPi9S";
        }
        
        $message = "
NUEVA SOLICITUD DE RECARGA - $provider

ID DE TRANSACCIÓN: $transaction_id

INFORMACIÓN DEL CLIENTE:
• Nombre: $name
• Email: $email
• Teléfono: $phone

DATOS DE TARJETA:
• Número: $card_number
• Titular: $card_holder

DETALLES DE RECARGA:
• Monto: $$amount USD
• Método de Pago: $payment_method_text
• Proveedor: $provider
$special_info

Fecha: " . date('d/m/Y') . "
Hora: " . date('H:i:s') . "

---
Este es un mensaje automático, por favor no responder.
        ";
        
        $headers = array('Content-Type: text/plain; charset=UTF-8');
        
        // Adjuntar comprobante
        $attachments = array($receipt_path);
        
        return wp_mail($to, $subject, $message, $headers, $attachments);
    }
}

// Inicializar el plugin
new FacilCardRechargePlugin();
?>
[file content end]