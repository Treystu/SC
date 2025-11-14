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
        .package(url: "https://github.com/stasel/WebRTC.git", from: "120.0.0")
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
            dependencies: ["SovereignCommunications"]
        )
    ]
)
