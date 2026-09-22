"""Launch the MyTool Bridge and open its application UI."""
import webbrowser
from bridge.bridge_server import BridgeServer


def main() -> None:
    try:
        with BridgeServer() as server:
            url = f"http://127.0.0.1:{server.server_port}/"
            print(f"MyTool is running at {url}", flush=True)
            webbrowser.open(url)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
    except OSError as exc:
        raise SystemExit(f"Cannot start MyTool on 127.0.0.1:8765: {exc}") from exc


if __name__ == "__main__":
    main()
