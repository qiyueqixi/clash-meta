# Clash.Meta for fnOS

这是给飞牛 fnOS 使用的 Clash.Meta / mihomo 原生 Native 应用包，不是 Docker 包。

- Core: mihomo v1.19.27
- Dashboard: MetaCubeXD v1.258.3
- Package: 1.19.27-29
- Dashboard URL: `http://<fnOS-IP>:9090/ui/`
- Proxy port: `7899`
- Controller port: `9090`

安装时包含中文原生安装向导，同一页提供 `订阅 / 导入链接` 和完整 mihomo YAML 配置 URL 两个输入框，二选一填写即可；都留空则稍后手动配置。小猫咪复制出的 `clash://install-config?url=...&name=...` 链接填第一个输入框，会按订阅导入处理。订阅 provider 下载固定走 `DIRECT`，默认关闭 provider health-check，避免首次拉取订阅时误走尚未就绪的 `PROXY` 组或立刻测速。内嵌 Web 不再自动弹出订阅配置；需要临时新增订阅时，点击页面右下角“配置”按钮，它会通过 mihomo `/configs?force=true` 加载运行时配置，不再进入 MetaCubeXD 的空 `Profiles` 页面。请求有 30 秒超时，超时后按钮会恢复；普通订阅地址仍需要 NAS 自己能直连访问。这个按钮不会写回飞牛应用文件里的 `config.yaml`，需要持久保存时仍要通过安装向导或手动编辑配置文件。

卸载时包含中文原生卸载向导，默认保留全部用户数据；也可以只删除运行缓存、临时文件和旧日志并保留 `config.yaml` / `secret` / 订阅数据，或删除全部应用数据。

首次启动后，用户配置位于飞牛“应用文件”目录下的 `config/config.yaml`，日志位于 `logs/mihomo.log`。包内已内置 `country.mmdb`、`geoip.metadb`、完整版 `geoip.dat` 和 `geosite.dat`，并关闭用户设备上的 geodata 自动更新；后续由维护者手动更新后重新打包。
