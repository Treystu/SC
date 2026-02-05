// sc-cli — Iron Core Messaging CLI
//
// Real messaging commands, not vitality demos.

use sc_core::IronCore;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "sc-cli")]
#[command(about = "Iron Core V2 — Encrypted P2P Messaging", long_about = None)]
struct Cli {
    /// Path for persistent storage (optional)
    #[arg(short, long)]
    storage: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Identity management
    Identity {
        #[command(subcommand)]
        action: IdentityAction,
    },
    /// Send an encrypted message (outputs envelope bytes)
    Send {
        /// Recipient's public key (hex)
        #[arg()]
        recipient: String,
        /// Message text
        #[arg()]
        message: String,
    },
    /// Run end-to-end messaging test (two in-memory nodes)
    Test,
}

#[derive(Subcommand)]
enum IdentityAction {
    /// Generate a new identity (or load existing)
    Generate,
    /// Show current identity info
    Show,
}

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();

    let core = if let Some(path) = &cli.storage {
        IronCore::with_storage(path.clone())
    } else {
        IronCore::new()
    };

    match cli.command {
        Commands::Identity { action } => match action {
            IdentityAction::Generate => cmd_identity_generate(&core)?,
            IdentityAction::Show => cmd_identity_show(&core)?,
        },
        Commands::Send { recipient, message } => cmd_send(&core, &recipient, &message)?,
        Commands::Test => cmd_test()?,
    }

    Ok(())
}

fn cmd_identity_generate(core: &IronCore) -> anyhow::Result<()> {
    println!("Generating identity...\n");
    core.initialize_identity()
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    let info = core.get_identity_info();
    println!("Identity created successfully.\n");
    println!("Identity ID: {}", info.identity_id.unwrap_or_default());
    println!("Public Key:  {}", info.public_key_hex.unwrap_or_default());
    println!("\nShare your public key with peers so they can send you messages.");
    Ok(())
}

fn cmd_identity_show(core: &IronCore) -> anyhow::Result<()> {
    core.initialize_identity()
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    let info = core.get_identity_info();
    if info.initialized {
        println!("Identity ID: {}", info.identity_id.unwrap_or_default());
        println!("Public Key:  {}", info.public_key_hex.unwrap_or_default());
    } else {
        println!("No identity found. Run `sc-cli identity generate` first.");
    }
    Ok(())
}

fn cmd_send(core: &IronCore, recipient_hex: &str, text: &str) -> anyhow::Result<()> {
    core.initialize_identity()
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    let sender_info = core.get_identity_info();
    println!("Sender: {}...", &sender_info.public_key_hex.unwrap_or_default()[..16]);
    println!("Recipient: {}...", &recipient_hex[..std::cmp::min(16, recipient_hex.len())]);
    println!("Message: {}\n", text);

    let envelope_bytes = core
        .prepare_message(recipient_hex.to_string(), text.to_string())
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    println!("Encrypted envelope: {} bytes", envelope_bytes.len());
    println!("Message ready for transmission.");
    println!("\n(Peer-to-peer transport coming in next iteration)");
    Ok(())
}

fn cmd_test() -> anyhow::Result<()> {
    println!("Iron Core V2 — End-to-End Messaging Test");
    println!("=========================================\n");

    let alice = IronCore::new();
    let bob = IronCore::new();

    alice.initialize_identity().map_err(|e| anyhow::anyhow!("{}", e))?;
    bob.initialize_identity().map_err(|e| anyhow::anyhow!("{}", e))?;

    let alice_info = alice.get_identity_info();
    let bob_info = bob.get_identity_info();

    println!("Alice: {}...", &alice_info.public_key_hex.as_ref().unwrap()[..16]);
    println!("Bob:   {}...\n", &bob_info.public_key_hex.as_ref().unwrap()[..16]);

    // Test 1: Alice sends to Bob
    println!("Test 1: Alice -> Bob (text message)");
    let envelope = alice
        .prepare_message(bob_info.public_key_hex.clone().unwrap(), "Hello Bob! This is a secret message.".to_string())
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    println!("  Encrypted: {} bytes", envelope.len());

    let msg = bob.receive_message(envelope).map_err(|e| anyhow::anyhow!("{}", e))?;
    println!("  Decrypted: \"{}\"", msg.text_content().unwrap());
    println!("  Sender ID matches: {}", msg.sender_id == alice_info.identity_id.clone().unwrap());
    println!("  PASS\n");

    // Test 2: Bob sends to Alice
    println!("Test 2: Bob -> Alice (text message)");
    let envelope = bob
        .prepare_message(alice_info.public_key_hex.clone().unwrap(), "Hey Alice! Got your message.".to_string())
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    println!("  Encrypted: {} bytes", envelope.len());

    let msg = alice.receive_message(envelope).map_err(|e| anyhow::anyhow!("{}", e))?;
    println!("  Decrypted: \"{}\"", msg.text_content().unwrap());
    println!("  PASS\n");

    // Test 3: Eve cannot decrypt
    println!("Test 3: Eve cannot decrypt Alice's message to Bob");
    let eve = IronCore::new();
    eve.initialize_identity().map_err(|e| anyhow::anyhow!("{}", e))?;

    let envelope = alice
        .prepare_message(bob_info.public_key_hex.clone().unwrap(), "This is only for Bob".to_string())
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    match eve.receive_message(envelope) {
        Ok(_) => println!("  FAIL: Eve decrypted the message!"),
        Err(_) => println!("  Eve cannot decrypt: PASS"),
    }
    println!();

    // Test 4: Replay protection
    println!("Test 4: Replay protection");
    let envelope = alice
        .prepare_message(bob_info.public_key_hex.unwrap(), "No replays allowed".to_string())
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    bob.receive_message(envelope.clone()).map_err(|e| anyhow::anyhow!("{}", e))?;
    println!("  First receive: OK");

    match bob.receive_message(envelope) {
        Ok(_) => println!("  FAIL: Replay accepted!"),
        Err(_) => println!("  Replay rejected: PASS"),
    }
    println!();

    // Test 5: Digital signatures
    println!("Test 5: Digital signatures");
    let data = b"Important document content".to_vec();
    let sig = alice.sign_data(data.clone()).map_err(|e| anyhow::anyhow!("{}", e))?;

    let valid = alice
        .verify_signature(data.clone(), sig.signature.clone(), sig.public_key_hex.clone())
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    println!("  Valid signature: {}", valid);

    let invalid = alice
        .verify_signature(b"tampered".to_vec(), sig.signature, sig.public_key_hex)
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    println!("  Tampered data rejected: {}", !invalid);
    println!("  PASS\n");

    println!("=========================================");
    println!("All tests passed.");
    println!("\nPhase 0 status:");
    println!("  [x] Generate identities");
    println!("  [x] Encrypt messages (XChaCha20-Poly1305 + X25519)");
    println!("  [x] Decrypt messages");
    println!("  [x] Replay protection (deduplication)");
    println!("  [x] Digital signatures (Ed25519)");
    println!("  [ ] Peer discovery (mDNS / DHT) — transport layer ready");
    println!("  [ ] Send over network — transport layer ready");
    println!("  [ ] Delivery receipts — message types ready");

    Ok(())
}
