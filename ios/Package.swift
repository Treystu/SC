// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "SovereignCommunications",
    platforms: [
        .iOS(.v15)
    ],
    products: [
        .library(
            name: "SovereignCommunications",
            targets: ["SovereignCommunications"]
        )
    ],
    dependencies: [
        // Updated to latest version for security patches
        // Previous: 120.0.0 (M120, Nov 2023)
        // Current: 125.0.0 (M125, latest stable)
        // Check for updates: https://github.com/stasel/WebRTC/releases
        .package(url: "https://github.com/stasel/WebRTC.git", from: "125.0.0")
    ],
    targets: [
        .target(
            name: "SovereignCommunications",
            dependencies: [
                .product(name: "WebRTC", package: "WebRTC")
            ]
        ),
        .testTarget(
            name: "SovereignCommunicationsTests",
            dependencies: ["SovereignCommunications"],
            resources: [
                .process("Resources")
            ]
        )
    ]
)
