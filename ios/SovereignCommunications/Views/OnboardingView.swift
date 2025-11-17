import SwiftUI

/**
 * iOS Onboarding Flow
 * Matches web and Android onboarding for consistency
 */
struct OnboardingView: View {
    let localPeerId: String
    let onComplete: () -> Void
    
    @State private var currentStep: OnboardingStep = .welcome
    @State private var displayName: String = ""
    
    var body: some View {
        ZStack {
            Color(UIColor.systemBackground)
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Progress indicator
                OnboardingProgressView(currentStep: currentStep)
                    .padding()
                
                // Content
                TabView(selection: $currentStep) {
                    WelcomeScreenView(
                        onNext: { currentStep = .identity },
                        onSkip: onComplete
                    )
                    .tag(OnboardingStep.welcome)
                    
                    IdentityScreenView(
                        peerId: localPeerId,
                        displayName: $displayName,
                        onBack: { currentStep = .welcome },
                        onNext: { currentStep = .addContact }
                    )
                    .tag(OnboardingStep.identity)
                    
                    AddContactTutorialView(
                        onBack: { currentStep = .identity },
                        onNext: { currentStep = .privacy }
                    )
                    .tag(OnboardingStep.addContact)
                    
                    PrivacyScreenView(
                        onBack: { currentStep = .addContact },
                        onComplete: {
                            UserDefaults.standard.set(true, forKey: "onboarding_complete")
                            if !displayName.isEmpty {
                                UserDefaults.standard.set(displayName, forKey: "display_name")
                            }
                            onComplete()
                        }
                    )
                    .tag(OnboardingStep.privacy)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
        }
    }
}

enum OnboardingStep: Int {
    case welcome = 0
    case identity = 1
    case addContact = 2
    case privacy = 3
}

struct OnboardingProgressView: View {
    let currentStep: OnboardingStep
    
    var body: some View {
        HStack(spacing: 12) {
            ForEach(0..<4) { index in
                Circle()
                    .fill(index <= currentStep.rawValue ? Color.green : Color.gray.opacity(0.3))
                    .frame(width: 12, height: 12)
            }
        }
        .padding(.vertical, 16)
    }
}

struct WelcomeScreenView: View {
    let onNext: () -> Void
    let onSkip: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            
            Text("🔐")
                .font(.system(size: 64))
            
            Text("Welcome to Sovereign Communications")
                .font(.system(size: 28, weight: .bold))
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            Text("Private, decentralized messaging with end-to-end encryption")
                .font(.system(size: 16))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            VStack(spacing: 8) {
                FeatureItemView(text: "✅ No central servers")
                FeatureItemView(text: "✅ Military-grade encryption")
                FeatureItemView(text: "✅ Direct peer-to-peer connections")
                FeatureItemView(text: "✅ Your data stays on your device")
            }
            .padding(.horizontal)
            .padding(.top, 20)
            
            Spacer()
            
            VStack(spacing: 12) {
                Button(action: onNext) {
                    Text("Get Started")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.green)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                
                Button(action: onSkip) {
                    Text("Skip Tutorial")
                        .font(.system(size: 14))
                        .foregroundColor(.gray)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 20)
        }
    }
}

struct FeatureItemView: View {
    let text: String
    
    var body: some View {
        HStack {
            Text(text)
                .font(.system(size: 16))
                .foregroundColor(.primary)
            Spacer()
        }
        .padding()
        .background(Color.green.opacity(0.1))
        .cornerRadius(8)
    }
}

struct IdentityScreenView: View {
    let peerId: String
    @Binding var displayName: String
    let onBack: () -> Void
    let onNext: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            
            Text("🆔")
                .font(.system(size: 64))
            
            Text("Your Secure Identity")
                .font(.system(size: 24, weight: .bold))
                .multilineTextAlignment(.center)
            
            Text("We've created a unique cryptographic identity for you. This ID is how others will connect to you.")
                .font(.system(size: 16))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            VStack(alignment: .leading, spacing: 8) {
                Text("Your Peer ID:")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                
                Text(peerId)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(.green)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(UIColor.secondarySystemBackground))
                    .cornerRadius(8)
            }
            .padding(.horizontal)
            
            VStack(alignment: .leading, spacing: 4) {
                TextField("Display Name (optional)", text: $displayName)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal)
                
                Text("This name is only stored locally on your device")
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
                    .padding(.horizontal)
            }
            
            Spacer()
            
            HStack(spacing: 12) {
                Button(action: onBack) {
                    Text("Back")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(UIColor.secondarySystemBackground))
                        .foregroundColor(.primary)
                        .cornerRadius(12)
                }
                
                Button(action: onNext) {
                    Text("Continue")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.green)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 20)
        }
    }
}

struct AddContactTutorialView: View {
    let onBack: () -> Void
    let onNext: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            
            Text("👥")
                .font(.system(size: 64))
            
            Text("Connect with Others")
                .font(.system(size: 24, weight: .bold))
                .multilineTextAlignment(.center)
            
            Text("To start messaging, you'll need to add contacts. There are several ways to connect:")
                .font(.system(size: 16))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            VStack(spacing: 16) {
                ConnectionMethodView(
                    icon: "📱",
                    title: "QR Code",
                    description: "Scan someone's QR code or show yours"
                )
                ConnectionMethodView(
                    icon: "🔗",
                    title: "Manual Entry",
                    description: "Exchange Peer IDs directly"
                )
                ConnectionMethodView(
                    icon: "🧪",
                    title: "Demo Mode",
                    description: "Try it out with \"demo\" as the Peer ID"
                )
            }
            .padding(.horizontal)
            
            HStack(alignment: .top, spacing: 8) {
                Text("💡")
                    .font(.system(size: 20))
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("Tip:")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.green)
                    Text("Click the \"+\" button to add your first contact")
                        .font(.system(size: 14))
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.green.opacity(0.1))
            .cornerRadius(8)
            .padding(.horizontal)
            
            Spacer()
            
            HStack(spacing: 12) {
                Button(action: onBack) {
                    Text("Back")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(UIColor.secondarySystemBackground))
                        .foregroundColor(.primary)
                        .cornerRadius(12)
                }
                
                Button(action: onNext) {
                    Text("Continue")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.green)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 20)
        }
    }
}

struct ConnectionMethodView: View {
    let icon: String
    let title: String
    let description: String
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(icon)
                .font(.system(size: 24))
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.green)
                Text(description)
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
        .padding()
        .background(Color(UIColor.secondarySystemBackground))
        .cornerRadius(8)
    }
}

struct PrivacyScreenView: View {
    let onBack: () -> Void
    let onComplete: () -> Void
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text("🔒")
                    .font(.system(size: 64))
                    .padding(.top, 20)
                
                Text("Your Privacy & Security")
                    .font(.system(size: 24, weight: .bold))
                    .multilineTextAlignment(.center)
                
                VStack(spacing: 16) {
                    PrivacyFeatureView(
                        icon: "🔐",
                        title: "End-to-End Encryption",
                        description: "All messages are encrypted with Ed25519 signatures and XChaCha20-Poly1305 encryption. Even we can't read your messages."
                    )
                    PrivacyFeatureView(
                        icon: "🌐",
                        title: "Decentralized Network",
                        description: "Messages travel directly between devices using peer-to-peer connections. No data passes through our servers because we don't have any."
                    )
                    PrivacyFeatureView(
                        icon: "💾",
                        title: "Local Storage",
                        description: "Your messages, contacts, and identity are stored only on your device. Make sure to backup your identity keys!"
                    )
                    PrivacyFeatureView(
                        icon: "🔄",
                        title: "Perfect Forward Secrecy",
                        description: "Session keys automatically rotate, so even if a key is compromised, past messages remain secure."
                    )
                }
                .padding(.horizontal)
                
                HStack(spacing: 12) {
                    Button(action: onBack) {
                        Text("Back")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color(UIColor.secondarySystemBackground))
                            .foregroundColor(.primary)
                            .cornerRadius(12)
                    }
                    
                    Button(action: onComplete) {
                        Text("Start Messaging")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 20)
            }
        }
    }
}

struct PrivacyFeatureView: View {
    let icon: String
    let title: String
    let description: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(icon)
                    .font(.system(size: 20))
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.green)
            }
            
            Text(description)
                .font(.system(size: 14))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(UIColor.secondarySystemBackground))
        .cornerRadius(8)
    }
}
