// Phone sync: the rules for signing OW's SDK in, keeping it signed in, and
// signing it out. Ported from the HPC Validation Hub's HubKit (same SDK fork).
//
// The SDK keeps its backend credentials on the device across launches and
// AthleteOS sign-outs, and it uploads whatever Apple Health holds. Left alone,
// the next person to sign in on this phone would have their Health data filed
// under the previous person's backend user, and nothing downstream could tell.
// So:
//
//   - the SDK session is bound to the athlete that started it (`SyncBinding`),
//     and on every launch a session that does not belong to the signed-in
//     athlete is stopped and signed out (`reconcile`);
//   - a refresh that comes back for a different backend user (the admin
//     relinked this athlete) resets the session instead of feeding the new
//     user's tokens to a session writing as the old one (`refreshTokens`);
//   - signing out of AthleteOS signs the SDK out (`disconnect`);
//   - an iPad never relays: Apple Health on an iPad holds the iPhone's samples
//     by iCloud sync, so both syncing would send every night twice.
//
// Nothing here retries silently or picks a fallback.

import Foundation

public enum SyncState: String, Sendable {
    case off, syncing, paused
}

/// A step the person can act on; the message is written for them and shown as is.
public struct SyncError: Error, LocalizedError, Equatable, Sendable {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var errorDescription: String? { message }
}

@MainActor
public struct PhoneSync {
    /// Every Health type the OW fork's backend stores, so the phone sends all the
    /// dashboards could use. The same list as the Hub's: one SDK fork, one backend.
    public static let healthTypes = [
        "steps",
        "distanceWalkingRunning",
        "distanceCycling",
        "flightsClimbed",
        "walkingSpeed",
        "walkingStepLength",
        "walkingAsymmetryPercentage",
        "walkingDoubleSupportPercentage",
        "sixMinuteWalkTestDistance",
        "activeEnergy",
        "basalEnergy",
        "appleExerciseTime",
        "heartRate",
        "restingHeartRate",
        "heartRateVariabilitySDNN",
        "heartRateVariabilityRMSSD",
        "heartRateRecoveryOneMinute",
        "vo2Max",
        "oxygenSaturation",
        "respiratoryRate",
        "walkingHeartRateAverage",
        "heartbeatSeries",
        "bodyMass",
        "height",
        "bmi",
        "bodyFatPercentage",
        "leanBodyMass",
        "waistCircumference",
        "bodyTemperature",
        "appleSleepingWristTemperature",
        "bloodGlucose",
        "insulinDelivery",
        "bloodPressureSystolic",
        "bloodPressureDiastolic",
        "sleep",
        "appleSleepingBreathingDisturbances",
        "dietaryEnergyConsumed",
        "dietaryCarbohydrates",
        "dietaryFiber",
        "dietarySugar",
        "dietaryProtein",
        "dietaryFatTotal",
        "dietaryFatSaturated",
        "dietaryFatMonounsaturated",
        "dietaryFatPolyunsaturated",
        "dietaryCholesterol",
        "dietarySodium",
        "dietaryPotassium",
        "dietaryChloride",
        "dietaryCaffeine",
        "dietaryCalcium",
        "dietaryIron",
        "dietaryMagnesium",
        "dietaryPhosphorus",
        "dietaryVitaminA",
        "dietaryVitaminB6",
        "dietaryVitaminB12",
        "dietaryVitaminC",
        "dietaryVitaminD",
        "dietaryVitaminE",
        "dietaryVitaminK",
        "dietaryThiamin",
        "dietaryRiboflavin",
        "dietaryNiacin",
        "dietaryFolate",
        "dietaryBiotin",
        "dietaryPantothenicAcid",
        "dietaryZinc",
        "dietaryCopper",
        "dietaryManganese",
        "dietarySelenium",
        "dietaryChromium",
        "dietaryMolybdenum",
        "dietaryIodine",
        "dietaryWater",
        "food",
        "runningPower",
        "runningVerticalOscillation",
        "runningGroundContactTime",
        "cyclingPower",
        "cyclingCadence",
        "cyclingSpeed",
        "cyclingFunctionalThresholdPower",
        "workout",
        "workoutRoute",
        "workoutEffortScore",
        "estimatedWorkoutEffortScore",
        "physicalEffort",
    ]

    public static var authorizedTypes: String { healthTypes.joined(separator: ",") }

    /// Days of history the first sync uploads.
    public static let historyDays = 30
    /// `daysBack` meaning no limit: every sample Health holds.
    public static let allHistory = 0

    public static let tabletMessage = "Health data is sent from your iPhone, not an iPad, so nothing is counted twice. Open AthleteOS on your iPhone to turn on Apple Health."
    public static let notStartedMessage = "Apple Health sync couldn't start on this phone. Try again in a moment."
    public static let notSyncingMessage = "Turn on Apple Health on this phone first, then send its history."

    public struct Reconciled: Equatable, Sendable {
        public let state: SyncState
        /// A session that belonged to someone else (or to nobody) was stopped.
        public let reset: Bool
    }

    public enum Refreshed: String, Sendable { case refreshed, reset }

    public let sdk: HealthSDK
    public let store: BindingStore

    public init(sdk: HealthSDK, store: BindingStore) {
        self.sdk = sdk
        self.store = store
    }

    public var relaysHealth: Bool { !sdk.isTablet }

    /// At launch, before any UI and without the network: resume the SDK's stored session when the binding
    /// says it is this phone's own, so a background launch (a HealthKit wake) finds its observers running.
    /// Decides nothing `reconcile` decides: it never stops, signs out or touches the binding.
    @discardableResult
    public func restoreAtLaunch() -> Bool {
        guard relaysHealth,
              let owUserId = sdk.storedUserId(),
              let binding = try? store.get(), binding.owUserId == owUserId,
              sdk.isSyncActive() else { return false }
        sdk.restoreAtLaunch()
        return true
    }

    /// On launch and whenever the signed-in athlete changes. `athleteKey` is nil when nobody is signed in.
    public func reconcile(athleteKey: String?) async throws -> Reconciled {
        let binding = try store.get()
        guard let owUserId = sdk.storedUserId() else {
            if binding != nil { try store.clear() }
            return Reconciled(state: .off, reset: false)
        }
        guard relaysHealth, let binding, let athleteKey, binding.athleteKey == athleteKey, binding.owUserId == owUserId else {
            if let binding { sdk.configure(host: binding.host) }
            try await disconnect()
            return Reconciled(state: .off, reset: true)
        }
        sdk.configure(host: binding.host)
        guard sdk.isSyncActive() else { return Reconciled(state: .paused, reset: false) }
        if binding.authorizedTypes != Self.authorizedTypes {
            // An update added types: Health asks only about the new ones, and the SDK registers observers at start.
            try await sdk.stopBackgroundSync()
            _ = try await sdk.requestAuthorization(types: Self.healthTypes)
            var updated = binding
            updated.authorizedTypes = Self.authorizedTypes
            try store.set(updated)
            guard try await sdk.startBackgroundSync(daysBack: Self.historyDays) else { return Reconciled(state: .paused, reset: false) }
        }
        return Reconciled(state: .syncing, reset: false)
    }

    /// Sign the SDK in as the athlete's own backend user and start background sync.
    public func connect(source: SyncSessionSource, athleteKey: String) async throws -> SyncState {
        // Before asking the server for anything: an iPad is refused outright, not after a token pair was minted.
        guard relaysHealth else { throw SyncError(Self.tabletMessage) }
        let session = try await source.syncSession()

        let current = sdk.storedUserId()
        if let current, current != session.owUserId {
            // Another backend user's session: never re-point it, end it.
            try await sdk.stopBackgroundSync()
            try await sdk.signOut()
            try store.clear()
        }
        sdk.configure(host: session.host)
        if current == session.owUserId && sdk.isSessionValid() {
            sdk.updateTokens(accessToken: session.accessToken, refreshToken: session.refreshToken)
        } else {
            try await sdk.signIn(owUserId: session.owUserId, accessToken: session.accessToken, refreshToken: session.refreshToken)
        }
        // Written after the sign-in: a crash in between leaves a session with no binding, which the next launch ends.
        try store.set(SyncBinding(athleteKey: athleteKey, owUserId: session.owUserId, host: session.host))
        _ = try await sdk.requestAuthorization(types: Self.healthTypes)
        try store.set(SyncBinding(athleteKey: athleteKey, owUserId: session.owUserId, host: session.host, authorizedTypes: Self.authorizedTypes))
        guard try await sdk.startBackgroundSync(daysBack: Self.historyDays) else { throw SyncError(Self.notStartedMessage) }
        return .syncing
    }

    /// The SDK's own refresh failed: ask AthleteOS for a new pair. A pair for a different backend user or host
    /// than the session holds means the athlete was relinked; the session is ended and they turn it on again.
    public func refreshTokens(source: SyncSessionSource, athleteKey: String) async throws -> Refreshed {
        guard let binding = try store.get(), binding.athleteKey == athleteKey, sdk.storedUserId() == binding.owUserId else {
            try await disconnect()
            return .reset
        }
        let session = try await source.syncSession()
        guard session.owUserId == binding.owUserId, session.host == binding.host else {
            try await disconnect()
            return .reset
        }
        sdk.updateTokens(accessToken: session.accessToken, refreshToken: session.refreshToken)
        return .refreshed
    }

    /// Send everything Health holds again, from the oldest sample. The backend stores each sample once, so nothing doubles.
    public func resyncAllHistory(athleteKey: String) async throws -> SyncState {
        guard relaysHealth else { throw SyncError(Self.tabletMessage) }
        guard let binding = try store.get(), binding.athleteKey == athleteKey, sdk.storedUserId() == binding.owUserId, sdk.isSyncActive() else {
            throw SyncError(Self.notSyncingMessage)
        }
        try await sdk.stopBackgroundSync()
        sdk.resetAnchors()
        guard try await sdk.startBackgroundSync(daysBack: Self.allHistory) else { throw SyncError(Self.notStartedMessage) }
        return .syncing
    }

    /// Stop syncing and forget the session on this phone. Nothing already synced is deleted.
    public func disconnect() async throws {
        try await sdk.stopBackgroundSync()
        try await sdk.signOut()
        try store.clear()
    }
}
