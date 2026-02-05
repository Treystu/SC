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
    }

    Ok(())
}

fn run_interactive_demo() -> anyhow::Result<()> {
    println!("\n🦀 Iron Core V2 - Interactive Vitality Demo");
    println!("==========================================\n");
    println!("This demo shows how the Governor (Vitality Engine) adapts to");
    println!("environmental conditions like battery level and network type.\n");

    let core = IronCore::new();
    core.start();

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
    core.start();

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
    core.start();

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
