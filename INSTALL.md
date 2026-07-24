# fnOS Clash.Meta 安装与使用

## 安装包选择

- Intel / AMD 飞牛设备安装 `clash.meta_1.19.27-31_x86.fpk`。
- ARM64 飞牛设备安装 `clash.meta_1.19.27-31_arm.fpk`。
- 这是原生应用包，不需要安装 Docker。

## 首次安装

飞牛先显示协议许可，随后显示“首次配置”。同一页有两个输入框，二选一：

1. `订阅 / 导入链接`

   可填写普通 `http(s)` 订阅，或小猫咪生成的 `clash://install-config?url=...&name=...`。

2. `完整 YAML 配置 URL`

   只填写可直接作为 mihomo `config.yaml` 使用的完整 YAML 地址。两个框都填时优先使用此项。

两个框都留空时使用最小默认配置。安装向导不会要求 controller token，应用会首次启动时自动生成。

订阅模式生成的配置包含：

- provider 每 `86400` 秒自动更新一次。
- provider 下载走 `DIRECT`。
- provider 启动测速默认关闭，避免首次启动被网络质量拖死。
- `自动选择` 使用 `url-test`，每 600 秒检测一次。
- `PROXY` 默认选择 `自动选择`，也可以在面板手动选择节点或 `DIRECT`。

## 打开应用

从飞牛桌面图标或应用中心的“打开”按钮进入。入口通过统一网关访问：

```text
/app/clash-meta/ui/
```

不要填写或访问 `http://<飞牛IP>:9090`。从 `1.19.27-30` 开始，控制器只监听 NAS 本机 `127.0.0.1:9090`，由 fnOS 网关完成登录校验和转发。

## 修改订阅

有两种持久化方式：

- 在内嵌页右下角点击“配置”，填写订阅并提交。系统先备份旧配置，再原子写入 `config.yaml` 并热加载；失败会恢复旧配置。
- 在飞牛应用设置中打开“更新配置”，填写订阅或完整 YAML URL。全部留空表示不修改。提交后服务会重启验证，失败恢复原配置。

也可以手工编辑：

```text
<应用文件>/clash.meta/config/config.yaml
```

手工编辑后在应用中心重启应用。

自动备份文件：

- `config.yaml.bak`: 内嵌页“配置”提交前的备份。
- `config.yaml.settings-backup`: 飞牛应用设置提交前的备份。

订阅地址通常包含私有 token，不要把 `config.yaml`、向导保存目录、截图或日志公开上传。

## 网络使用方式

应用不会默认接管整个 NAS 或局域网。默认提供显式代理：

- HTTP / SOCKS mixed: `<飞牛IP>:7899`
- DNS: `<飞牛IP>:1053`

需要使用代理的设备或应用手工填写 `7899`。配置中没有启用 TUN，因此未配置代理的流量仍按原网络出口访问。

## 应用文件

```text
<应用文件>/clash.meta/config/config.yaml
<应用文件>/clash.meta/config/secret
<应用文件>/clash.meta/config/providers/
<应用文件>/clash.meta/config/wizard/
<应用文件>/clash.meta/logs/mihomo.log
```

geodata 也会复制到 `config/`。它们由安装包内置，默认不在线更新。

## 卸载

- `保留全部用户数据（推荐）`: 保留配置、订阅、provider、日志和缓存。
- `删除其他数据，保留用户配置与订阅`: 保留配置、secret、provider 和向导地址，删除缓存、临时文件和旧日志。
- `删除全部应用数据`: 停止服务后删除 Clash.Meta 的应用文件目录，以及 fnOS 为此应用创建的 `@appdata`、`@apphome`、`@appconf`、`@appmeta` 和 `@apptemp` 私有目录。

## 排障

应用卡在启用或打不开时，先查看：

```text
<应用文件>/clash.meta/logs/mihomo.log
```

正常启动应看到：

```text
RESTful API listening at: 127.0.0.1:9090
Mixed(http+socks) proxy listening at: [::]:7899
fnOS gateway listening on .../clash-meta.sock
```

常见问题：

- `context deadline exceeded`: 订阅地址或 DNS 不能直连；包内 geodata 本身不需要下载。
- `mihomo rejected config`: 新配置语法或字段有误，检查日志和自动备份。
- 应用运行但没有“打开”: 确认安装 `1.19.27-31`，必要时卸载旧包后重新安装以刷新入口元数据。
- 统一网关返回 502: mihomo 未启动或本机 9090 冲突，检查同一日志中的前置错误。
