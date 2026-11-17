import SwiftUI
import UIKit

/// The web app's colours (src/app/globals.css), as dynamic colours so both
/// themes keep the contrast the web app was tuned for. The lime is a fill and
/// a dark-theme text colour; light-theme text uses the darker accentText.
enum Palette {
    static let accent = Color(hex: 0xC8F046)
    static let accentInk = Color(hex: 0x0C0D0F)
    static let accentText = dynamic(light: 0x4B6B0A, dark: 0xC8F046)
    static let good = dynamic(light: 0x0A7D0A, dark: 0x3FCF5A)
    static let warn = dynamic(light: 0x8A5A00, dark: 0xFAB219)
    static let bad = dynamic(light: 0xB42B2B, dark: 0xFF6B6B)
    static let goodWeak = dynamic(light: 0xE3F3E3, dark: 0x13261A)
    static let warnWeak = dynamic(light: 0xFDF1D6, dark: 0x2C240C)
    static let badWeak = dynamic(light: 0xFBE4E4, dark: 0x2E1515)

    private static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

extension Color {
    init(hex: UInt32) { self.init(uiColor: UIColor(hex: hex)) }
}
