# fnOS Clash.Meta 原生应用包

本项目产出的是飞牛 fnOS 应用中心可安装的原生 Native 应用包，不是 Docker 包。包内置 mihomo 核心、MetaCubeXD Web 面板和 geodata，配置、日志、运行态文件按飞牛应用目录规范分开放置。

## 已构建版本

- 应用版本: `1.19.27-29`
- mihomo 核心: `v1.19.27`
- 内嵌 Web 面板: `MetaCubeXD v1.258.3`
- 打包方式: `scripts/build-fpk.py` 手工 tar 打包，显式保留 Linux 执行权限

## 产物

构建产物位于 `dist/`:

- `clash.meta_1.19.27-29_x86.fpk`: 飞牛 x86 平台使用
- `clash.meta_1.19.27-29_arm.fpk`: 飞牛 ARM 平台使用
- `SHA256SUMS.txt`: 包校验值

当前 SHA256:

```text
2CA11C3A3B1876E9F77D8FAE36E442590810CC294C933743FEC989AF6A4CDA59  clash.meta_1.19.27-29_x86.fpk
814CFCAE9829026862E364C730DF4F6E9C30534FB5CC6C6BC3D1987E979305F3  clash.meta_1.19.27-29_arm.fpk
```

## 安装向导

安装时仍会先显示飞牛标准“协议许可”页。继续下一步后，本包会显示中文安装向导:

1. `首次配置`: 同一页提供 `订阅 / 导入链接` 和 `完整 YAML 配置 URL` 两个输入框。

填写规则:

- `订阅 / 导入链接`: 普通 Clash/Mihomo 订阅填这里；小猫咪复制出的 `clash://install-config?url=...&name=...` 链接也填这里。首次启动会生成 `proxy-providers.subscription` 配置，provider 下载固定走 `DIRECT`，默认关闭 provider health-check，并给订阅域名加直连规则；普通流量仍默认 `MATCH,PROXY`。
- `完整 YAML 配置 URL`: 只有可直接作为 mihomo `config.yaml` 使用的完整 YAML 配置地址才填这里。首次启动会尝试下载；下载失败会回退到默认配置，不让应用卡在“启用中”。
- 两个都填时优先使用 `完整 YAML 配置 URL`。
- 两个都留空时，首次启动复制包内默认配置，规则为 `MATCH,DIRECT`。

内嵌 Web 不再自动弹出订阅配置，避免和安装向导重复。需要临时新增或替换订阅时，打开应用后点击右下角 `配置` 按钮，粘贴普通订阅或 `clash://install-config?url=...&name=...` 导入链接。这个按钮是本包额外加的，不是 MetaCubeXD 原生按钮；它会生成一份运行时 mihomo 配置并调用 `/configs?force=true` 加载，不再进入 MetaCubeXD 的 `Profiles` 空配置文件页。从 `1.19.27-27` 开始，配置请求有 30 秒超时，超时后按钮会恢复，不会一直停在“正在加载...”。从 `1.19.27-28` 开始，按钮文案改为 `配置`，弹窗标题改为 `配置订阅`，避免和 MetaCubeXD 原生“导入配置”概念混淆。

注意: 右下角 `配置` 只保证当前运行时加载配置，不保证把配置永久写回 `<应用文件>/clash.meta/config/config.yaml`。超时不一定表示链接格式错误，也可能是 NAS 直连订阅域名慢或失败。需要长期保存订阅时，建议卸载重装时在安装向导填写订阅，或手动编辑 `config.yaml` 后重启应用。

## 卸载向导

卸载时会显示中文卸载向导，默认 `保留全部用户数据（推荐）`。

可选项:

- `保留全部用户数据（推荐）`: 不删除应用文件目录，保留 `config.yaml`、`secret`、订阅缓存和日志。
- `删除其他数据，保留用户配置与订阅`: 删除运行缓存、临时文件和旧日志，保留 `config.yaml`、`secret`、订阅 provider 和安装向导保存的订阅/配置 URL。
- `删除全部应用数据`: 删除整个 `<应用文件>/clash.meta` 应用文件目录。

## 安装后入口

应用中心“打开”按钮会打开内嵌 MetaCubeXD 面板。也可以直接访问:

```text
http://<飞牛IP>:9090/ui/
```

首次打开 MetaCubeXD 正常会自动连接本机后端，不需要手动填写密钥。如果仍出现“后端地址 / 密钥”页面:

- 后端地址填 `http://<飞牛IP>:9090`
- 密钥填 `<应用文件>/clash.meta/config/secret` 里的值
- 如果只是旧窗口缓存导致，刷新或清理 `http://<飞牛IP>:9090` 的站点数据后重开应用

如果启用成功但桌面没有图标或应用中心没有“打开”按钮:

- 确认安装的是 `1.19.27-29`。
- 先卸载旧包再安装新包，避免入口元数据缓存。
- 非管理员用户看不到入口时，需要由管理员授权；本包默认不对所有用户开放控制面板入口。

## 应用文件目录

首次启动后，配置和日志位于飞牛“应用文件”目录:

```text
<应用文件>/clash.meta/config/config.yaml
<应用文件>/clash.meta/config/secret
<应用文件>/clash.meta/logs/mihomo.log
```

向导选择会保存到:

```text
<应用文件>/clash.meta/config/wizard/
```

修改 `config.yaml` 后，需要在飞牛应用中心重启应用。

## 内置 geodata

包内置:

- `country.mmdb`
- `geoip.metadb`
- `geoip.dat`
- `geosite.dat`

启动时会复制到应用文件配置目录，并默认关闭 geodata 自动更新，避免首次启动或规则加载阶段因访问 GitHub 超时失败。

后续维护规则:

- 包内 geodata 不做自动更新。
- 下次需要维护者在构建机手动下载新的 `country.mmdb`、`geoip.metadb`、`geoip.dat` 和 `geosite.dat`。
- 更新后必须重打 `.fpk` 包并重新安装或发布。
- 具体命令写在 `MAINTENANCE.md` 的“手动更新 geodata”章节。

## 默认端口

- HTTP/SOCKS mixed proxy: `7899`
- External controller / Web UI: `9090`
- DNS listen: `1053`

## 安全说明

- 默认 `allow-lan: true`，局域网设备可以连接 `7899` 和 `9090`。
- 首次启动会自动生成 controller secret，写入 `<应用文件>/clash.meta/config/secret` 和 `config.yaml`。
- 内嵌 MetaCubeXD 会自动带上这个 secret，正常不需要手动填写密钥。
- 这个 secret 会出现在运行时 Web 配置里，能访问 `9090/ui/` 的人仍可能读到它。
- 如果用飞牛公共网关或反向代理对外访问，外层必须有飞牛网关鉴权或等价访问控制。

## 验证

安装并启动后，在飞牛或同局域网机器上检查:

```bash
curl http://<飞牛IP>:9090/version
curl http://<飞牛IP>:9090/ui/
```

如果面板无法打开，优先检查:

- 应用是否处于运行状态
- `9090` 是否被其他服务占用
- 防火墙是否阻止访问
- 日志文件 `<应用文件>/clash.meta/logs/mihomo.log`
- 应用中心入口是否来自 `1.19.27-29` 包
- `geodata/` 是否随包内置
