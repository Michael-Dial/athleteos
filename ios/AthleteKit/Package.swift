// swift-tools-version: 6.0
// AthleteKit: everything in the iOS app that is not a screen. The API client
// and its generated models, the session, invite codes and the phone sync
// rules. Plain Foundation, so `swift test` runs it on a Mac without a
// simulator.
import PackageDescription

let package = Package(
    name: "AthleteKit",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [.library(name: "AthleteKit", targets: ["AthleteKit"])],
    targets: [
        .target(name: "AthleteKit"),
        // Fixtures: real answers captured from a running server. Generated/Samples.json: every response
        // type at its fullest and emptiest, written by src/lib/api/swift-gen.ts.
        .testTarget(name: "AthleteKitTests", dependencies: ["AthleteKit"], resources: [.copy("Fixtures"), .copy("Generated/Samples.json")]),
    ]
)
