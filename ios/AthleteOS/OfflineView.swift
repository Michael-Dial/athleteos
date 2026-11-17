import UIKit

/// The page's two themes (`data-theme` on <html>). Colours mirror --page, --ink and the volt accent in
/// src/app/globals.css, so the native parts read as part of the page.
enum PageTheme: String {
    case dark, light

    var background: UIColor { self == .dark ? UIColor(hex: 0x0C0D0F) : UIColor(hex: 0xF3F3EF) }
    var ink: UIColor { self == .dark ? UIColor(hex: 0xF3F3EF) : UIColor(hex: 0x101114) }
    var inkMuted: UIColor { self == .dark ? UIColor(hex: 0xB8BCC4) : UIColor(hex: 0x4A4D55) }
    var statusBar: UIStatusBarStyle { self == .dark ? .lightContent : .darkContent }
}

/// Shown when the site can't be reached, in place of WebKit's blank page.
final class OfflineView: UIView {
    var onRetry: (() -> Void)?

    private let title = UILabel()
    private let detail = UILabel()
    private let button = UIButton(type: .system)

    override init(frame: CGRect) {
        super.init(frame: frame)

        title.text = "Can't reach AthleteOS"
        title.font = .preferredFont(forTextStyle: .title2)
        title.adjustsFontForContentSizeCategory = true
        title.numberOfLines = 0
        title.textAlignment = .center

        detail.text = "Check your connection, then try again. If you're online, the server may be restarting; give it a minute."
        detail.font = .preferredFont(forTextStyle: .body)
        detail.adjustsFontForContentSizeCategory = true
        detail.numberOfLines = 0
        detail.textAlignment = .center

        var config = UIButton.Configuration.filled()
        config.title = "Try again"
        config.baseBackgroundColor = UIColor(hex: 0xC8F046)
        config.baseForegroundColor = UIColor(hex: 0x0C0D0F)
        config.cornerStyle = .medium
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 24, bottom: 12, trailing: 24)
        button.configuration = config
        button.addAction(UIAction { [weak self] _ in self?.onRetry?() }, for: .primaryActionTriggered)

        let stack = UIStackView(arrangedSubviews: [title, detail, button])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.setCustomSpacing(24, after: detail)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: safeAreaLayoutGuide.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: readableContentGuide.leadingAnchor, constant: 8),
            stack.trailingAnchor.constraint(equalTo: readableContentGuide.trailingAnchor, constant: -8),
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func apply(_ theme: PageTheme) {
        backgroundColor = theme.background
        title.textColor = theme.ink
        detail.textColor = theme.inkMuted
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: 1)
    }
}
