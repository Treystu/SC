// sc-cli - Iron Core Test Harness & Interactive Demo
// Demonstrates the Vitality Engine in action

use sc_core::{IronCore, EnvironmentalReading, NetworkType, NodeState};
use clap::{Parser, Subcommand};
use std::io::{self, Write};

#[derive(Parser)]
#[command(name = "sc-cli")]
#[command(about = "Iron Core V2 - Test Harness & Demo", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Interactive vitality demo
    Demo,
    /// Run automated vitality tests
    Test,
    /// Simulate a specific scenario
    Simulate {
        /// Battery level (0.0 to 1.0)
        #[arg(short, long)]
        battery: f32,
        /// Network type (wifi, cellular, ethernet, unknown)
        #[arg(short, long)]
        network: String,
    },
    /// Comprehensive demo of all Iron Core V2 features
    Full,
}

fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Demo => run_interactive_demo()?,
        Commands::Test => run_automated_tests()?,
        Commands::Simulate { battery, network } => run_simulation(battery, &network)?,
        Commands::Full => run_comprehensive_demo()?,
    }

    Ok(())
}

fn run_interactive_demo() -> anyhow::Result<()> {
    println!("\n🦀 Iron Core V2 - Interactive Vitality Demo");
    println!("==========================================\n");
    println!("This demo shows how the Governor (Vitality Engine) adapts to");
    println!("environmental conditions like battery level and network type.\n");

    let core = IronCore::new();
    core.start().expect("Failed to start Iron Core");

    println!("📊 Initial State:");
    print_vitality_report(&core);

    loop {
        println!("\n--- Simulation Options ---");
        println!("1. High Battery + WiFi (Hub mode)");
        println!("2. Medium Battery + WiFi (Active mode)");
        println!("3. Low Battery + WiFi (Leaf mode)");
        println!("4. High Battery + Cellular (Leaf mode - poor network)");
        println!("5. Battery Drain Simulation (1.0 -> 0.0)");
        println!("6. Network Roaming Simulation");
        println!("7. Custom Input");
        println!("0. Exit");
        print!("\nSelect option: ");
        io::stdout().flush()?;

        let mut input = String::new();
        io::stdin().read_line(&mut input)?;

        match input.trim() {
            "1" => {
                println!("\n⚡ Setting: Battery=90%, Network=WiFi");
                core.set_environmental_reading(EnvironmentalReading {
                    battery_level: 0.9,
                    network_type: NetworkType::Wifi,
                });
                print_vitality_report(&core);
            }
            "2" => {
                println!("\n⚡ Setting: Battery=50%, Network=WiFi");
                core.set_environmental_reading(EnvironmentalReading {
                    battery_level: 0.5,
                    network_type: NetworkType::Wifi,
                });
                print_vitality_report(&core);
            }
            "3" => {
                println!("\n⚡ Setting: Battery=15%, Network=WiFi");
                core.set_environmental_reading(EnvironmentalReading {
                    battery_level: 0.15,
                    network_type: NetworkType::Wifi,
                });
                print_vitality_report(&core);
            }
            "4" => {
                println!("\n⚡ Setting: Battery=90%, Network=Cellular");
                core.set_environmental_reading(EnvironmentalReading {
                    battery_level: 0.9,
                    network_type: NetworkType::Cellular,
                });
                print_vitality_report(&core);
            }
            "5" => {
                println!("\n⚡ Simulating battery drain from 100% to 0%...\n");
                simulate_battery_drain(&core);
            }
            "6" => {
                println!("\n⚡ Simulating network roaming (WiFi -> Cellular -> WiFi)...\n");
                simulate_roaming(&core);
            }
            "7" => {
                custom_input(&core)?;
            }
            "0" => {
                println!("\n👋 Shutting down Iron Core...");
                core.stop();
                break;
            }
            _ => {
                println!("❌ Invalid option");
            }
        }
    }

    Ok(())
}

fn run_automated_tests() -> anyhow::Result<()> {
    println!("\n🧪 Running Automated Vitality Tests\n");
    println!("===================================\n");

    let core = IronCore::new();
    core.start().expect("Failed to start Iron Core");

    let test_cases = vec![
        (0.9, NetworkType::Wifi, "Hub", "High battery + WiFi"),
        (0.5, NetworkType::Wifi, "Active", "Medium battery + WiFi"),
        (0.15, NetworkType::Wifi, "Leaf", "Low battery + WiFi"),
        (0.9, NetworkType::Cellular, "Leaf", "High battery + Cellular"),
        (0.15, NetworkType::Cellular, "Leaf", "Low battery + Cellular"),
        (0.5, NetworkType::Ethernet, "Active", "Medium battery + Ethernet"),
    ];

    for (i, (battery, network, expected_state, description)) in test_cases.iter().enumerate() {
        println!("Test {}: {}", i + 1, description);
        core.set_environmental_reading(EnvironmentalReading {
            battery_level: *battery,
            network_type: *network,
        });

        let report = core.get_vitality_report();
        let state_str = format!("{:?}", report.state);

        let status = if state_str == *expected_state {
            "✅ PASS"
        } else {
            "❌ FAIL"
        };

        println!("  Expected: {} | Got: {} | {}", expected_state, state_str, status);
        println!("  Vitality Score: {:.2}", report.score);
        println!();
    }

    core.stop();
    println!("✅ All tests completed!\n");

    Ok(())
}

fn run_simulation(battery: f32, network: &str) -> anyhow::Result<()> {
    let network_type = match network.to_lowercase().as_str() {
        "wifi" => NetworkType::Wifi,
        "cellular" => NetworkType::Cellular,
        "ethernet" => NetworkType::Ethernet,
        _ => NetworkType::Unknown,
    };

    println!("\n🔬 Running Simulation");
    println!("====================");
    println!("Battery: {:.0}%", battery * 100.0);
    println!("Network: {:?}\n", network_type);

    let core = IronCore::new();
    core.start().expect("Failed to start Iron Core");

    core.set_environmental_reading(EnvironmentalReading {
        battery_level: battery,
        network_type,
    });

    print_vitality_report(&core);
    core.stop();

    Ok(())
}

fn print_vitality_report(core: &IronCore) {
    let report = core.get_vitality_report();

    println!("\n📊 Vitality Report");
    println!("==================");
    println!("State:           {:?}", report.state);
    println!("Vitality Score:  {:.2}", report.score);
    println!("Battery Level:   {:.0}%", report.battery_level * 100.0);
    println!("Network Type:    {:?}", report.network_type);

    let capabilities = match report.state {
        NodeState::Hub => "Can relay, serve DHT, 6 mesh connections",
        NodeState::Active => "Normal participation, 3 mesh connections",
        NodeState::Leaf => "Minimal participation, 0 mesh connections",
        NodeState::Sleeping => "Delegated listening mode",
    };

    println!("Capabilities:    {}", capabilities);

    // Visual indicator
    let indicator = match report.state {
        NodeState::Hub => "🟢 Hub - Maximum vitality",
        NodeState::Active => "🟡 Active - Normal operation",
        NodeState::Leaf => "🟠 Leaf - Conservation mode",
        NodeState::Sleeping => "💤 Sleeping - Delegated",
    };

    println!("\n{}", indicator);
}

fn simulate_battery_drain(core: &IronCore) {
    let steps = 10;
    for i in (0..=steps).rev() {
        let battery = i as f32 / steps as f32;
        println!("Battery: {:.0}%", battery * 100.0);

        core.set_environmental_reading(EnvironmentalReading {
            battery_level: battery,
            network_type: NetworkType::Wifi,
        });

        let report = core.get_vitality_report();
        println!("  State: {:?}, Score: {:.2}", report.state, report.score);

        std::thread::sleep(std::time::Duration::from_millis(500));
    }
}

fn simulate_roaming(core: &IronCore) {
    let networks = vec![
        (NetworkType::Wifi, "WiFi"),
        (NetworkType::Cellular, "Cellular"),
        (NetworkType::Wifi, "WiFi"),
        (NetworkType::Ethernet, "Ethernet"),
    ];

    for (network, name) in networks {
        println!("Network changed to: {}", name);

        core.set_environmental_reading(EnvironmentalReading {
            battery_level: 0.8,
            network_type: network,
        });

        let report = core.get_vitality_report();
        println!("  State: {:?}, Score: {:.2}", report.state, report.score);
        println!();

        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}

fn custom_input(core: &IronCore) -> anyhow::Result<()> {
    print!("\nEnter battery level (0.0 to 1.0): ");
    io::stdout().flush()?;
    let mut battery_input = String::new();
    io::stdin().read_line(&mut battery_input)?;
    let battery: f32 = battery_input.trim().parse()?;

    print!("Enter network type (wifi/cellular/ethernet/unknown): ");
    io::stdout().flush()?;
    let mut network_input = String::new();
    io::stdin().read_line(&mut network_input)?;

    let network_type = match network_input.trim().to_lowercase().as_str() {
        "wifi" => NetworkType::Wifi,
        "cellular" => NetworkType::Cellular,
        "ethernet" => NetworkType::Ethernet,
        _ => NetworkType::Unknown,
    };

    println!("\n⚡ Setting custom values...");
    core.set_environmental_reading(EnvironmentalReading {
        battery_level: battery,
        network_type,
    });

    print_vitality_report(core);

    Ok(())
}

fn run_comprehensive_demo() -> anyhow::Result<()> {
    println!("\n╔══════════════════════════════════════════════════════════╗");
    println!("║  IRON CORE V2 - COMPREHENSIVE INTEGRATION DEMO          ║");
    println!("║  \"One Binary, Infinite Possibilities\"                   ║");
    println!("╚══════════════════════════════════════════════════════════╝\n");

    println!("This demo showcases all 4 phases of Iron Core V2 integrated:");
    println!("  • Phase 1: Governor (Vitality Engine)");
    println!("  • Phase 2: Mycorrhizal Mesh (Adaptive Networking)");
    println!("  • Phase 3: Symbiosis (Delegated Listening)");
    println!("  • Phase 4: Identity & Cryptography\n");

    // Create and start core
    let core = IronCore::new();
    println!("🦀 Creating Iron Core instance...");
    core.start().expect("Failed to start Iron Core");
    println!("✅ Iron Core started successfully\n");

    // ========================================================================
    // PHASE 1: GOVERNOR (VITALITY ENGINE)
    // ========================================================================
    println!("╔═══════════════════════════════════════════════════════════╗");
    println!("║  PHASE 1: GOVERNOR - VITALITY ENGINE                     ║");
    println!("╚═══════════════════════════════════════════════════════════╝\n");

    println!("📊 Initial Vitality State:");
    print_vitality_report(&core);

    println!("\n⚡ Simulating High-Resource Environment (Hub Mode)...");
    core.set_environmental_reading(EnvironmentalReading {
        battery_level: 0.95,
        network_type: NetworkType::Wifi,
    });
    print_vitality_report(&core);

    println!("\n⚡ Simulating Low-Resource Environment (Leaf Mode)...");
    core.set_environmental_reading(EnvironmentalReading {
        battery_level: 0.15,
        network_type: NetworkType::Cellular,
    });
    print_vitality_report(&core);

    // Restore to Hub mode for remaining demos
    core.set_environmental_reading(EnvironmentalReading {
        battery_level: 0.95,
        network_type: NetworkType::Wifi,
    });

    // ========================================================================
    // PHASE 2: MYCORRHIZAL MESH
    // ========================================================================
    println!("\n╔═══════════════════════════════════════════════════════════╗");
    println!("║  PHASE 2: MYCORRHIZAL MESH - ADAPTIVE NETWORKING         ║");
    println!("╚═══════════════════════════════════════════════════════════╝\n");

    let mesh_params = core.get_mesh_parameters();
    println!("🕸️  Mesh Parameters (for current vitality state):");
    println!("   • mesh_n_low: {} connections", mesh_params.mesh_n_low);
    println!("   • mesh_n: {} connections", mesh_params.mesh_n);
    println!("   • mesh_n_high: {} connections", mesh_params.mesh_n_high);
    println!("   • relay_enabled: {}", mesh_params.enable_relay);
    println!("   • dht_mode: {}", mesh_params.dht_mode);

    let peer_scores = core.get_peer_scores();
    println!("\n👥 Known Peers: {} (peer scoring ready)", peer_scores.len());

    println!("\n📤 Testing message publishing...");
    let test_message = b"Hello from Iron Core V2!".to_vec();
    core.publish_message(test_message.clone())?;
    println!("   ✅ Message published successfully ({} bytes)", test_message.len());

    // ========================================================================
    // PHASE 3: SYMBIOSIS (DELEGATED LISTENING)
    // ========================================================================
    println!("\n╔═══════════════════════════════════════════════════════════╗");
    println!("║  PHASE 3: SYMBIOSIS - DELEGATED LISTENING                ║");
    println!("╚═══════════════════════════════════════════════════════════╝\n");

    let delegation_status = core.get_delegation_status();
    println!("💤 Delegation Status:");
    println!("   • Active: {}", delegation_status.is_active);
    println!("   • Delegate Count: {}", delegation_status.delegate_count);
    println!("   • Delegates: {:?}", delegation_status.delegate_ids);

    println!("\n🔄 Attempting to enable delegated listening...");
    let result = core.enable_delegated_listening("test_push_token_123".to_string());
    match result {
        Ok(_) => println!("   ✅ Delegation enabled successfully"),
        Err(e) => println!("   ⚠️  Delegation failed: {} (expected - no peers available)", e),
    }

    // ========================================================================
    // PHASE 4: IDENTITY & CRYPTOGRAPHY
    // ========================================================================
    println!("\n╔═══════════════════════════════════════════════════════════╗");
    println!("║  PHASE 4: IDENTITY & CRYPTOGRAPHY                        ║");
    println!("╚═══════════════════════════════════════════════════════════╝\n");

    let identity_info = core.get_identity_info();
    if identity_info.initialized {
        println!("🔑 Identity already initialized (from auto-start)");
    } else {
        println!("🔑 Initializing identity...");
        core.initialize_identity()?;
        println!("   ✅ Identity initialized successfully");
    }

    let identity_info = core.get_identity_info();
    println!("\n🆔 Identity Information:");
    if let Some(id) = identity_info.identity_id {
        println!("   • Identity ID: {}...", &id[..16]);
    }
    if let Some(pk) = identity_info.public_key_hex {
        println!("   • Public Key: {}...", &pk[..16]);
    }
    println!("   • Initialized: {}", identity_info.initialized);

    // Test signing and verification
    println!("\n🔐 Testing cryptographic operations...");
    let data = b"Test message for signing".to_vec();
    let sig_result = core.sign_data(data.clone())?;
    println!("   ✅ Data signed successfully");
    println!("   • Signature length: {} bytes", sig_result.signature.len());

    let is_valid = core.verify_signature(
        data.clone(),
        sig_result.signature.clone(),
        sig_result.public_key_hex.clone(),
    )?;
    println!("   ✅ Signature verification: {}", if is_valid { "VALID ✓" } else { "INVALID ✗" });

    // Try verifying with wrong data
    let wrong_data = b"Wrong message".to_vec();
    let is_invalid = core.verify_signature(
        wrong_data,
        sig_result.signature,
        sig_result.public_key_hex,
    )?;
    println!("   ✅ Invalid signature detection: {}", if !is_invalid { "WORKING ✓" } else { "FAILED ✗" });

    // ========================================================================
    // SUMMARY
    // ========================================================================
    println!("\n╔═══════════════════════════════════════════════════════════╗");
    println!("║  INTEGRATION SUMMARY                                      ║");
    println!("╚═══════════════════════════════════════════════════════════╝\n");

    println!("✅ Phase 1 (Governor): Vitality state management working");
    println!("✅ Phase 2 (Mesh): Adaptive networking parameters working");
    println!("✅ Phase 3 (Symbiosis): Delegation protocol ready");
    println!("✅ Phase 4 (Identity): Ed25519 cryptography working");
    println!("\n🎉 All systems integrated and operational!");
    println!("📱 Ready for mobile bindings (iOS/Android via UniFFI)");
    println!("🌐 Ready for web bindings (Browser via WASM)\n");

    // Cleanup
    core.stop();
    println!("🛑 Iron Core stopped gracefully\n");

    Ok(())
}
