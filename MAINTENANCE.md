# 维护和迭代手册

这份文档记录 fnOS Clash.Meta 原生应用包的结构、构建流程和升级步骤，方便后续维护。

## 项目结构

```text
D:\clash-meta
├── fnos-appstore-mihomo/      # fnpack 应用源码目录
│   ├── manifest               # 应用元信息
│   ├── ICON.PNG               # 64x64 应用图标
│   ├── ICON_256.PNG           # 256x256 应用图标
│   ├── cmd/                   # fnOS 生命周期脚本
│   │   └── main               # start/stop/status
│   ├── config/
│   │   ├── privilege          # 运行用户和权限
│   │   └── resource           # data-share/systemd 资源声明
│   ├── LICENSE                # 本包元数据和维护脚本许可证
│   ├── wizard/                # 飞牛原生向导，install 为首次订阅/配置 URL 引导
│   └── app/
│       ├── mihomo             # 当前构建架构的 Linux mihomo 二进制
│       ├── config.default.yaml
│       ├── THIRD_PARTY_NOTICES.md
│       ├── geodata/           # 内置 geodata，避免启动时联网下载 GitHub 资源
│       ├── dashboard/         # 内嵌 MetaCubeXD 静态文件
│       └── ui/                # 飞牛桌面入口源码；打包后位于 app.tgz 顶层 ui/
├── dist/                      # 构建产物
├── scripts/build-fpk.py        # 当前正式打包脚本
├── .tools/                    # 本地打包工具
└── .tmp/                      # 下载和解包缓存
```

## 关键文件说明

### `manifest`

当前关键字段:

```text
appname=clash.meta
version=1.19.27-27
platform=x86
desktop_uidir=ui
desktop_applaunchname=clash.meta.Application
service_port=9090
checkport=true
disable_authorization_path=true
```

构建 x86 包时 `platform=x86`，构建 ARM 包时改为 `platform=arm`。

当前包不设置 `install_type=root`。飞牛文档说明 root 权限模式仅适用于官方合作企业开发者，第三方普通 Native 应用不应依赖 root 安装或系统目录写入。本包不需要低端口、系统目录写入或硬件访问，因此保持普通安装方式。

版本号建议用:

```text
<mihomo版本>-<包修订号>
```

例如:

```text
1.19.27-1
1.19.27-9
1.19.27-10
1.19.27-11
1.19.27-12
1.19.27-13
1.19.27-15
1.19.27-16
1.19.27-17
1.19.27-18
1.19.27-19
1.19.27-20
1.19.27-21
1.19.27-22
1.19.27-23
1.19.27-24
1.19.27-25
1.19.27-26
1.19.27-27
1.20.0-1
```

### `config/privilege`

当前权限文件:

```json
{
  "defaults": {
    "run-as": "package"
  },
  "username": "clash.meta",
  "groupname": "clash.meta"
}
```

飞牛官方文档里 `run-as` 默认是 `package`，即应用专用用户。这里显式写出是为了防止后续维护误改成 root 或旧式自定义运行身份。

不要再改回:

```json
"run-as": "clash.meta"
```

旧写法在部分版本里能跑，但不符合当前官方推荐的权限模型，也不利于后续按上架标准审查。


### `wizard/install`

飞牛原生安装向导。官方文档说明 `wizard/install` 在安装时展示，字段名会直接作为环境变量传给脚本。

当前向导是中文单页:

- `首次配置`: 同一页显示两个输入框，分别收集 `wizard_subscription_url` 和 `wizard_config_url`。

配置判定:

- `wizard_config_url` 非空时优先按完整 mihomo YAML 配置 URL 处理。
- `wizard_config_url` 为空、`wizard_subscription_url` 非空时按订阅地址处理。
- `wizard_subscription_url` 中填入 `clash://install-config?url=...&name=...` 时，会提取并解码 `url` 参数后按订阅地址处理。
- `wizard_config_url` 只接受 `http(s)` 完整 YAML 配置 URL，不在界面层鼓励填写 `clash://install-config`。
- 两个输入框都为空时复制包内默认配置。
- `wizard_config_mode` 只保留为旧包升级兼容字段，不再在界面展示。

注意:

- 向导不会直接写 `config.yaml`，它只把用户输入交给生命周期脚本。
- `cmd/install_callback` 会把向导变量保存到 `<应用文件>/clash.meta/config/wizard/`，同时保存一份到 `${TRIM_PKGVAR}/wizard/` 作为兜底。
- `cmd/main` 首次启动时才真正生成 `config.yaml`。如果用户已经有 `config.yaml`，不会覆盖。
- 完整配置 URL 下载失败会回退到默认配置，不能让启动失败卡在“启用中”。
- 不要重新加三选一 radio；用户反馈两个框同页、二选一填写更符合这个包的实际使用方式。

### `cmd/install_callback`

安装完成后运行，负责持久化安装向导输入。

当前保存文件:

```text
<应用文件>/clash.meta/config/wizard/mode
<应用文件>/clash.meta/config/wizard/subscription.url
<应用文件>/clash.meta/config/wizard/config.url
${TRIM_PKGVAR}/wizard/mode
${TRIM_PKGVAR}/wizard/subscription.url
${TRIM_PKGVAR}/wizard/config.url
```

之所以保存两份，是因为不同 fnOS 版本或安装阶段不一定都能稳定提供 `TRIM_DATA_SHARE_PATHS`。主数据仍以应用文件目录为准，`${TRIM_PKGVAR}/wizard` 只做首次启动兜底。

### `wizard/uninstall`

飞牛原生卸载向导。当前提供三种数据处理方式:

- `keep_all`: 保留全部用户数据，默认推荐。
- `delete_other_data_keep_config_subscription`: 删除运行缓存、临时文件和旧日志，保留 `config.yaml`、`secret`、订阅 provider 和安装向导保存的订阅/配置 URL。
- `delete_all`: 删除整个 `<应用文件>/clash.meta` 应用文件目录。

### `cmd/uninstall_callback`

卸载完成后运行，按 `wizard_uninstall_data_action` 处理应用文件目录。

当前删除范围:

- `keep_all`: 不删除任何应用文件目录内容。
- `delete_other_data_keep_config_subscription`: 删除 `config/cache.db*`、`cache/`、`tmp/` 和旧 `logs/`，保留 `config/providers/`、`config/subscription.yaml`、`config/wizard/` 和 `${TRIM_PKGVAR}/wizard/`。
- `delete_all`: 删除整个 `APP_SHARE`，但脚本会拒绝删除空路径、`/`、`/var`、`/var/apps`、应用安装目录和运行目录等危险路径。

重要约束:

- `delete_other_data_keep_config_subscription` 必须保留 `config.yaml`、`secret`、订阅 provider、订阅文件和安装向导保存的订阅 URL。
- `delete_subscription_cache` 是 `1.19.27-18` 到 `1.19.27-21` 的历史值，脚本只作为升级兼容入口接受，行为映射到新的保留订阅清理逻辑。
- 删除逻辑必须通过 `safe_remove_path` 或 `safe_remove_runtime_path`，不要裸写 `rm -rf "${变量}"`。
- 如果后续新增缓存位置，必须同步修改本节和 `scripts/build-fpk.py` 校验。

### `cmd/main`

fnOS 会调用:

```bash
cmd/main start
cmd/main stop
cmd/main status
```

脚本行为:

- 使用 `${TRIM_APPDEST}/mihomo` 作为源二进制，启动时复制到 `${TRIM_PKGVAR}/bin/mihomo` 后再执行
- 路径优先使用飞牛注入的环境变量；没有环境变量时才按官方目录模型 fallback 到 `/var/apps/clash.meta/target`、`/var/apps/clash.meta/etc`、`/var/apps/clash.meta/var`
- 用户配置目录为飞牛 `data-share` 应用文件目录下的 `config/`
- 首次启动根据安装向导创建 `<应用文件>/clash.meta/config/config.yaml`；没有向导值时复制 `app/config.default.yaml`
- 日志写入 `<应用文件>/clash.meta/logs/mihomo.log`
- runtime 二进制写入 `${TRIM_PKGVAR}/bin/mihomo`
- runtime dashboard 写入 `${TRIM_PKGVAR}/dashboard`，不要依赖安装目录可写
- controller secret 写入 `<应用文件>/clash.meta/config/secret`，并同步到 `config.yaml`
- PID 写入 `${TRIM_PKGVAR}/run/mihomo.pid`
- 启动失败时写入 `${TRIM_TEMP_LOGFILE}`，让飞牛应用中心前端能展示错误
- 启动参数包含 `-ext-ui "${TRIM_PKGVAR}/dashboard"`，确保使用注入了 secret 的运行时 Web 面板
- 启动前复制包内 `${TRIM_APPDEST}/geodata/` 到配置目录，覆盖损坏或半下载的 geodata 文件
- 安装向导填写订阅地址或 `clash://install-config?url=...` 时生成 `proxy-providers.subscription`，provider 下载固定走 `DIRECT`，订阅域名加直连规则，普通流量默认 `MATCH,PROXY`
- 安装向导填写完整 YAML 配置 URL 时用 `curl` 或 `wget` 短超时下载；下载失败回退默认配置

### controller secret

从 `1.19.27-13` 开始，启动脚本会处理 mihomo `external-controller` 的 `secret`:

- 如果用户 `config.yaml` 已经有非空 `secret`，沿用它，不重写用户配置。
- 如果 `config.yaml` 是空密钥，但 `<应用文件>/clash.meta/config/secret` 已存在，复用该文件。
- 如果两者都为空，首次启动生成随机 64 位十六进制 secret。
- secret 文件权限尽量设置为 `0600`。
- 每次启动都会把安装目录的 `dashboard/` 复制到 `${TRIM_PKGVAR}/dashboard`，再把 secret 注入运行时 `config.js`。

安全边界:

- 这个机制解决的是“局域网里不能空密钥调用 `9090` API”。
- 因为内嵌 Web 面板需要自动连接，secret 会出现在运行时 `config.js` 中；能访问 `9090/ui/` 的人仍可能读到它。
- 不要把 `9090` 直接裸露到公网。公网访问必须走飞牛公共网关、反向代理鉴权、防火墙或 VPN。
- 如果后续接入飞牛统一网关，要按官方 `gatewayPrefix` / `gatewaySocket` 机制实现，不要为了公网入口重新改成 root 包。

### `geodata/`

内置 geodata 数据文件:

```text
geodata/country.mmdb
geodata/geoip.metadb
geodata/geoip.dat
geodata/geosite.dat
```

启动脚本会复制为:

```text
<应用文件>/clash.meta/config/country.mmdb
<应用文件>/clash.meta/config/Country.mmdb
<应用文件>/clash.meta/config/geoip.metadb
<应用文件>/clash.meta/config/geoip.dat
<应用文件>/clash.meta/config/geosite.dat
```

这样 mihomo 启动时不需要联网下载 MMDB/metadb/dat。当前内置数据来源:

```text
https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb
https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb
https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat
https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat
```

从 `1.19.27-25` 开始，`geoip.dat` 和 `geosite.dat` 使用上游完整版，不再使用 lite 资产。这样包体积会增大，但用户设备启动和规则加载阶段不再需要访问 GitHub 补齐 dat 文件。

当前内置文件 SHA256:

```text
3CDCA3B21DC247AD62DF291D36B5117B054089CD006E4342BDE37E0C2CD0E7F3  country.mmdb
75BCA302AAE2A50B11DAC9DBBF73D01AA6EE540FD1CE4F4211503A22F41D9499  geoip.metadb
1B0C33F5E123FC3F21702F44002882DFB8B08499E4D34C7CBA7050A7DC3FB383  geoip.dat
F1FF796F579A242461DB509679515ADE127231989624A68CC588B52AF1514493  geosite.dat
```

### `app/ui/config`

飞牛桌面入口源码。源码目录是 `fnos-appstore-mihomo/app/ui/`，正式包里会被打到 `app.tgz` 顶层 `ui/config`，最终安装路径是 `${TRIM_APPDEST}/ui/config`。不要打成 `.fpk` 外层 `ui/config`，也不要打成 `app.tgz` 里的 `app/ui/config`。

```json
{
  ".url": {
    "clash.meta.Application": {
      "title": "Clash.Meta",
      "desc": "Clash.Meta mihomo core with built-in MetaCubeXD web dashboard.",
      "icon": "images/{0}.png",
      "type": "iframe",
      "protocol": "http",
      "port": "9090",
      "url": "/ui/",
      "allUsers": false,
      "noDisplay": false
    }
  }
}
```

`manifest` 的 `desktop_applaunchname` 必须和这里的 `clash.meta.Application` 一致。应用中心“打开”按钮和桌面图标都依赖这个入口 ID，并且桌面入口必须显式设置 `noDisplay=false`。

`allUsers=false` 是有意设计。MetaCubeXD 是 mihomo 控制面板，不是普通展示页面；默认不应对所有飞牛用户开放。需要给非管理员使用时，由飞牛侧授权或后续做安装向导/权限说明。

### 第三方许可

包内必须保留:

```text
LICENSE
app/THIRD_PARTY_NOTICES.md
```

当前第三方组件:

- mihomo: MIT
- MetaCubeXD: MIT
- MetaCubeX meta-rules-dat geodata: GPL-3.0

每次升级 mihomo、MetaCubeXD 或 geodata，都要同步检查 `app/THIRD_PARTY_NOTICES.md` 的版本、来源和许可证。不上架飞牛应用商店也按这个标准维护，避免后续重新分发时缺少许可信息。

### `app/dashboard/config.js`

MetaCubeXD 默认后端配置:

```js
(function () {
  const backendURL = `${window.location.protocol}//${window.location.host}`
  const localEndpoint = {
    id: "local-mihomo",
    url: backendURL,
    secret: "",
    label: "Local mihomo",
  }

  window.__METACUBEXD_CONFIG__ = {
    defaultBackendURL: backendURL,
  }

  window.metacubexd = window.metacubexd || {}
  window.metacubexd.endpoint = {
    url: localEndpoint.url,
    secret: localEndpoint.secret,
  }

  // 真实文件还会同步 localStorage.endpointList / selectedEndpoint。
})()
```

这样从 `http://<飞牛IP>:9090/ui/` 打开面板时，会默认连接同一个 `9090` 控制端口，并自动注册 `local-mihomo` 本地端点。不要只设置 `defaultBackendURL`，它在 MetaCubeXD 里只是默认候选地址，不一定会保存和选中端点。

从 `1.19.27-21` 开始，`config.js` 不再自动弹出订阅配置，避免和原生安装向导重复。Web 面板保留一个手动触发的右下角导入按钮:

- 从 `1.19.27-26` 开始按钮文案为 `导入`，这是本包额外注入的按钮，不是 MetaCubeXD 原生按钮。
- 从 `1.19.27-27` 开始，`PUT /configs?force=true` 和后台 provider 刷新都走 `fetchWithTimeout()`；运行时导入配置默认关闭 provider `health-check`，避免导入后立刻测速造成长时间等待。
- `clashMetaConfigDraftUrl` 用来保留弹窗草稿。
- 兼容清理旧版 `clashMetaSubscriptionPendingUrl` / `clashMetaSubscriptionDraftUrl`，避免升级后继续触发旧的 `#/profiles` 填表流程。
- 支持普通 `http(s)` 订阅和 `clash://install-config?url=...&name=...` 导入链接。
- 提交后前端生成一份最小 mihomo 订阅配置，调用 `PUT /configs?force=true` 加载运行时配置，然后跳转到 `#/proxies`。
- 如果控制接口 30 秒内没有返回，弹窗会显示超时错误并恢复按钮；此时可能是 mihomo 正在后台拉订阅，也可能是 NAS 无法直连订阅域名。
- 这段逻辑不承诺写回 `<应用文件>/clash.meta/config/config.yaml`。持久配置仍以原生安装向导或手动编辑 `config.yaml` 为准。
- `scripts/build-fpk.py` 会校验 `clashMetaConfigDraftUrl`、`clearLegacySubscriptionState()`、`installConfigImportButton()`、`normalizeSubscriptionInput()`、`buildSubscriptionConfig()`、`applyRuntimeConfig()`、`fetchWithTimeout()`、`/configs?force=true`、`加载配置超时` 和 `运行时配置已加载`，并禁止恢复 `routeToProfiles()`、`openProfileImportUI()`、`prefillSubscriptionURL()` 等旧逻辑。

## 上游来源

- mihomo: `https://github.com/MetaCubeX/mihomo/releases`
- MetaCubeXD: `https://github.com/MetaCubeX/metacubexd/releases`
- fnpack: `https://developer.fnnas.com/docs/cli/fnpack/`
- fnOS 应用结构: `https://developer.fnnas.com/docs/core-concepts/framework/`
- manifest: `https://developer.fnnas.com/docs/core-concepts/manifest/`
- 应用入口: `https://developer.fnnas.com/docs/core-concepts/app-entry/`

## 升级 mihomo 核心

1. 查询最新 mihomo release。
2. 下载对应文件:

```text
mihomo-linux-amd64-compatible-<version>.gz
mihomo-linux-arm64-<version>.gz
```

3. 解压 `.gz` 得到 Linux 二进制。
4. 构建 x86 包时，使用 `amd64-compatible` 二进制并复制为:

```text
fnos-appstore-mihomo/app/mihomo
```

5. 构建 ARM 包时，把 arm64 二进制复制为同一路径。
6. 更新 `manifest` 里的 `version`。
7. 如果只是脚本或配置改动，mihomo 主版本不变，递增包修订号，例如 `1.19.27-9`。

## 手动更新 geodata

这是本包的固定维护策略: geodata 只在构建时内置，不在用户设备上自动更新。后续需要维护者手动下载新版 `country.mmdb`、`geoip.metadb`、`geoip.dat` 和 `geosite.dat`，重打 `.fpk` 后再安装或发布。

这样做是为了避免 fnOS 设备首次启动时访问 GitHub 超时，导致 mihomo 因 external-ui、MMDB、metadb 或 dat 下载失败直接退出。

建议在以下情况手动更新:

- mihomo 升级时
- GeoIP 规则明显过旧时
- 用户反馈 GeoIP/Fallback DNS 行为异常时
- 每隔 1 到 3 个月做例行维护

更新命令:

```powershell
curl.exe -L --retry 3 --connect-timeout 20 -o '.tmp\downloads\country.mmdb' 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb'
curl.exe -L --retry 3 --connect-timeout 20 -o '.tmp\downloads\geoip.metadb' 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb'
curl.exe -L --retry 3 --connect-timeout 20 -o '.tmp\downloads\geoip.dat' 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat'
curl.exe -L --retry 3 --connect-timeout 20 -o '.tmp\downloads\geosite.dat' 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat'
Copy-Item -Force '.tmp\downloads\country.mmdb' 'fnos-appstore-mihomo\app\geodata\country.mmdb'
Copy-Item -Force '.tmp\downloads\geoip.metadb' 'fnos-appstore-mihomo\app\geodata\geoip.metadb'
Copy-Item -Force '.tmp\downloads\geoip.dat' 'fnos-appstore-mihomo\app\geodata\geoip.dat'
Copy-Item -Force '.tmp\downloads\geosite.dat' 'fnos-appstore-mihomo\app\geodata\geosite.dat'
Get-FileHash 'fnos-appstore-mihomo\app\geodata\country.mmdb','fnos-appstore-mihomo\app\geodata\geoip.metadb','fnos-appstore-mihomo\app\geodata\geoip.dat','fnos-appstore-mihomo\app\geodata\geosite.dat' -Algorithm SHA256
```

更新后必须:

1. 把新的 SHA256 写回本文档。
2. 递增 `manifest` 的包修订号。
3. 运行 `python scripts\build-fpk.py --version <新版本>`。
4. 解包确认 `geodata/country.mmdb`、`geodata/geoip.metadb`、`geodata/geoip.dat` 和 `geodata/geosite.dat` 存在。

## 升级 MetaCubeXD 面板

1. 查询 MetaCubeXD release。
2. 下载 `compressed-dist.tgz`。
3. 清空并替换:

```text
fnos-appstore-mihomo/app/dashboard/
```

4. 检查 `app/dashboard/config.js`，确保仍然包含默认后端配置、`window.metacubexd.endpoint` / `localStorage` 自举逻辑，以及右下角 `导入` 运行时加载配置逻辑。
5. 如果图标需要同步，可复制:

```text
app/dashboard/pwa-64x64.png  -> ICON.PNG 和 app/ui/images/icon_64.png
app/dashboard/pwa-512x512.png -> ICON_256.PNG 和 app/ui/images/icon_256.png
```

## 构建流程

在 `D:\clash-meta` 执行。当前不要再直接用 Windows 版 `fnpack build` 产出最终包，因为它会丢 Unix 执行权限。正式构建使用:

```powershell
python scripts\build-fpk.py --version 1.19.27-27
```

脚本会自动:

- 校验 `desktop_applaunchname` 是否匹配源码 `app/ui/config`
- 校验桌面入口 `noDisplay=false`
- 校验桌面入口 `allUsers=false`
- 校验 `config/privilege` 使用 `run-as=package`
- 校验 `config/resource` 声明 `data-share`，并给应用用户 `rw` 权限
- 校验 `manifest` 没有 `install_type=root`
- 校验外层 `LICENSE` 和内层 `THIRD_PARTY_NOTICES.md`
- 校验入口图标 `app/ui/images/64.png` 和 `app/ui/images/256.png` 存在
- 校验内置 `country.mmdb`、`geoip.metadb`、完整版 `geoip.dat` 和完整版 `geosite.dat` 存在且大小合理
- 校验默认配置使用 `mixed-port: 7899` 和 `geo-auto-update: false`，不包含 `external-ui-name` / `external-ui-url`，DNS bootstrap 不依赖 DoH 域名
- 校验 `dashboard/config.js` 包含本地 endpoint 自举和右下角运行时导入配置按钮
- 校验 `cmd/main` 包含 `TRIM_DATA_SHARE_PATHS`、`${TRIM_TEMP_LOGFILE}`、随机 secret、内置 geodata 和运行时 dashboard 逻辑
- 校验 `wizard/install` 包含中文原生安装向导、订阅/导入链接、完整 YAML 配置 URL 字段和 `clash://install-config` 提示
- 校验 `wizard/uninstall` 包含中文原生卸载向导和三种数据处理方式
- 校验 `cmd/install_callback` 会保存 `wizard_subscription_url`、`wizard_config_url`，并兼容旧字段 `wizard_config_mode`
- 校验 `cmd/uninstall_callback` 会按 `wizard_uninstall_data_action` 保留、清缓存或删除全部数据
- 校验 `cmd/main` 包含安装向导配置生成、订阅 `proxy-providers`、订阅 provider 直连下载、旧订阅配置迁移、端口/DNS 迁移和完整配置 URL 下载逻辑
- 校验 `dashboard/*.html` 中 `config.js?v=<version>` 与 manifest 版本一致
- x86 包使用 `.tmp/downloads/mihomo-linux-amd64-compatible`
- ARM 包使用 `.tmp/downloads/mihomo-linux-arm64`
- 为 `cmd/*` 和 `mihomo` 写入 `0755` 权限
- 按官方 `fnpack` 布局生成 `app.tgz`，让 `mihomo`、`dashboard/`、`ui/`、`geodata/` 位于顶层
- 生成 `dist/SHA256SUMS.txt`

## 验证清单

构建后至少检查:

1. `python scripts\build-fpk.py --version <version>` 没有报错。
2. x86 包 manifest 中 `platform = x86`。
3. ARM 包 manifest 中 `platform = arm`。
4. 内层 `app.tgz` 包含:

```text
mihomo
config.default.yaml
dashboard/index.html
dashboard/config.js
THIRD_PARTY_NOTICES.md
ui/config
ui/images/64.png
ui/images/256.png
geodata/country.mmdb
geodata/geoip.metadb
geodata/geoip.dat
geodata/geosite.dat
```

5. `dashboard/config.js` 默认后端指向当前访问 host，并会写入/选中 `local-mihomo` endpoint。
6. `cmd/main` 包含 `prepare_secret`、`prepare_dashboard` 和 `-ext-ui "${DASHBOARD_DIR}"`。
7. `tar -tvf` 检查 `cmd/main` 是 `rwxr-xr-x`。
8. 解开内层 `app.tgz` 后检查 `mihomo` 是 `rwxr-xr-x`。
9. 重新生成 `dist/SHA256SUMS.txt`。
10. `manifest` 中 `desktop_applaunchname` 等于 `app.tgz` 顶层 `ui/config` 中的入口 ID。
11. `ui/config` 入口包含 `noDisplay=false`。
12. `ui/config` 入口包含 `allUsers=false`。
13. `config/privilege` 使用 `run-as=package`。
14. `manifest` 不包含 `install_type=root`。
15. 外层 `.fpk` 包含 `LICENSE`。
16. 内层 `app.tgz` 包含 `THIRD_PARTY_NOTICES.md`。
17. `geodata/country.mmdb`、`geodata/geoip.metadb`、`geodata/geoip.dat` 和 `geodata/geosite.dat` 存在。
18. `app.tgz` 顶层包含 `ui/config`、`ui/images/64.png`、`ui/images/256.png`。
19. 外层 `.fpk` 不需要包含 `ui/config`；官方 `fnpack` 也不会把入口放在外层。
20. `config/resource` 给 `clash.meta` data-share `rw` 权限。
21. `cmd/main` 使用 `TRIM_DATA_SHARE_PATHS` 选择应用文件目录，并在失败时写 `${TRIM_TEMP_LOGFILE}`。
22. 外层 `.fpk` 包含 `wizard/install`。
23. 外层 `.fpk` 包含 `wizard/uninstall`。
24. `cmd/install_callback` 是 `rwxr-xr-x`。
25. `cmd/uninstall_callback` 是 `rwxr-xr-x`。
26. `cmd/main` 包含 `create_initial_config`、`write_subscription_config`、`download_wizard_config`。
27. 订阅模式生成的 `proxy-providers.subscription` 包含 `proxy: DIRECT`。
28. `cmd/main` 包含 `migrate_subscription_config`，用于把旧安装向导订阅配置迁移到 provider 直连下载。

## 解包检查命令

```powershell
Remove-Item -Recurse -Force '.tmp\inspect-x86','.tmp\inspect-x86-app' -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path '.tmp\inspect-x86','.tmp\inspect-x86-app' | Out-Null
tar -xf 'dist\clash.meta_1.19.27-27_x86.fpk' -C '.tmp\inspect-x86'
tar -xzf '.tmp\inspect-x86\app.tgz' -C '.tmp\inspect-x86-app'
Get-Content '.tmp\inspect-x86\manifest'
Get-Content '.tmp\inspect-x86\config\privilege'
Get-Content '.tmp\inspect-x86-app\ui\config'
Get-ChildItem '.tmp\inspect-x86\LICENSE','.tmp\inspect-x86-app\THIRD_PARTY_NOTICES.md','.tmp\inspect-x86-app\ui\images\64.png','.tmp\inspect-x86-app\ui\images\256.png','.tmp\inspect-x86-app\mihomo','.tmp\inspect-x86-app\dashboard\index.html','.tmp\inspect-x86-app\geodata\country.mmdb','.tmp\inspect-x86-app\geodata\geoip.metadb','.tmp\inspect-x86-app\geodata\geoip.dat','.tmp\inspect-x86-app\geodata\geosite.dat'
```

## 运行时排障

## 踩坑记录

### 2026-06-21: 内嵌 UI 不能让 mihomo 自己去 GitHub 下载

背景:

- 用户在 MetaCubeXD 日志页看到:

```text
External UI downloading ...
Error downloading UI: can't download file: Get "https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip": ...
[TCP] dial PROXY ... github.com:443 error: dns resolve failed
Start Mixed(http+socks) server error: listen tcp :7890: bind: address already in use
```

- 本包已经内置 MetaCubeXD 静态文件，mihomo 不应该再下载 GitHub 上的 external-ui。
- `external-ui-name: MetaCubeXD` 会触发 mihomo 的 UI 下载逻辑。即使启动参数传了 `-ext-ui`，配置里保留这个字段仍可能让核心尝试联网下载。
- 默认 `mixed-port: 7890` 容易和用户已有代理服务冲突；截图中的 `bind: address already in use` 表示端口已经被其他进程占用。

修复:

- 从 `1.19.27-24` 开始，新生成配置和默认模板只保留 `external-ui: dashboard`，不再写 `external-ui-name` 或 `external-ui-url`。
- `ensure_config_runtime_settings` 会删除用户配置里的 `external-ui-name` / `external-ui-url`，确保运行时只使用包内 `${TRIM_PKGVAR}/dashboard`。
- 新生成配置和默认模板把 `mixed-port` 改为 `7899`，降低和已有 `7890` 服务冲突的概率。
- `migrate_subscription_config` 只会把安装向导生成的旧订阅配置从 `mixed-port: 7890` 迁移到 `7899`，不强行改用户手写完整 YAML。
- 新生成配置的 DNS bootstrap 改为 IP nameserver；`migrate_bootstrap_dns` 会迁移旧安装向导订阅配置里的 `default-nameserver`、`nameserver` 和 `fallback`，避免拉订阅前解析 DoH 域名又依赖代理或 DNS 自举。

踩坑:

- 不要同时设置 `external-ui-name` 和内嵌 dashboard。内嵌包只需要 `external-ui: dashboard` 加启动参数 `-ext-ui "${DASHBOARD_DIR}"`。
- `9090` 是应用中心入口和控制 API 端口，不能随意变；代理端口冲突优先改 `mixed-port`。
- 如果用户已有 `config.yaml` 是完整自定义配置，维护脚本不能擅自改端口。需要用户手动编辑 `<应用文件>/clash.meta/config/config.yaml` 后重启应用。
- 如果继续看到 GitHub UI 下载日志，先检查运行时 `config.yaml` 是否还残留 `external-ui-name` 或 `external-ui-url`。

后续要求:

- 构建脚本必须继续禁止默认配置和 `cmd/main` 出现 `external-ui-name:`、`external-ui-url:`、`mixed-port: 7890` 和 DoH bootstrap 域名。
- 文档里的默认代理端口要统一写 `7899`。

### 2026-06-21: geodata 不能依赖用户设备自动更新

背景:

- 用户的 fnOS 设备访问 GitHub 不稳定，哪怕包内已经带了 MMDB，如果配置或核心触发 geodata 自动更新，仍可能在启动或规则加载阶段卡住。
- `geoip-lite.dat` / `geosite-lite.dat` 可以降低包体积，但对“尽量不依赖 GitHub”的目标不够彻底。用户更需要开箱可启动，而不是小包体。

修复:

- 从 `1.19.27-25` 开始，包内 `geodata/geoip.dat` 和 `geodata/geosite.dat` 改为上游完整版。
- 默认配置和安装向导生成配置都写入 `geo-auto-update: false`。
- `ensure_config_runtime_settings` 会把运行时配置里的 `geo-auto-update` 统一改为 `false`，没有该字段时会补上。
- `scripts/build-fpk.py` 对 geodata 做最小大小校验，`geoip.dat` 小于 10MB 或 `geosite.dat` 小于 1MB 会直接拒绝打包，避免误把 lite 文件打进正式包。

踩坑:

- 不要为了包体积再换回 lite dat，除非明确接受用户设备后续可能还要访问 GitHub 补齐规则数据。
- 不要在用户设备上启用 `geo-auto-update`。本包的维护模式是构建机手动更新 geodata，然后重打 `.fpk`。
- 默认配置不写 `geox-url`，因为只要自动更新关闭，启动路径不需要这些下载地址；保留上游默认值比写死镜像地址更少维护负担。

### 2026-06-21: 前端日志里的 Provider/TCP 订阅错误不是前端报错

背景:

- 用户在 MetaCubeXD 日志页看到:

```text
[Provider] subscription pull error: Get "https://subscription.example.com/api/v1/sub?...": EOF
[TCP] dial PROXY (match Match/) mihomo --> subscription.example.com:443 error: dns resolve failed: context deadline exceeded
```

- 这类日志来自 mihomo 核心，MetaCubeXD 只是把核心日志展示出来，不是前端 JS 异常。
- `dial PROXY ... subscription.example.com:443` 说明拉订阅请求被路由到了 `PROXY` 组。
- 安装向导生成的订阅配置里，`PROXY` 组的节点又来自同一个 `proxy-providers.subscription`。首次启动时 provider 还没拉下来，如果订阅请求先走 `PROXY`，就会形成自举闭环。

修复:

- 从 `1.19.27-23` 开始，`write_subscription_config` 在 `proxy-providers.subscription` 下写入 `proxy: DIRECT`，强制订阅 provider 下载和更新走直连。
- 从 `1.19.27-27` 开始，安装向导生成的订阅配置和 Web 运行时导入配置都默认写入 `health-check.enable: false`。
- 同时从订阅 URL 提取域名，在 `MATCH,PROXY` 前插入 `DOMAIN-SUFFIX,<订阅域名>,DIRECT`，避免订阅域名被普通规则兜底到 `PROXY`。
- `cmd/main` 增加 `migrate_subscription_config`。如果旧包已经由安装向导创建了订阅配置，启动时会补上 `proxy: DIRECT`、订阅域名直连规则，并关闭 provider health-check。
- 迁移只处理 `configured_by_install_wizard=subscription` 的配置，不主动改用户手写的完整 `config.yaml`。

踩坑:

- 不要把这个问题当成 MetaCubeXD 前端 bug。前端重装或清浏览器缓存不会解决 provider 拉取路径。
- 不要只加 `DOMAIN-SUFFIX` 规则。provider 下载自身支持 `proxy` 字段，官方 mihomo 文档里 `proxy-providers` 示例包含 `proxy: DIRECT`；这是更直接的修复点。
- 不要在安装向导默认配置里重新打开 provider health-check。首次导入或首次启动时节点还没稳定，立刻测速会增加启动和导入链路的网络不确定性。
- 如果升级到 `1.19.27-23` 后仍然是 `EOF` 或 DNS timeout，说明飞牛 NAS 自己直连访问订阅域名仍失败，需要检查 NAS DNS、上游网络或换一个 NAS 可直连访问的订阅地址。
- 如果用户改过完整 YAML 配置，维护者不能盲目迁移；只能指导用户在对应 `proxy-providers` 项里手动加 `proxy: DIRECT`，或给订阅域名加直连规则。

后续要求:

- 任何修改安装向导订阅配置生成逻辑，都必须保留 `proxy: DIRECT` 和 `health-check.enable: false`。
- 构建脚本必须继续校验 `cmd/main` 中的 `proxy: DIRECT`、`enable: false`、`disable_subscription_provider_health_check()`、`DOMAIN-SUFFIX,${subscription_host},DIRECT` 和 `migrate_subscription_config()`。
- 文档里排障时要先区分“Web 面板显示的核心日志”和“Web 前端 JS 报错”。

### 2026-06-21: 卸载向导必须区分配置、订阅缓存和全部数据

背景:

- 用户希望卸载时有明确选择: 保留数据、只删除订阅/缓存、删除全部应用数据。
- Clash.Meta 的 `config.yaml` 和 `secret` 是用户长期配置，不应该因为清理订阅缓存被误删。

实现:

- 从 `1.19.27-18` 开始增加 `wizard/uninstall`。
- 默认选项是 `保留全部用户数据（推荐）`。
- `1.19.27-18` 到 `1.19.27-21` 的 `删除订阅与缓存数据，保留用户配置` 只保留 `config.yaml` 和 `secret`，会删除 providers 和安装向导保存的订阅 URL。
- 从 `1.19.27-22` 开始，第二项改为 `删除其他数据，保留用户配置与订阅`，只清理运行缓存、临时文件和旧日志。
- `删除全部应用数据` 才删除整个 `<应用文件>/clash.meta`。
- `cmd/uninstall_callback` 使用 `wizard_uninstall_data_action` 决定行为。

踩坑:

- 卸载向导只收集选择，真正删除必须放在 `cmd/uninstall_callback`。
- 不要把“删除其他数据”理解成删除订阅；用户明确要求保留用户配置与订阅，因此不能删 `config/providers/`、`config/subscription.yaml`、`config/wizard/` 或 `${TRIM_PKGVAR}/wizard/`。
- `delete_subscription_cache` 只能作为历史值兼容，必须映射到新的保留订阅清理逻辑。
- 删除全部数据必须做路径保护，拒绝删除空路径、`/`、`/var`、`/var/apps`、应用安装目录和运行目录。
- `${TRIM_PKGVAR}/wizard` 是运行态兜底路径，不在应用文件目录里，清理时要用独立白名单，不能复用只允许 `APP_SHARE` 的删除函数。

后续要求:

- 新增清理目录时，必须先判断是否属于“运行缓存/临时文件”还是“用户配置/订阅数据”。
- 所有删除都走 `safe_remove_path` 或 `safe_remove_runtime_path`。
- 构建脚本必须继续校验 `wizard/uninstall` 和 `cmd/uninstall_callback` 的关键标记。

### 2026-06-21: 安装向导不要做三选一模式页

背景:

- 用户反馈原生向导里上方三选一 radio 加下方两个输入框太重，容易误解。
- 用户从小猫咪复制的导入链接形如 `clash://install-config?url=...`，旧校验只允许 `http(s)`，会导致完整配置框无法通过。
- 用户希望两个输入框放在同一界面，二选一填写即可。

实现:

- 从 `1.19.27-19` 开始，`wizard/install` 改为单页两个输入框: `订阅地址` 和 `完整配置文件 URL`。
- 不再显示 `wizard_config_mode` radio；该字段只作为旧包升级兼容。
- `cmd/install_callback` 自动判断模式: 完整配置框优先，订阅框其次，都为空则 manual。
- `clash://install-config?url=...` 会提取 `url` 参数并解码常见 URL 编码，然后按完整配置 URL 保存。
- `cmd/main` 也保留同样的解析兜底，防止某些安装阶段没有正确写入 callback 结果。

踩坑:

- 安装向导的输入校验必须同时允许空值、`http(s)://` 和 `clash://install-config?...`。
- 如果两个框都填，按完整配置优先；文档和界面提示必须写清楚。
- 不要把 `clash://install-config` 当订阅地址写入 `proxy-providers`，mihomo 不能直接拉这个协议。
- 旧字段 `wizard_config_mode` 不要立刻删除，升级或残留环境变量可能仍会出现。
- URL 解码不能依赖 Python 或 Node，实机生命周期脚本里只用 shell/sed 处理常见编码。

后续要求:

- 修改向导字段时，同步更新 `cmd/install_callback`、`cmd/main`、`scripts/build-fpk.py`、`INSTALL.md` 和本手册。
- 新增 URL 协议兼容时，先确认最终落盘的一定是 mihomo 能直接使用的 `http(s)` URL。
- 用户界面优先保持“一个页面两个框”，不要再恢复三选一模式页。

### 2026-06-21: 小猫咪 install-config 链接应按订阅导入处理

背景:

- 用户给出的链接格式为 `clash://install-config?url=https%3A%2F%2F...&name=...`。
- 这类链接里的 `url` 参数通常是机场订阅或导入地址，不一定是一份可以直接作为 `config.yaml` 使用的完整 YAML。
- `1.19.27-19` 曾把 `clash://install-config` 解码后归入完整配置 URL，这会导致启动时尝试下载并校验完整 mihomo YAML；如果服务端返回的是订阅内容，就会回退默认配置，用户会以为链接不可用。

修复:

- 从 `1.19.27-20` 开始，`wizard_subscription_url` 中的 `clash://install-config?url=...&name=...` 解码后保存为 `subscription.url`，模式为 `subscription`。
- `cmd/main` 首次启动会基于该 URL 生成 `proxy-providers.subscription`，保留订阅自动更新行为。
- `wizard_config_url` 的界面校验改为只接受 `http(s)`，文案明确只有真正完整 YAML 配置才填第二个输入框。

后续要求:

- 不要因为协议名叫 `install-config` 就默认当完整配置文件处理。
- 如果以后要识别某个链接确实返回完整 YAML，应新增明确字段或显式检测，不能影响普通订阅导入路径。
- 文案里优先使用“订阅 / 导入链接”，降低用户判断成本。

### 2026-06-21: 原生安装向导不能只做前端弹窗

背景:

- 用户希望第一次安装时，在飞牛协议许可页之后继续出现订阅地址配置入口。
- Clash/Mihomo 类客户端通常默认就是订阅地址，因此默认配置方式应该是订阅，而不是让用户先进入空面板再找 Profile。

实现:

- 从 `1.19.27-17` 开始增加 `wizard/install`，使用飞牛原生安装向导。
- `1.19.27-17` 到 `1.19.27-18` 曾使用说明页加三选一配置页。
- 从 `1.19.27-19` 开始改为单页两个输入框，二选一填写；都留空等同稍后手动配置。
- 从 `1.19.27-20` 开始进一步明确第一个框是“订阅 / 导入链接”，`clash://install-config` 按订阅导入处理。
- `cmd/install_callback` 保存向导输入。
- `cmd/main` 首次启动时读取向导输入并创建 `config.yaml`。
- 订阅模式生成 `proxy-providers.subscription`，完整配置 URL 模式尝试下载完整 YAML。
- 完整配置 URL 下载失败不报错退出，回退默认配置，避免应用中心卡在“启用中”。

踩坑:

- `wizard/install` 只能收集输入，不会自动帮应用落盘生成业务配置。
- 用户向导变量只保证在相关生命周期脚本里可用，不能假设 `cmd/main start` 一定还能读到。
- 所以需要在 `cmd/install_callback` 中持久化一份到应用文件目录。
- 安装阶段如果 `TRIM_DATA_SHARE_PATHS` 不稳定，还要保存一份到 `${TRIM_PKGVAR}/wizard/` 做兜底。
- 如果用户已经存在 `config.yaml`，绝对不要用向导值覆盖用户配置。

后续要求:

- 修改向导字段名时，必须同步改 `cmd/install_callback`、`cmd/main` 和 `scripts/build-fpk.py` 校验。
- 新增模式时要保证失败回退，不要让下载、解析或网络问题影响启用。
- 文档必须写清楚 geodata 仍然是维护者手动更新，不在用户设备自动更新。

### 2026-06-21: 按飞牛上架标准收紧权限和许可

背景:

- 虽然当前包不会上架飞牛应用商店，但仍按飞牛应用商店标准维护。
- 旧包为了路径稳定性写过 `install_type=root`，权限文件也写过 `"run-as": "clash.meta"`。

问题:

- 飞牛官方文档里 root 权限模式只适合官方合作或确实需要系统级能力的应用。
- 本包只需要监听 `7899/9090/1053`、读取安装目录、写应用文件目录和运行态目录，不需要 root。
- 包内捆绑 mihomo、MetaCubeXD 和 geodata，缺少第三方许可说明不符合长期维护和再分发要求。

修复:

- 从 `1.19.27-14` 开始，`config/privilege` 改为 `run-as=package`。
- `manifest` 移除 `install_type=root`。
- 外层 `.fpk` 增加 `LICENSE`。
- 内层 `app.tgz` 增加 `THIRD_PARTY_NOTICES.md`。
- `scripts/build-fpk.py` 增加强制校验，发现 root 安装、非 package 运行身份或缺许可文件时直接构建失败。

后续要求:

- 不要为了“路径看起来固定”重新加 `install_type=root`。
- 所有路径继续通过 `TRIM_APPDEST`、`TRIM_PKGVAR`、`TRIM_PKGETC`、`TRIM_DATA_SHARE_PATHS` 获取。
- 如果将来接入飞牛公共网关，优先按官方 `gatewayPrefix/gatewaySocket` 机制做，不要通过 root 权限绕。

### 2026-06-21: 中途关机或构建中断后的恢复检查

现象:

- 本地电脑中途关机，源码可能已经修改，但 `dist/` 里的 `.fpk`、`SHA256SUMS.txt` 或文档 SHA256 还没同步。
- 继续构建时容易把旧版本包误认为新版本包。

处理:

- 先检查 `manifest` 当前版本号、`INSTALL.md` 里的版本号、`dashboard/index.html` / `200.html` / `404.html` 里的 `config.js?v=` 是否一致。
- 重新跑 `python -m py_compile scripts\build-fpk.py`、`node --check fnos-appstore-mihomo\app\dashboard\config.js`、`bash -n fnos-appstore-mihomo/cmd/main`。
- 重新执行 `python scripts\build-fpk.py --version <当前版本>`，不要复用中断前的 `.fpk`。
- 构建后必须解包验 `manifest`、`config/privilege`、`cmd/main` 执行位、`app.tgz` 内 `mihomo` 执行位、`ui/config`、`dashboard/config.js`、`geodata/`。
- 最后用 `dist/SHA256SUMS.txt` 回填 `INSTALL.md`，避免安装说明和实际包不一致。

后续要求:

- 中断恢复时以源码和重新构建产物为准，不以 `dist/` 旧包为准。
- 每次恢复都先跑脚本自检，构建脚本会拦截 root 安装、错误入口权限、缺少许可文件、缺少 geodata 等已踩过的问题。

### 2026-06-21: PowerShell 默认编码会破坏静态 HTML

现象:

- 用 `(Get-Content -Raw $file) -replace ... | Set-Content` 修改 `dashboard/index.html`、`200.html`、`404.html` 后，HTML 里的多语言字符串出现乱码。

根因:

- Windows PowerShell 对无 BOM UTF-8 文件的默认读取/写入编码不稳定，容易把 UTF-8 内容按系统 ANSI 编码处理。
- MetaCubeXD 生成的 HTML 是单行压缩文件，里面包含中文、日文、韩文、俄文等非 ASCII 文本。

修复:

- 从已验证的 `1.19.27-13` 包内恢复 HTML。
- 用 Python 或 .NET UTF-8 no BOM 方式只替换 ASCII 版本号。

后续要求:

- 修改静态 Web 资源时，不要用默认 `Get-Content | Set-Content`。
- 可以用构建脚本或明确 UTF-8 no BOM 的方式处理。
- 修改 `index.html` 后要同步更新 `sw.js` 中 `{url:"./",revision:"..."}` 对应的 MD5，避免 service worker 缓存旧首页。

### 2026-06-21: 升级内嵌 MetaCubeXD 到 v1.258.3

背景:

- 用户在面板关于页看到 `MetaCubeXD v1.256.6` 和 `mihomo v1.19.27`，担心前后端版本差距过大。
- 上游核对结果: mihomo `v1.19.27` 已是当时最新稳定版；MetaCubeXD 最新为 `v1.258.3`。

修复:

- 从 `1.19.27-15` 开始，只升级内嵌 MetaCubeXD 到 `v1.258.3`，mihomo 核心继续保持 `v1.19.27`。
- 替换 `app/dashboard/` 后，必须把自定义 `config.js` 自动连接逻辑写回。
- `index.html`、`200.html`、`404.html` 中 `config.js` 必须带当前包版本号，例如 `?v=1.19.27-15`，防止浏览器和 PWA 缓存旧配置。
- `sw.js` 中 `url:"./"` 的 revision 已按新 `index.html` MD5 更新为 `86a3527c5f50f3fb073ca88182bec156`。
- `THIRD_PARTY_NOTICES.md`、`README.md`、`INSTALL.md` 同步更新 MetaCubeXD 版本。

后续要求:

- 后续升级 MetaCubeXD 时，不要直接使用上游自带的 60 字节 `config.js`；必须保留本包的 `local-mihomo`、`endpointList`、`selectedEndpoint` 自举逻辑。
- 下载 GitHub release 时可能中断，必须先解包验证 `index.html` 里的 `appVersion`，再替换正式 dashboard。
- 替换 dashboard 后必须跑 `node --check app/dashboard/config.js` 和 `python scripts\build-fpk.py --version <新版本>`。

### 2026-06-21: Web 订阅入口不要自动弹出

背景:

- 安装时已经有原生向导收集订阅或完整 YAML 配置。
- Web 首次打开再自动弹一个订阅配置，会和安装向导产生重复入口，用户容易以为两处配置互相覆盖。
- MetaCubeXD 自带 `Profiles` 页面和订阅导入能力，但自动选中本地 endpoint 后不会一定展示上游 onboarding。

实现:

- `1.19.27-16` 到 `1.19.27-20` 曾在 `app/dashboard/config.js` 里加入轻量首开弹窗。
- 从 `1.19.27-21` 开始删除自动弹窗，改为右下角手动 `订阅` 按钮。
- `1.19.27-22` 到 `1.19.27-25` 曾尝试主动打开 MetaCubeXD 的 URL 导入入口，找不到输入框时显示错误提示。
- 从 `1.19.27-26` 开始废弃 `#/profiles` 填表方案，按钮文案改成 `导入`。用户点击后可粘贴普通 `http(s)` 订阅或 `clash://install-config?url=...&name=...`。
- 前端解出真实订阅 URL，生成与安装向导同结构的最小 mihomo 配置，包含 `proxy-providers.subscription`、`proxy: DIRECT`、订阅域名直连规则、`mixed-port: 7899`、`external-ui: dashboard` 和当前 controller `secret`。
- 前端调用 mihomo 标准控制接口 `PUT /configs?force=true`，请求体为 `{ "path": "", "payload": "<yaml>" }`，成功后跳转 `#/proxies`。
- 从 `1.19.27-27` 开始，运行时导入里的 `proxy-providers.subscription.health-check.enable` 默认为 `false`，并给 `PUT /configs?force=true` 加 30 秒超时、给后台 provider 刷新加 8 秒超时。

踩坑:

- 右下角提示和按钮都是本包注入的，不是 MetaCubeXD 原生 UI。用户截图里的“没有进入配置文件页面”和“订阅链接已填入导入页”都来自旧版 `config.js`。
- 当前包内置的是静态 MetaCubeXD external-ui，MetaCubeXD 的 Profiles 导入组件内部调用 `/api/control/profiles/import`，这不是 mihomo 标准 external-controller API。没有额外控制后端时，页面可能只有“暂无配置文件”空状态，无法真正完成 Profile 导入。
- `#/config` 页里的“拉取远程配置”对应 MetaCubeXD 自己的 `fetchRemoteConfigAPI`，内部也是先下载 YAML，再 `PUT /configs?force=true`。因此右下角 `导入` 按钮应贴这个标准控制接口，而不是继续找 Profiles 输入框。
- `PUT /configs?force=true` 能让当前运行时加载配置，但不要把它当成飞牛应用目录配置持久化方案。长期保存仍要依赖安装向导写入或维护者手动编辑 `<应用文件>/clash.meta/config/config.yaml`。
- `PUT /configs?force=true` 可能在 mihomo 解析配置、拉取 provider 或网络阻塞时长时间不返回。前端必须用 `AbortController` 做超时，并在失败路径恢复“加载配置”按钮；不要只在 `catch` 里恢复按钮而没有超时。
- 运行时导入生成的是 provider 配置，不是 MetaCubeXD 自己的远程 YAML 下载逻辑。普通订阅地址最终仍需要 NAS 能直连访问；如果用户环境连不上订阅域名，按钮超时是预期的可恢复失败。
- 真要做到“一填订阅就写入应用文件目录并重启”，需要新增本地辅助服务或明确安全的后端 API，并处理 secret、权限、并发、订阅下载失败和失败回滚。

后续要求:

- 升级 MetaCubeXD 后，必须把右下角 `导入` 运行时加载逻辑重新套回 `config.js`，并重新核对 MetaCubeXD 是否仍使用 `PUT /configs?force=true`。
- 不要恢复首开自动弹窗；安装向导才是首次配置主入口。
- 修改 `index.html` / `200.html` / `404.html` 的 `config.js?v=` 时要同步当前包版本。
- 修改 `index.html` 后要同步 `sw.js` 中 `url:"./"` 的 MD5 revision。
- 构建前跑 `node --check fnos-appstore-mihomo\app\dashboard\config.js`。
- 构建脚本已检查 `clashMetaConfigDraftUrl`、`clearLegacySubscriptionState()`、`installConfigImportButton()`、`normalizeSubscriptionInput()`、`buildSubscriptionConfig()`、`applyRuntimeConfig()`、`fetchWithTimeout()` 和 `加载配置超时`，不要删掉这些标记。

### 2026-06-21: 启用一直卡住

现象:

- 在飞牛应用中心点击启用后，一直停在“启用中”。
- 前端没有明确错误提示。
- 应用文件里找不到清晰的 mihomo 日志。

根因:

- 早期 `1.19.27-1` 包把用户配置和日志放在 `${TRIM_PKGVAR}` 下，没有按飞牛应用文件规范使用 `data-share`。
- `config/resource` 只声明了 share 名称，没有给应用运行用户声明读写权限。
- `cmd/main` 启动失败时没有写 `${TRIM_TEMP_LOGFILE}`，飞牛应用中心无法把失败原因展示出来。

修复:

- 从 `1.19.27-6` 开始，配置文件放到 `<应用文件>/clash.meta/config/config.yaml`。
- 日志放到 `<应用文件>/clash.meta/logs/mihomo.log`。
- `config/resource` 中给 `clash.meta` 用户添加 data-share `rw` 权限。
- `cmd/main` 在启动失败时写 `${TRIM_TEMP_LOGFILE}`，同时把关键路径和最近日志写进去。
- PID 仍然放在 `${TRIM_PKGVAR}/run/mihomo.pid`，只作为运行态文件，不作为用户配置或日志位置。

后续要求:

- 不要把需要用户查看或长期保留的配置、日志放在 `${TRIM_PKGVAR}`。
- 涉及启动失败的脚本必须写 `${TRIM_TEMP_LOGFILE}`。
- 新包至少要解包检查 `config/resource`、`cmd/main` 和内层 `app.tgz`。

### Windows 本地构建时的两个注意点

- mihomo release 的 `.gz` 是单个 gzip 压缩二进制，不是 tar 包，不能用 `tar -tzf` 检查内容。
- GitHub release 下载慢或中断时，可能得到截断文件。必须对比 GitHub asset size，解压后检查二进制大小，再构建。
- x86 包必须优先使用 `mihomo-linux-amd64-compatible-<version>.gz`，不要用普通 `mihomo-linux-amd64-<version>.gz`。

### 2026-06-21: `binary is not executable`

现象:

- 飞牛弹窗显示 `binary is not executable: /usr/local/apps/@appcenter/clash.meta/app/mihomo`。
- 应用无法启用。

根因:

- 在 Windows 上直接用 `fnpack build` 打包时，包内 Unix 权限位被写成 `0666`。
- `cmd/main` 和 `app/mihomo` 都没有执行位。
- 运行时脚本里尝试 `chmod +x` 不可靠，因为 `/usr/local/apps/@appcenter/<appname>/app/` 是应用安装目录，运行用户可能没有写权限。

第一轮修复:

- 从 `1.19.27-3` 开始，不再依赖 Windows `fnpack build` 生成最终包。
- 用 Python `tarfile` 手工重建 `app.tgz` 和外层 `.fpk`，显式设置:
  - `cmd/*`: `0755`
  - `app/mihomo`: `0755`
  - 目录: `0755`
  - 普通资源文件: `0644`
- 构建后必须用 `tar -tvf`/`tar -tvzf` 检查权限。

第二轮修复:

- 实机仍然报安装目录 `app/mihomo` 不可执行，说明飞牛安装或运行环境可能仍会改变安装目录文件权限，或者应用运行用户无法依赖安装目录权限。
- 从 `1.19.27-6` 开始，`cmd/main` 不直接执行安装目录里的 `mihomo`。
- 启动时复制安装目录里的 `mihomo` 到 `${TRIM_PKGVAR}/bin/mihomo`，然后在可写运行目录里执行 `chmod 755`。
- 实际运行 `${TRIM_PKGVAR}/bin/mihomo`，绕开安装目录执行权限问题。

第三轮修复:

- 实机继续报 `source binary does not exist: /usr/local/apps/@appcenter/clash.meta/app/mihomo`。
- 当时误判为内层缺少顶层 `app/` 目录，曾把脚本路径改成 `${TRIM_APPDEST}/app/mihomo`。
- 后来用官方 `fnpack` 生成包反查确认: `app.tgz` 会直接解到应用安装目录，最终正确布局是 `app.tgz` 顶层包含 `mihomo`、`dashboard/`、`ui/`、`geodata/`。
- 从 `1.19.27-11` 开始，`cmd/main` 使用 `${TRIM_APPDEST}/mihomo`，手工打包器生成的内层结构为:

```text
mihomo
config.default.yaml
dashboard/
ui/
geodata/
```

### 2026-06-21: AMD64 v3 微架构不兼容

现象:

- 应用已经能找到并执行 `mihomo`。
- 日志出现:

```text
This program can only be run on AMD64 processors with v3 microarchitecture support.
```

根因:

- 早期 x86 包使用了普通 `mihomo-linux-amd64-v1.19.27.gz`。
- 该二进制要求 AMD64 v3 微架构。
- 部分飞牛设备虽然是 x86_64，但 CPU 不支持 AMD64 v3。

修复:

- 从 `1.19.27-6` 开始，x86 包改用官方 `mihomo-linux-amd64-compatible-v1.19.27.gz`。
- ARM 包仍使用 `mihomo-linux-arm64-v1.19.27.gz`。
- 后续升级 x86 包时必须继续选 `amd64-compatible` 资产，除非明确只支持新 CPU。

验证命令:

```powershell
tar -tvf 'dist\clash.meta_1.19.27-12_x86.fpk' | Select-String 'cmd/main|app.tgz'
tar -xzf '.tmp\inspect-x86\app.tgz' -C '.tmp\inspect-x86-app'
tar -tzf '.tmp\inspect-x86\app.tgz' | Select-Object -First 10
tar -tvzf '.tmp\inspect-x86\app.tgz' | Select-String 'mihomo$'
Select-String -Path '.tmp\inspect-x86\cmd\main' -Pattern 'TRIM_PKGVAR}/bin|prepare_binary|chmod 755'
```

### 2026-06-21: 启用成功但没有桌面图标和“打开”按钮

现象:

- 应用已经能成功启用。
- 直接访问 `http://<飞牛IP>:9090/ui/` 可以打开内嵌 MetaCubeXD。
- 但飞牛桌面没有图标，应用中心卡片上也没有“打开”按钮。

根因:

- 应用启动和桌面入口是两条链路。mihomo 能运行，只说明 `cmd/main` 正常。
- “打开”按钮和桌面图标由 `manifest` 的 `desktop_uidir` / `desktop_applaunchname` 找到安装目录中的 `ui/config`，也就是 `app.tgz` 顶层 `ui/config`。
- `1.19.27-9` 把入口打成了 `${TRIM_APPDEST}/app/ui/config`；`1.19.27-10` 又误打成 `.fpk` 外层 `ui/config`。官方 `fnpack` 的真实布局是 `app.tgz` 顶层 `ui/config`，安装后对应 `${TRIM_APPDEST}/ui/config`。
- 入口名大小写也要和参考包风格保持一致，使用 `clash.meta.Application`，不要再用 `APPLICATION`。
- 图标路径使用 `images/{0}.png`，实际文件为 `app.tgz` 顶层 `ui/images/64.png` 和 `ui/images/256.png`。

修复:

- 从 `1.19.27-11` 开始，入口统一为:

```text
desktop_uidir=ui
desktop_applaunchname=clash.meta.Application
```

- `app.tgz` 顶层 `ui/config` 中必须存在同名 entry:

```json
{
  ".url": {
    "clash.meta.Application": {
      "title": "Clash.Meta",
      "desc": "Clash.Meta mihomo core with built-in MetaCubeXD web dashboard.",
      "icon": "images/{0}.png",
      "type": "iframe",
      "protocol": "http",
      "port": "9090",
      "url": "/ui/",
      "allUsers": false,
      "noDisplay": false
    }
  }
}
```

注: `1.19.27-11` 到 `1.19.27-13` 曾使用 `allUsers=true`。从 `1.19.27-14` 开始按控制面板安全边界收紧为 `false`，不影响管理员入口显示。

验证:

```powershell
tar -xf 'dist\clash.meta_1.19.27-12_x86.fpk' -C '.tmp\inspect-x86'
tar -xzf '.tmp\inspect-x86\app.tgz' -C '.tmp\inspect-x86-app'
Select-String -Path '.tmp\inspect-x86\manifest' -Pattern 'desktop_uidir|desktop_applaunchname'
Get-Content '.tmp\inspect-x86-app\ui\config'
Get-ChildItem '.tmp\inspect-x86-app\ui\images\64.png','.tmp\inspect-x86-app\ui\images\256.png'
tar -tzf '.tmp\inspect-x86\app.tgz' | Select-String '^(ui/config|ui/images/64.png|ui/images/256.png)$'
```

实机注意:

- 如果升级安装后仍然没有“打开”按钮，优先卸载旧包再安装 `1.19.27-12`，因为应用中心可能缓存旧入口元数据。
- 这类问题不要看 mihomo 日志判断，日志只能证明核心是否启动；入口问题要解包看外层 `manifest` 和 `app.tgz` 顶层 `ui/config`。

### 2026-06-21: `不是有效的 fpk 文件`

现象:

- 飞牛应用中心安装上传后直接弹窗: `无法安装`、`不是有效的 fpk 文件`。
- 还没进入安装脚本，也不会产生日志。

根因:

- `1.19.27-7` 的外层 `.fpk` 被脚本写成了未压缩 tar。
- 之前能安装的 `1.19.27-6` 外层是 gzip tar，文件开头为 `1f 8b`。
- 飞牛应用中心会按 gzip fpk 解析，裸 tar 会被直接判无效。

修复:

- 从 `1.19.27-8` 开始，`scripts/build-fpk.py` 外层使用 `tarfile.open(..., "w:gz")`。
- 构建脚本新增 `validate_fpk()`，检查 `.fpk` 文件头必须是 gzip magic，并检查外层必须包含 `manifest`、`app.tgz`、`cmd/main`、`config/privilege`、`config/resource`。

验证:

```powershell
python -c "from pathlib import Path; p=Path('dist/clash.meta_1.19.27-12_x86.fpk'); print(p.read_bytes()[:2].hex())"
tar -tvf 'dist\clash.meta_1.19.27-12_x86.fpk' | Select-String 'manifest|cmd/main|app.tgz'
```

期望:

```text
1f8b
```

### 2026-06-21: MMDB 下载超时导致无法启动

现象:

- mihomo 已经能执行，但启动失败。
- 日志出现:

```text
MMDB invalid, remove and download
can't initial GeoIP: can't download MMDB: context deadline exceeded
Parse config error: load GeoIP dns fallback filter error
```

根因:

- 默认 DNS 配置包含 `fallback`，mihomo 会加载 GeoIP 数据用于 fallback filter。
- 运行目录里没有可用 MMDB，或者之前下载中断留下了损坏 MMDB。
- 飞牛设备无法稳定访问 GitHub 下载源，启动时自动下载 MMDB 超时，mihomo 直接 fatal 退出。

修复:

- 从 `1.19.27-9` 开始，包内置 `country.mmdb` 和 `geoip.metadb`。
- 从 `1.19.27-25` 开始，额外内置完整版 `geoip.dat` 和 `geosite.dat`，并关闭 `geo-auto-update`，避免启动或规则加载阶段再访问 GitHub:

```text
geodata/country.mmdb
geodata/geoip.metadb
geodata/geoip.dat
geodata/geosite.dat
```

- `cmd/main` 启动前复制内置 geodata 到配置目录，并覆盖损坏文件:

```text
<应用文件>/clash.meta/config/country.mmdb
<应用文件>/clash.meta/config/Country.mmdb
<应用文件>/clash.meta/config/geoip.metadb
<应用文件>/clash.meta/config/geoip.dat
<应用文件>/clash.meta/config/geosite.dat
```

后续要求:

- 每次更新 geodata 后都要重打包，不能指望用户机器首次启动联网下载。
- 不要只通过 `fallback-filter.geoip=false` 绕开，这会改变默认 DNS 行为；应用商店包应优先内置必要数据。
- 启动脚本覆盖 geodata 是有意设计，用于清理已经损坏或半下载的运行时 MMDB。

### 应用启动失败

检查:

```text
<应用文件>/clash.meta/logs/mihomo.log
```

常见原因:

- `config.yaml` 格式错误
- `7899`、`9090` 或 `1053` 端口被占用
- 二进制没有执行权限
- 包架构装错，例如 ARM 机器安装了 x86 包
- 内置 geodata 缺失或损坏

### 面板打不开

检查:

- 应用状态是否运行中
- `service_port=9090` 是否被飞牛识别
- 外层 `ui/config` 的入口名是否匹配 `desktop_applaunchname`
- 入口是否设置了 `noDisplay=false`
- `config.yaml` 是否有 `external-controller: 0.0.0.0:9090`
- `app/dashboard/config.js` 是否被替换回空后端

### 面板打开但连接不上后端

检查:

- `1.19.27-13` 以后默认会自动生成 secret，内嵌 MetaCubeXD 正常不需要手动填写。
- 如果从浏览器手动添加后端，密钥必须填写 `<应用文件>/clash.meta/config/secret` 里的值。
- 如果密钥输入框里出现圆点，可能是浏览器或窗口自动填充，也可能是旧 endpoint 缓存；优先刷新并确认 `dashboard/config.js` 已注入当前 secret。
- 如果用户手动设置了 `config.yaml` 的 `secret`，运行时 dashboard 会沿用它；外部 MetaCubeXD 也需要同步填写同一个值。
- 浏览器地址是否就是 `http://<飞牛IP>:9090/ui/`
- `external-controller` 是否监听 `0.0.0.0:9090`

### 2026-06-21: 空密钥存在安全风险

现象:

- 早期包默认 `secret: ""`。
- `external-controller: 0.0.0.0:9090` 会让同局域网设备可以访问 mihomo 控制 API。
- 用户担心 MetaCubeXD 首次页面要求 token，以及空密钥是否安全。

风险:

- 空密钥时，能访问 `9090` 的设备可以读取和操作 mihomo 控制接口。
- 设置 secret 后，API 调用需要 `Authorization: Bearer <secret>`。
- 但如果内嵌 UI 需要自动打开，secret 必须以某种方式交给前端；因此能访问 `9090/ui/` 的人仍可能从运行时配置中读到 secret。

修复:

- 从 `1.19.27-13` 开始，启动时生成或复用 `<应用文件>/clash.meta/config/secret`。
- 如果用户已有非空 `config.yaml secret`，不覆盖用户配置，只同步给运行时 dashboard。
- 如果旧配置是空密钥，则自动写入随机 secret。
- 启动时复制 dashboard 到 `${TRIM_PKGVAR}/dashboard`，再把 secret 注入运行时 `config.js`。
- mihomo 启动参数改为 `-ext-ui "${TRIM_PKGVAR}/dashboard"`。

局限:

- 这不是公网安全方案，只是避免 `9090` 裸奔空密钥。
- 公网访问必须另加反向代理鉴权、防火墙或 VPN。
- 如果要做到前端完全不暴露 secret，需要引入后端代理或飞牛系统级鉴权入口，复杂度明显上升。

### 2026-06-21: 首次打开面板，点“添加”没反应

现象:

- 应用已启用成功，`http://<飞牛IP>:9090/ui/` 可以打开 MetaCubeXD。
- 首屏要求填写后端地址和密钥。
- 后端地址填 `http://<飞牛IP>:9090`、密钥留空后，点击添加没有明显跳转。

根因:

- `defaultBackendURL` 只会作为默认候选地址，不保证 MetaCubeXD 把它保存为当前 endpoint。
- 如果浏览器或 fnOS 内嵌窗口里已有旧的 `endpointList` / `selectedEndpoint` 本地存储，页面可能继续停在 setup 或选中旧端点。
- 如果用户配置目录里的 `config.yaml` 曾经手动设置过 `secret`，空密钥也会连接失败。升级包不会覆盖用户已有配置。

修复:

- 从 `1.19.27-12` 开始，`app/dashboard/config.js` 会在页面加载前写入:

```js
window.metacubexd.endpoint = {
  url: `${window.location.protocol}//${window.location.host}`,
  secret: "",
}
```

- 同时维护 `localStorage.endpointList` 和 `localStorage.selectedEndpoint`，注册并优先选中 `local-mihomo`。
- 只在当前选中端点为空、失效、就是 `local-mihomo`，或旧端点 host 等于当前访问 host 时自动切换，避免覆盖用户手动添加的远程后端。

实机排障:

```text
http://<飞牛IP>:9090/version
```

如果这个地址能返回版本信息，但面板仍然停在 setup，优先升级到 `1.19.27-12`；如果仍失败，在浏览器开发者工具里清理 `http://<飞牛IP>:9090` 的站点数据后重开应用。

## 后续可改进项

- 安装向导已经支持一填订阅生成初始配置；如需运行后在 Web 内直接改写并重启配置，再增加本地辅助服务或安全后端 API。
- 接入飞牛统一网关，按官方 `gatewayPrefix` / `gatewaySocket` 和登录认证标准处理公网访问。
- 增加更严格的防火墙和访问控制说明。
- 在真实 fnOS 设备上跑安装、启动、停止、升级、卸载完整测试。
