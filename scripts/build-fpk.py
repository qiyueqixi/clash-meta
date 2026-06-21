from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import tarfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "fnos-appstore-mihomo"
DIST_DIR = ROOT / "dist"
TMP_DIR = ROOT / ".tmp"

PLATFORM_BINARIES = {
    "x86": ROOT / ".tmp" / "downloads" / "mihomo-linux-amd64-compatible",
    "arm": ROOT / ".tmp" / "downloads" / "mihomo-linux-arm64",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_manifest_lines() -> list[str]:
    text = (SOURCE_DIR / "manifest").read_text(encoding="utf-8-sig")
    return [line for line in text.splitlines() if line.strip()]


def manifest_dict(lines: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in lines:
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def set_manifest_value(lines: list[str], key: str, value: str) -> list[str]:
    prefix = f"{key}="
    replaced = False
    next_lines: list[str] = []
    for line in lines:
        if line.startswith(prefix):
            next_lines.append(f"{key}={value}")
            replaced = True
        else:
            next_lines.append(line)
    if not replaced:
        next_lines.append(f"{key}={value}")
    return next_lines


def add_bytes(tar: tarfile.TarFile, arcname: str, data: bytes, mode: int) -> None:
    info = tarfile.TarInfo(arcname)
    info.size = len(data)
    info.mode = mode
    info.uid = 0
    info.gid = 0
    info.uname = ""
    info.gname = ""
    tar.addfile(info, io.BytesIO(data))


def add_path(tar: tarfile.TarFile, source: Path, arcname: str, mode: int | None = None) -> None:
    info = tar.gettarinfo(str(source), arcname)
    info.uid = 0
    info.gid = 0
    info.uname = ""
    info.gname = ""
    if mode is not None:
        info.mode = mode
    elif info.isdir():
        info.mode = 0o755
    else:
        info.mode = 0o644

    if info.isfile():
        with source.open("rb") as f:
            tar.addfile(info, f)
    else:
        tar.addfile(info)


def add_tree(tar: tarfile.TarFile, source_root: Path, arc_root: str, executable_files: set[str] | None = None) -> None:
    executable_files = executable_files or set()
    add_path(tar, source_root, arc_root, 0o755)
    for dirpath, dirnames, filenames in os.walk(source_root):
        current = Path(dirpath)
        dirnames.sort()
        filenames.sort()

        for dirname in dirnames:
            source = current / dirname
            relative = source.relative_to(source_root).as_posix()
            add_path(tar, source, f"{arc_root}/{relative}", 0o755)

        for filename in filenames:
            source = current / filename
            relative = source.relative_to(source_root).as_posix()
            arcname = f"{arc_root}/{relative}"
            mode = 0o755 if arcname in executable_files else 0o644
            add_path(tar, source, arcname, mode)


def validate_entry() -> None:
    manifest = manifest_dict(read_manifest_lines())
    appname = manifest["appname"]
    launch_name = manifest["desktop_applaunchname"]
    ui_dir = manifest.get("desktop_uidir", "ui")

    if manifest.get("install_type") == "root":
        raise RuntimeError("install_type=root is not allowed for this third-party native package")

    license_path = SOURCE_DIR / "LICENSE"
    third_party_notices = SOURCE_DIR / "app" / "THIRD_PARTY_NOTICES.md"
    if not license_path.is_file():
        raise RuntimeError(f"missing package license: {license_path}")
    if not third_party_notices.is_file():
        raise RuntimeError(f"missing third-party notices: {third_party_notices}")

    privilege_path = SOURCE_DIR / "config" / "privilege"
    privilege = json.loads(privilege_path.read_text(encoding="utf-8"))
    run_as = privilege.get("defaults", {}).get("run-as")
    if run_as != "package":
        raise RuntimeError(f"{privilege_path} must use defaults.run-as=package, got {run_as!r}")
    username = privilege.get("username", appname)

    resource_path = SOURCE_DIR / "config" / "resource"
    resource = json.loads(resource_path.read_text(encoding="utf-8"))
    shares = resource.get("data-share", {}).get("shares", [])
    app_share = next((share for share in shares if share.get("name") == appname), None)
    if app_share is None:
        raise RuntimeError(f"{resource_path} must declare data-share named {appname}")
    rw_users = app_share.get("permission", {}).get("rw", [])
    if username not in rw_users:
        raise RuntimeError(f"{resource_path} must grant rw permission for {username}")

    config_path = SOURCE_DIR / "app" / ui_dir / "config"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    entries = config.get(".url", {})

    if not launch_name.startswith(f"{appname}."):
        raise RuntimeError(f"desktop_applaunchname must start with {appname}.")
    if launch_name not in entries:
        raise RuntimeError(f"desktop_applaunchname {launch_name!r} is missing in {config_path}")

    entry = entries[launch_name]
    if entry.get("noDisplay") is not False:
        raise RuntimeError("desktop entry must set noDisplay=false so fnOS shows the Open button")
    if entry.get("allUsers") is not False:
        raise RuntimeError("desktop entry must set allUsers=false because the dashboard controls mihomo")
    if entry.get("type") not in {"url", "iframe"}:
        raise RuntimeError("desktop entry type must be url or iframe")

    icon_pattern = entry.get("icon", "")
    for size in ("64", "256"):
        icon_path = SOURCE_DIR / "app" / ui_dir / icon_pattern.replace("{0}", size)
        if not icon_path.is_file():
            raise RuntimeError(f"missing desktop icon: {icon_path}")

    geodata_min_sizes = {
        "country.mmdb": 1024 * 1024,
        "geoip.metadb": 1024 * 1024,
        "geoip.dat": 10 * 1024 * 1024,
        "geosite.dat": 1024 * 1024,
    }
    for geodata_name, min_size in geodata_min_sizes.items():
        geodata_path = SOURCE_DIR / "app" / "geodata" / geodata_name
        if not geodata_path.is_file():
            raise RuntimeError(f"missing embedded geodata: {geodata_path}")
        size = geodata_path.stat().st_size
        if size < min_size:
            raise RuntimeError(
                f"embedded geodata is too small: {geodata_path} has {size} bytes, expected at least {min_size}"
            )

    default_config_path = SOURCE_DIR / "app" / "config.default.yaml"
    default_config_text = default_config_path.read_text(encoding="utf-8")
    for required_text in (
        "mixed-port: 7899",
        "external-controller: 0.0.0.0:9090",
        "external-ui: dashboard",
        "geo-auto-update: false",
        "    - 223.5.5.5",
        "    - 119.29.29.29",
    ):
        if required_text not in default_config_text:
            raise RuntimeError(f"{default_config_path} is missing {required_text!r}")
    for forbidden_text in (
        "mixed-port: 7890",
        "external-ui-name:",
        "external-ui-url:",
        "https://dns.alidns.com/dns-query",
        "https://doh.pub/dns-query",
        "geo-auto-update: true",
    ):
        if forbidden_text in default_config_text:
            raise RuntimeError(f"{default_config_path} must not contain {forbidden_text!r}")

    wizard_install = SOURCE_DIR / "wizard" / "install"
    if not wizard_install.is_file():
        raise RuntimeError(f"missing native install wizard: {wizard_install}")
    wizard_data = json.loads(wizard_install.read_text(encoding="utf-8"))
    wizard_text = json.dumps(wizard_data, ensure_ascii=False)
    for required_text in (
        "首次配置",
        "wizard_subscription_url",
        "wizard_config_url",
        "订阅 / 导入链接",
        "完整 YAML 配置 URL",
        "二选一填写",
        "clash://install-config",
    ):
        if required_text not in wizard_text:
            raise RuntimeError(f"{wizard_install} is missing {required_text!r}")

    wizard_uninstall = SOURCE_DIR / "wizard" / "uninstall"
    if not wizard_uninstall.is_file():
        raise RuntimeError(f"missing native uninstall wizard: {wizard_uninstall}")
    wizard_uninstall_data = json.loads(wizard_uninstall.read_text(encoding="utf-8"))
    wizard_uninstall_text = json.dumps(wizard_uninstall_data, ensure_ascii=False)
    for required_text in (
        "卸载数据处理",
        "wizard_uninstall_data_action",
        "保留全部用户数据（推荐）",
        "删除其他数据，保留用户配置与订阅",
        "删除全部应用数据",
    ):
        if required_text not in wizard_uninstall_text:
            raise RuntimeError(f"{wizard_uninstall} is missing {required_text!r}")

    dashboard_config = SOURCE_DIR / "app" / "dashboard" / "config.js"
    dashboard_config_text = dashboard_config.read_text(encoding="utf-8")
    for required_text in (
        "defaultBackendURL",
        "window.metacubexd.endpoint",
        "local-mihomo",
        "selectedEndpoint",
        "endpointList",
        'secret: "",',
        "clashMetaConfigDraftUrl",
        "clearLegacySubscriptionState()",
        "installConfigImportButton()",
        "normalizeSubscriptionInput(",
        "buildSubscriptionConfig(",
        "applyRuntimeConfig(",
        "fetchWithTimeout(",
        "/configs?force=true",
        "加载配置超时",
        "运行时配置已加载",
    ):
        if required_text not in dashboard_config_text:
            raise RuntimeError(f"{dashboard_config} is missing {required_text!r}")
    for forbidden_text in (
        "routeToProfiles()",
        "openProfileImportUI(",
        "prefillSubscriptionURL(",
        "订阅链接已填入导入页",
        "没有进入配置文件页面",
    ):
        if forbidden_text in dashboard_config_text:
            raise RuntimeError(f"{dashboard_config} must not contain {forbidden_text!r}")

    cmd_main = SOURCE_DIR / "cmd" / "main"
    cmd_main_text = cmd_main.read_text(encoding="utf-8")
    for required_text in (
        "TRIM_DATA_SHARE_PATHS",
        "LOG_DIR=\"${APP_SHARE}/logs\"",
        "TRIM_TEMP_LOGFILE",
        "SECRET_FILE=",
        "prepare_secret()",
        "generate_secret()",
        "prepare_dashboard()",
        "prepare_geodata()",
        "create_initial_config()",
        "write_subscription_config()",
        "download_wizard_config()",
        "proxy-providers:",
        "proxy: DIRECT",
        "      enable: false",
        "disable_subscription_provider_health_check()",
        "DOMAIN-SUFFIX,${subscription_host},DIRECT",
        "migrate_subscription_config()",
        "replace_generated_mixed_port()",
        "migrate_bootstrap_dns()",
        "get_subscription_provider_url()",
        "mixed-port: 7899",
        "geo-auto-update: false",
        "RUNTIME_DASHBOARD_DIR=",
        "configured_by_install_wizard",
        "-ext-ui \"${DASHBOARD_DIR}\"",
    ):
        if required_text not in cmd_main_text:
            raise RuntimeError(f"{cmd_main} is missing {required_text!r}")
    for forbidden_text in (
        "external-ui-name: MetaCubeXD",
        "external-ui-url:",
        "https://dns.alidns.com/dns-query",
        "https://doh.pub/dns-query",
        "mixed-port: 7890",
        "geo-auto-update: true",
    ):
        if forbidden_text in cmd_main_text:
            raise RuntimeError(f"{cmd_main} must not contain {forbidden_text!r}")

    install_callback = SOURCE_DIR / "cmd" / "install_callback"
    install_callback_text = install_callback.read_text(encoding="utf-8")
    for required_text in (
        "wizard_subscription_url",
        "wizard_config_url",
        "wizard_config_mode",
        "normalize_config_url()",
        "extract_clash_install_config_url()",
        "clash://install-config",
        "normalized_subscription_url=\"$(normalize_config_url",
        "subscription.url",
        "config.url",
    ):
        if required_text not in install_callback_text:
            raise RuntimeError(f"{install_callback} is missing {required_text!r}")

    uninstall_callback = SOURCE_DIR / "cmd" / "uninstall_callback"
    uninstall_callback_text = uninstall_callback.read_text(encoding="utf-8")
    for required_text in (
        "wizard_uninstall_data_action",
        "delete_other_data_keep_config_subscription",
        "delete_subscription_cache",
        "safe_delete_all",
        "keep_all",
        "delete_all",
        "config.yaml, secret, providers, subscription files, and wizard values preserved",
    ):
        if required_text not in uninstall_callback_text:
            raise RuntimeError(f"{uninstall_callback} is missing {required_text!r}")

    version = manifest["version"]
    for html_name in ("index.html", "200.html", "404.html"):
        html_path = SOURCE_DIR / "app" / "dashboard" / html_name
        html_text = html_path.read_text(encoding="utf-8")
        expected = f"config.js?v={version}"
        if expected not in html_text:
            raise RuntimeError(f"{html_path} is missing {expected!r}")


def validate_fpk(path: Path) -> None:
    with path.open("rb") as f:
        magic = f.read(2)
    if magic != b"\x1f\x8b":
        raise RuntimeError(f"{path} is not gzip-compressed; fnOS will reject it as an invalid fpk")

    with tarfile.open(path, "r:gz") as tar:
        names = set(tar.getnames())
        required = {"manifest", "app.tgz", "cmd/main", "config/privilege", "config/resource", "LICENSE"}
        missing = required - names
        if missing:
            raise RuntimeError(f"{path} is missing required entries: {sorted(missing)}")
        app_member = tar.extractfile("app.tgz")
        if app_member is None:
            raise RuntimeError(f"{path} is missing readable app.tgz")
        app_data = app_member.read()

    with tarfile.open(fileobj=io.BytesIO(app_data), mode="r:gz") as app_tar:
        app_names = set(app_tar.getnames())
    if "THIRD_PARTY_NOTICES.md" not in app_names:
        raise RuntimeError(f"{path} app.tgz is missing THIRD_PARTY_NOTICES.md")


def build_app_tgz(platform: str, binary_path: Path) -> Path:
    app_source = SOURCE_DIR / "app"
    app_tgz = TMP_DIR / f"app-{platform}.tgz"
    app_tgz.parent.mkdir(parents=True, exist_ok=True)

    if not binary_path.is_file():
        raise FileNotFoundError(binary_path)

    with tarfile.open(app_tgz, "w:gz", format=tarfile.PAX_FORMAT) as tar:
        for dirpath, dirnames, filenames in os.walk(app_source):
            current = Path(dirpath)
            dirnames.sort()
            filenames.sort()

            for dirname in dirnames:
                source = current / dirname
                relative = source.relative_to(app_source).as_posix()
                add_path(tar, source, relative, 0o755)

            for filename in filenames:
                source = current / filename
                if source == app_source / "mihomo":
                    continue
                relative = source.relative_to(app_source).as_posix()
                add_path(tar, source, relative, 0o644)

        add_path(tar, binary_path, "mihomo", 0o755)

    return app_tgz


def build_fpk(platform: str, version: str, app_tgz: Path) -> Path:
    lines = read_manifest_lines()
    lines = set_manifest_value(lines, "version", version)
    lines = set_manifest_value(lines, "platform", platform)
    lines = set_manifest_value(lines, "checksum", md5(app_tgz))
    manifest_data = ("\n".join(lines) + "\n").encode("utf-8-sig")

    out = DIST_DIR / f"clash.meta_{version}_{platform}.fpk"
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    with tarfile.open(out, "w:gz", format=tarfile.PAX_FORMAT) as tar:
        add_path(tar, SOURCE_DIR / "ICON.PNG", "ICON.PNG", 0o644)
        add_path(tar, SOURCE_DIR / "ICON_256.PNG", "ICON_256.PNG", 0o644)
        add_path(tar, SOURCE_DIR / "LICENSE", "LICENSE", 0o644)
        add_bytes(tar, "manifest", manifest_data, 0o644)
        add_tree(tar, SOURCE_DIR / "cmd", "cmd", {f"cmd/{p.name}" for p in (SOURCE_DIR / "cmd").iterdir() if p.is_file()})
        add_tree(tar, SOURCE_DIR / "config", "config")
        wizard = SOURCE_DIR / "wizard"
        if wizard.exists():
            add_tree(tar, wizard, "wizard")
        add_path(tar, app_tgz, "app.tgz", 0o644)

    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", default=manifest_dict(read_manifest_lines())["version"])
    args = parser.parse_args()

    validate_entry()

    outputs: list[Path] = []
    for platform, binary_path in PLATFORM_BINARIES.items():
        app_tgz = build_app_tgz(platform, binary_path)
        out = build_fpk(platform, args.version, app_tgz)
        validate_fpk(out)
        outputs.append(out)

    sums = [f"{sha256(path)}  {path.name}" for path in outputs]
    (DIST_DIR / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="ascii")

    for line in sums:
        print(line)


if __name__ == "__main__":
    main()
