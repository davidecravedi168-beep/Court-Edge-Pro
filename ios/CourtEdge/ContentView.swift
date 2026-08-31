import SwiftUI
import WebKit
import UIKit

private enum AppURLs {
    static let base: URL = {
        let configured = Bundle.main.object(forInfoDictionaryKey: "COURT_BASE_URL") as? String
        let fallback = "https://davidecravedi168-beep.github.io/Court-Edge-Pro/"
        return URL(string: configured?.isEmpty == false ? configured! : fallback)!
    }()

    static let board = base
    static let sureBet = URL(string: "surebet.html", relativeTo: base)!.absoluteURL
}

struct SavedPage: Identifiable, Codable, Hashable {
    let id: UUID
    let title: String
    let url: URL
    let savedAt: Date
}

final class SavedStore: ObservableObject {
    @Published private(set) var items: [SavedPage] = []
    private let key = "court.savedPages.v1"

    init() {
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? JSONDecoder().decode([SavedPage].self, from: data) else { return }
        items = decoded
    }

    func add(title: String, url: URL) {
        guard !items.contains(where: { $0.url == url }) else { return }
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        items.insert(SavedPage(id: UUID(), title: cleanTitle.isEmpty ? "Court Edge" : cleanTitle, url: url, savedAt: Date()), at: 0)
        persist()
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    func remove(at offsets: IndexSet) {
        items.remove(atOffsets: offsets)
        persist()
    }

    func clear() {
        items.removeAll()
        persist()
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}

final class BrowserModel: ObservableObject {
    @Published var currentURL: URL?
    @Published var currentTitle = "Court Edge"
    @Published var isLoading = false
    @Published var loadFailed = false
    @Published var reloadToken = UUID()
    @Published var homeToken = UUID()

    let startURL: URL

    init(startURL: URL) {
        self.startURL = startURL
        self.currentURL = startURL
    }

    func reload() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        loadFailed = false
        reloadToken = UUID()
    }

    func goHome() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        loadFailed = false
        currentURL = startURL
        homeToken = UUID()
    }
}

struct ContentView: View {
    @StateObject private var saved = SavedStore()

    var body: some View {
        TabView {
            BrowserScreen(title: "Board", startURL: AppURLs.board, saved: saved)
                .tabItem { Label("Board", systemImage: "basketball.fill") }

            BrowserScreen(title: "SureBet", startURL: AppURLs.sureBet, saved: saved)
                .tabItem { Label("SureBet", systemImage: "arrow.triangle.2.circlepath") }

            SavedView(store: saved)
                .tabItem { Label("Saved", systemImage: "bookmark.fill") }
        }
    }
}

struct BrowserScreen: View {
    let title: String
    @ObservedObject var saved: SavedStore
    @StateObject private var model: BrowserModel
    @State private var showInfo = false

    init(title: String, startURL: URL, saved: SavedStore) {
        self.title = title
        self.saved = saved
        _model = StateObject(wrappedValue: BrowserModel(startURL: startURL))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                WebContainer(model: model)
                    .ignoresSafeArea(edges: .bottom)

                if model.isLoading {
                    ProgressView()
                        .padding(12)
                        .background(.thinMaterial, in: Capsule())
                }

                if model.loadFailed {
                    ContentUnavailableView {
                        Label("Dati non raggiungibili", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text("Fail-closed attivo: se i feed non sono raggiungibili, Court Edge non deve presentare il dato come aggiornato.")
                    } actions: {
                        Button("Riprova") { model.reload() }
                            .buttonStyle(.borderedProminent)
                    }
                    .padding()
                    .background(.regularMaterial)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button { model.goHome() } label: { Image(systemName: "house") }
                        .accessibilityLabel("Torna alla schermata iniziale")
                    Button { model.reload() } label: { Image(systemName: "arrow.clockwise") }
                        .accessibilityLabel("Aggiorna dati")
                }

                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        saved.add(title: model.currentTitle, url: model.currentURL ?? model.startURL)
                    } label: {
                        Image(systemName: "bookmark")
                    }
                    .accessibilityLabel("Salva questa schermata")

                    ShareLink(item: model.currentURL ?? model.startURL) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Condividi")

                    Button { showInfo = true } label: { Image(systemName: "info.circle") }
                        .accessibilityLabel("Informazioni e uso responsabile")
                }
            }
            .sheet(isPresented: $showInfo) {
                ResponsibleUseView()
            }
        }
    }
}

struct SavedView: View {
    @ObservedObject var store: SavedStore

    var body: some View {
        NavigationStack {
            Group {
                if store.items.isEmpty {
                    ContentUnavailableView(
                        "Nessun elemento salvato",
                        systemImage: "bookmark",
                        description: Text("Salva una partita o schermata da Board o SureBet per ritrovarla qui sul dispositivo.")
                    )
                } else {
                    List {
                        ForEach(store.items) { item in
                            Link(destination: item.url) {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(item.title).font(.headline).foregroundStyle(.primary)
                                    Text(item.savedAt, style: .date).font(.caption).foregroundStyle(.secondary)
                                    Text(item.url.absoluteString).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                                }
                                .padding(.vertical, 4)
                            }
                        }
                        .onDelete(perform: store.remove)
                    }
                }
            }
            .navigationTitle("Saved")
            .toolbar {
                if !store.items.isEmpty {
                    Button("Svuota", role: .destructive) { store.clear() }
                }
            }
        }
    }
}

struct ResponsibleUseView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Court Edge") {
                    Label("Analisi quantitativa e statistica: non garantisce risultati o profitti.", systemImage: "chart.xyaxis.line")
                    Label("Quando qualità, latenza o completezza dei feed non superano il gate, il comportamento corretto è NO BET.", systemImage: "hand.raised.fill")
                }
                Section("NBA / EuroLeague") {
                    Text("NBA e EuroLeague mantengono pipeline e modelli separati. Prima della monetizzazione vanno confermati i diritti commerciali di ogni feed; il feed EuroLeague research non va trattato come commerciale senza licenza esplicita.")
                }
                Section("Release iOS") {
                    Text("Billing, account, notifiche server-side, monitoraggio produzione e App Store metadata restano gate separati prima di far pagare utenti.")
                }
            }
            .navigationTitle("Uso responsabile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fine") { dismiss() }
                }
            }
        }
    }
}

struct WebContainer: UIViewRepresentable {
    @ObservedObject var model: BrowserModel

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.refresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        context.coordinator.webView = webView
        context.coordinator.loadStartIfNeeded()
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if context.coordinator.lastReloadToken != model.reloadToken {
            context.coordinator.lastReloadToken = model.reloadToken
            webView.reload()
        }
        if context.coordinator.lastHomeToken != model.homeToken {
            context.coordinator.lastHomeToken = model.homeToken
            webView.load(URLRequest(url: model.startURL, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 20))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        let model: BrowserModel
        weak var webView: WKWebView?
        var lastReloadToken: UUID
        var lastHomeToken: UUID
        private var didInitialLoad = false

        init(model: BrowserModel) {
            self.model = model
            self.lastReloadToken = model.reloadToken
            self.lastHomeToken = model.homeToken
        }

        func loadStartIfNeeded() {
            guard !didInitialLoad, let webView else { return }
            didInitialLoad = true
            webView.load(URLRequest(url: model.startURL, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 20))
        }

        @objc func refresh(_ sender: UIRefreshControl) {
            model.loadFailed = false
            webView?.reload()
            sender.endRefreshing()
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.isLoading = true
            model.loadFailed = false
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.isLoading = false
            model.loadFailed = false
            model.currentURL = webView.url ?? model.startURL
            webView.scrollView.refreshControl?.endRefreshing()
            webView.evaluateJavaScript("document.title") { [weak self] value, _ in
                if let title = value as? String, !title.isEmpty {
                    DispatchQueue.main.async { self?.model.currentTitle = title }
                }
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail(webView) }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail(webView) }

        private func fail(_ webView: WKWebView) {
            model.isLoading = false
            model.loadFailed = true
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if ["about", "blob", "data"].contains(url.scheme ?? "") {
                decisionHandler(.allow)
                return
            }

            if let host = url.host, host != AppURLs.base.host {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }
    }
}
